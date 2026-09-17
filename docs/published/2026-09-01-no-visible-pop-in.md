---
description: Keeping a streamed browser forest from visibly spawning: pixel-size arithmetic, screen-space dissolve bands, and what discard costs in opaque shaders.
published: 2026-09-01
---
# No visible pop-in: dissolving a streamed forest

**Question:** Day Hike streams an endless forest around the player in a browser, with
Babylon.js on WebGL2. The standing rule for its scenery is that the player must never see
anything spawn: every tree, bush and tuft of grass in view must already be there. Level of
detail, instance budgets and streaming all work against that rule. How do you turn "never
visibly spawns" into something a renderer can check, and what does it cost?

**Short answer:** the rule becomes arithmetic. At the game's field of view, a 1080p frame
has about 770 pixels per radian, so every place where an instance appears, disappears or
changes shape has a size in pixels, and that size must be small. Every such edge becomes a
**dissolve band**: a fragment-stage screen-door dither driven by interleaved gradient noise,
evaluated per frame from the true eye distance. Where two versions of a tree meet, the
outgoing and incoming draws keep **complementary halves** of the noise, so every pixel is
drawn exactly once. Band membership is **padded by the most the streaming grid's snap can
move a distance**, so the snap never shows. The trap is `discard`: putting it into opaque
materials disables early depth rejection and cost 10 to 20 ms at 8× resolution, so the
dither is confined to materials that already alpha-test, and opaque props hand off
geometrically at a size of a few pixels. Shadows are the one place the dither cannot reach.

The shipped mechanism is
[`distanceFadePlugin.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/distanceFadePlugin.ts)
in the public game repository; the band tables are in
[`forestField.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/forestField.ts)
and
[`clutterField.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/clutterField.ts).

## 1. The rule, as pixels

Nothing hides in haze close to the player. Before height shaping, the base fog term is
exponential-squared and is solved for 5% transmittance at 4 km in clear weather, so at 1 km a
tree keeps 83% of its contrast and at 2 km it keeps 47%. Popping cannot be buried in fog below
a couple of kilometres.

The camera's vertical field of view is 1.4 radians. Spreading 1080 rows over that gives
about 770 pixels per radian, so an object of height *h* at distance *d* is roughly
*h* / *d* × 770 pixels tall. That is the one formula every number below uses. It is slightly
generous: at the centre of the screen a perspective projection gives about 640 pixels per
radian, so the true sizes there are about a fifth smaller, which errs on the safe side.

With that formula, "never visibly spawns" becomes a question with an answer for each class
of scenery: at the distance where this instance appears, disappears or swaps meshes, how
many pixels tall is it? The answer decides the mechanism:

- **Things with a silhouette** (trees, saplings, snags) must exist until they are close to
  sub-pixel, or at least small and hazed, and every change on the way there must dissolve.
- **Carpet-like things** (meadow, flowers, grass) may end where a tuft is a few pixels,
  as long as the edge dissolves into the ground texture rather than stopping at a line.

## 2. Why the forest popped

Before this work, the numbers were bad in several different ways.

| Source | Mechanism | What the eye saw |
| --- | --- | --- |
| Three giants in four | The billboard band from 120 m to 2 km sampled one tree cell in four. The other three trees were not drawn at all until they entered the 120 m near band. | A 41–70 m tree appearing from nothing at 120 m: 260–450 px tall |
| The fourth giant | Billboard to low mesh at 120 m, to mid mesh at 85 m, to full mesh at 42 m, all hard swaps | Silhouette and shading jumping three times on the approach |
| Saplings and snags | Near band only, no billboard | An 11 m sapling appearing at 120 m: 70 px. A 6–8 m snag: 40–50 px |
| Understory | Ferns and shrubs inside 65 m, hard edge | A 1 m fern appearing at 65 m: 12 px |
| Meadow carpet | 20 m disc; the last 6 m shrank each tuft toward the ground | Grass growing out of the soil 14–20 m ahead; a tuft at 17 m is 13 px |
| Bushes, flowers | 45 m and 35 m discs with shrink ramps | A 1.5 m bush visibly shrinking at 40 m, about 29 px |

**Hard LOD swaps read as spawning** because a swap is a change of shape at a size the eye
resolves easily. A tree at 85 m is still more than 50 px tall; switching its mesh changes
its outline and its shading in one frame, and in motion the eye catches that as something
happening.

**The shrink fade read as spawning too.** It had replaced hard pops at clutter disc edges in
an earlier round: a vertex-stage plugin scaled each instance toward its base point over the
last fifth of its disc (the last 30% for meadow). It worked exactly as designed, and what it
designed was growth. A tuft that rises out of the ground as you walk toward it is a tuft
spawning, only slower. Scaling was the right *place* for the fade (it had to live in the
shader, because instance matrices are rewritten only when the camera crosses a streaming
cell, so a CPU-side ramp would step every few metres), but the wrong *effect*.

## 3. The dissolve: a screen-space dither

The replacement is one material plugin that every fading instance uses. It changes
visibility, never size.

The vertex stage computes one number per instance: the **horizontal distance from the eye to
the instance origin**, `distance(finalWorld[3].xz, fadeEye.xz)`. Using the origin rather than
the fragment's own position means a whole tuft or tree fades as one unit, and ignoring
height means a mesh standing on its base point and a billboard centred higher up, placed at
the same ground position, compute the same distance.

The fragment stage runs at the very start of `main`, before any texture fetch, so a dropped
fragment costs nothing else:

```glsl
float dfN   = dfNoise(gl_FragCoord.xy);
float dfIn  = smoothstep(vFadeBands.x, vFadeBands.y, vFadeDist);       // 0 before the in-band, 1 after
float dfOut = 1.0 - smoothstep(vFadeBands.z, vFadeBands.w, vFadeDist); // 1 before the out-band, 0 after
if (dfIn < 1.0 - dfN || dfOut < dfN) discard;
```

`dfNoise` is **interleaved gradient noise** (IGN), from Jorge Jimenez's 2014 post-processing
work on *Call of Duty: Advanced Warfare*:

```glsl
fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y))
```

It maps each pixel coordinate to a value in [0, 1) with neighbouring pixels spread across
the whole range, so thresholding it at *v* keeps close to a fraction *v* of the pixels in any
small patch, evenly scattered rather than in clumps. It needs no texture and costs one line.
Because it is a fixed function of the pixel position, the pattern is pinned to the screen and
needs no temporal filtering. Scenery does slide under a screen-fixed pattern as the camera
moves, the effect [Return of the Obra Dinn](/research/stylized-shader-looks) had to fix for its
whole image, but a dissolve band covers a few to a few tens of pixels for a moment, so it goes
unnoticed.

The bands are **per instance, not per material**. `fadeBands` is a four-float thin-instance
attribute (in-band start and end, out-band start and end), written beside each instance's
matrix. It has to be per instance: billboards inside and outside 1 km share one material per
species but fade out at different ranges (section 6), and a tree drawn by two LOD buckets
carries each bucket's bands. For every clutter class the value is constant across the bucket,
so the cost is 16 bytes per instance. A band that should never fire is `(-2, -1)` for the
in-band and `(1e8, 2e8)` for the out-band, never two equal edges, because GLSL leaves
`smoothstep(e, e, x)` undefined.

## 4. Seams: two keep-sets that partition every pixel

Wherever one representation of a tree hands over to another (full mesh to mid mesh, mesh to
billboard), the tree is drawn by **both** buckets across a band, and their fades run in
opposite directions. Both draws hit the same pixels and read the same noise value there,
because the noise depends only on `gl_FragCoord`. That shared noise is what makes an exact
cross-fade possible, and also what makes a naive one fail.

The naive version computes one visibility `v = dfIn * dfOut` and keeps a fragment when
`n < v`. At a seam, the outgoing bucket keeps `n < 1 − s` and the incoming bucket keeps
`n < s`, where `s` is the smoothstep across the band. Both sets start at zero: they are
**nested**, not complementary. At mid-band, where both visibilities are 0.5, the pixels with
noise below 0.5 are drawn twice and the pixels above 0.5 are drawn by neither, so half the
tree is a hole. An earlier version used exactly this predicate, and the mid-band speckle it
produced looked plausible in still images.

The fix tests each term on its own side of the noise:

- the outgoing (out-band) term keeps a fragment when `dfOut ≥ n`;
- the incoming (in-band) term keeps a fragment when `dfIn ≥ 1 − n`.

At a seam both buckets use the same band edges and the same distance, so `dfOut = 1 − s` for
the outgoing bucket and `dfIn = s` for the incoming one. The outgoing bucket keeps
`n ≤ 1 − s`; the incoming bucket keeps `n ≥ 1 − s`. Those two sets **partition** [0, 1): at
every pixel and every point in the band, exactly one bucket draws. No hole at mid-band,
nothing drawn twice, and the tree's coverage never changes during the handover. A pure
TypeScript mirror of the predicate (`fadeKeeps`) sits beside the shader so the partition can
be tested numerically rather than judged from screenshots.

## 5. Padding band membership by the snap distance

The fade is evaluated per frame from the true eye position. Band *membership* (which buckets
a tree is emitted to) is not: the forest's CPU side walks the tree grid around a
**cell-snapped** origin and rebuilds only when the camera crosses a 10 m tree cell. Between
rebuilds, the snapped origin can sit up to √2 × 10 m, about 14 m, from the real eye.

If membership used the snapped distance against the exact band, a tree whose true distance
was inside a seam band, but whose snapped distance was just outside it, would be in only one
bucket. The shader would then fade it out with nothing fading in, or fade it in from nothing:
a pop exactly where the band was meant to hide one.

The fix decouples the two. The shader's band keeps its designed width; the field emits a
tree to both neighbouring buckets whenever its snapped distance is within the band **padded
by √2 × the cell size on each side**, the most the snap can shift it. A padded duplicate
that turns out to be outside the true band is at visibility 1 in one bucket and 0 in the
other, so it costs its vertices but still covers each pixel exactly once. The same
rule pads the outer edge of every disc, so a tree that joins the list because of the snap is
already at visibility 0.

The padding is not free. The near band's flat list, duplicates included, runs about 47–49%
over its unique trees at the cameras scanned in September 2026, and padding the understory
disc raised its instance count 1.48×. Clutter uses the same idea at its own 3 m cell: every
fade ramp has a floor of √2 × 3 m, about 4.2 m, so a narrow ramp on the low quality tier
(which scales every radius by 0.6) cannot become narrower than the snap jitter it has to
hide.

## 6. The bands

Every forest seam is now a band:

| Seam | Band (m) | Fades out | Fades in |
| --- | --- | --- | --- |
| Full mesh / mid mesh | 36 → 42 | full mesh | mid mesh |
| Mid mesh / low mesh | 76 → 85 | mid mesh | low mesh |
| Low mesh / billboard | 100 → 120 | low mesh | billboard |
| Every cell / one cell in four | 900 → 1000 | billboards not on the thinned grid | nothing (the thinned grid is already drawn) |
| Billboard / nothing | 1800 → 2000 | billboard | nothing |
| Understory edge | 52 → 65 | ferns and shrubs | nothing |

Saplings and snags now get billboards of their own and ride the same bands as the giants.

The billboard grid changed too. Beyond 1 km the band still samples one tree cell in four,
but inside 1 km it samples every cell. A 41–70 m giant is 32–54 px tall at 1 km, which is
clearly resolvable, so the three missing trees in four would otherwise appear from nothing
there; the extra trees instead dissolve out across the 900 to 1000 m band. At 2 km the same
giant is 16–27 px and has lost about half its contrast to haze, so the outer band only has to
finish erasing an already faint shape.

For clutter, each class dissolves over the last fifth of its disc (the last 30% for meadow),
and its near-to-far mesh switch at 45% of the radius is also a band, closing a swap pop that
the shrink fade had left alone. With the shipped radii:

| Class | Height | Ends at | Size there | Handover |
| --- | --- | --- | --- | --- |
| Meadow carpet | ~0.3 m | 40 m (was 20) | 6 px | dissolve |
| Flower | ~0.4 m | 50 m (was 35) | 6 px | dissolve |
| Grass | ~0.4 m | 110 m | 2.8 px | dissolve |
| Bush | 1.5 m | 110 m (was 45) | 10 px | dissolve |
| Understory | ~1 m | 65 m | 12 px | dissolve |
| Rock | ~0.4 m | 110 m | 2.8 px | opaque: disappears at that size |
| Driftwood | ~0.5 m | 110 m | 3.5 px | opaque: disappears at that size |
| Fungus | ~0.15 m | 70 m | 1.7 px | opaque: disappears at that size |
| Boulder | ~2 m | 400 m | 4 px | opaque: disappears at that size |

Two classes are compromises and are named as such: bushes at 10 px and understory at 12 px
dissolve at sizes that are visible, among grass and under canopy respectively. The levers,
if they are ever needed, are a billboard for bushes and a wider understory disc (65 to 90 m
would cost 1.9× the instances). The opaque classes do not dissolve at all, for the reason in
the next section.

Widening the discs was only affordable because the edges now dissolve. The meadow budget
went from about 2,700 instances to 10,600, bushes from 445 to 2,500, and the forest draws
1.68× as many giants as before at a dense test viewpoint (the estimate had been 1.75×). The
billboard budget is two clamps: 26,000 for the thinned grid and 20,000 for the every-cell fill
inside 1 km, split so a dense fill cannot starve the outer grid or the reverse.

## 7. The cost of `discard` in opaque materials

The first build attached the dither to every material in the scene, and frame time went up
far more than the added instances could explain.

**How it was measured.** Paired back-to-back samples of 300 frames against the previous
build, in both orders, three rounds, at two viewpoints: a roadside and an open meadow. The
page rendered at 5485×3085, 8.16× the pixels of 1080p, so fragment costs rise well above
noise. At native resolution both builds held a vsync-locked 16.67 ms at both viewpoints.

**With the dither on every material:** every pair was positive, so the gap was a real
fragment cost, not drift.

| Viewpoint | Round 1 | Round 2 | Round 3 | Mean |
| --- | --- | --- | --- | --- |
| Roadside | +9.1 ms | +10.5 ms | +12.6 ms | +10.7 ms |
| Meadow | +22.4 ms | +23.1 ms | +15.2 ms | +20.2 ms |

Bisecting the instance counts in place changed nothing. With the meadow carpet back at
20 m, all three widened radii reverted, and the 1 km billboard fill switched off, the meadow
gap stayed at about +20 ms.

**The cause was the plugin itself.** A `discard` anywhere in a fragment shader means the
fragment's depth cannot be written before the shader has run, so the GPU stops rejecting
hidden fragments early for that draw, and tile-based GPUs lose their equivalent hidden-surface
removal too (*unverified*: inferred from the measured cost, not from a citable primary source).
The dither had put a `discard` into every opaque
material: bark, rock, boulder, driftwood and fungus. In a dense forest, trunks hidden behind
other trunks were being shaded in full.

**The fix: attach only where a `discard` already exists.** Alpha-tested materials (foliage
and grass cards, flowers, bushes, understory, the billboards) discard anyway, so the dither's
extra `discard` costs them almost nothing. Restricting the plugin to those, 18 of the scene's
44 materials, brought the gap to **+1.4 ms at the roadside and +9.6 ms at the meadow** in the
first experiment. Clean pairs on fresh pages then measured:

| Viewpoint | At the fix | After the seam and padding fixes | Native-equivalent, after |
| --- | --- | --- | --- |
| Roadside | +1.37 ms (±0.2) | +1.99 ms | about +0.24 ms |
| Meadow | +6.27 ms (±0.8) | +8.83 ms | about +1.08 ms |

The roadside figure is at the noise level of earlier rounds on the same machine. What is left
at the meadow is the widened carpets' own alpha overdraw, plus more billboards and the seam
duplicates; the later rise of about 2.5 ms at 8× (0.3 ms native) matches the one change that
adds fragments there, the padded understory. The attach function enforces the rule:
`attachDistanceFade` returns early unless `material.needAlphaTesting()` is true.

**Opaque materials hand off geometrically instead.** Mesh to mesh at the LOD rings, and at
their disc edges at the sizes in the table above: rock 2.8 px, driftwood 3.5 px, boulder
4 px, fungus 1.7 px. There is one forced exception: the deadwood material, which is opaque,
dithers anyway, because a snag's low-mesh-to-billboard handover at 120 m is 40–50 px and
visibly pops. It covers about 24 instances, and it was judged worth the cost in the browser
rather than by the pixel formula.

One measurement lesson came out of the bisection. The absolute gap in the bisection runs
(+11 to +26 ms) was larger than the clean run's +6.3 ms because it grew each time the new
build's page was reloaded while the old build's numbers stayed put: each load baked five
billboard render targets. Comparisons between configurations need a fresh page for each
configuration.

## 8. A 600 m fallback that bought almost nothing

Sampling every tree cell to 1 km was the one change whose cost was not obviously negligible,
so it had a planned fallback: sample every cell only to 600 m, with the same dissolve band at
its edge. A 41–70 m giant is 50–90 px at 600 m, so the fallback would have been an honest
dissolve into canopy at a size clearly worse than 1 km.

It was measured rather than assumed. With the fill radius at 1000 m, 600 m and switched off,
interleaved twice each in one session at the meadow, the frame-time gap moved by **3 ms or
less out of about 26 ms** at 8× resolution. Neither the carpets nor the fill dominated the
remaining cost; it was spread across everything the design added. The 600 m fallback was not
taken, and the every-cell radius stays at 1 km.

## 9. What shadows cannot do

The dither never reaches the shadow map. Babylon.js renders shadow depth with its own
`shadowMap` shader, and that shader has no hook inside its `main` function for material
plugin code (checked against the installed `@babylonjs/core` 9.18.0 source), so plugin
discards do not run there. A shadow caster's shadow is therefore all or nothing: it follows
membership in the caster list, not the dissolve.

In practice this matters little because very few things cast. Only the giants' full meshes
(inside 42 m) and boulders are shadow casters; mid and low meshes, billboards, saplings,
deadwood and understory never cast. The one visible artefact is a giant's shadow that ends
at the full-mesh seam while its mesh dissolves. It existed before this work and the work did
not change it.

The route to fix it is `ShadowDepthWrapper`, covered in
[Babylon.js material plugin traps](/research/babylon-material-plugin-traps). It was left out here
because it recompiles every wrapped material and would need its own frame-time measurement.

## 10. What stills cannot show

Every check above is a still image, a count or a frame-time sample. "Nothing spawns" is a
claim about walking, and only motion judges it. The places to look are the ones the
arithmetic names: the far rim of the meadow carpet, which should thicken as speckle and never
grow; the forest edge at 100 to 120 m, where a tree should never appear whole; bushes near
100 m and ferns near 60 m, the two compromise classes; and the opaque handovers (a trunk
changing to its billboard at 120 m, a boulder vanishing at 400 m), which are a few pixels by
the formula.

## Sources

| Source | Covers |
| --- | --- |
| [Next Generation Post Processing in Call of Duty: Advanced Warfare](https://advances.realtimerendering.com/s2014/index.html) (Jimenez, SIGGRAPH 2014 Advances in Real-Time Rendering) | Interleaved gradient noise |
| [`distanceFadePlugin.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/distanceFadePlugin.ts) | The dither, the partition predicate, the alpha-test-only attach rule |
| [`forestField.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/forestField.ts) | Forest seam bands, snap padding, billboard budgets |
| [`clutterField.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/clutterField.ts) | Clutter radii, fade fractions, the ramp floor |
| [`forestMeshes.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/forestMeshes.ts) | Shadow casters, the deadwood exception |
| Installed `@babylonjs/core` 9.18.0 source: `Shaders/shadowMap.fragment.js`, `Materials/shadowDepthWrapper.js` | Section 9 |
