---
description: Why trees float on slopes and distant ridges in a procedural world, measured, and the shader and clipmap fixes that grounded them in Babylon.js.
published: 2026-08-29
---
# Why props float on procedural terrain

**Question:** on a steep forest slope in Day Hike, every tree trunk ended in a wide flat
plate with a black gap beneath it and the hillside running away underneath. Logs and
boulders did the same. From a hilltop, distant trees stood on daylight along the ridgelines.
Why do props float on a streamed procedural heightfield, and how do you ground them without
burying them, leaning trees that should stand plumb, or moving collision?

**Short answer:** it is two different problems at two distances. **Near the player** (inside
about 120 m) the terrain is drawn accurately; the props are the problem. The models have a
flat root plate, and a rigid disc up to 3 m across, seated on one ground sample, cannot touch
a 16° to 35° slope everywhere. The fix is a vertex-shader conform that pushes only the base of
a tree down onto the local ground plane, with a 1.5× overshoot, plus a tilt onto the ground
normal for props that rest rather than stand. **Far from the player** (past about 250 m) the
props are right and the terrain is low: the clipmap samples the height field every 8 to 64 m,
and its straight chords cut under ridges and cliff edges by up to 19 m. The fix lifts each
terrain vertex by the most the field rises above any of its drawn edges, blended toward the
coarser ring so seams stay watertight. Neither fix moves a prop or a collider, and both accept
a little burial in exchange for no daylight.

The measurements below were taken in late August and early September 2026 on the deployed
world seed. The mechanisms ship in the public
[game-dayhike](https://github.com/csarkosh/game-dayhike) repository.

## 1. Background

**Terrain as a pure function.** Day Hike's world has no terrain chunks on disk. Elevation is a
pure function of world position that returns the height `h` and its exact gradient
`(dx, dz)`, and the simulation places every tree, log and rock at the exact `h` of its own
position. The renderer draws the same function at whatever resolution it can afford.
([An endless world as a pure function](/docs/procedural-world-as-a-pure-function) covers how
that field is built.)

**Geometry clipmaps.** The renderer draws that function as a
[geometry clipmap](https://hhoppe.com/proj/geomclipmap/): nested square rings of height
samples, finer near the camera and coarser with distance, drawn as flat triangles so the
surface between samples is a straight chord rather than the field itself. ([An endless world
as a pure function](/docs/procedural-world-as-a-pure-function) covers the clipmap's rings,
spacing, snapping and draw calls.)

**Thin instances.** Babylon.js
[thin instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances)
draw many copies of one mesh in a single draw call from a flat buffer of 4 × 4 world matrices,
64 bytes per copy. `thinInstanceSetBuffer` also accepts buffers under any other attribute
name, which the vertex shader reads per instance. Every tree LOD, log bucket and clutter class
in Day Hike is a thin-instanced mesh, so a per-prop fix has two places to live: the matrix,
written on the CPU when a band rebuilds, or the vertex shader, which sees each vertex and the
instance origin (`finalWorld[3]`).

## 2. The first hypothesis: chord sag, rejected up close

The obvious suspect was the clipmap. Props take the exact height; the drawn chord between two
samples sags below the field on convex ground; so the props are right and the terrain is low.
That was measured by comparing the exact elevation against the two-triangle interpolation the
clipmap actually draws, over random points:

| Ring spacing | Drawn at | p90 float | p99 | max |
| --- | --- | --- | --- | --- |
| 1 m | 0–64 m | 0.004 m | 0.047 m | 0.26 m |
| 2 m | 64–128 m | 0.018 m | 0.13 m | 0.64 m |
| 8 m | 256–512 m | 0.15 m | 0.78 m | 6.9 m |
| 32 m | 1–2 km | 1.0 m | 4.6 m | 13.1 m |

At 109 real tree positions inside 64 m the worst chord sag was **4.8 cm**. Across every
clutter class in a 120 m box it was 6.8 cm, and over 20,000 random points near the player,
12 cm. Chord sag is a real effect of metres past about 250 m, but it explains nothing a player
sees on the slope in front of them. The near-field cause had to be something else.

## 3. The near-field cause: a flat root plate on a slope

The tree models reach their full base radius within the first 10 cm above their origin: a
flat root plate. Scaled per instance, that plate becomes a rigid disc. Trees, snags, logs and
saplings also grow larger toward the valley floor (a boost of up to 1.25× at sea level, fading
out by 240 m), so a valley giant is scaled up to 5.13, not the 4.1 its cohort maximum suggests.

| Prop | Base radius at scale 1 | Instance scale | Seated disc radius |
| --- | --- | --- | --- |
| Giant pine and fir | 0.59 m | 2.8–5.13 | 1.65–3.03 m |
| Deadwood (log role) | 1.57 m | 1.5–2.5 | 2.36–3.93 m |
| Large boulder | 1.45 m | 0.6–1.39 | 0.87–2.02 m |
| Understory shrub | 0.39 m, widening to 1.18 m by 0.25 m up | 0.8–1.63 | up to 1.92 m |
| Sapling | 0.27 m | 0.8–1.63 | 0.22–0.44 m |

The scale ranges include the valley boost where it applies; the giant, sapling, deadwood and
boulder ranges match the constants in the shipped code.

That disc was seated on a **single** ground sample at the instance's own position, while forest
ground runs a median gradient of 0.28 (16°), a p99 of 0.71 (35°) and a maximum of 0.86 (41°).
Measured daylight under real instances within 120 m, sampling each footprint circle at 24
azimuths and two radii:

| Cohort | Footprint radius | Median gap | p90 | Max | Share over 30 cm |
| --- | --- | --- | --- | --- | --- |
| Giants | 1.8–2.7 m | **0.61 m** | 1.09 m | 2.44 m | **87%** |
| Logs | 2.6–3.4 m | **0.93 m** | 1.49 m | 2.00 m | **95%** |
| Snags | 1.2–1.6 m | 0.43 m | 0.84 m | 1.15 m | 73% |
| Saplings | 0.25–0.4 m | 0.12 m | 0.18 m | 0.18 m | 0% |

Small clutter in a 60 m box stayed low: rocks at most 0.42 m, meadow tufts 0.28 m, fungus
0.24 m, bushes 0.06 m. So the near-field artifact is **footprint times slope**, and it is
worst on exactly the props that are largest and most noticed.

The goal became: no visible daylight under a prop's base, without burying it, without leaning
trees that should stand vertical, and without changing where the simulation puts anything.

## 4. Rejected: sink the whole prop

The cheapest fix is one extra term in the instance matrix: seat the prop at
`groundH − k·R·|∇h|`, where `R` is the footprint radius. It was measured over the 386 giants
within 120 m:

| k | Residual gap p90 | Median uphill burial | Max burial |
| --- | --- | --- | --- |
| 0.0 | 1.09 m | 0.67 m | 2.11 m |
| 0.5 | 0.58 m | 0.95 m | 3.16 m |
| 0.7 | 0.39 m | 1.07 m | 3.58 m |
| 1.0 | **0.20 m** | **1.26 m** | **4.21 m** |

The only `k` that closes the gap buries the trunk a median 1.26 m and up to 4.21 m. The root
flare disappears and a giant fir comes out of the ground like a telephone pole: a different
artifact of the same size. It also separates the visual from the trunk's box collider, which
stays where the simulation put it. No sink term ships.

## 5. Conform what stands, tilt what rests

A tree grows plumb whatever the hillside does, so its *base* has to follow the ground while its
trunk stays vertical. A boulder or a log rests on the ground, so the whole body should tilt.
That split decides the fix per prop:

| Prop | Fix | Why |
| --- | --- | --- |
| Giants and saplings, all LODs | Vertex conform | Must stay vertical; 87% of giants showed daylight |
| Standing snags | Tilt | The model is authored lying down (below) |
| Boulders, rocks, driftwood | Tilt | Flat-bottomed; resting tilted is what they do |
| Fallen logs | Roll about the trunk axis | Already pitched end to end |
| Understory shrubs and ferns | Tilt | 1.92 m footprint, and leaning with the slope reads natural |
| Grass, meadow, flowers, bushes, fungus | Nothing | Worst gap 0.28 m, and they sway in the wind |
| Distant tree billboards (past 120 m) | Nothing | A billboard has no plate, and the gap is sub-pixel there |

### The base conform

A small Babylon.js material plugin,
[`groundConformPlugin.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/groundConformPlugin.ts),
injects three lines at the point in the PBR vertex shader where the instanced world position
has just been computed:

```glsl
vec2 gcOff = worldPos.xz - finalWorld[3].xz;
float gcW = 1.0 - smoothstep(0.0, gcRamp, positionUpdated.y);
worldPos.y += gcW * min(0.0, gcOvershoot * dot(gcOff, groundGrad));
```

- `gcOff` is the vertex's horizontal offset from the instance origin in world metres, already
  scaled and rotated.
- `dot(gcOff, groundGrad)` is a first-order Taylor step of the height field: how far the ground
  sits above or below the placement point at that offset.
- `gcW` fades the effect out with **model-space** height, so one constant covers the whole
  2.8 to 5.13 scale range. `gcRamp` is 0.8 m: the weight is still about 0.99 across the plate,
  which ends by model height 0.25 m, and it reaches zero before the trunk is clear of it.
- `min(0.0, …)` means the displacement only ever pushes **down**, and `gcOvershoot` pushes past
  the plane.

Both of the last two were chosen by measurement over the 386 giants, not by taste:

| Variant | p50 gap | p90 | p99 | Max |
| --- | --- | --- | --- | --- |
| No conform | 0.615 m | 1.088 m | 1.569 m | 2.441 m |
| Signed plane | 0.133 m | 0.477 m | 1.022 m | **3.055 m** |
| Down-only, ×1.0 | 0.053 m | 0.339 m | 0.927 m | 2.303 m |
| **Down-only, ×1.5** | **0.001 m** | **0.316 m** | 0.909 m | 2.303 m |
| Down-only, ×2.0 | 0.000 m | 0.296 m | 0.904 m | 2.303 m |

A signed conform, which also lifts the uphill half of the plate, looks correct on paper and is
worse in practice: where the real surface is concave, the lifted half rises above ground that
curves away beneath it and opens new daylight, taking the worst case from 2.44 m to 3.06 m.
Overshooting tucks the downhill edge *into* the hillside instead of leaving it level with a
tangent plane the real ground has already fallen away from. The overshoot ships at 1.5,
because 2.0 buys another 2 cm at p90 for more burial. On flat ground the plane term is zero,
so the conform does nothing there; a difference image between builds at a flat-ground camera
was black on the terrain and the trunks.

This is not the sink from section 4. That moved the whole instance and buried the trunk by a
median 1.26 m. The conform moves only geometry inside the ramp band, only downward, and only by
what the local ground plane says.

The gradient reaches the shader as a `vec2` per-instance attribute, `groundGrad`, uploaded with
`thinInstanceSetBuffer` next to the matrix buffer: 8 bytes per instance against the matrix's
64. The shader body is guarded so it runs only on thin-instanced draws, because a non-instanced
clone of the same geometry would otherwise read one arbitrary instance's gradient.
([Babylon.js material plugin traps](/docs/babylon-material-plugin-traps) covers the injection
pitfalls.)

### The tilt

For props that rest, the fix is in the matrix:
[`groundTilt.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/groundTilt.ts)
composes the random yaw with the rotation that carries world up onto the ground normal
`(−dx, 1, −dz)/‖·‖`. Yaw is applied first, in the model's own frame, and the result is laid on
the slope. Scale and position are unchanged.

The tilt is full and uncapped. The steepest measured ground, a gradient of 0.86, is a 41° lean,
and a boulder on that ground genuinely takes it; a cap would bring daylight back exactly where
the artifact is worst. The boulder's collider box stays axis-aligned where the simulation put
it, so the top of a tilted boulder matches its box only to within about 0.15 m on the steepest
ground.

Two props need more than a plain tilt:

- **Fallen logs** were already pitched so the trunk runs from one sampled end height to the
  other. What they lacked was a **roll about their own axis**, which seats a log lying across
  the fall line instead of along it. The roll angle comes from the same gradient resolved
  perpendicular to the trunk.
- **Standing snags** share a model with the logs, authored lying down and rolled 90° upright.
  The conform's ramp reads model-space height, which runs across the trunk's cross-section on
  that model, and the snag's origin is deliberately raised several metres above the ground, so
  origin-relative height does not work either. A dead standing trunk leaning with the slope is
  ordinary in a real forest, so snags tilt, composed after the upright roll.

### Where the gradient comes from

The simulation already called the height sample once per tree and per clutter instance, and
that sample already computed `dx` and `dz` before discarding them. Returning them as two more
fields costs no extra sampling and changes no placement: positions, heights, scales and variants
come out bit-identical, so the world a multiplayer invite points at is unchanged. Re-sampling
the field in the renderer instead was rejected, because clutter rebuilds its instance buffers
as the player walks and those rebuilds must not hitch.

### Limits and cost

- **p99 stays near 0.91 m and the max near 2.3 m.** A plane cannot follow broken ground under a
  3 m plate. That is the honest limit of a first-order conform, not a regression.
- **Normals are not recomputed** on the displaced band. The band sits under the canopy in
  contact shadow, and recomputing would need a second gradient.
- **The shadow map still sees the flat plate,** because Babylon's shadow depth pass uses its own
  shader and never runs the plugin. At high zoom on a giant on a steep sunlit slope, the cast
  shadow did not visibly detach: the displacement stays inside the contact-shadow region under
  the trunk. A custom shadow depth material is the fallback if the ramp or overshoot ever grows.
- **Frame time:** native rendering was vsync-locked at 16.67 ms before and after. Supersampled to
  6.4× the pixels to get off the cap, the conform cost **+0.14 ms, about 0.5%**.

## 6. The far field: chord sag is real past 250 m

With the near field fixed, the distant problem remained: from a hillside, billboard trees
several hundred metres away stood on daylight. Here the original hypothesis is right. It was
re-measured at real tree positions (6,128 trees across a 1.6 × 3.2 km area), taking each ring
at its inner edge, the worst case, with a yardstick of 1 px ≈ 0.05° (1080p at about 90° field
of view):

| Ring | Spacing | Band (inner edge) | Float p90 | Float max | Trees over 1 m | Trees over 2 px | Worst |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 1 m | 32–64 m | 0.016 m | 0.27 m | 0% | 0.6% | 9.6 px |
| 1 | 2 m | 64–128 m | 0.045 m | 1.32 m | 0% | 0.8% | 23.6 px |
| 2 | 4 m | 128–256 m | 0.12 m | 2.0 m | 0% | 1.4% | 18.2 px |
| 3 | 8 m | 256–512 m | 0.31 m | 7.9 m | 0.2% | 2.3% | 35.2 px |
| 4 | 16 m | 0.5–1 km | 0.74 m | 10.4 m | 2.7% | 3.3% | 23.2 px |
| 5 | 32 m | 1–2 km | 1.6 m | 15.4 m | 9.3% | 3.6% | 17.2 px |
| 6 | 64 m | 2–4 km | 3.4 m | 19.1 m | 20% | 4.1% | 10.7 px |

Two facts shaped the fix. The share of *visibly* floating trees grows slowly with distance
(0.6% to 4.1%), while the worst float in metres grows fast: **the tail is cliffs, not
curvature.** A chord across a cliff edge sags by the cliff's height at any spacing, so extra
resolution cannot close it. And inside 64 m, 99.4% of trees float by less than 2 px, which is
why the near-field rejection in section 2 still stands.

## 7. Choosing what height a ring vertex carries

Three samplers were measured on the same trees.

- **Exact** (what shipped before): the table above.
- **Maximum over the half-lattice.** Take nine sub-samples at half the ring spacing around the
  vertex and keep the highest. It kills the tail (worst float 0.3 to 1.8 px), but it also lifts
  every plain slope by slope × spacing/2. **81% of trees were buried by more than 2 px** at every
  ring, median 4.3 px, p90 10 px. It trades a 1 to 4% defect for an 80% one. A 5 × 5
  quarter-lattice at 16× the samples barely improved on it. Rejected.
- **Chord excess** (chosen): lift a vertex by the most the field rises above the drawn chord at
  the midpoint of any of its drawn edges, clamped at zero. It is zero on planes and in valleys
  and positive only on crests, with the same sample cost as the maximum:

| Ring | Float over 2 px | Float max | Buried over 2 px | Buried p50 / p90 / p99 | Buried max |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.0% | 1.0 px | 1.7% | 0.2 / 0.8 / 2.5 px | 0.3 m |
| 1 | 0.0% | 0.8 px | 5.5% | 0.3 / 1.4 / 4.0 px | 1.2 m |
| 2 | 0.0% | 1.0 px | 9.4% | 0.5 / 1.9 / 5.1 px | 2.1 m |
| 3 | 0.0% | 3.7 px | 14% | 0.7 / 2.4 / 6.0 px | 5.8 m |
| 4 | 0.0% | 7.2 px | 18% | 0.8 / 2.7 / 7.1 px | 9.7 m |
| 5 | 0.0% | 2.6 px | 23% | 1.0 / 3.4 / 7.9 px | 16 m |
| 6 | 0.1% | 3.3 px | 26% | 1.1 / 3.5 / 7.8 px | 27 m |

Burial goes up, and that is the intended trade. A slightly buried base reads as a tree standing
in a small rise; a float is daylight under a tree. The residual float maxima are cliff feet, and
the burial maxima are trees at the foot of a cliff whose drawn face now covers them, which most
viewpoints cannot see anyway.

Two other options were rejected:

- **Doubling the ring resolution** (256 cells instead of 128) costs 4× the vertices and fill and
  only halves the visible-float share, because the tail is cliffs.
- **Snapping props to the drawn mesh** makes every prop bob up and down each time a ring
  scrolls, needs a per-instance matrix rewrite on every ring update, and gets the diagnosis
  backwards: the props are at the true height, and the terrain is what is wrong.

## 8. The chord-excess lift

Each ring keeps one extra array: the exact height on its **half-lattice**, every vertex plus
the midpoint between each pair, 257 × 257 samples at half spacing. Like every other ring array
it is a function of world position, so when the ring scrolls it shifts by index and samples
only the strips that entered.

The mesh draws each cell as two triangles split along one diagonal, so every vertex has six
drawn edges: four along the axes and two along the drawn diagonals. For vertex P with exact
height `h(P)`:

```
own(P) = h(P) + max(0, max over the six neighbours q of [ hh(mid(P, q)) - (h(P) + h(q)) / 2 ])
```

where `hh` is the half-lattice height. The guarantee follows directly. At a vertex, the drawn
height is at least the exact height. At the midpoint of an edge P–q, both ends were lifted by at
least the chord's shortfall there, so the chord passes at or above the field. A cell centre lies
on the drawn diagonal, so the same argument covers it. **The drawn surface is at or above the
exact field at every half-lattice point**; what remains is the field's excursion between those
points, which is the residual in the table.

Three details matter in the shipped
[`liftedHeight`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/clipmap.ts):

- The two diagonal neighbours depend on the triangle winding. Changing the winding without
  changing those two offsets silently breaks the guarantee at cell centres.
- A lift under 1 mm is ignored. On a perfect plane, float32 rounding of the three stored samples
  can manufacture a few hundredths of a millimetre of "crest", and the deadband keeps planes
  exactly planar.
- Only heights move. Normals stay the exact analytic normal, so a flattened crest still lights
  like the true slope the props follow, and colours and material weights are untouched. The road
  bed is flat across and smooth along its grade, so its chord excess is zero and the road stays
  at grade at every ring.

## 9. Blending toward the coarser ring

Any lift raises coarse rings more than fine ones at the same position, because a coarse ring's
edges span more ground. If a fine ring's border simply adopted the coarse ring's values, the
step at each seam would be visible:

| Seam | At | Share over 1 px | p90 | p99 | Max |
| --- | --- | --- | --- | --- | --- |
| Rings 0/1 | 64 m | 13% | 1.3 px | 4.7 px | 3.3 m |
| Rings 2/3 | 256 m | 22% | 1.9 px | 6.7 px | 9.4 m |
| Rings 5/6 | 2048 m | 34% | 2.7 px | 8.3 px | 21 m |

So every ring blends across its whole width:

```
y(P) = mix(own(P), coarse(P), t(P))
```

- `coarse(P)` is exactly what the next coarser ring draws at P: its lifted vertex where the two
  lattices coincide, the mean of two lifted coarse vertices along an edge, or the mean across the
  coarse cell's drawn diagonal at a cell centre. Because each ring's origin snaps to twice its
  spacing, these positions always line up.
- `t` runs from 0 at the inner hole to 1 at the outer border, by Chebyshev cell distance:
  `t = dIn / (dIn + dOut)`. Ring 0 has no hole and measures from its centre.
- At the border, `t = 1`, so the fine ring draws the coarse ring's own vertices and chords and
  the seam is watertight. The older crack fix (averaging odd border vertices) is now just the
  `t = 1` case. The outermost ring has no neighbour and draws its own lift.

The lift applies to every ring, including ring 0.

## 10. Result and cost

At three hilltop viewpoints, counting every giant billboard 400 to 1500 m away with a clear line
of sight, against the clipmap's own drawn surface:

| Viewpoint | Trees | Float over 1 m, before → after | Float over 2 px | Buried over 2 px |
| --- | --- | --- | --- | --- |
| A | 694 | 13.7% → **0.1%** | 2.0% → **0%** | 0.6% → 5.2% |
| B | 955 | 15.8% → **0.6%** | 2.2% → **0%** | 1.4% → 13.1% |
| C | 558 | 16.8% → **0.7%** | 2.2% → **0%** | 0.9% → 10.2% |

The worst single tree went from 8.61 m of daylight (7.2 px) to 1.30 m (1.1 px) at 767 m. The
visible change is mostly the mechanism itself: ridge skylines and crest lines sit slightly
higher and fuller. The residual gaps could not be counted by eye in either build, because at
400 to 800 m the terrain behind a floating tree is almost always higher, so the gap shows
ground, not sky.

Vertex and index counts are unchanged, so GPU cost does not move. The CPU cost is the
half-lattice, about 4× the samples of the vertex grid. Measured in the browser under extra CPU
load (so an upper bound), it adds about 105 ms per ring at startup, roughly 750 ms across
seven, and about 1.8 ms per ring scroll, which is about 0.67 ms per frame at a 12 m/s sprint and
nothing at rest. The design estimate had been half that; the measured figures are the ones in
the code.

The same pass added a vertex-shader shrink fade at clutter disc edges so tufts would not
appear at full size. It read as spawning and was later replaced by a dissolve, described in
[No visible pop-in](/docs/no-visible-pop-in).

## 11. What carries over

- **Measure the gap before choosing the cause.** "Terrain too low" and "props too wide" produce
  the same screenshot. Comparing the exact field against the drawn interpolation, at real prop
  positions, separated them.
- **Report the tail, not the mean.** The far-field p90 float is under a metre out to 1 km; the
  fix exists for the few percent of trees on cliff edges, and the cliffs are also why more
  resolution would not have helped.
- **Burial is cheaper than daylight,** but only in small amounts. Both rejected options (the
  slope sink and the half-lattice maximum) closed the gap by burying most props; both chosen
  fixes bury a few.
- **Keep the gradient.** A procedural field that returns exact derivatives makes the conform, the
  tilt and the normals free, as long as nothing throws `dx` and `dz` away.

## Sources

| Source | Covers |
| --- | --- |
| [Geometry clipmaps: Terrain rendering using nested regular grids](https://hhoppe.com/proj/geomclipmap/) (Losasso and Hoppe, SIGGRAPH 2004) | The nested-ring terrain technique |
| [Thin instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances) (Babylon.js documentation) | Per-instance matrix and custom attribute buffers |
| [`groundConformPlugin.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/groundConformPlugin.ts), [`groundTilt.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/groundTilt.ts), [`forestMeshes.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/forestMeshes.ts), [`clutterMeshes.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/clutterMeshes.ts) | The shipped near-field conform and tilt |
| [`clipmap.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/clipmap.ts) | The shipped chord-excess lift and ring blend |
