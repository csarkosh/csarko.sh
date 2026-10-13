/**
 * The admin token gate: the only auth surface on the client (spec 2.1).
 *
 * One long random token, pasted once per browser, kept in localStorage under
 * `admin.token` (never a cookie) and sent as `Authorization: Bearer` to every app's API.
 * When no token is stored, or an API answers 401, the shell shows one field, "Admin
 * token", and nothing else. The csarko.sh page and the Day Hike bundle both import this
 * file as `/auth.js`, so its exports are a contract: token, setToken, clearToken,
 * fetchWithAuth, requireToken.
 */

const KEY = 'admin.token';
export const UNAUTHORIZED = 'admin:unauthorized';
/** The token for this page only, when storage is blocked. */
let memory = null;

/** The stored token, or null. Storage can be blocked or throw; treat that as no token. */
export function token() {
  try {
    const value = localStorage.getItem(KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function setToken(value) {
  const trimmed = String(value ?? '').trim();
  try {
    if (trimmed) localStorage.setItem(KEY, trimmed);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the token lives for this page only, in the closure below.
    memory = trimmed || null;
  }
}

export function clearToken() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
}

const current = () => token() ?? memory;

/**
 * fetch() with the bearer token, no credentials and CORS mode. A 401 announces
 * `admin:unauthorized` on window (the gate listens) and the Response is still returned,
 * so a caller can read the body or throw as it likes.
 */
export async function fetchWithAuth(url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  const bearer = current();
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  const response = await fetch(url, { ...init, headers, credentials: 'omit', mode: 'cors' });
  if (response.status === 401) window.dispatchEvent(new CustomEvent(UNAUTHORIZED, { detail: { url } }));
  return response;
}

function gateMarkup(note) {
  const doc = document;
  const make = (tag, attrs, ...children) => {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.append(...children);
    return node;
  };
  const input = make('input', { id: 'admin-token', type: 'password', autocomplete: 'off', spellcheck: 'false', required: '', placeholder: 'Paste the token' });
  const button = make('button', { class: 'btn primary', type: 'submit' }, 'Continue');
  const form = make('form', { class: 'field token', 'aria-describedby': 'admin-token-help' },
    make('label', { for: 'admin-token' }, 'Admin token', input),
    make('div', {}, button));
  const root = make('section', { class: 'gate', 'aria-labelledby': 'gate-title' },
    make('h1', { id: 'gate-title' }, 'Admin'),
    make('p', { id: 'admin-token-help' }, 'Paste the admin token once; this browser keeps it and sends it to each app with every request.'),
    form);
  if (note) root.append(make('p', { class: 'note', role: 'status' }, note));
  return { root, form, input };
}

/**
 * Show the gate until a token is stored, then call onReady(). The page's existing content
 * (the children of `root`) is hidden behind the gate rather than thrown away, so the
 * static header and nav come back as they were. On `admin:unauthorized` the token is
 * dropped and the gate returns with "That token was refused."
 */
export function requireToken(root, onReady) {
  let gate = null;
  let hidden = [];

  const show = (note) => {
    if (gate) gate.remove();
    hidden = Array.from(root.children).filter((node) => !node.hidden);
    for (const node of hidden) node.hidden = true;
    const { root: node, form, input } = gateMarkup(note);
    gate = node;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      setToken(input.value);
      hide();
      onReady();
    });
    root.append(gate);
    input.focus();
  };
  const hide = () => {
    if (gate) gate.remove();
    gate = null;
    for (const node of hidden) node.hidden = false;
    hidden = [];
  };

  window.addEventListener(UNAUTHORIZED, () => {
    clearToken();
    show('That token was refused.');
  });

  if (current()) onReady();
  else show(null);
}
