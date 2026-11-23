#!/usr/bin/env node
// Draws intersection-plan.svg, the one figure of docs/published/2026-11-22-how-small-town-intersections-are-built.md.
// Every number is declared once in N below. The drawing uses them; the key under the drawing prints them;
// and `node make-figure.mjs --check` fails unless each printed figure also appears in the doc, so the
// picture and the text cannot disagree. Lengths are feet in the drawing's own units (1 ft = SC px).
//
//   node make-figure.mjs            writes intersection-plan.svg beside this file
//   node make-figure.mjs --check    also checks the doc's text for every figure printed on the drawing
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = join(HERE, '../../../../../../docs/published/2026-11-22-how-small-town-intersections-are-built.md');

// ---- the numbers (feet unless stated). Each one is in the doc with its source.
const N = {
  lane: 11,          // WSDOT lane width range 10 to 12 ft at 35 mph or less; 11 ft drawn
  radius: 20,        // Seattle's standard curb return radius for streets other than two neighbourhood streets
  buffer: 4,         // WSDOT suggested buffer, 25 mph, suburban (minimum 3 ft)
  walk: 6,           // WSDOT suggested sidewalk, 25 mph, suburban (minimum 5 ft)
  rampW: 4,          // curb ramp clear width, minimum
  rampRun: 6,        // 6 in curb reveal at the 8.3% maximum running slope: 0.5 / 0.083
  landing: 4,        // landing 4 ft by 4 ft, minimum
  dws: 2,            // detectable warning surface, 2 ft minimum in the direction of travel
  cross: 10,         // marked crosswalk width, WSDOT standard
  bar: 2,            // WSDOT crosswalk bar width
  barGapMax: 5,      // WSDOT crosswalk bar gap, maximum
  stopLine: 2,       // MUTCD stop line 12 to 24 in wide; 24 in drawn
  stopSetback: 4,    // stop line at least 4 ft in advance of the nearest crosswalk line
  signOffset: 1,     // sign support at least 1 ft from the face of the curb
  parkCross: 20,     // RCW 46.61.570: within 20 ft of a crosswalk
  parkSign: 30,      // RCW 46.61.570: within 30 ft upon the approach to a stop sign
  dash: 10, gap: 30, // MUTCD 3A.04 broken line, 10 ft segments and 30 ft gaps
  dotDash: 2, dotGap: 6, // dotted extension, 2 ft segments, 2 to 6 ft gaps (WSDOT draws 2 ft and 6 ft)
};
const SC = 3;                      // px per foot
const W = 420, PLAN_TOP = 46, EXT = 70;
const CX = W / 2, CY = PLAN_TOP + EXT * SC + 4;  // plan centre in px

const half = N.lane;               // half the roadway width: two lanes of 11 ft, so the curb is 11 ft from the centre line
const R = N.radius;
const tang = half + R;             // where a curb return meets the straight curb: 31 ft from the centre
const bufOuter = R - N.buffer, walkOuter = R - N.buffer - N.walk; // arc radii, same centre as the curb arc
const px = (x) => (CX + x * SC).toFixed(1);
const py = (y) => (CY + y * SC).toFixed(1);   // +y is south
const f = (v) => v.toFixed(1);

const out = [];
const add = (s) => out.push(s);

// ---- background pieces, drawn for the south-east corner and mirrored to all four
const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
function cornerShapes([sx, sy]) {
  const c = `translate(${px(0)} ${py(0)}) scale(${sx} ${sy})`;
  const p = (x, y) => `${f(x * SC)} ${f(y * SC)}`;
  const arc = (r, from, to) => `A ${f(r * SC)} ${f(r * SC)} 0 0 ${from} ${p(to[0], to[1])}`;
  // block corner (lot): outside the sidewalk
  const lot = `M ${p(tang - walkOuter, EXT)} L ${p(tang - walkOuter, tang)} ` +
    `A ${f(walkOuter * SC)} ${f(walkOuter * SC)} 0 0 1 ${p(tang, tang - walkOuter)} L ${p(EXT, tang - walkOuter)} L ${p(EXT, EXT)} Z`;
  // sidewalk ring: between the buffer's arc and the sidewalk's back arc
  const sw = `M ${p(tang - bufOuter, EXT)} L ${p(tang - bufOuter, tang)} ` +
    `A ${f(bufOuter * SC)} ${f(bufOuter * SC)} 0 0 1 ${p(tang, tang - bufOuter)} L ${p(EXT, tang - bufOuter)} ` +
    `L ${p(EXT, tang - walkOuter)} L ${p(tang, tang - walkOuter)} ` +
    `A ${f(walkOuter * SC)} ${f(walkOuter * SC)} 0 0 0 ${p(tang - walkOuter, tang)} L ${p(tang - walkOuter, EXT)} Z`;
  // verge (buffer) between the curb and the sidewalk
  const vg = `M ${p(half, EXT)} L ${p(half, tang)} ` +
    `A ${f(R * SC)} ${f(R * SC)} 0 0 1 ${p(tang, half)} L ${p(EXT, half)} ` +
    `L ${p(EXT, tang - bufOuter)} L ${p(tang, tang - bufOuter)} ` +
    `A ${f(bufOuter * SC)} ${f(bufOuter * SC)} 0 0 0 ${p(tang - bufOuter, tang)} L ${p(tang - bufOuter, EXT)} Z`;
  const curb = `M ${p(half, EXT)} L ${p(half, tang)} A ${f(R * SC)} ${f(R * SC)} 0 0 1 ${p(tang, half)} L ${p(EXT, half)}`;
  add(`<g transform="${c}"><path class="lot" d="${lot}"/><path class="verge" d="${vg}"/><path class="walk" d="${sw}"/><path class="curb" d="${curb}"/></g>`);
}

// ---- header
add(`<text class="title" x="16" y="26">A four-way corner, drawn to the figures in this doc</text>`);

// pavement: two crossing roadways and the four curb-return flares
add(`<g class="pave"><rect x="${px(-EXT)}" y="${py(-half)}" width="${EXT * 2 * SC}" height="${half * 2 * SC}"/>` +
  `<rect x="${px(-half)}" y="${py(-EXT)}" width="${half * 2 * SC}" height="${EXT * 2 * SC}"/>` +
  corners.map(([sx, sy]) => `<path transform="translate(${px(0)} ${py(0)}) scale(${sx} ${sy})" d="M ${f(half * SC)} ${f(half * SC)} L ${f(half * SC)} ${f(tang * SC)} A ${f(R * SC)} ${f(R * SC)} 0 0 1 ${f(tang * SC)} ${f(half * SC)} Z"/>`).join('') + `</g>`);
for (const k of corners) cornerShapes(k);

// ---- crosswalks on all four legs: 10 ft wide, near edge 21 ft out (far edge at the tangent point), bars 2 ft with gaps of at most 5 ft
const cwNear = tang - N.cross, cwFar = tang;          // 21 to 31 ft from the centre
const nBars = 4, barGap = (half * 2 - nBars * N.bar) / (nBars - 1); // 4 bars across 22 ft: gap 4.67 ft
if (barGap > N.barGapMax) throw new Error('crosswalk gap exceeds the figure of 5 ft');
function bars(horizontalLeg, sign) {
  for (let i = 0; i < nBars; i++) {
    const o = -half + i * (N.bar + barGap);          // offset across the roadway
    if (horizontalLeg) add(`<rect class="bar" x="${px(sign * cwNear + (sign < 0 ? -N.cross : 0))}" y="${py(o)}" width="${N.cross * SC}" height="${N.bar * SC}"/>`);
    else add(`<rect class="bar" x="${px(o)}" y="${py(sign * cwNear + (sign < 0 ? -N.cross : 0))}" width="${N.bar * SC}" height="${N.cross * SC}"/>`);
  }
}
bars(true, 1); bars(true, -1); bars(false, 1); bars(false, -1);

// ---- stop lines on the side street (north-south): 4 ft in advance of the crosswalk, 2 ft wide, across the approach lane
const slNear = cwFar + N.stopSetback;                    // 35 ft from the centre
add(`<rect class="stopline" x="${px(0)}" y="${py(slNear)}" width="${half * SC}" height="${N.stopLine * SC}"/>`);            // southbound... see below
add(`<rect class="stopline" x="${px(-half)}" y="${py(-slNear - N.stopLine)}" width="${half * SC}" height="${N.stopLine * SC}"/>`);

// ---- centre line of the main street (east-west), 10 ft dash, 30 ft gap, ending before the crosswalks
const cy = py(0);
for (const s of [-1, 1]) {
  // one dash at the far end, then the gap runs on to the crosswalk
  const x0 = s > 0 ? EXT - N.dash : -EXT;
  add(`<rect class="cl" x="${px(x0)}" y="${(Number(cy) - 1).toFixed(1)}" width="${N.dash * SC}" height="2"/>`);
}
// dotted extension through the intersection, 2 ft dashes and 6 ft gaps, between the crosswalks
for (let x = -cwNear + 1; x + N.dotDash <= cwNear - 1; x += N.dotDash + N.dotGap) {
  add(`<rect class="cl" x="${px(x)}" y="${(Number(cy) - 1).toFixed(1)}" width="${N.dotDash * SC}" height="2"/>`);
}

// ---- curb ramps: two per corner, each normal to the curb arc, 4 ft wide and 6 ft long, a 2 ft dome panel at the foot,
//      a 4 ft by 4 ft landing at the top. Drawn on the south-east corner and mirrored.
function ramp([sx, sy], toward) {
  // arc centre is (tang, tang); the ramp sits where the crosswalk's middle meets the arc
  const mid = cwNear + N.cross / 2;                     // 26 ft out along the leg
  // point on the arc at that distance along the leg
  const a = toward === 'ns' ? [Math.sqrt(R * R - (tang - mid) ** 2), 0] : [0, 0];
  const dx = toward === 'ns' ? tang - Math.sqrt(R * R - (tang - mid) ** 2) : mid;   // x on the arc
  const dy = toward === 'ns' ? mid : tang - Math.sqrt(R * R - (tang - mid) ** 2);   // y on the arc
  const ang = Math.atan2(tang - dy, tang - dx) * 180 / Math.PI;   // direction from the arc point to the arc centre
  const g = `translate(${px(sx * dx)} ${py(sy * dy)}) scale(${sx} ${sy}) rotate(${f(ang)})`;
  const L = N.rampRun * SC, Wd = N.rampW * SC, D = N.dws * SC, Lg = N.landing * SC;
  add(`<g transform="${g}"><rect class="ramp" x="0" y="${-Wd / 2}" width="${L}" height="${Wd}"/>` +
      `<rect class="dws" x="0" y="${-Wd / 2}" width="${D}" height="${Wd}"/>` +
      `<rect class="land" x="${L}" y="${-Lg / 2}" width="${Lg}" height="${Lg}"/></g>`);
}
for (const k of corners) { ramp(k, 'ns'); ramp(k, 'ew'); }

// ---- the stop signs: on the right of each side-street approach, before the crosswalk, 1 ft behind the curb face
const signY = slNear + N.stopLine / 2;
const signs = [[half + N.signOffset, signY], [-half - N.signOffset, -signY]];
for (const [x, y] of signs) add(`<circle class="sign" cx="${px(x)}" cy="${py(y)}" r="5"/>`);

// ---- no-parking lengths on the east curb of the south approach (the sign side)
const parkEnd = Math.max(cwFar + N.parkCross, signY + N.parkSign);
add(`<line class="nopark" x1="${px(half - 0.8)}" y1="${py(cwFar)}" x2="${px(half - 0.8)}" y2="${py(parkEnd)}"/>`);
const t = (x, y, s, cls = 'sm', anchor = 'start') => add(`<text class="${cls}" x="${px(x)}" y="${py(y)}" text-anchor="${anchor}">${s}</text>`);
function vdim(x, y1, y2, label, ext = 0) {          // a vertical dimension line, with faint extension lines back to the curb
  for (const y of [y1, y2]) {
    add(`<line class="ext" x1="${px(half + 0.5)}" y1="${py(y)}" x2="${px(x + 1)}" y2="${py(y)}"/>`);
    add(`<line class="dim" x1="${px(x - 1.2)}" y1="${py(y)}" x2="${px(x + 1.2)}" y2="${py(y)}"/>`);
  }
  add(`<line class="dim" x1="${px(x)}" y1="${py(y1)}" x2="${px(x)}" y2="${py(y2)}"/>`);
  t(x + 2.2, (y1 + y2) / 2 + 1.5, label);
}
vdim(36, cwFar, cwFar + N.parkCross, `${N.parkCross} ft`);
vdim(48, signY, signY + N.parkSign, `${N.parkSign} ft`);

// lane width: a dimension across one lane of the west leg, and the radius drawn in the north-east lot
add(`<line class="dim" x1="${px(-52)}" y1="${py(0)}" x2="${px(-52)}" y2="${py(half)}"/>`);
add(`<line class="dim" x1="${px(-53.2)}" y1="${py(0)}" x2="${px(-50.8)}" y2="${py(0)}"/><line class="dim" x1="${px(-53.2)}" y1="${py(half)}" x2="${px(-50.8)}" y2="${py(half)}"/>`);
t(-49.5, half / 2 + 1.5, `${N.lane} ft`);
add(`<line class="dim" x1="${px(tang)}" y1="${py(-tang)}" x2="${px(tang - R * Math.SQRT1_2)}" y2="${py(-(tang - R * Math.SQRT1_2))}"/><circle class="cdot" cx="${px(tang)}" cy="${py(-tang)}" r="2"/>`);
t(tang + 2, -tang - 2, `R ${N.radius} ft`);

// ---- numbered callouts (circles with leader lines) tied to the key below
function callout(n, x, y, lx, ly) {
  add(`<line class="lead" x1="${px(x)}" y1="${py(y)}" x2="${px(lx)}" y2="${py(ly)}"/>`);
  add(`<circle class="num" cx="${px(lx)}" cy="${py(ly)}" r="8"/>`);
  add(`<text class="numt" x="${px(lx)}" y="${(Number(py(ly)) + 4).toFixed(1)}" text-anchor="middle">${n}</text>`);
}
const rampAt = (leg) => { const mid = cwNear + N.cross / 2, d = Math.sqrt(R * R - (tang - mid) ** 2); return leg === 'ns' ? [tang - d, mid] : [mid, tang - d]; };
const [rx, ry] = rampAt('ns');                                                   // the south-east ramp for the side-street crossing
const ang = Math.atan2(tang - ry, tang - rx);
const along = (d) => [rx + Math.cos(ang) * d, ry + Math.sin(ang) * d];          // d feet from the curb along the ramp
callout(1, tang - R * Math.SQRT1_2, -(tang - R * Math.SQRT1_2), 22, -48);        // curb return radius (north-east)
callout(2, 50, -18, 58, -36);                                                    // buffer and sidewalk (north-east)
callout(3, -along(3.5)[0], along(3.5)[1], -34, 38);                                                // ramp (south-west mirror, drawn at south-east)
callout(4, -along(8.5)[0], along(8.5)[1], -46, 50);                                                // landing
callout(5, -along(1)[0], along(1)[1], -58, 38);                                                // dome panel
callout(6, -5, -26, -32, -48);                                                   // crosswalk (north leg)
callout(7, 5, slNear + 1, -26, 50);                                              // stop line
callout(8, half + N.signOffset, signY, 28, 36);                                  // sign
callout(9, half - 0.8, cwFar + 25, 26, 62);                                  // no parking
callout(10, -65, 0, -58, -12);
callout(11, -52, half / 2, -60, 14);                                                   // centre line
// ---- the key under the plan: the same numbers as the drawing
const KEY = [
  [1, `Curb return radius ${N.radius} ft`],
  [2, `Buffer ${N.buffer} ft, sidewalk ${N.walk} ft`],
  [3, `Ramp ${N.rampW} ft wide, ${N.rampRun} ft long, 8.3% at most`],
  [4, `Landing ${N.landing} ft by ${N.landing} ft at the top`],
  [5, `Dome panel ${N.dws} ft deep, full ramp width`],
  [6, `Crosswalk ${N.cross} ft wide, bars ${N.bar} ft, gaps ${N.barGapMax} ft at most`],
  [7, `Stop line 24 in wide, ${N.stopSetback} ft before the crosswalk`],
  [8, `STOP sign ${N.signOffset} ft or more behind the curb face`],
  [9, `No parking ${N.parkCross} ft from the crosswalk, ${N.parkSign} ft before the sign`],
  [10, `Centre line ${N.dash} ft dash, ${N.gap} ft gap; dotted ${N.dotDash} ft, ${N.dotGap} ft`],
  [11, `Lane ${N.lane} ft, drawn (10 to 12 ft allowed)`],
];
const keyTop = PLAN_TOP + EXT * 2 * SC + 24;
add(`<text class="sec" x="16" y="${keyTop - 8}">Side street runs north-south, main street east-west.</text>`);
KEY.forEach(([n, t], i) => {
  const y = keyTop + 12 + i * 21;
  add(`<circle class="num" cx="26" cy="${y - 4}" r="8"/><text class="numt" x="26" y="${y}" text-anchor="middle">${n}</text>`);
  add(`<text x="44" y="${y}">${t}</text>`);
});
const H = keyTop + 12 + KEY.length * 21 + 8;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
  <title id="t">Plan of a small-town four-way intersection drawn to scale. A main street runs east to west with a yellow broken centre line, and a side street runs north to south with STOP signs. Each corner has a curb return of ${N.radius} feet radius, a ${N.buffer} foot verge and a ${N.walk} foot sidewalk, and two ramps, each ${N.rampW} feet wide with a ${N.dws} foot dome panel at its foot. Four crosswalks ${N.cross} feet wide have ${N.bar} foot bars. The side street's stop lines sit ${N.stopSetback} feet before the crosswalks. On the side street's south approach no parking is allowed ${N.parkCross} feet from the crosswalk and ${N.parkSign} feet before the STOP sign.</title>
  <style>
    text { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 12px; fill: #e8eaf0; }
    .title { font-size: 16px; font-weight: 600; }
    .sec { fill: #a0a8b8; }
    .sm { font-size: 11px; fill: #a0a8b8; }
    .pave { fill: #a0a8b8; opacity: 0.2; }
    .pave * { fill: inherit; }
    .lot { fill: #a0a8b8; opacity: 0.06; }
    .verge { fill: #7dd3c0; opacity: 0.12; }
    .walk { fill: #a0a8b8; opacity: 0.38; }
    .curb { fill: none; stroke: #e8eaf0; stroke-width: 1.4; }
    .bar { fill: #e8eaf0; opacity: 0.9; }
    .stopline { fill: #e8eaf0; }
    .cl { fill: #f5c451; }
    .ramp { fill: #7dd3c0; opacity: 0.55; stroke: #7dd3c0; stroke-width: 0.6; }
    .land { fill: #7dd3c0; opacity: 0.3; stroke: #7dd3c0; stroke-width: 0.6; }
    .dws { fill: #f5c451; }
    .sign { fill: #e5736d; stroke: #e8eaf0; stroke-width: 1; }
    .nopark { stroke: #f5c451; stroke-width: 3; opacity: 0.9; }
    .dim { stroke: #a0a8b8; stroke-width: 1; }
    .lead { stroke: #a0a8b8; stroke-width: 0.8; }
    .ext { stroke: #a0a8b8; stroke-width: 0.5; opacity: 0.6; }
    .cdot { fill: #a0a8b8; }
    .num { fill: #14171f; stroke: #7dd3c0; stroke-width: 1.2; }
    .numt { font-size: 11px; font-weight: 600; fill: #e8eaf0; }
    @media (prefers-color-scheme: light) {
      text { fill: #12151c; }
      .sec, .sm { fill: #4a5263; }
      .pave { fill: #4a5263; opacity: 0.2; }
      .lot { fill: #4a5263; opacity: 0.06; }
      .verge { fill: #0a735f; opacity: 0.14; }
      .walk { fill: #4a5263; opacity: 0.3; }
      .curb { stroke: #12151c; }
      .bar { fill: #ffffff; stroke: #4a5263; stroke-width: 0.6; opacity: 1; }
      .stopline { fill: #ffffff; stroke: #4a5263; stroke-width: 0.6; }
      .cl { fill: #8a6100; }
      .ramp { fill: #0a735f; stroke: #0a735f; }
      .land { fill: #0a735f; stroke: #0a735f; }
      .dws { fill: #f0b429; stroke: #8a6100; stroke-width: 0.5; }
      .sign { fill: #b3261e; stroke: #ffffff; }
      .nopark { stroke: #8a6100; }
      .dim, .lead, .ext { stroke: #4a5263; }
      .cdot { fill: #4a5263; }
      .num { fill: #ffffff; stroke: #0a735f; }
      .numt { fill: #12151c; }
    }
  </style>
${out.map((s) => '  ' + s).join('\n')}
</svg>
`;
writeFileSync(join(HERE, 'intersection-plan.svg'), svg);
console.log(`wrote intersection-plan.svg ${W}x${H}; crosswalk bar gap ${barGap.toFixed(2)} ft`);

if (process.argv.includes('--check')) {
  const doc = readFileSync(DOC, 'utf8').replace(/\s+/g, ' ');
  const needs = KEY.map(([, t]) => t).flatMap((t) => (t.match(/\d+(\.\d+)?(?= (ft|in)|%)/g) ?? []).map((n) => [n, t]));
  const missing = needs.filter(([n]) => !new RegExp(`(^|[^\\d.])${n.replace('.', '\\.')}( ft| in|%| foot)`).test(doc));
  if (missing.length) { console.error('not in the doc:', missing); process.exit(1); }
  console.log(`checked ${needs.length} figures against the doc`);
}
