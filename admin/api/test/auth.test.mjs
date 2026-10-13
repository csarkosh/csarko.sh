import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT, exportJWK } from "jose";
import { bearerOf, parseAllowlist, createAdminAuth, createOidcVerifier, audiencesFor, GOOGLE_ISSUER } from "../src/auth.mjs";

test("bearerOf reads the token and nothing else", () => {
  assert.equal(bearerOf("Bearer abc"), "abc");
  assert.equal(bearerOf("Bearer   abc  "), "abc");
  assert.equal(bearerOf("Bearer "), null);
  assert.equal(bearerOf("Basic abc"), null);
  assert.equal(bearerOf(undefined), null);
});

test("parseAllowlist keeps addresses, lower-cased, and nothing else", () => {
  assert.deepEqual(parseAllowlist(" Cyrus@Example.com , ,nobody, b@c.d"), ["cyrus@example.com", "b@c.d"]);
  assert.deepEqual(parseAllowlist(undefined), []);
});

test("the admin verifier admits a Firebase ID token for an allowed, verified account and nothing else", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const keys = async () => publicKey;
  const projectId = "csarko-sh";
  const auth = createAdminAuth({ projectId, allowed: ["Cyrus@example.com"], keys });
  assert.equal(auth.enabled, true);

  const mint = (claims, aud = projectId, issuer = `https://securetoken.google.com/${projectId}`) =>
    new SignJWT({ email: "cyrus@example.com", email_verified: true, ...claims })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

  assert.deepEqual(await auth.verify(await mint({})), { email: "cyrus@example.com" });
  assert.deepEqual(await auth.verify(await mint({ email: "CYRUS@example.com" })), { email: "cyrus@example.com" }, "case does not matter");
  assert.equal(await auth.verify(await mint({ email: "someone@example.com" })), null, "not on the list");
  assert.equal(await auth.verify(await mint({ email_verified: false })), null, "unverified email");
  assert.equal(await auth.verify(await mint({}, "another-project")), null, "another audience");
  assert.equal(await auth.verify(await mint({}, projectId, "https://securetoken.google.com/another-project")), null, "another issuer");
  assert.equal(await auth.verify(await mint({}, projectId, GOOGLE_ISSUER)), null, "a plain Google OIDC token is not a Firebase one");
  assert.equal(await auth.verify("not-a-jwt"), null);
  assert.equal(await auth.verify(null), null);

  const nobody = createAdminAuth({ projectId, allowed: [], keys });
  assert.equal(nobody.enabled, false);
  assert.equal(await nobody.verify(await mint({})), null, "an empty list admits nobody");
  assert.equal(createAdminAuth({ projectId: "", allowed: ["a@b.c"], keys }).enabled, false, "no project, no verifier");
});

test("the OIDC verifier admits Google's token for the invoker and nothing else", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const keys = async () => publicKey;
  const invoker = "scheduler@csarko-sh.iam.gserviceaccount.com";
  const verifier = createOidcVerifier({ invoker, keys });
  const audiences = ["https://csarko-admin-abc-uw.a.run.app", "https://csarko-admin-abc-uw.a.run.app/admin/snapshot"];

  const mint = (claims, aud = audiences[1], issuer = GOOGLE_ISSUER) =>
    new SignJWT({ email: invoker, email_verified: true, ...claims })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

  assert.deepEqual(await verifier.verify(await mint({}), audiences), { email: invoker });
  assert.equal(await verifier.verify(await mint({ email: "someone@example.com" }), audiences), null, "another account");
  assert.equal(await verifier.verify(await mint({ email_verified: false }), audiences), null, "unverified email");
  assert.equal(await verifier.verify(await mint({}, "https://other.example"), audiences), null, "another audience");
  assert.equal(await verifier.verify(await mint({}, audiences[1], "https://evil.example"), audiences), null, "another issuer");
  assert.equal(await verifier.verify("not-a-jwt", audiences), null);
  assert.equal(await verifier.verify(await mint({}), []), null, "no audience known");
  assert.equal(await createOidcVerifier({ invoker: null, keys }).verify(await mint({}), audiences), null, "no invoker configured");
});

test("audiencesFor derives the service URL from the request and SERVICE_URL", () => {
  const req = { headers: { host: "csarko-admin-abc-uw.a.run.app" } };
  assert.deepEqual(audiencesFor(req, null), ["https://csarko-admin-abc-uw.a.run.app", "https://csarko-admin-abc-uw.a.run.app/admin/snapshot"]);
  assert.deepEqual(audiencesFor({ headers: { host: "x" } }, "https://svc.example/"), [
    "https://svc.example",
    "https://svc.example/admin/snapshot",
    "https://x",
    "https://x/admin/snapshot",
  ]);
});
