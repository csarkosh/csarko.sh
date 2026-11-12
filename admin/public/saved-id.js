/**
 * The id of a saved answer in Firestore (`adminViews/<id>`), the browser's copy of
 * admin/api/src/saved.mjs `savedId`: the app's slug, the route under its prefix and the parameters
 * that shape the answer, sorted, URI-encoded. admin/api/test/saved.test.mjs holds the two to one
 * another. No imports, so that test can load it.
 */

export const SAVED_PARAMS = ['days', 'range', 'tz', 'who'];

export function savedId(slug, path, params) {
  const kept = SAVED_PARAMS.filter((k) => params?.[k] !== null && params?.[k] !== undefined && params?.[k] !== '').map((k) => `${k}=${params[k]}`);
  return encodeURIComponent(`${slug}${path}${kept.length > 0 ? `?${kept.join('&')}` : ''}`);
}
