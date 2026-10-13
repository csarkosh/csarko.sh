/**
 * Which group a referrer belongs to: search, social, newsletter, code,
 * video, direct or other. GoatCounter already folds the Google country
 * domains into one "Google" row (`ref_scheme: "g"`), and reports a visit
 * with no referrer as an empty name; everything else is a host, sometimes
 * with a path, which is classified by its host alone.
 */

const GROUPS = [
  ["search", [/^(www\.)?google\./, /^(www\.)?bing\./, /^(www\.)?duckduckgo\./, /(^|\.)yahoo\./, /^(www\.)?ecosia\./, /^search\.brave\.com$/, /^(www\.)?brave\.com$/, /^(www\.)?startpage\.com$/, /^(www\.)?qwant\.com$/, /^yandex\./, /^(www\.)?baidu\.com$/]],
  ["social", [/(^|\.)linkedin\.com$/, /^lnkd\.in$/, /^t\.co$/, /(^|\.)twitter\.com$/, /^(www\.)?x\.com$/, /(^|\.)facebook\.com$/, /^(l\.|m\.)?facebook\.com$/, /^fb\.me$/, /(^|\.)instagram\.com$/, /^l\.instagram\.com$/, /(^|\.)bsky\.app$/, /(^|\.)threads\.net$/, /^(www\.|old\.|out\.)?reddit\.com$/, /^news\.ycombinator\.com$/, /(^|\.)mastodon\.(social|online|world)$/, /^(www\.)?(hachyderm\.io|fosstodon\.org|mstdn\.social|techhub\.social|infosec\.exchange)$/, /^(www\.)?lobste\.rs$/]],
  ["newsletter", [/(^|\.)substack\.com$/, /^substack\.com$/, /^mail\./, /(^|\.)outlook\.(com|live\.com|office\.com)$/, /^outlook\./, /(^|\.)gmail\.com$/, /^(www\.)?getpocket\.com$/, /^email\./]],
  ["code", [/(^|\.)github\.com$/, /^github\.io$/, /(^|\.)gitlab\.com$/, /(^|\.)npmjs\.com$/, /(^|\.)codeberg\.org$/, /(^|\.)sourcehut\.org$/]],
  ["video", [/(^|\.)youtube\.com$/, /^youtu\.be$/, /(^|\.)vimeo\.com$/]],
];

/** The host of a referrer as GoatCounter shows it: `https://www.a.com/x` and `www.a.com/x` both give `www.a.com`. */
export function hostOf(referrer) {
  const text = String(referrer ?? "").trim().toLowerCase();
  if (text === "") return "";
  const withoutScheme = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  return withoutScheme.split(/[/?#]/)[0].replace(/:\d+$/, "");
}

/**
 * @param referrer the GoatCounter row's `name`
 * @param scheme the row's `ref_scheme`: `g` is a generated group such as "Google", `c` a campaign
 */
export function classifyReferrer(referrer, scheme = undefined) {
  const text = String(referrer ?? "").trim();
  if (text === "" || text === "(no data)" || text === "(direct)") return "direct";
  if (scheme === "g") {
    const lower = text.toLowerCase();
    if (/google|bing|duckduckgo|yahoo|ecosia|brave|startpage|qwant|yandex|baidu/.test(lower)) return "search";
    if (/hacker news|reddit|twitter|linkedin|facebook|mastodon|bluesky/.test(lower)) return "social";
  }
  const host = hostOf(text);
  if (host === "") return "direct";
  for (const [group, patterns] of GROUPS) {
    if (patterns.some((p) => p.test(host))) return group;
  }
  // GoatCounter's generated names are words, not hosts ("Hacker News", "Google").
  const lower = text.toLowerCase();
  if (/^google$|^bing$|^duckduckgo$|^yahoo/.test(lower)) return "search";
  if (/^hacker news$|^reddit$|^twitter$|^linkedin$|^facebook$/.test(lower)) return "social";
  return "other";
}

export const REFERRER_GROUPS = ["search", "social", "newsletter", "code", "video", "direct", "other"];

/** Referrer rows grouped and summed, every group present even at zero so the bars keep their order. */
export function groupReferrers(rows) {
  const sums = new Map(REFERRER_GROUPS.map((g) => [g, 0]));
  const out = rows.map((r) => {
    const group = classifyReferrer(r.name, r.ref_scheme);
    const visitors = Number(r.count ?? 0);
    sums.set(group, sums.get(group) + visitors);
    return { referrer: r.name === "" ? "(direct)" : String(r.name), group, visitors };
  });
  return {
    groups: REFERRER_GROUPS.map((group) => ({ group, visitors: sums.get(group) })),
    rows: out.sort((a, b) => b.visitors - a.visitors),
  };
}
