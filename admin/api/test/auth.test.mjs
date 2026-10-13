import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT, exportJWK } from "jose";
import { bearerOf, tokenMatches, createOidcVerifier, audiencesFor, GOOGLE_ISSUER } from "../src/auth.mjs";

test("bearerOf reads the token and nothing else", () => {
  assert.equal(bearerOf("Bearer abc"), "abc");
  assert.equal(bearerOf("Bearer   abc  "), "abc");
  assert.equal(bearerOf("Bearer "), null);
  assert.equal(bearerOf("Basic abc"), null);
  assert.equal(bearerOf(undefined), null);
});

test("tokenMatches is exact, and refuses an empty expected token", () => {
  assert.equal(tokenMatches("s3cret-s3cret", "s3cret-s3cret"), true);
  assert.equal(tokenMatches("s3cret-s3cres", "s3cret-s3cret"), false);
  assert.equal(tokenMatches("s3cret", "s3cret-s3cret"), false, "different lengths");
  assert.equal(tokenMatches("", ""), false, "an empty expected token matches nothing");
  assert.equal(tokenMatches(null, "s3cret"), false);
  assert.equal(tokenMatches("s3cret", null), false);
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
