/**
 * The entry esbuild bundles into admin/public/vendor/firebase-auth.<hash>.js: the part of
 * the Firebase SDK that `/auth.js` needs, and nothing else. The admin pages allow no
 * third-party script (CSP `script-src 'self'`), so the SDK is self-hosted here the way the
 * site self-hosts count.js, and committed like every other generated asset.
 *
 * `node admin/build.mjs` runs the bundle step when admin/node_modules is present and the
 * output is missing or older than package-lock.json (`npm install` in admin/ first).
 *
 * What is self-hosted is the SDK's code. At runtime the popup flow still goes out: the
 * popup itself opens `https://<authDomain>/__/auth/handler` (our own host, served by
 * Firebase Hosting's reserved `/__/` namespace), the SDK loads Google's gapi loader
 * `https://apis.google.com/js/api.js` to talk to the `/__/auth/iframe` frame it embeds,
 * and it exchanges tokens with Identity Toolkit (`https://identitytoolkit.googleapis.com`)
 * and refreshes them against Secure Token (`https://securetoken.googleapis.com`). The CSP
 * in firebase.json allows exactly those.
 */

export { initializeApp } from 'firebase/app';
export {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
