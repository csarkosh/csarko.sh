---
description: Unbounded mountains, a warped coastline, a highway and cliff bands built as pure C² functions with exact derivatives, so every peer builds one world.
published: 2026-07-29
---
# An endless world as a pure function

**Question:** Day Hike's world has no edge. Every player's browser generates it from a seed,
and nothing about the terrain crosses the network. How do you build mountains that read as
geology rather than noise, add a coastline, a highway and cliffs, render it kilometres out,
and still guarantee that every peer computes the same height at the same point, with no seams?

**Short answer:** make the world one pure function `h(seed, x, z)` that also returns its exact
analytic derivatives, and build every feature as a C² stage composed on the previous one. A
low-frequency uplift field decides where mountains are; a domain warp, a hybrid multifractal
and derivative-aware attenuation turn that into ridges and valleys. The coast, road, cliffs
and dunes are each a smooth remap in the coordinate that suits them, and each returns its input
unchanged where it is inactive. Exact derivatives give true normals and make the erosion
weights possible, and one numeric-vs-analytic test proves them. Determinism comes from a few
hard rules: no implementation-defined `Math` in the simulation, a seed stream per generation
pass, and a level id that digests the generated world, so mismatched peers refuse to connect
instead of drifting apart. A geometry clipmap samples the same function more coarsely with
distance, so an 8 km view costs 7 draw calls.

The code is public in [game-dayhike](https://github.com/csarkosh/game-dayhike): mountains in
[`montane.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/sim/montane.ts),
coast and composition in
[`olympic.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/sim/olympic.ts),
the highway in [`road.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/sim/road.ts)
and cliffs in [`cliffs.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/sim/cliffs.ts).
Numbers with a date were measured when that stage was built; tests now hold bounds, not the
exact values.

## 1. Why plain noise looks like noise

The first generator was a forest: summed octaves of value noise, bounded so the ground was
always walkable, plus a plateau field quantized into levels to make cliffs. It was well tested
and looked amateurish, for structural reasons:

- **The walkability bound forbade drama.** Slope was bounded by construction, which worked out
  to relief over wavelength of about 0.11: no more than about 11 m of rise over 100 m, roughly
  6°, whatever the constants. Measured in the game: 2.8 to 6.2 m of relief across a 140 m view.
- **No erosion.** Real land is carved by water into branching valleys and sharp ridges. Summed
  noise has neither, and this is the biggest reason procedural terrain looks fake.
- **fBm has no landforms**, only lumps at several scales, and **no large-scale composition**:
  every square kilometre had the same character.
- **Value noise** is blobby with faint grid alignment, and the **plateau levels** read as
  terracing.

The architecture survived. Height is a pure function of world coordinates and a 32 m chunk is
a window onto it, so adjacent chunks evaluate the same function at the same points and seams
cannot exist. For the same reason nothing is ever clamped or smoothed after the fact: a clamp is
a sweep over neighbours, a sweep depends on evaluation order, and order dependence would break
the property that makes seams impossible.

The research came down to how octaves are combined more than which noise feeds them. Gradient
(Perlin) noise replaces value noise. Ridged multifractal, `Σ wᵢ · (1 − |noise|)²`, gives sharp
connected ridgelines. Hybrid multifractal keeps low ground smooth while high ground grows rough,
a montane elevation gradient for free. Two techniques break the "it looks like noise" problem:
**domain warping** (evaluate at `p + k·g(p)` where `g` is itself noise, folding blobs into
directional forms) and **derivative-aware attenuation** (damp each octave by `1 / (1 + k·|∇|²)`,
so detail stops accumulating on steep ground, faces smooth and ridges sharpen).

The central tension is that **erosion is global and this generator is local.** Water flows for
kilometres; a chunk must be generatable alone, in any order.

| Option | Verdict |
| --- | --- |
| Analytic approximation (attenuation by slope) | Chosen: keeps locality, imitates the result, one multiply-add per octave |
| Hydraulic simulation over a chunk plus a margin | Rejected: a droplet's travel is unbounded and the margin is not, so borders seam or the margin cost explodes |
| Offline-eroded tiles, streamed and blended | Rejected: finite, repetitive, asset-heavy, and no longer an infinite pure function |

The pipeline keeps an empty slot for real erosion. It has not been needed.

## 2. The montane pipeline

| # | Stage | Purpose |
| --- | --- | --- |
| 1 | Uplift | Low-frequency fBm: where mountains are |
| 2 | Domain warp | Two scales: regional folding and local sinuosity |
| 3 | Base relief | Hybrid multifractal, smooth fBm blending to ridged by uplift |
| 4 | Derivative attenuation | The eroded look |
| 5 | Talus bias | Damps detail past the angle of repose |
| 6 | Reserved | Real hydraulic erosion, if it ever earns its cost |

Forest and mountain are not two biomes blended with a mask. Each relief octave is
`smooth + t·(ridged − smooth)`, with `t` a smoothstep of uplift, so low uplift reads as forested
valley and high uplift as rock: a real geographic gradient that cannot produce the mush of
blended generators. Height is `PEAK_HEIGHT · u² · R`. Stage 5 is labelled an approximation in the
code: real talus accumulates downslope, which is non-local, so it only damps detail once slope
passes tan(34°) and moves no material. The ridged channel softens `|n|` to `sqrt(n² + 0.02²)` so
crests stay differentiable.

| Constant | Montane | Dense (ships) |
| --- | --- | --- |
| Uplift wavelength | 4096 m | 1792 m |
| Warp, coarse / fine | 512 m at 120 m / 96 m at 18 m | same |
| Relief | 1024 m base wavelength, 8 octaves | same |
| Peak height | 650 m | 1100 m |
| Erosion strength `k` | 6 | 8 |
| Ridge blend start (uplift) | 0.35 | 0.25 |
| Talus strength | 0.85 | 0.7 |

The first config put ranges about 4 km apart and the view felt empty. A 24-configuration sweep
(August 2026) found that raising peak height alone is not enough: eight octaves of fBm never
sum near their maximum, so the field's ceiling is about 0.42 × `PEAK_HEIGHT`, and 650 m capped
real peaks near 320 m. The sweep also rejected an "uplift floor" knob, which at 0.3 collapsed
flat lowland from 36% to 1.4% while barely raising peaks. The dense config halves the uplift
wavelength and raises the peak height to 1100 m; when set, it measured a 483 m maximum, 19
massifs above 300 m and 11.0% flat lowland in an 8 km window. A later retune sharpened the
mountains. A census test pins promises, not numbers: at least two massifs above 300 m, a peak
above 400 m, at least 10% flat lowland, 5 to 15% above the treeline.

Walkability left generation entirely. The simulation collides against the same analytic field
the renderer draws ([`ground.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/sim/ground.ts)),
and ground is walkable when its normal's vertical component is at least 0.7, a gradient of about
1.02. The field costs about 20 noise evaluations per sample instead of 4, yet warmed chunk
generation fell from 1.384 ms to 0.76 ms, because the same change retired four prop passes that
had cost more than elevation ever did.

## 3. Why exact analytic derivatives matter

Every stage returns `{ h, dx, dz }`, the height and its exact partial derivatives, carried
through every warp, blend and window by the chain rule. That pays in four places:

- **Normals.** Each clipmap vertex normal is `(−dx, 1, −dz)` normalised, smooth and true even on
  64 m outer-ring triangles where mesh-estimated normals would facet. Collision uses the same
  derivatives, with no finite differencing.
- **Erosion weights.** Stage 4 is defined by a slope at every octave.
- **Surface classification.** Rock, scree and grass key on slope with no extra samples.
- **Composition.** Every later stage windows on a height or distance and needs its gradient.

### The regress, and where it stops

"Damp by the gradient" does not say whose. Using the gradient of the weighted sum being built
makes each weight depend on its own derivative: the first derivative of the result would need
the noise's third derivative, then its fourth, without end. The implementation keeps a **guide
field**, the unweighted running sum of octaves already visited, and damps against that.
Differentiating a weight then needs only the guide's Hessian, the noise's second derivatives.

So the primitive is gradient noise with a **quintic fade** and exact first and second derivatives
([`field.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/sim/field.ts)). The
quintic's second derivative vanishes at cell borders, so the Hessian is continuous; the old
cubic fade's second derivative jumps at every lattice line.

One ordering detail is invisible to any test. The guide is updated after each octave's weight is
read, so octave *i* damps octave *i+1* and never itself. Hoisting the update is still
self-consistent mathematics: the derivative test stays green and the landscape comes out much
flatter.

### The only proof: numeric against analytic

A wrong derivative makes terrain subtly wrong everywhere, with no error and nothing visibly
broken. The test compares returned derivatives with central differences,
`(h(x + H) − h(x − H)) / 2H` at H = 0.02 m, over a few hundred points out to about ±90 km
([`derivatives.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/test/sim/helpers/derivatives.ts)).

The bound began as an absolute number and broke for a reason unrelated to derivatives:
truncation error scales with amplitude, so raising `PEAK_HEIGHT` from 650 to 800 pushed the
`ridged` control to 0.0051 against 0.005. It is now a ratio: worst disagreement under 1% of the
steepest slope in the same sweep. Measured worst ratios at the original config were 1.2e-3 to
2.2e-3. The test has teeth: dropping the weight-gradient term gives 6.2e-1, and flipping its sign
gives 1.2. Every composed stage runs through the same harness, with sweeps on its band edges and
window boundaries.

The other derivative trap is handedness: Babylon.js is left-handed, so reversed winding lights
terrain from below and culls it (see [Babylon.js material plugin traps](/docs/babylon-material-plugin-traps)).

## 4. The 16× bug that made mountains read as downland

With the pipeline, clipmap and derivative test in place, the browser showed broad ridges and a
readable valley system, but soft rounded ridgelines, no rock faces, and a nearly flat-topped
skyline from 720 m. It read as rolling downland. Relief agreed: 187.9 m for `montane` against
248.5 m for the `plain` control with stages 4 and 5 off.

The obvious lever, erosion strength, was the wrong one. The cause was a scale error. Height is
`PEAK_HEIGHT · up · rv` with `up = u²` applied at the end, but the guide was scaled by
`PEAK_HEIGHT / RELIEF_NORM` with no `up`: it described the terrain at full uplift everywhere. The
squared slope the weights read was overstated by `1 / u⁴`, which at the median uplift
`u ≈ 0.5` is **16**.

That was the whole behaviour. Each octave adds about the same to the guide gradient, and the
guide scale was about 326, so by octave 4 the squared slope reached 4 to 8. At `k = 6` the erosion
weight was about 0.03 and the talus weight 0.15: a product of about 0.005. **Octaves 5 to 8
contributed well under 1% of nominal everywhere.** The field was effectively four octaves of
fBm, which is what soft, flat-topped ridges look like. No single erosion strength could fix a
factor that varied 16× across the map: low enough for detailed valleys turned peaks to noise,
and high enough for peaks left valleys smooth.

No test caught it, because nothing was inconsistent: the derivatives were exact derivatives of
the wrong landscape. It was found by reading the guide's scaling beside the height's and asking
why they differed.

**The fix** scales the guide by local uplift, computing `up` before the relief loop. The guide now
varies with `u`, so each weight gains a term:

```
∂m/∂u = 2 · (PEAK_HEIGHT / RELIEF_NORM)² · up · up′ · |∇f|²
```

That is first order in quantities already computed, so the regress still stops at second
derivatives. It is written as a product, not `m · 2 · up′ / up`, which is 0/0 at `u = 0`.

Verification used controls. `plain` has attenuation off and `ridged` pins uplift to 1, so both
came out byte-for-byte unchanged; only `montane` moved, from 187.9 m to 213.7 m of relief. The
derivative test passed, and failed at about 60× the bound with the new term omitted. The browser
showed peaks and notches on the skyline. Neither check alone suffices: the test passes any
self-consistent maths, and the eye cannot tell a rougher field from wrong normals.

## 5. Composing features without breaking C² or determinism

Every feature after the mountains follows the same rules:

- **One stage, one coordinate:** signed distance to the shore, offset from the road, or altitude.
- **Quintic windows.** Smootherstep has zero first and second derivatives at both edges, so a
  window never creases the surface. A kink is exactly what the harness would flag.
- **Identity when cold.** Where a window is exactly zero, the stage returns its input as the same
  object, so bit-identity outside the feature is a property of the code path, asserted with
  identity, not tolerance.
- **Masks read heights, never slopes**, because slope-keyed masks would need second derivatives
  of the composed field, which the stages do not carry. Distances are compared squared, avoiding
  roots and staying smooth at zero.

### The coastline in signed-distance space

```
coastX(z) = −400 + 220 · warp(z)        // 2-octave noise along z, 1100 m wavelength
d(x, z)   = x − coastX(z)               // positive inland, negative at sea
```

`∂d/∂x = 1` and `∂d/∂z = −coastX′(z)` come from the noise's analytic derivative, so everything built
on `d` chains exactly. The shore is unbounded along its length.

- **Onshore**, a smootherstep of `d` starting 25 m inland blends the beach into the mountains.
  The same warp value modulates the window's end: on a headland it narrows to 40 m, so mountains
  arrive as a steep bluff; in a bay it stretches to 500 m of sand. Headlands read as resistant
  rock without a second noise field. Past the window the mountain sample is returned unchanged.
- **At the waterline**, beach grade (2.5%) and surf grade (1.5%) meet through a C² softened
  `max(0, d)` over ±6 m rather than a crease. Offshore, the seabed steepens to a 25 m floor.
- **Sea stacks** come from a jittered grid of 180 m cells: a hash decides presence, centre, radius
  and height, and each query sums its 3×3 neighbourhood. Each column is
  `height · (1 − r²/R²)³`: a polynomial in `r²`, so no square root, no derivative singularity at
  the peak, and C² at the rim. The 12 m minimum radius is a rendering constraint: stacks sit
  400–700 m from a camera on the beach, in clipmap rings sampled every 8 to 16 m, and thinner
  columns would fall between samples and flicker.

Sea level floods nothing inland because the mountain field never dropped below +12.2 m over a
12.8 km sweep (August 2026), which lets sand colour key on altitude alone; a guard test holds the
inland floor above 10 m.

### The highway, graded by a B-spline

The road must run forever, keep to flat land and never cross a peak, one coordinate at a time, so
global route-finding is out. A naive line about 250 m inland measured a median terrain height of
131 m, a 394 m maximum and a 97 m worst cut: the dense field pushes mountains nearly to the shore.

The flat land is inside the shore-blend window, so the centreline is defined relative to it:

```
d_r(z) = (25 + 30) + 0.12 · (blendEnd(z) − 25) · (1 + 0.4 · wobble(z))
u(x,z) = d(x, z) − d_r(z)               // signed offset from the centreline
```

The wobble factor is always positive, so `d_r ≥ 55` and the corridor never reaches the beach. The
road swings inland through bays, hugs the bluff foot around headlands, and never ends.

A road cannot ride terrain bumps, and a pointwise function cannot run a moving average. The
**grade line** is a uniform cubic B-spline over pre-road heights sampled on the centreline every
480 m. Any query touches four lattice points; the spline is C² with a closed-form derivative and
low-passes the terrain, following big landforms so cuts stay bounded and ignoring small ones so
grades stay sane. It approximates rather than interpolates, on purpose. Lattice heights are
memoised, and a test proves the cache bit-transparent in any query order.

**Cut-and-fill** is `h = w·grade + (1 − w)·terrain`, with `w = 1` on an 11 m flat bed (height
exactly the grade, `dx` exactly 0) falling by smootherstep to 0 at 30 m, which makes road cuts
through rises and embankments over dips. Collision comes free: the road is terrain.

Tuning was a lesson in probing the formula you ship. The first probe (30 km of positive `z`,
without the 55 m floor) measured a 12.2% maximum grade and an 11.6 m cut, both unrepresentative:
the floored line sits on steeper flanks, and the negative-`z` half held a worse headland. With the
floor, a 0.35 window fraction and 160 m lattice measured a **43% grade and 33 m cut**. At 0.12 and
480 m, re-probed over 90 km both ways (August 2026): 7.0% maximum grade, 24.2 m maximum cut or
fill, road never below +6 m. A census over 30 km holds grade under 12% and cut or fill under 30 m.

### Cliffs as a monotone terrace remap

Real cliffs are near-vertical faces between benches: a remap of altitude, not more noise. Shift
altitude so bands do not ring the world at fixed heights, `g = h + φ` with `φ` a 14 m noise, then
terrace `g` into 26 m bands:

```
n = floor(g / 26),  f = g / 26 − n
step(f) = 0.2 · f + 0.8 · smootherstep(0.38, 0.62, f)
Δ = 26 · (n + step(f)) − g
h′ = h + m · Δ                           // m: cliff mask in [0, 1]
```

- **Monotone:** `step′ ≥ 0.2`, so terrain never inverts, whatever the constants.
- **C² across bands:** `step(0) = 0`, `step(1) = 1`, and the smootherstep window is interior, so
  derivatives match where `f` wraps. No crease at bench lips.
- **Benches and risers:** slope is multiplied by 0.2 on benches and up to about 6.4× across the
  riser, so a 35% flank becomes a face of about 65°.
- **Bounded:** `|Δ| ≤ 26 · 0.8 / 2 = 10.4 m`, a census bound derived from the geometry.

The mask combines a mountain component (ramping in over 120–220 m of altitude, patchy along a
range) and sparse lowland outcrops (only above 12–20 m, so sand is never terraced). It never reads
slope; risers concentrate on steep ground anyway, because steep ground crosses more bands per
metre. A smootherstep on `u²` from 30 to 90 m makes the mask exactly zero in the road corridor,
which keeps the grade lattice bit-identical (an unsuppressed riser between lattice points could
have added about 6% grade) and reads as intent: the highway was built where the ground allows.

### Dunes windowed on base height

The beach was a constant grade, lit identically everywhere. Dunes add 3-octave noise sampled at
30 m across the shore and 90 m along it, so ridges elongate along the coast like foredunes. The
amplitude is windowed on **pre-dune height**, not coast distance: rising over 0.1–1.0 m and falling
over 4–8 m, matching the band painted as sand. That self-adjusts around bays and headlands and
excludes everything below the waterline. It is also the sea-level safety margin: a trough reaches
at most 69.4% of the local height at a 1.2 m amplitude, so dunes never pit dry beach below sea
level. Delivered relief across 15 km of coast measured 0.195 m crest-to-trough at the median and
0.492 m at worst.

Dunes run after cliffs and before the road corridor, which flattens them. An earlier argument held
that this placement kept dune noise out of the grade spline. It was wrong: the spline samples only
the centreline, where the dune window's own road suppression is already zero. Moving the stage
leaves every lattice height unchanged, so no numeric test could fail; the guard checks the call
site instead.

The full order today: coast frame, shore and stacks blended with the mountains, cliffs, dunes, the
trailhead pad, made trail features (a peak, meadows, a pond), the trail corridor, and the road
corridor last. The trail system spec builds on this field under the same contract.

## 6. Determinism rules for peers

Nothing about the world crosses the network, so any disagreement is a desync with no correction.

- **No implementation-defined `Math`.** `sin`, `cos`, `atan2`, `pow`, `exp`, `log`, `hypot` and
  friends may differ by an ULP between engines, so a generator using one could build a different
  world in Chrome than in Firefox. The generator uses only arithmetic, `Math.floor`, `Math.imul`
  and `Math.sqrt`, which IEEE 754 specifies exactly; `**` is banned like `Math.pow`, and powers are
  repeated multiplication. A test scans the simulation source, allowlisting a few older calls
  outside the generator by call text rather than line number
  ([`architecture.test.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/test/architecture.test.ts)).
  Rendering code is exempt.
- **Per-pass seed streams.** Each pass hashes (world seed, chunk x, chunk z, pass id) into its own
  stream. One sequential stream would shift every later draw when a pass is added, silently
  rewriting every world. Pass ids are never reused.
- **Bit-identical refactors.** Before the pipeline was parameterised, a snapshot test captured
  exact `h`, `dx`, `dz` literals for three variants on a 9-point lattice, asserted with exact
  equality. New knobs enter as exact identities at their default (`0 + 1·u`).
- **A level id that refuses mismatches.** The host sends a level id on join and the client refuses
  if its own differs ([`forest.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/sim/forest.ts)).
  It combines a version, the variant, the seed and two hashes. `fieldHash` covers a fixed 16×16
  grid of heights quantized to 1/16 m. `passHash` joins a **geometry digest** of what the passes
  emit over a fixed probe, which catches undeclared logic changes, with a **registry digest** of
  every declared constant (noise salts included) hashed as exact bits, which catches changes too
  small to sample. The retired forest showed why both are needed: its ramp gate rolled 93 times in
  the probe, raising the ramp chance from 0.16 to 0.17 flipped none, and a nine-fold larger probe
  did not help. The version number remains for changes no digest can see, such as walking speed.

Version skew proved more likely than float differences: a player on a cached pre-deploy bundle
would build a slightly different world and drift invisibly. The level id makes that a clear
refusal. The netcode on top is in [browser co-op netcode](/docs/browser-coop-netcode).

## 7. Rendering it kilometres out

The forest's fog sat at 70 m, right for dense trees and useless for mountains, which only exist
as mountains at distance. Brute force is out: 2 km of view at 32 m chunks is over 16,000 chunks.

Because height is a pure function, distant terrain needs no chunks. A **geometry clipmap**
([`clipmap.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/clipmap.ts))
samples the field directly: 7 camera-centred rings of 128 cells per side, at 1, 2, 4, 8, 16, 32
and 64 m spacing, about 8.2 km across, 7 draw calls and about 90,000 quads at any view distance.

- **Snapping.** Each ring's origin snaps to twice its own spacing. Its own spacing stops vertices
  sliding between samples as the camera moves; doubling it puts every vertex on the next coarser
  ring's lattice, keeping that ring's hole aligned to whole cells at every camera position.
- **Holes** are cut from the index buffer, leaving vertex arrays whole.
- **Cracks.** Rings meet at a 2:1 mismatch, which leaves gaps unless the finer ring's border
  vertices are pinned to the coarser surface. That pinning is now one end of a blend over an
  upper envelope of the field; why is in
  [floating props on procedural terrain](/docs/floating-props-on-procedural-terrain).
- **Incremental scrolling.** Samples depend only on world position, so when a ring moves, vertices
  still inside are copied and only new strips are sampled: about 0.67 ms per frame at a sprint,
  zero at rest. A test requires a scrolled ring to equal a fresh one.
- **Fog as a depth cue.** The base fog density reaches 4 km, where 5% of a surface's colour
  survives, before height shaping. Without aerial perspective, distant peaks read as flat
  cardboard. Shadows stop at 300 m instead of following the fog, which would have cut near-field
  shadow resolution about 50× (as designed in August 2026).

## Sources

| Source | Covers |
| --- | --- |
| [Value noise derivatives](https://iquilezles.org/articles/morenoise/) (Quílez) | Analytic noise derivatives; damping fBm octaves by slope for an eroded look |
| [Domain warping](https://iquilezles.org/articles/warp/) (Quílez) | Evaluating `f(g(p))` with noise-driven `g` |
| [Geometry Clipmaps: Terrain Rendering Using Nested Regular Grids](https://hhoppe.com/proj/geomclipmap/) (Losasso and Hoppe, SIGGRAPH 2004) | Nested camera-centred grids |
| *Texturing and Modeling: A Procedural Approach* (Ebert, Musgrave et al.) | Ridged and hybrid multifractals |
