/**
 * The finance page's categories (spec 2026-10-29, section 3): one fixed list in the order the
 * page draws them, and the rule table that puts a provider's line into one of them.
 *
 * A line is `{ provider, service, line }`: for AWS the Cost Explorer SERVICE and USAGE_TYPE
 * (`BoxUsage:g4dn.xlarge`, `USW2-EBS:SnapshotUsage`), for GCP the export's service and SKU
 * descriptions (`Compute Engine`, `Nvidia L4 GPU running in Americas`), for GitHub the usage
 * endpoint's product and SKU (`actions`, `Actions Linux`). The first rule that matches wins;
 * nothing matching is `other`, which the page lists so the table gets a row.
 *
 * Each category has a kind: `idle` bills while nothing runs (the number the page exists for),
 * `activity` bills because something ran, `fixed` is a flat line (the domain's yearly renewal, the
 * claude.ai subscription's monthly fee, which `claude.mjs` writes straight into `claudeCode`:
 * no rule here). Tax follows the rest and is counted as activity.
 */

export const CATEGORIES = [
  { key: "compute", label: "Compute", kind: "activity" },
  { key: "serverless", label: "Serverless", kind: "activity" },
  { key: "hosting", label: "Hosting and bandwidth", kind: "activity" },
  { key: "loadBalancing", label: "Load balancing", kind: "idle" },
  { key: "storage", label: "Storage", kind: "idle" },
  { key: "ai", label: "AI generation", kind: "activity" },
  { key: "dns", label: "DNS, keys and secrets", kind: "idle" },
  { key: "domains", label: "Domains", kind: "fixed" },
  { key: "claudeCode", label: "Claude Code", kind: "fixed" },
  { key: "ci", label: "CI", kind: "activity" },
  { key: "tax", label: "Tax", kind: "activity" },
  { key: "other", label: "Other", kind: "activity" },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

/** The category record for a key (`other` for an unknown one). */
export function categoryOf(key) {
  return BY_KEY.get(key) ?? BY_KEY.get("other");
}

/** `idle`, `activity` or `fixed`. */
export function kindOf(key) {
  return categoryOf(key).kind;
}

/**
 * The rules, per provider, tested in order against the line (AWS, GitHub) or the service and
 * SKU (GCP). AWS usage types carry an optional region prefix (`USW2-`, `us-west-2-`), so every
 * AWS pattern is unanchored at the start.
 */
const AWS_RULES = [
  [/BoxUsage:/, "compute"],
  [/SpotUsage:/, "compute"],
  [/EBS:VolumeUsage/, "storage"],
  [/EBS:SnapshotUsage/, "storage"],
  [/EBS:/, "storage"],
  [/TimedStorage-ByteHrs/, "storage"],
  [/Requests-Tier/, "storage"],
  [/^HostedZone$/, "dns"],
  [/KMS-Keys/, "dns"],
  [/AWSSecretsManager/, "dns"],
  [/^DNS-Queries$/, "hosting"],
  [/PublicIPv4:InUseAddress/, "hosting"],
  [/PublicIPv4:IdleAddress/, "hosting"],
  [/DataTransfer-Out-Bytes/, "hosting"],
  [/^Route53-Domains$/, "domains"],
  [/^Tax$/, "tax"],
];

/** AWS lines told apart by service rather than usage type: the registrar bills the renewal under its own service. */
const AWS_SERVICE_RULES = [
  [/Amazon Registrar/, "domains"],
  [/^Tax$/, "tax"],
];

const GITHUB_RULES = [
  [/^actions$/i, "ci"],
  [/^git_lfs$/i, "ci"],
];

function awsCategory(service, line) {
  for (const [re, key] of AWS_RULES) if (re.test(line)) return key;
  for (const [re, key] of AWS_SERVICE_RULES) if (re.test(service)) return key;
  return "other";
}

function gcpCategory(service, sku) {
  if (/^Vertex AI/.test(service) || /Gemini|Veo/.test(sku)) return "ai";
  if (service === "Firebase Hosting") return /Storage/i.test(sku) ? "storage" : "hosting";
  if (/^Cloud Load Balancer Forwarding Rule/.test(sku)) return "loadBalancing";
  if (/^Cloud Run/.test(service) || service === "Cloud Functions") return "serverless";
  if (service === "Compute Engine") return /PD Capacity|Snapshot|Storage/i.test(sku) ? "storage" : "compute";
  if (service === "Cloud Storage" || service === "Artifact Registry") return "storage";
  if (service === "Cloud DNS" || service === "Secret Manager" || /Key Management/.test(service)) return "dns";
  if (service === "Networking") return "hosting";
  return "other";
}

function githubCategory(product) {
  for (const [re, key] of GITHUB_RULES) if (re.test(product)) return key;
  return "other";
}

/** The category key of one provider line; `other` when no rule matches. */
export function categorize({ provider, service = "", line = "" }) {
  const s = String(service ?? "");
  const l = String(line ?? "");
  if (provider === "aws") return awsCategory(s, l);
  if (provider === "gcp") return gcpCategory(s, l);
  if (provider === "github") return githubCategory(s || l);
  return "other";
}
