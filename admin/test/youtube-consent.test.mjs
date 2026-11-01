import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  readClient, challengeOf, pkce, newState, consentUrl, codeFromCallback, tokenBody, refreshTokenOf, secretPayload, versionOf, SCOPE, AUTH_URL,
} from '../tools/youtube-consent.mjs';

// Every client here is made up: the real client file is never read by a test.
const FAKE = { installed: { client_id: 'fake-id.apps.googleusercontent.com', client_secret: 'GOCSPX-fake-secret', redirect_uris: ['http://localhost'] } };
const SCRIPT = fileURLToPath(new URL('../tools/youtube-consent.mjs', import.meta.url));

test('the client file must be a Desktop app client; a wrong one is named, never echoed', () => {
  assert.deepEqual(readClient(JSON.stringify(FAKE)), { clientId: 'fake-id.apps.googleusercontent.com', clientSecret: 'GOCSPX-fake-secret' });
  for (const [text, why] of [['not json', /not JSON/], [JSON.stringify({ web: FAKE.installed }), /Web application/], [JSON.stringify({ installed: { client_id: 'x' } }), /installed.client_secret/], ['{}', /Desktop app/]]) {
    assert.throws(() => readClient(text), (e) => why.test(e.message) && !e.message.includes('GOCSPX'));
  }
});

test('PKCE is S256 over a verifier of unreserved characters (RFC 7636 appendix B)', () => {
  assert.equal(challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const { verifier, challenge } = pkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(challenge, challengeOf(verifier));
  assert.notEqual(pkce().verifier, verifier, 'fresh every run');
  assert.match(newState(), /^[A-Za-z0-9_-]{32}$/);
});

test('the consent URL asks for the one read-only scope, offline, consent forced, PKCE S256, and carries no secret', () => {
  const url = new URL(consentUrl({ clientId: 'fake-id.apps.googleusercontent.com', redirectUri: 'http://127.0.0.1:53111', state: 's-1', challenge: 'c-1' }));
  assert.equal(`${url.origin}${url.pathname}`, AUTH_URL);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    client_id: 'fake-id.apps.googleusercontent.com',
    redirect_uri: 'http://127.0.0.1:53111',
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/yt-analytics.readonly',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state: 's-1',
    code_challenge: 'c-1',
    code_challenge_method: 'S256',
  });
  assert.equal(SCOPE, 'https://www.googleapis.com/auth/yt-analytics.readonly');
});

test('the redirect is taken only with this run\'s state and a code', () => {
  assert.equal(codeFromCallback('/?state=s-1&code=4/abc&scope=x', 's-1'), '4/abc');
  assert.throws(() => codeFromCallback('/?state=other&code=4/abc', 's-1'), /state does not match/);
  assert.throws(() => codeFromCallback('/?code=4/abc', 's-1'), /state does not match/);
  assert.throws(() => codeFromCallback('/?state=s-1', 's-1'), /no code/);
  assert.throws(() => codeFromCallback('/?error=access_denied&state=s-1', 's-1'), /access_denied: the consent was not given/);
});

test('the code is traded with its verifier; the answer must grant the scope and carry a refresh token', () => {
  assert.deepEqual(Object.fromEntries(new URLSearchParams(tokenBody({ code: '4/abc', clientId: 'id', clientSecret: 'cs', redirectUri: 'http://127.0.0.1:1', verifier: 'v' }))), {
    code: '4/abc', client_id: 'id', client_secret: 'cs', redirect_uri: 'http://127.0.0.1:1', grant_type: 'authorization_code', code_verifier: 'v',
  });
  assert.equal(refreshTokenOf(200, { access_token: 'at', refresh_token: '1//rt', scope: SCOPE, token_type: 'Bearer' }), '1//rt');
  assert.throws(() => refreshTokenOf(200, { access_token: 'at', refresh_token: '1//rt', scope: 'openid' }), /did not grant YouTube Analytics/);
  assert.throws(() => refreshTokenOf(200, { access_token: 'at', scope: SCOPE }), /no refresh token/);
  assert.throws(() => refreshTokenOf(400, { error: 'invalid_grant', error_description: 'Bad Request' }), (e) => /token exchange failed \(400: invalid_grant\)/.test(e.message) && !e.message.includes('Bad Request'));
  assert.deepEqual(JSON.parse(secretPayload({ clientId: 'id', clientSecret: 'cs', refreshToken: '1//rt' })), { client_id: 'id', client_secret: 'cs', refresh_token: '1//rt' });
  assert.equal(versionOf('Created version [3] of the secret [youtube-oauth].'), 3);
  assert.equal(versionOf(''), null);
});

test('--dry-run checks a client file and prints the consent URL with the client id and no secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'consent-'));
  try {
    const file = join(dir, 'client.json');
    writeFileSync(file, JSON.stringify(FAKE), { mode: 0o600 });
    const out = execFileSync(process.execPath, [SCRIPT, file, '--dry-run'], { encoding: 'utf8' });
    assert.match(out, /^client file ok: /);
    const url = new URL(out.trim().split('\n').at(-1));
    assert.equal(url.searchParams.get('client_id'), 'fake-id.apps.googleusercontent.com');
    assert.match(url.searchParams.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.ok(!out.includes('GOCSPX'), 'the client secret is never printed');

    writeFileSync(file, JSON.stringify({ web: FAKE.installed }));
    assert.throws(() => execFileSync(process.execPath, [SCRIPT, file, '--dry-run'], { encoding: 'utf8', stdio: 'pipe' }), (e) => e.status === 1 && /Web application/.test(e.stderr) && !e.stderr.includes('GOCSPX'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
