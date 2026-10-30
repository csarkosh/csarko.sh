/**
 * The Films card (the contract's `films` query): each film's ledger from the bucket
 * (`collectors/ledgers.mjs`) shaped as its total against its cap, by provider and by model. The
 * pipeline (`~/Projects/film-generation`, `tools/cinema/make.py` and `frontier.py`) prices every
 * paid call before it is made and appends `{ what, model, gpu, seconds, usd, note }` to
 * `<film>/ledger.json`; the rows carry no dates, so they attribute cost and never feed the daily
 * chart. Veo rows are at the ledger's list rate, so a film's Vertex figure can read higher than
 * Google's bill. Pure over `[{ slug, rows, budgetUsd, updated }]`.
 */

import { cents } from "./rows.mjs";

/** The pipeline's default budget a film, when its sequence sets none (`make.DEFAULT_BUDGET_USD`). */
export const DEFAULT_CAP_USD = 150;
export const FILM_PROVIDERS = ["modal", "fal", "gcp"];

const LABELS = {
  "last-trail": "The Last Trail",
  "ranger-radio": "Ranger Radio, the earlier cut of The Last Trail",
  "rowan-rockslide": "Pipeline spike: rowan-rockslide",
  "rowan-speech": "Pipeline spike: rowan-speech",
};

/** The film's label from the fixed map; a `last-trail-<suffix>` is that cut's takes; any other slug is itself. */
export function filmLabel(slug) {
  const s = String(slug ?? "");
  if (LABELS[s]) return LABELS[s];
  if (s.startsWith("last-trail-") && s.length > "last-trail-".length) return `The Last Trail, ${s.slice("last-trail-".length)} takes`;
  return s;
}

/**
 * Where a ledger row ran: a note naming `vertex` or a model naming Veo is Google (`gcp`), a model
 * naming Seedance, Nano Banana or ElevenLabs is `fal`, everything else ran on Modal.
 */
export function providerOf(row) {
  const model = String(row?.model ?? "");
  const note = String(row?.note ?? "");
  if (/vertex/i.test(note) || /veo/i.test(model)) return "gcp";
  if (/seedance|nano[-_ ]?banana|elevenlabs/i.test(model)) return "fal";
  return "modal";
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** One film's entry from its ledger: the total, the cap, the split by provider and the models, largest first. */
export function filmOf({ slug, rows, budgetUsd = null }) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === "object") : [];
  const byProvider = Object.fromEntries(FILM_PROVIDERS.map((p) => [p, 0]));
  const models = new Map();
  let total = 0;
  for (const r of list) {
    const usd = num(r.usd);
    const provider = providerOf(r);
    total += usd;
    byProvider[provider] += usd;
    const model = String(r.model ?? "");
    const key = `${model}\u0000${provider}`;
    const m = models.get(key) ?? { model, provider, usd: 0, calls: 0, seconds: 0 };
    m.usd += usd;
    m.calls += 1;
    m.seconds += num(r.seconds);
    models.set(key, m);
  }
  return {
    key: String(slug),
    label: filmLabel(slug),
    total: cents(total),
    capUsd: typeof budgetUsd === "number" && budgetUsd > 0 ? budgetUsd : DEFAULT_CAP_USD,
    byProvider: Object.fromEntries(FILM_PROVIDERS.map((p) => [p, cents(byProvider[p])])),
    byModel: [...models.values()]
      .map((m) => ({ model: m.model, provider: m.provider, usd: cents(m.usd), calls: m.calls, seconds: Math.round(m.seconds) }))
      .sort((a, b) => b.usd - a.usd || a.model.localeCompare(b.model)),
  };
}

/** The `films` answer's body over the bucket's ledgers: `asOf` the newest object's update time (null when the bucket is empty), the films largest first. */
export function filmsOf(ledgers) {
  const list = Array.isArray(ledgers) ? ledgers : [];
  let asOf = null;
  for (const l of list) if (typeof l.updated === "string" && (asOf === null || l.updated > asOf)) asOf = l.updated;
  return {
    asOf,
    films: list.map(filmOf).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)),
  };
}
