/**
 * page.mjs: the donate site's pages, pure. A door's prices, its picture's srcsets and the site's
 * theme in, HTML out; build.mjs does the file work. Each page is a standalone page in the apps
 * pages' shell (standaloneShell: the site's head, tokens and fonts, no nav or trail), holding one
 * centred tip card: kicker, headline, lead, the picture, the bill sentence, three tiers and the free
 * row, the button and the Stripe line. The prices this door was built with are baked into the page
 * as JSON so it never shows an empty card; /app.js swaps in the live ones when they load.
 */

import { CUSTOM, DONATE_URL, TIERS } from '../admin/api/src/donate/doors.mjs';
import { escapeHtml, standaloneShell } from '../.agents/skills/site-quality/scripts/docs_lib.mjs';
import { ICON_CSS, iconSvg } from './icon.mjs';
import { DEFAULT_TIER, PROJECTS_BACK, billParts, buttonLabel } from './view.mjs';

const BRAND = 'Buy Me Tokens';
// The free row's words: its name is CUSTOM's, its price the minimum.
const OWN_CAPTION = 'set it at checkout';
// The picture's rendered width: the card's full 560px (the card has no side padding), or the screen
// less the page's 16px gutters on a phone.
const SHOT_SIZES = '(max-width: 592px) calc(100vw - 32px), 560px';

// A JSON data block: `<` escaped so no value can close the <script>.
const jsonBlock = (id, data) => `<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

const author = { '@type': 'Person', '@id': 'https://csarko.sh/#person', name: 'Cyrus Sarkosh', url: 'https://csarko.sh/' };

/** The shell around a donate page, with the icon beside the bar's name. */
function shell({ title, description, canonical, main, noindex = false }) {
  const html = standaloneShell({
    title,
    ogTitle: title,
    description,
    canonical,
    ogType: 'website',
    extraCss: DONATE_CSS,
    graph: [{ '@type': 'WebPage', '@id': canonical, url: canonical, name: title, description, author }],
    theme: THEME_SLOT,
    name: BRAND,
    links: [],
    main,
  });
  // The bar's name is the site's: it links to the bare door, not to the page it is on.
  const name = `<a class="app-name" href="${escapeHtml(canonical)}">${BRAND}</a>`;
  if (!html.includes(name)) throw new Error('page.mjs: the shell lost its bar name');
  let out = html.replace(name, `<a class="app-name" href="${DONATE_URL}">${iconSvg()}${BRAND}</a>`);
  if (noindex) out = out.replace('<meta name="viewport" content="width=device-width, initial-scale=1" />', '$&\n  <meta name="robots" content="noindex" />');
  return out;
}

// standaloneShell takes the theme as text and pastes it in; the slot keeps the theme out of the
// replace() calls above, so a `$` in it can never be read as a replacement pattern.
const THEME_SLOT = '/* theme */';
const withTheme = (html, theme) => html.split(THEME_SLOT).join(theme);

/** A <picture> from pictures.py's sets, the dark theme's sources first when there are any. */
function pictureHtml(picture, alt) {
  const srcset = (list) => escapeHtml(list.join(', '));
  const sources = [];
  const { light, dark } = picture.sets;
  if (dark) {
    sources.push(`<source media="(prefers-color-scheme: dark)" type="image/avif" srcset="${srcset(dark.avif)}" sizes="${SHOT_SIZES}" />`);
    sources.push(`<source media="(prefers-color-scheme: dark)" type="image/webp" srcset="${srcset(dark.webp)}" sizes="${SHOT_SIZES}" />`);
  }
  sources.push(`<source type="image/avif" srcset="${srcset(light.avif)}" sizes="${SHOT_SIZES}" />`);
  sources.push(`<source type="image/webp" srcset="${srcset(light.webp)}" sizes="${SHOT_SIZES}" />`);
  const fallback = light.jpg[0].split(' ')[0];
  return `<picture class="shot">
        ${sources.join('\n        ')}
        <img src="${escapeHtml(fallback)}" srcset="${srcset(light.jpg)}" sizes="${SHOT_SIZES}" width="${picture.width}" height="${picture.height}" alt="${escapeHtml(alt ?? '')}" fetchpriority="high" />
      </picture>`;
}

/**
 * A door's page. `door` is the DOORS entry, `prices` this door's prices ({ month, pool, tiers:
 * [{ tier, usd, label, ... }], links: { <tier>: url } }), `picture` pictures.py's output (srcset
 * entries as the page should request them, plus an optional `alt`), `theme` themeBlocks().
 */
export function doorPage({ door, prices, picture, theme }) {
  const title = door.door === 'all' ? BRAND : `${BRAND} · ${door.name}`;
  const canonical = `${DONATE_URL}${door.path}`;
  const tierOf = (key) => {
    const t = prices.tiers.find((x) => x.tier === key);
    if (!t) throw new Error(`${door.door}: no price for the ${key} tier`);
    return t;
  };
  const linkOf = (key) => {
    const url = prices.links?.[key];
    if (typeof url !== 'string' || !url) throw new Error(`${door.door}: no link for the ${key} tier`);
    return url;
  };
  const rows = TIERS.map((t, i) => {
    const p = tierOf(t.key);
    return `        <label class="tier"><input type="radio" name="tier" value="${t.key}"${t.key === DEFAULT_TIER ? ' checked' : ''} /><span class="what"><b>${escapeHtml(t.name)}</b><small>${escapeHtml(door.captions[i])}</small></span><span class="price">$${escapeHtml(p.usd)}<small>${escapeHtml(p.label)}</small></span></label>`;
  });
  rows.push(`        <label class="tier own"><input type="radio" name="tier" value="${CUSTOM.key}" /><span class="what"><b>${escapeHtml(CUSTOM.name)}</b><small>${OWN_CAPTION}</small></span><span class="price">any<small>$${CUSTOM.minimumUsd} or more</small></span></label>`);
  const baked = {
    door: door.door,
    month: prices.month,
    pool: prices.pool,
    tiers: TIERS.map((t) => { const p = tierOf(t.key); return { tier: p.tier, usd: p.usd, label: p.label }; }),
    links: Object.fromEntries([...TIERS, CUSTOM].map((t) => [t.key, linkOf(t.key)])),
  };
  const bill = billParts(prices);
  const main = `  <main id="top" class="wrap" tabindex="-1">
    <article class="tip">
      <p class="kicker">${escapeHtml(title)}</p>
      <h1>${escapeHtml(door.headline)}</h1>
      <p class="lead">${escapeHtml(door.lead)}</p>
      ${pictureHtml(picture, picture.alt)}
      <p class="bill">${escapeHtml(bill.before)}<b>${escapeHtml(bill.figure)}</b>${escapeHtml(bill.after)}</p>
      <fieldset class="tiers">
        <legend class="sr-only">Pick a tier</legend>
${rows.join('\n')}
      </fieldset>
      <a id="pay" class="btn" href="${escapeHtml(linkOf(DEFAULT_TIER))}">${escapeHtml(buttonLabel(DEFAULT_TIER, prices))}</a>
      <p class="foot">Payments by Stripe · no account needed</p>
    </article>
    ${jsonBlock('prices', baked)}
    <script type="module" src="/app.js"></script>
  </main>`;
  return withTheme(shell({ title, description: door.lead, canonical, main }), theme);
}

/**
 * The page Stripe sends a payer back to, /thanks?door=<door>. `doors` maps each door key to its
 * { back, thanks }; without a script (or for a door it does not know) the page thanks plainly and
 * links to the projects page, and /app.js puts in the door's own line and link.
 */
export function thanksPage({ theme, doors }) {
  const canonical = `${DONATE_URL}/thanks`;
  const main = `  <main id="top" class="wrap" tabindex="-1">
    <article class="tip thanks">
      <p class="kicker">${BRAND}</p>
      <h1>Thank you</h1>
      <p class="lead" id="line">Tokens received.</p>
      <p class="back"><a id="back" href="${escapeHtml(PROJECTS_BACK.href)}">${escapeHtml(PROJECTS_BACK.label)}</a></p>
    </article>
    ${jsonBlock('doors', doors)}
    <script type="module" src="/app.js"></script>
  </main>`;
  return withTheme(shell({ title: `${BRAND} · Thank you`, description: 'Tokens received.', canonical, main, noindex: true }), theme);
}

// The tip card, from the Oct 30 mockup's "Middle" layout, on the site's tokens and type. One
// centred column, 560px at most; the page's gutters are 16px on a phone. Every colour is a token.
export const DONATE_CSS = `
    .app-bar { border-bottom: 1px solid var(--border); }
    .app-bar .wrap { display: flex; align-items: center; justify-content: space-between; height: 60px; gap: 16px; }
    .app-name { display: inline-flex; align-items: center; font-family: var(--mono); font-weight: 600; font-size: 15px; letter-spacing: -0.01em; color: var(--text); }
    .app-bar ul { display: flex; list-style: none; margin: 0; padding: 0; }
    ${ICON_CSS}
    .app-name .tokens-icon { vertical-align: 0; }
    footer .maker { color: var(--muted); transition: color var(--md-duration-short3) var(--md-easing-standard); }
    footer .maker:hover { color: var(--text); }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

    .tip { max-width: 560px; margin: 0 auto; padding-block: 56px 72px; }
    .tip .kicker { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin: 0 0 12px; }
    .tip h1 { font-size: clamp(1.9rem, 6vw, 2.4rem); line-height: 1.1; letter-spacing: -0.03em; margin: 0 0 14px; }
    .tip .lead { font-size: 1.05rem; color: var(--prose); margin: 0 0 24px; }
    .shot { display: block; margin: 0 0 22px; }
    /* The picture keeps its own shape: a hero is as wide as it was made, a poster arrives cropped to 16:9. */
    .shot img { display: block; width: 100%; height: auto; object-fit: cover; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); }
    .bill { margin: 0 0 18px; color: var(--text); text-wrap: pretty; }
    .bill b { font-family: var(--mono); font-weight: 600; color: var(--accent); }
    .note { margin: -10px 0 18px; font-size: 13.5px; color: var(--muted); }

    .tiers { display: grid; gap: 8px; margin: 0 0 16px; padding: 0; border: 0; min-width: 0; }
    .tier { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); cursor: pointer; line-height: 1.4;
      transition: border-color var(--md-duration-short3) var(--md-easing-standard), background-color var(--md-duration-short3) var(--md-easing-standard); }
    .tier:hover { border-color: var(--border-strong); }
    .tier input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
    .tier:has(:checked) { border-color: var(--accent-border); background: var(--accent-soft); }
    .tier:has(:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
    .tier.own { border-style: dashed; }
    .tier .what { min-width: 0; }
    .tier b { display: block; font-weight: 600; color: var(--text); }
    .tier .what small { display: block; font-size: 13.5px; color: var(--muted); }
    .price { flex: none; text-align: right; font-family: var(--mono); font-size: 16px; font-weight: 600; color: var(--accent); }
    .price small { display: block; font-family: var(--sans); font-size: 12.5px; font-weight: 400; color: var(--muted); }

    .btn { display: block; padding: 13px 16px; border-radius: 10px; background: var(--accent); color: var(--on-accent); font-size: 16px; font-weight: 600; text-align: center;
      transition: background-color var(--md-duration-short3) var(--md-easing-standard); }
    .btn:hover { background: var(--accent-hover); }
    .foot { margin: 12px 0 0; font-size: 13px; color: var(--muted); text-align: center; }

    .thanks .back { margin: 28px 0 0; }
    .thanks .back a { color: var(--accent); text-decoration: underline; text-decoration-color: var(--accent-underline); text-underline-offset: 3px; transition: text-decoration-color var(--md-duration-short3) var(--md-easing-standard); }
    .thanks .back a:hover { text-decoration-color: var(--accent); }

    @media (max-width: 640px) {
      .wrap { padding-inline: 16px; }
      .tip { padding-block: 32px 56px; }
      .tier { padding: 11px 14px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .tier, .btn, footer .maker, .thanks .back a { transition: none; }
    }`;
