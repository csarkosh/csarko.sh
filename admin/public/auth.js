/**
 * Sign-in for the admin host: a Google account through Firebase Auth on project csarko-sh,
 * checked against an email allowlist by every app's API, exactly as Day Hike's admin page
 * had. The only auth surface on the client: the csarko.sh page and the Day Hike bundle both
 * import this file as `/auth.js`, so its exports are a contract (admin/CONTRACT.md, "Auth"):
 *
 *   requireSession(root, onReady)   the gate until someone is signed in, then onReady(user)
 *   user()                          { email } | null
 *   fetchWithAuth(url, init)        fetch() with `Authorization: Bearer <fresh ID token>`
 *   signOut()                       Firebase signOut
 *
 * The SDK is self-hosted (vendor/firebase-auth.<hash>.js, bundled by build.mjs from
 * admin/vendor/firebase-auth.js; the path below is generated) and imported only when a page
 * asks for a session, so `?preview` never loads it. The session persists in localStorage
 * (browserLocalPersistence), never a cookie. The page never decides who is allowed: it sends
 * the ID token, the API answers 401 to an account that is not on the list, and the gate comes
 * back with "<email> is not on the list." and a Sign out, so another account can be tried.
 *
 * What is self-hosted is the SDK's code. At runtime the popup flow still goes out: the popup
 * opens https://<authDomain>/__/auth/handler (our host, Firebase Hosting's reserved
 * namespace), the SDK loads Google's gapi loader https://apis.google.com/js/api.js to talk
 * to the /__/auth/iframe frame it embeds, and it exchanges and refreshes tokens with
 * https://identitytoolkit.googleapis.com and https://securetoken.googleapis.com. The CSP in
 * firebase.json allows exactly that.
 *
 * A build with no key in auth-config.json has no sign-in: the gate says so and points at
 * ?preview, as the game's page did.
 */

import { fadeIn, fadeOut, hideMenu, showMenu, tokens } from '/motion.js';

// generated:vendor
const VENDOR = '/vendor/firebase-auth.febf56d0.js';
// /generated:vendor
const CONFIG_URL = '/auth-config.json';
export const UNAUTHORIZED = 'admin:unauthorized';

/** The signed-in account as `{ email }`, kept in step by onAuthStateChanged; null when nobody is. */
let current = null;
/** The SDK, initialised once: Promise<{ sdk, auth, provider } | null>, null when the build has no sign-in. */
let sdkPromise = null;

async function loadConfig() {
  try {
    const response = await fetch(CONFIG_URL, { cache: 'no-cache' });
    if (!response.ok) return null;
    const config = await response.json();
    return config && typeof config.apiKey === 'string' && config.apiKey.trim() ? config : null;
  } catch {
    return null;
  }
}

/** Load the SDK and sign-in config once; null when the build has none. */
function session() {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const config = await loadConfig();
      if (!config) return null;
      const sdk = await import(VENDOR);
      const app = sdk.initializeApp({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId });
      const auth = sdk.getAuth(app);
      await sdk.setPersistence(auth, sdk.browserLocalPersistence);
      sdk.onAuthStateChanged(auth, (account) => { current = account ? { email: account.email ?? '' } : null; });
      const provider = new sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return { sdk, auth, provider };
    })();
  }
  return sdkPromise;
}

/** The signed-in account, `{ email }`, or null. */
export function user() {
  return current;
}

/**
 * fetch() with a fresh ID token as the bearer, no credentials and CORS mode. A 401 announces
 * `admin:unauthorized` on window with `{ detail: { email, url } }` (the gate listens) and the
 * Response is still returned, so a caller can read the body or throw as it likes.
 */
export async function fetchWithAuth(url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  const s = await session();
  let account = null;
  if (s) {
    await s.auth.authStateReady();
    account = s.auth.currentUser;
    if (account) headers.set('Authorization', `Bearer ${await account.getIdToken()}`);
  }
  const response = await fetch(url, { ...init, headers, credentials: 'omit', mode: 'cors' });
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED, { detail: { email: account?.email ?? null, url } }));
  }
  return response;
}

/** Sign the account out; the gate returns through onAuthStateChanged. */
export async function signOut() {
  // Drop the persisted session at once too, so a caller that reloads the page right after
  // calling this (the old `clearToken(); location.reload()`) does not come back signed in.
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('firebase:authUser:')) localStorage.removeItem(key);
  } catch { /* storage blocked: the SDK's own sign-out below is enough */ }
  const s = await session();
  if (s) await s.sdk.signOut(s.auth);
  current = null;
  menuHost?.replaceChildren();
}

const make = (tag, attrs, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  node.append(...children);
  return node;
};

/** Where the nav's account menu was rendered, so signing out clears it along with the page. */
let menuHost = null;

/** "CS" for Cyrus Sarkosh: the first letters of the name's first and last words, else the email's first letter; '' with no account. */
export function initialsOf(account) {
  if (!account) return '';
  const words = String(account.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const local = String(account.email ?? '').split('@')[0];
  return local ? local[0].toUpperCase() : '';
}

/**
 * The nav's account (Cyrus, 2026-10-13: in place of the app links): a round profile button
 * that toggles a small menu with the Live or Sample badge, the signed-in email and Sign out.
 * Rendered into `host`, the nav's `#account`, by each page once it is ready. Under
 * `?preview` there is no account: the menu says so and has no Sign out. The menu closes on
 * Escape, on a click elsewhere, and when Sign out is pressed; the gate then returns. It grows
 * in from the button's corner and fades out (motion.js showMenu, hideMenu); the button's
 * `aria-expanded` says where it is going, so a click while it moves turns it round.
 */
export function accountMenu(host, { account = null, preview = false } = {}) {
  menuHost = host;
  // Signed in, the button is the account's initials in the accent circle (Cyrus,
  // 2026-10-13); with nobody signed in, the generic profile mark.
  const initials = initialsOf(account);
  let face;
  if (initials) {
    face = make('span', { 'aria-hidden': 'true' }, initials);
  } else {
    face = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) face.setAttribute(k, v);
    for (const d of ['M20 21a8 8 0 0 0-16 0', 'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      face.append(path);
    }
  }
  const button = make('button', { class: `avatar${initials ? ' me' : ''}`, type: 'button', 'aria-label': account ? `Account, ${account.name ?? account.email}` : 'Account', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'account-menu' }, face);
  const menu = make('div', { class: 'menu', id: 'account-menu', hidden: true },
    make('span', { class: `badge ${preview ? 'sample' : 'live'}` }, preview ? 'Sample data' : 'Live'),
    ...(account?.name ? [make('p', { class: 'name' }, account.name)] : []),
    account ? make('p', { class: 'email' }, account.email) : make('p', { class: 'note' }, 'Nobody is signed in: the page shows the sample data set.'));
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';
  const close = () => { hideMenu(menu); button.setAttribute('aria-expanded', 'false'); };
  const open = () => { showMenu(menu); button.setAttribute('aria-expanded', 'true'); };
  if (account) {
    const out = make('button', { class: 'btn ghost small', type: 'button' }, 'Sign out');
    out.addEventListener('click', () => { close(); signOut(); });
    menu.append(out);
  }
  button.addEventListener('click', () => { if (isOpen()) close(); else open(); });
  document.addEventListener('click', (event) => { if (isOpen() && !host.contains(event.target)) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isOpen()) { close(); button.focus(); } });
  host.replaceChildren(button, menu);
}

const NO_SIGN_IN = 'This build has no sign-in. Add ?preview to the address to see the page with sample data.';

/**
 * The gate: a heading, one sentence, "Sign in with Google", and a note line for what went
 * wrong. `refused` adds a "Sign out" so another account can be tried; `disabled` is the
 * build with no sign-in.
 */
function gateMarkup({ note, refused, disabled }) {
  const signIn = make('button', { class: 'btn primary', type: 'button', disabled }, 'Sign in with Google');
  const signOutButton = refused ? make('button', { class: 'btn ghost', type: 'button' }, 'Sign out') : null;
  const line = make('p', { class: 'note', role: 'status' }, note ?? (disabled ? NO_SIGN_IN : ''));
  const root = make('section', { class: 'gate', 'aria-labelledby': 'gate-title' },
    make('h1', { id: 'gate-title' }, 'Admin'),
    make('p', {}, 'Sign in with a Google account on the list; this browser keeps the session.'),
    make('div', { class: 'actions' }, signIn, ...(signOutButton ? [signOutButton] : [])),
    line);
  return { root, signIn, signOutButton, line };
}

// Material's fade through, for a full change of what the page shows (page ↔ gate): what leaves
// fades out over short2, then `change()` swaps them and what arrives fades in over short4
// (`arrive`). `current()` says whether this swap is still the latest, so a later one supersedes
// a waiting one. Under reduced motion it swaps at once.
function fadeThrough(leaving, change, current) {
  const outs = leaving.map((node) => fadeOut(node, tokens().short2)).filter(Boolean);
  const go = () => { if (current()) change(); };
  if (!outs.length) go();
  else Promise.allSettled(outs.map((a) => a.finished)).then(go);
}
// The gate also grows from a slight scale; the page only fades, since its cards measure their
// heights as they load (charts.js hold, settle) and a scale would skew what they remember.
function arrive(node, { grow = false } = {}) {
  const t = tokens();
  fadeIn(node, t.short4);
  if (grow && t.short4 && typeof node.animate === 'function') {
    node.animate([{ transform: 'scale(0.92)' }, { transform: 'none' }], { duration: t.short4, easing: t.decelerate });
  }
}

/**
 * Show the gate until someone is signed in, then call onReady({ email }). The page's
 * existing content (the children of `root`) is hidden behind the gate rather than thrown
 * away, so the static header and nav come back as they were. The gate returns on sign-out,
 * and on `admin:unauthorized` with "<email> is not on the list." and a Sign out. Page and
 * gate swap with a fade through; onReady runs once the page is back, at once when no gate
 * was up (a session restored on load).
 */
export function requireSession(root, onReady) {
  let gate = null;
  /** The page's own nodes, hidden behind the gate or fading out for it. */
  let hidden = [];
  let turns = 0;
  /** The uid onReady last ran for, so a repeated auth event does not load the page twice. */
  let active = null;
  let s = null;

  const hide = (then) => {
    const mine = ++turns;
    const leaving = gate;
    const back = hidden;
    const done = () => {
      leaving?.remove();
      if (gate === leaving) gate = null;
      hidden = [];
      for (const node of back) {
        node.hidden = false;
        arrive(node);
      }
      then();
    };
    if (leaving) fadeThrough([leaving], done, () => mine === turns);
    else {
      // Fading out for a gate that has not come up yet: they come straight back.
      for (const node of back) fadeIn(node);
      hidden = [];
      then();
    }
  };
  const ready = (account) => {
    active = account.uid;
    current = { email: account.email ?? '', name: account.displayName || null };
    hide(() => onReady(current));
  };
  const show = (state) => {
    const mine = ++turns;
    const { root: node, signIn, signOutButton, line } = gateMarkup(state);
    const up = () => {
      if (gate) gate.replaceWith(node);
      else {
        for (const page of hidden) page.hidden = true;
        root.append(node);
      }
      gate = node;
      arrive(node, { grow: true });
      signIn.focus({ preventScroll: true });
    };
    if (gate) up();
    else {
      if (!hidden.length) hidden = Array.from(root.children).filter((child) => !child.hidden);
      fadeThrough(hidden, up, () => mine === turns);
    }
    signIn.addEventListener('click', async () => {
      if (!s) return;
      signIn.disabled = true;
      try {
        const result = await s.sdk.signInWithPopup(s.auth, s.provider);
        // The same account again (after a 401, say) fires no auth event: load for it here.
        if (gate && result.user && active !== result.user.uid) ready(result.user);
      } catch (error) {
        const code = error?.code ?? '';
        if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
          line.textContent = `Could not sign in: ${error?.message ?? String(error)}`;
        }
      } finally {
        signIn.disabled = false;
      }
    });
    signOutButton?.addEventListener('click', () => { signOut(); });
  };

  window.addEventListener(UNAUTHORIZED, (event) => {
    active = null;
    const email = event.detail?.email ?? current?.email ?? null;
    show({ note: email ? `${email} is not on the list.` : 'That account was refused.', refused: Boolean(email) });
  });

  session().then((loaded) => {
    s = loaded;
    if (!s) { show({ disabled: true }); return; }
    s.sdk.onAuthStateChanged(s.auth, (account) => {
      if (!account) { active = null; show({}); return; }
      if (active !== account.uid) ready(account);
    });
  }).catch((error) => {
    // The SDK or its config could not be loaded: say so rather than leave the page blank.
    show({ disabled: true, note: `Could not start sign-in: ${error?.message ?? String(error)}` });
  });
}

// One release of the token gate's names, so the Day Hike bundle built against them still
// loads: requireToken, clearToken and token (always null now; the ID token is fetched fresh
// inside fetchWithAuth). setToken is gone. Remove these once that bundle is rebuilt.
export const requireToken = requireSession;
export const clearToken = signOut;
export function token() {
  return null;
}
