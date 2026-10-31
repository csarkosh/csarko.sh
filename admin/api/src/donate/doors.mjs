/**
 * The donate site's fixed vocabulary: where it lives, the three tiers every door shares, and the
 * seven doors (one per project, plus the bare door for the whole body of work). A door is a page
 * on donate.csarko.sh that shows the project's own picture and words over the same bill, so only
 * the copy here differs from door to door; the prices come from prices.mjs and the last 30 days' pool.
 * The repository is public, so everything written here is public copy: Cyrus's register (first
 * person, dry, short), no em-dash, no address.
 *
 * `picture.source` is relative to `.agents/skills/site-quality/assets/`; `focusY` is the fraction
 * of the source's height at which a landscape crop is centred, for a source taller than wide.
 */

/**
 * The first day the step may price, the launch day (the spec's section 3, "The first pool and the
 * launch"): a run before it does nothing.
 */
export const DONATE_FROM = "2026-10-31";
/** The bill is the 30 days ending yesterday (UTC). */
export const WINDOW_DAYS = 30;
/** Prices turn every seven days from the last repricing. */
export const REPRICE_DAYS = 7;
/**
 * A sweep retires the Stripe objects of a period repriced more than this many days before the
 * current one, so the deployed pages' baked links still pay for a month after a turn.
 */
export const KEEP_DAYS = 35;

/**
 * The launch flag. Flipped to `true` by the launch commit (plan Task 9 Step 3) once donate.csarko.sh
 * serves the doors; until then the entrances on csarko.sh and apps.csarko.sh render nothing.
 */
export const DONATE_LIVE = false;

export const DONATE_URL = "https://donate.csarko.sh";
export const PRICES_BUCKET = "csarko-sh-donate-prices";
export const PRICES_OBJECT = "prices.json";
export const PRICES_URL = `https://storage.googleapis.com/${PRICES_BUCKET}/${PRICES_OBJECT}`;

/** The three tiers, each a share of the last 30 days' pool. */
export const TIERS = [
  { key: "prompt", name: "A prompt", share: 0.01 },
  { key: "context", name: "A long context window", share: 0.03 },
  { key: "run", name: "A whole agent run", share: 0.1 },
];
/** The fourth, dashed row: any amount from the minimum up. */
export const CUSTOM = { key: "own", name: "Your own number", minimumUsd: 1 };
export const TIER_KEYS = [...TIERS.map((t) => t.key), CUSTOM.key];

const APP_THANKS = "Tokens received. The next agent run is on you.";
const APP_CAPTIONS = ["a quick fix, a good question", "a whole feature, read end to end", "a milestone, start to merge"];
const FILM_CAPTIONS = ["one more take", "a scene, start to end", "a cut"];

export const DOORS = [
  {
    door: "arkos", slug: "ide-arkos", name: "Arkos IDE", kind: "app", shipped: true, path: "/arkos",
    headline: "Fund my next agent run",
    lead: "Arkos is free. If it saved you a few hours, cover a slice of the cloud bill that builds it and everything else here.",
    captions: APP_CAPTIONS, thanks: APP_THANKS,
    back: { label: "Back to Arkos IDE", href: "https://apps.csarko.sh/ide-arkos" },
    picture: { source: "apps/ide-arkos.png" },
  },
  {
    door: "macstats", slug: "app-macstats", name: "MacStats", kind: "app", shipped: true, path: "/macstats",
    headline: "Fund my next agent run",
    lead: "MacStats is free and runs on your Mac. If it told you something useful, cover a slice of the agent time that builds it.",
    captions: ["a quick fix, a good question", "a new panel, read end to end", "a release, start to merge"],
    thanks: APP_THANKS,
    back: { label: "Back to MacStats", href: "https://apps.csarko.sh/app-macstats" },
    picture: { source: "apps/app-macstats.png" },
  },
  {
    door: "visits", slug: "lib-visits", name: "lib-visits", kind: "app", shipped: true, path: "/visits",
    headline: "Fund my next agent run",
    lead: "lib-visits is free and counts without cookies. If you use it, cover a slice of the cloud bill it runs on.",
    captions: APP_CAPTIONS, thanks: APP_THANKS,
    back: { label: "Back to lib-visits", href: "https://apps.csarko.sh/lib-visits" },
    picture: { source: "apps/lib-visits.png", dark: "apps/lib-visits-dark.png" },
  },
  {
    door: "last-trail", slug: "the-last-trail", name: "The Last Trail", kind: "film", shipped: true, path: "/last-trail",
    headline: "Fund the next short",
    lead: "The Last Trail is free to watch. If it got under your skin, cover a slice of the compute that makes the next one.",
    captions: FILM_CAPTIONS, thanks: "Tokens received. The next take is on you.",
    back: { label: "Back to the film", href: "https://www.youtube.com/shorts/C1XsDuJE4MQ" },
    // The poster is a portrait, 720 by 960: at 0.42 the 16:9 crop runs from the brows to the
    // radio's lit LED, so her eyes and the radio are both in frame (0.3 lost the radio).
    picture: { source: "films/the-last-trail.jpg", focusY: 0.42 },
  },
  {
    door: "hallway", slug: "who-is-standing-in-my-hallway", name: "Who is standing in my hallway?", kind: "film", shipped: true, path: "/hallway",
    headline: "Fund the next short",
    lead: "It is free to watch, all 16 seconds. If it kept you up, cover a slice of the compute behind the next one.",
    captions: FILM_CAPTIONS, thanks: "Tokens received. The next take is on you.",
    back: { label: "Back to the film", href: "https://www.youtube.com/shorts/jBh7F1knRAA" },
    // The poster is a portrait, 1080 by 1440: a 16:9 crop is 42% of its height, and at 0.25 it
    // runs from the hair to below the mouth, face and eyes in frame.
    picture: { source: "films/who-is-standing-in-my-hallway.jpg", focusY: 0.25 },
  },
  {
    door: "all", slug: null, name: "The whole body of work", kind: "all", shipped: true, path: "/",
    headline: "Fund the next agent run",
    lead: "Everything here is free: the apps, the game, the films. If any of it was worth your time, cover a slice of the bill that builds it.",
    captions: APP_CAPTIONS, thanks: APP_THANKS,
    back: { label: "Back to the projects", href: "https://csarko.sh/projects" },
    picture: { source: "donate/body-of-work.png" },
  },
  {
    door: "dayhike", slug: "day-hike", name: "Day Hike", kind: "game", shipped: false, path: "/dayhike",
    headline: "Fund the next build",
    lead: "Day Hike is free and plays in your browser. If you made it back from the woods, cover a slice of the cloud bill that runs it.",
    captions: ["a bug fix, a good question", "a whole system, read end to end", "a build, start to merge"],
    thanks: "Tokens received. The next build is on you.",
    back: { label: "Back to Day Hike", href: "https://games.csarko.sh/dayhike/" },
    picture: null,
  },
];

/** The door for a project card's slug, else null. */
export const doorOf = (slug) => DOORS.find((d) => d.slug === slug) ?? null;
/** The door by its key (`arkos`, `all`...), else null. */
export const doorByKey = (door) => DOORS.find((d) => d.door === door) ?? null;
/** The doors that build today. */
export const shippedDoors = () => DOORS.filter((d) => d.shipped);
