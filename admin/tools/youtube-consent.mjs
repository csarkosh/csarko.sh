#!/usr/bin/env node
/**
 * Mints the admin API's YouTube Analytics credential and writes it straight into Secret Manager,
 * so the refresh token never passes through a terminal, a chat or Terraform. Node 22, no
 * dependencies. Cyrus runs it on his Mac (plan docs/superpowers/plans/2026-11-01-youtube-analytics.md, C2):
 *
 *   node admin/tools/youtube-consent.mjs [client.json] [--dry-run]
 *
 * It reads the OAuth client (a Desktop app's JSON from the Cloud console, by default
 * ~/.config/csarko-sh/youtube-oauth-client.json), listens on 127.0.0.1 on a free port, and opens
 * Google's consent page for the one read-only scope with a PKCE S256 challenge, a random `state`,
 * `access_type=offline` and `prompt=consent` (so Google sends a refresh token every time). Sign in
 * as the channel's account, pick @csarkosh if asked, and Allow. Google sends the browser back to
 * the loopback address with a code; the script checks the state, trades the code (with the PKCE
 * verifier) for the tokens, and pipes `{ client_id, client_secret, refresh_token }` to
 *
 *   gcloud secrets versions add youtube-oauth --project=csarko-sh --data-file=-
 *
 * on its stdin. It prints "saved version N" or the error, never a token or the client secret.
 * The service reads the secret at `latest`, so the next revision (or the next cold start) uses it.
 *
 * --dry-run checks the client file and prints the consent URL, which carries the client id and
 * nothing secret, without listening for the answer or writing anything.
 */

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const SECRET = "youtube-oauth";
export const PROJECT = "csarko-sh";
export const DEFAULT_CLIENT = `${homedir()}/.config/csarko-sh/youtube-oauth-client.json`;
const WAIT_MS = 5 * 60_000;

/**
 * The client id and secret from a Desktop app's client JSON (`{ installed: { client_id,
 * client_secret, ... } }`). Anything else throws, naming what is wrong and never a value.
 */
export function readClient(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("the client file is not JSON; download it again from the Cloud console (Clients, the Desktop client, Download JSON)");
  }
  if (json?.web) throw new Error("the client file is a Web application's; make a Desktop app client, whose loopback redirect this script uses");
  const c = json?.installed;
  if (!c || typeof c.client_id !== "string" || !c.client_id || typeof c.client_secret !== "string" || !c.client_secret) {
    throw new Error("the client file has no installed.client_id and installed.client_secret; it must be a Desktop app client's JSON");
  }
  return { clientId: c.client_id, clientSecret: c.client_secret };
}

/** The PKCE S256 challenge for a verifier (RFC 7636, section 4.2). */
export function challengeOf(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** A fresh PKCE pair: a 43 to 128 character verifier of unreserved characters, and its S256 challenge. */
export function pkce(bytes = randomBytes(48)) {
  const verifier = Buffer.from(bytes).toString("base64url");
  return { verifier, challenge: challengeOf(verifier) };
}

/** A random state, checked on the way back so another page cannot hand the script a code. */
export const newState = (bytes = randomBytes(24)) => Buffer.from(bytes).toString("base64url");

/** Google's consent page for the one scope, offline, consent forced, PKCE S256. Carries the client id only. */
export function consentUrl({ clientId, redirectUri, state, challenge }) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}

/**
 * The code from Google's redirect to the loopback address, once its state is ours. Throws for
 * a refusal (`error=access_denied`), a state that does not match, or no code.
 */
export function codeFromCallback(requestUrl, state) {
  const params = new URL(requestUrl, "http://127.0.0.1").searchParams;
  const error = params.get("error");
  if (error) throw new Error(`Google answered ${error}${error === "access_denied" ? ": the consent was not given" : ""}`);
  if (params.get("state") !== state) throw new Error("the answer's state does not match this run's; start again");
  const code = params.get("code");
  if (!code) throw new Error("Google's answer carried no code");
  return code;
}

/** The token request's form body for the code. */
export function tokenBody({ code, clientId, clientSecret, redirectUri, verifier }) {
  return new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }).toString();
}

/** The refresh token from the token answer, once the scope was granted. Throws, naming the cause, never echoing a token. */
export function refreshTokenOf(status, body) {
  if (status >= 400 || typeof body?.error === "string") {
    throw new Error(`the token exchange failed (${status}${typeof body?.error === "string" ? `: ${body.error}` : ""})`);
  }
  const granted = String(body?.scope ?? "").split(/\s+/);
  if (!granted.includes(SCOPE)) throw new Error("the consent did not grant YouTube Analytics (read only); run again and leave its box ticked");
  if (typeof body?.refresh_token !== "string" || !body.refresh_token) {
    throw new Error("Google sent no refresh token; remove the app's access at myaccount.google.com/permissions and run again");
  }
  return body.refresh_token;
}

/** The secret's value, the shape config.mjs `parseOAuth` reads. */
export const secretPayload = ({ clientId, clientSecret, refreshToken }) => JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken });

/** The version gcloud says it created ("Created version [3] of the secret [youtube-oauth]."), or null. */
export function versionOf(output) {
  const m = /Created version \[(\d+)\]/.exec(String(output ?? ""));
  return m ? Number(m[1]) : null;
}

/** A free port on the loopback address: listen on 0 and read what the system gave. */
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

/** Waits for Google's redirect: the first request carrying a code, an error or a state; anything else (a favicon) is a 404. */
function awaitCallback(server, state) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no answer from the browser in five minutes; run it again")), WAIT_MS);
    server.on("request", (req, res) => {
      const params = new URL(req.url ?? "/", "http://127.0.0.1").searchParams;
      if (!params.has("code") && !params.has("error") && !params.has("state")) {
        res.writeHead(404, { "content-type": "text/plain" }).end("not found");
        return;
      }
      clearTimeout(timer);
      try {
        const code = codeFromCallback(req.url ?? "/", state);
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Consent received. You can close this tab; the terminal says whether it was saved.");
        resolve(code);
      } catch (error) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end(`Not saved: ${error.message}`);
        reject(error);
      }
    });
  });
}

/** Runs a command with `input` on its stdin, resolving `{ code, stdout, stderr }`. */
function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  return new Promise((resolve) => {
    const child = spawn(command, [url], { stdio: "ignore", detached: true });
    child.on("error", () => resolve(false));
    child.on("spawn", () => { child.unref(); resolve(true); });
  });
}

async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const path = argv.find((a) => !a.startsWith("--")) ?? DEFAULT_CLIENT;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`cannot read the client file ${path}; download the Desktop client's JSON and move it there (chmod 600)`);
  }
  const { clientId, clientSecret } = readClient(text);
  const { verifier, challenge } = pkce();
  const state = newState();
  const server = createServer();
  const port = await listen(server);
  const redirectUri = `http://127.0.0.1:${port}`;
  const url = consentUrl({ clientId, redirectUri, state, challenge });

  if (dryRun) {
    server.close();
    console.log(`client file ok: ${path}`);
    console.log(url);
    return;
  }

  try {
    const answer = awaitCallback(server, state);
    if (!(await openBrowser(url))) console.error(`could not open a browser; open this address yourself:\n${url}`);
    const code = await answer;
    const res = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: tokenBody({ code, clientId, clientSecret, redirectUri, verifier }) });
    const body = await res.json().catch(() => ({}));
    const refreshToken = refreshTokenOf(res.status, body);
    const saved = await run("gcloud", ["secrets", "versions", "add", SECRET, `--project=${PROJECT}`, "--data-file=-"], secretPayload({ clientId, clientSecret, refreshToken }));
    if (saved.code !== 0) {
      const said = saved.stderr.split("\n").map((l) => l.trim()).filter(Boolean).find((l) => l.startsWith("ERROR")) ?? `exit ${saved.code}`;
      throw new Error(`gcloud did not save the secret: ${said}`);
    }
    const version = versionOf(`${saved.stderr}\n${saved.stdout}`);
    console.log(version === null ? "saved a new version" : `saved version ${version}`);
  } finally {
    server.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(() => process.exit(0), (error) => {
    console.error(`youtube-consent: ${error.message}`);
    process.exit(1);
  });
}
