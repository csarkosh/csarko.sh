// The Buy Me Tokens icon: a shaded pixel heart with one gold token tucked at its
// lower right, drawn on a 32 by 22 grid. Each letter in PIXELS is one pixel in
// one of the ten fixed colours below; a dot is transparent.

export const PALETTE = {
  O: '#6b1113', // heart outline
  m: '#e5484d', // heart mid-tone
  s: '#b32d33', // heart shadow
  h: '#ff7a80', // heart highlight
  H: '#ffd6d8', // heart top highlight
  g: '#7a5600', // token outline
  G: '#f0c040', // token mid-tone
  c: '#c8962a', // token shadow
  l: '#ffe08a', // token highlight
  L: '#fff7d6', // token top highlight
};

// prettier-ignore
export const PIXELS = [
  '................................',
  '........OOOO........OOOO........',
  '.......OmmmsO......OmmmsO.......',
  '......OhhmmmsO....OhhmmmsO......',
  '.....OhHHhmmmsO..OhHHhmmmsO.....',
  '.....OmhhmmmmmsOOmhhmmmmmsO.....',
  '....OmmmmmmmmmmmmmmmmmmmmssO....',
  '....OmmmmmmmmmmmmmmmmmmmmssO....',
  '.....OmmmmmmmmmmmmmmmmmmssO.....',
  '.....OmmmmmmmmmmmmmmmmmmssO.....',
  '.....Ommmmmmmmmmmmmmmmgggggg....',
  '......OmmmmmmmmmmmmmmgLlllllg...',
  '.......OmmmmmmmmmmmmgLGccccGGg..',
  '........OmmmmmmmmmmglGcGGGGlGcg.',
  '.........OmmmmmmmmsglcGGGGGGlcg.',
  '..........OmmmmmmssglcGGGGGGlcg.',
  '...........OmmmmsssglcGGGGGGlcg.',
  '............OmmssssglGcGGGGlGcg.',
  '.............OmsssO.gGGllllGcg..',
  '..............OssO...gccccccg...',
  '...............OO.....gggggg....',
  '................................',
];

// One <path> per colour, each run of it a 1-pixel-tall rectangle in the path's d: ten paths at
// most, under a third of the bytes one <rect> per run took (the /projects page carries it).
const RUNS = {};
PIXELS.forEach((row, y) => {
  for (const run of row.matchAll(/([^.])\1*/g)) {
    const w = run[0].length;
    RUNS[run[1]] = `${RUNS[run[1]] ?? ''}M${run.index} ${y}h${w}v1h-${w}z`;
  }
});
const SHAPES = Object.keys(PALETTE)
  .filter((letter) => RUNS[letter])
  .map((letter) => `<path fill="${PALETTE[letter]}" d="${RUNS[letter]}"/>`)
  .join('');

const attr = (value) => String(value).replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);

export function iconSvg({ className = 'tokens-icon' } = {}) {
  return `<svg viewBox="0 0 32 22" shape-rendering="crispEdges" aria-hidden="true" class="${attr(className)}">${SHAPES}</svg>`;
}

// Inline once per page, then draw the icon anywhere with iconUse(). Browsers do not
// apply the hidden attribute to an <svg> in HTML, so the sheet is also sized to
// nothing and taken out of the flow, or it would draw an empty 300 by 150 box.
export function iconSymbol() {
  return `<svg hidden aria-hidden="true" width="0" height="0" style="position: absolute"><symbol id="tokens-icon" viewBox="0 0 32 22" shape-rendering="crispEdges">${SHAPES}</symbol></svg>`;
}

export function iconUse({ className = 'tokens-icon' } = {}) {
  return `<svg class="${attr(className)}" aria-hidden="true"><use href="#tokens-icon"/></svg>`;
}

export const ICON_CSS = '.tokens-icon { width: calc(1em * 32 / 22); height: 1em; vertical-align: -0.12em; margin-right: 0.35em; flex: none; }';
