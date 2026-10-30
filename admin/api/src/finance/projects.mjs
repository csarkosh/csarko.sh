/**
 * The second axis of the finance page: which project a line paid for (the contract's `projects`
 * query). Four fixed projects in the page's order and one rule table over the line rows
 * (rows.mjs), by provider:
 *
 *   aws     the domains, the `csarko.sh` zone and its queries are the site; everything else is
 *           Day Hike's (the rigs, their volumes and images, the keys and secrets, tax)
 *   gcp     by project id: `fps-csarko` is Day Hike except Vertex AI (the films' Veo clips),
 *           `csarko-sh` the site and its admin, any other project is other
 *   github  by repository: `game-dayhike` is Day Hike, `csarko.sh` the site, the rest other
 *   modal   by app name: `cinema-*` the films, `dayhike-*` Day Hike, the rest other
 *   fal     every line is the films
 */

import { cents, monthOf } from "./rows.mjs";
import { partialMonths, GCP_EXPORT_FROM } from "./months.mjs";

export const PROJECTS = [
  { key: "films", label: "Films" },
  { key: "dayhike", label: "Day Hike" },
  { key: "site", label: "csarko.sh and admin" },
  { key: "other", label: "Other" },
];
export const PROJECT_KEYS = PROJECTS.map((p) => p.key);

const AWS_SITE = /^(Route53-Domains|HostedZone|DNS-Queries)$/;
const GITHUB_REPOS = { "game-dayhike": "dayhike", "csarko.sh": "site" };

/** The project key of one line row. */
export function projectOf(row) {
  const line = String(row?.line ?? "");
  const where = String(row?.where ?? "");
  switch (row?.provider) {
    case "aws":
      return AWS_SITE.test(line) || /Amazon Registrar/.test(String(row.service ?? "")) ? "site" : "dayhike";
    case "gcp":
      if (where === "fps-csarko") return /^Vertex AI/.test(String(row.service ?? "")) || row.category === "ai" ? "films" : "dayhike";
      if (where === "csarko-sh") return "site";
      return "other";
    case "github": {
      const repo = String(row.repo ?? "").replace(/^[^/]+\//, "");
      return GITHUB_REPOS[repo] ?? "other";
    }
    case "modal":
      if (/^cinema-/.test(line)) return "films";
      if (/^dayhike-/.test(line)) return "dayhike";
      return "other";
    case "fal":
      return "films";
    default:
      return "other";
  }
}

/**
 * The `projects` answer's body for `months` over monthly rows: every project in its fixed order
 * with `byMonth` aligned to `months` (0 where nothing billed) and the partial months, as the
 * categories table has them.
 */
export function projectsTable(rows, months, { exportFrom = GCP_EXPORT_FROM } = {}) {
  const index = new Map(months.map((m, i) => [m, i]));
  const sums = new Map(PROJECT_KEYS.map((k) => [k, months.map(() => 0)]));
  for (const r of rows) {
    const i = index.get(r.month ?? (r.day ? monthOf(r.day) : null));
    if (i === undefined) continue;
    sums.get(projectOf(r))[i] += r.amount;
  }
  return {
    months,
    projects: PROJECTS.map((p) => ({ key: p.key, label: p.label, byMonth: sums.get(p.key).map(cents) })),
    partial: partialMonths(months, exportFrom),
  };
}
