/**
 * The health dot, from the spec's 1.4: good when the site is up, Lighthouse
 * performance is 95 or more, every sitemap URL is indexed, the sitemap was
 * fetched within a week and no 404 path has more than a handful of hits;
 * warning when one of those slips; critical when the site is down or
 * performance drops under 90. A check whose value is unknown (null: not
 * configured, no snapshot yet) does not degrade the status, since "we do not
 * know" is not "it is broken"; the note says what is unknown.
 */

export const PERFORMANCE_GOOD = 95;
export const PERFORMANCE_CRITICAL = 90;
export const NOT_FOUND_HANDFUL = 5;
export const SITEMAP_FRESH_DAYS = 7;
export const CERT_WARN_DAYS = 14;

export function assessHealth({ up, lighthousePerformance, indexed, notFound, sitemapFetchedAt, certDaysLeft, now = Date.now() }) {
  const critical = [];
  const warnings = [];
  const unknown = [];

  if (up === false) critical.push("site down");
  else if (up === null || up === undefined) unknown.push("uptime");

  if (typeof lighthousePerformance === "number") {
    if (lighthousePerformance < PERFORMANCE_CRITICAL) critical.push(`performance ${lighthousePerformance}`);
    else if (lighthousePerformance < PERFORMANCE_GOOD) warnings.push(`performance ${lighthousePerformance}`);
  } else unknown.push("lighthouse");

  if (indexed && typeof indexed.indexed === "number" && typeof indexed.total === "number") {
    if (indexed.indexed < indexed.total) warnings.push(`${indexed.total - indexed.indexed} of ${indexed.total} pages not indexed`);
  } else unknown.push("indexing");

  if (Array.isArray(notFound)) {
    const loud = notFound.filter((n) => n.visitors > NOT_FOUND_HANDFUL);
    if (loud.length > 0) warnings.push(`${loud.length} 404 path${loud.length === 1 ? "" : "s"} with more than ${NOT_FOUND_HANDFUL} hits`);
  } else unknown.push("404s");

  if (typeof sitemapFetchedAt === "string") {
    const age = (now - Date.parse(sitemapFetchedAt)) / 86_400_000;
    if (!Number.isNaN(age) && age > SITEMAP_FRESH_DAYS) warnings.push(`sitemap last fetched ${Math.floor(age)} days ago`);
  } else if (sitemapFetchedAt !== undefined) unknown.push("sitemap fetch");

  if (typeof certDaysLeft === "number") {
    if (certDaysLeft <= 0) critical.push("certificate expired");
    else if (certDaysLeft < CERT_WARN_DAYS) warnings.push(`certificate expires in ${certDaysLeft} days`);
  }

  const status = critical.length > 0 ? "critical" : warnings.length > 0 ? "warning" : "good";
  const parts = [...critical, ...warnings];
  let note = parts.length > 0 ? parts.join("; ") : "all checks pass";
  if (unknown.length > 0) note += `${parts.length > 0 ? "; " : ", "}unknown: ${unknown.join(", ")}`;
  return { status, note };
}
