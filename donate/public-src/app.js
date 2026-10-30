// The donate site's one script. On a door page: the selected tier sets the button's link and
// words, and this month's prices replace the baked ones when the bucket answers. On /thanks: the
// door in the address picks the thanks line and the link back. Every value reaches the page through
// textContent or setAttribute, never as markup. Without this script both pages still work: the
// button pays the default tier and the thanks page links to the projects page.
import { DEFAULT_TIER, backLink, billParts, buttonLabel, monthName, pickPrices, thanksLine } from '/view.js';

// PRICES_URL in admin/api/src/donate/doors.mjs; build.mjs fails if the two differ.
const PRICES_URL = 'https://storage.googleapis.com/csarko-sh-donate-prices/prices.json';

const readJson = (id) => {
  try {
    return JSON.parse(document.getElementById(id)?.textContent ?? 'null');
  } catch {
    return null;
  }
};

function doorPage(pay, baked) {
  let prices = baked;
  const selected = () => document.querySelector('input[name="tier"]:checked')?.value ?? DEFAULT_TIER;

  // The button follows the selected tier: its words change only with its link, so it never says
  // one tier's price and pays another's.
  function setButton() {
    const tier = selected();
    const href = prices.links[tier];
    if (!href) return;
    pay.setAttribute('href', href);
    pay.textContent = buttonLabel(tier, prices);
  }
  for (const radio of document.querySelectorAll('input[name="tier"]')) radio.addEventListener('change', setButton);
  // A page restored from history may come back with another tier checked.
  addEventListener('pageshow', setButton);

  function apply({ prices: next, stale }) {
    // The bill's three parts, the same ones page.mjs baked: the text before the <b>, the figure, the rest.
    const bill = document.querySelector('.bill');
    const figure = bill?.querySelector('b');
    if (figure) {
      const parts = billParts(next);
      bill.replaceChildren(parts.before, figure, parts.after);
      figure.textContent = parts.figure;
    }
    for (const row of document.querySelectorAll('.tier')) {
      const key = row.querySelector('input')?.value;
      const tier = next.tiers.find((t) => t.tier === key);
      const price = row.querySelector('.price');
      if (!tier || !price) continue;
      const share = price.querySelector('small');
      price.firstChild.textContent = `$${tier.usd}`;
      if (share) share.textContent = tier.label;
    }
    prices = next;
    if (stale && bill && !document.querySelector('.note')) {
      const note = document.createElement('p');
      note.className = 'note';
      note.textContent = `Prices are from ${monthName(next.month)}.`;
      bill.after(note);
    }
    setButton();
  }

  fetch(PRICES_URL, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((fetched) => apply(pickPrices(baked, fetched, baked.door)))
    // Anything the live prices break leaves the baked ones, said to be from their month.
    .catch(() => apply({ prices: baked, stale: true }));
  setButton();
}

function thanksPage(doors) {
  const door = new URL(location.href).searchParams.get('door');
  const back = backLink(door, doors);
  const link = document.getElementById('back');
  const line = document.getElementById('line');
  if (link) {
    link.textContent = back.label;
    link.setAttribute('href', back.href);
  }
  if (line) line.textContent = thanksLine(door, doors);
}

const pay = document.getElementById('pay');
const baked = readJson('prices');
if (pay && baked) doorPage(pay, baked);
const doors = readJson('doors');
if (doors) thanksPage(doors);
