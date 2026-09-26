---
description: Why near grass reads bare from a first-person eye, what fixing it cost in a Babylon.js game, and the GPU techniques that win the frame back without thinning.
published: 2026-09-26
updated: 2026-09-26
---
# Grass fullness without thinning the field

**Question:** In Day Hike, a first-person hiking game in Babylon.js, a misty screenshot taken in a
grass sward beside a trail showed the ground 1 to 8 m from the eye as nearly bare, a pale floor
with a few thin dark strokes, while the ground 18 to 28 m out read as dense dark tufts. The part
of the frame the player looks at most was the emptiest. We filled the near field, measured it,
and paid about 1.3 ms of frame at the heaviest pose. How do we get that frame back without drawing
fewer grass cards?

**Short answer:** the frame is not going to pixels. It is going to per-instance vertex work, and about 85 % of
the instances shaded are outside the view. Each grass bucket is one Babylon thin-instanced mesh with its visibility
test switched off, and Babylon never culls a thin instance on its own anyway: "either all thin
instances are drawn (if the mesh is deemed visible) or none are" [1]. So every clump in the
40 m disc runs its vertex shader every frame, including every clump behind the camera; filtering
three layers to the view saved 0.82 ms of the 1.23 ms at native. The ranked follow-up is to cull
the blade field and the larger grass cards to the view first, let the terrain
shader carry the far sward as shipped systems since Ghost of Tsushima do [2], lean the cards
toward the eye and hug them to the ground as Horizon Zero Dawn did [3], and match the card roots
to the ground's colour. All of it is WebGL2 work. WebGPU compute culling is the long-term route,
but core Babylon has no indirect draw yet [4], so it gets a bounded spike first.

This continues [the September survey of grass, wind and trails](/research/grass-and-trail-realism),
which asked why the grass looked flat; this one is about what fullness costs once it is there. The
game is public at [game-dayhike](https://github.com/csarkosh/game-dayhike) and playable at
[games.csarko.sh/dayhike](https://games.csarko.sh/dayhike/).

## 1. Why the near field read bare

Two layers make the grass. Out to 18 m is a **blade field**: a lattice of 0.5 m cells, each growing
a clump of tapered strips 2 cm wide at the root and 0.2 to 0.45 m tall, in a near-black green.
Beyond it are **photo cards**: a meadow clump built from Poly Haven's Grass Medium 01 (CC0), an
alpha-tested cluster of vertical cards on a 0.7 m lattice out to 40 m, drawn at a near level of
detail (LOD0, 40 vertices) and a far one (LOD1, five cards, 20 vertices). Where the blade field
grew, the near cards were filtered out. A third layer, the **grass-class cards**, is larger tufts
built from Poly Haven's Grass Medium 01 and 02 (CC0), with a few hundred vertices each.

From a 1.6 m eye the near ground is seen from 15 to 60 degrees above the horizontal, and a 2 cm
strip seen from above covers its own 2 cm of ground and nothing else: the floor shows between the
blades whatever their count. The cards at 18 to 28 m are seen nearly edge-on, row behind row, and
their opaque photo texture overlaps on screen and hides the floor. The difference is not the amount
of grass. It is thin strips seen from above against opaque cards seen level.

## 2. What the game measured

### 2.1 The measure

A mean brightness hides the problem: the near and mid crops' means differed by only 16 %. What the
eye reads as full is the share of the ground hidden. So each 1200 by 2029 still is decoded to
linear luminance and two crops are taken: near, over ground 2 to 6 m out, and mid, over 18 to 26 m.
A crop's **cover fraction** is the share of its pixels darker than a fixed threshold, the unchanged
game's mid-crop median. The bar is near cover at least 0.8 times mid cover, with the two crops' mean
luminance within 0.8 to 1.25 of each other so a fix cannot just paint the near field black.

Two poses are pinned from the world's own data: a **canopy** pose in the sward beside a trail under
a closed forest canopy, and a **meadow** pose in open grass, both misty, at noon, on the high
quality tier. Frame time is measured in paired builds: a fresh browser per round, a discarded
warm-up page, then the unchanged game and the branch in alternating order, plus control-against-control rounds for the noise floor, 8 s of frame intervals each. The bar was at most +1.0 ms at four
times the pixels (2400 by 4058), so fill would show if fill were the cost. Rounds lifted by other
work on the same GPU were set aside; the quiet control-against-control rounds agree within 0.16 ms.

### 2.2 The four gates

On the unchanged game all of the near crop's cover came from the blades and all of the mid crop's
from the cards. The fixes went in as four content changes, each measured before the next.

| Step | Cover ratio, canopy / meadow | Frame ms, canopy / meadow |
|---|---|---|
| Unchanged game | 0.27 / 0.47 | |
| 1. Near cards kept under the blades | 0.45 / 1.03 | +1.19 / +1.48 |
| 1b. The same cards on the lighter LOD | 0.39 / 0.90 | +0.60 / +0.49 |
| 2. The floor under the sward darkened | 0.41 / 0.92 | +0.75 / +0.63 |
| 3. The sward under the canopy at 0.75 | 0.62 / 0.94 | +1.35 / not run |

Frame deltas are at four times the pixels against the unchanged game. The meadow met the bar from
step 1 on. The canopy never met the ratio, for a reason that says more about the measure than the
grass. Step 3 raised the world's canopy floor for grass from 0.5 to 0.75, which with the interior boost
takes the grass under a closed canopy from 0.5 to 0.94 (the open meadow's is 1.5), and the mid
crop, being the same canopy floor 20 m further on, filled up with the near crop. In absolute terms
the canopy's near cover rose to 0.46, equal to the meadow's 0.47, and in the stills the near field
reads as a sward rather than tufts on a floor. That step shipped, at +1.35 ms at four times the
pixels and +1.23 ms at native resolution.

### 2.3 The cost is per-card vertex work

- **It does not scale with pixels.** Step 1 cost +1.19 ms at the canopy at four times the pixels and
  +1.06 ms at native. Fill-bound work would have grown close to fourfold.
- **It scales with the cards drawn, not the cards seen.** The meadow pose, with 3,168 near cards
  against the canopy's 1,400, cost more, although the dither at the feet left only about 1,095 and
  466 cards' worth of pixels visible.
- **Halving the vertices halved it.** Step 1b drew the same near cards on LOD1, half the vertices
  (126,720 down to 63,360 at the meadow). The delta went from +1.19 to +0.60 ms at the canopy and
  from +1.48 to +0.49 ms at the meadow. It also cost a quarter of the cards' own near cover (0.455
  to 0.345 at the meadow), the kind of trade this doc is trying not to make again.

The design had expected alpha-tested overdraw to dominate. It does not.

### 2.4 Where the frame goes, measured

Measured, with an in-page profiler at the canopy pose on the shipped build against the unchanged
game, at native and at four times the pixels. Two cautions on the method. The WebGL2 timer
extension on this driver read about twice the frame interval, so it was used only as a sign that
GPU time moved, not as a GPU time. And sustained load at four times the pixels drifted the machine
within a minute or two, so most figures at that scale stayed too noisy to read; the reliable ones
below toggle each condition on and off every 1.5 s and are marked with their error.

- **The frame is GPU-bound.** JS takes 2.7 to 5 ms of a 22 to 55 ms frame, about 160 draw calls,
  and no ablation moved it beyond its noise.
- **It does not scale with pixels.** The shipped step costs +1.23 ms at native and +1.35 ms at four
  times the pixels; the grass-class cards cost 0.52 ms at native and 0.51 ms at four times.
- **Per layer**, hiding each on the shipped build at native saves: blades 1.36 ± 0.20 ms,
  grass-class cards 0.52 ± 0.12, far meadow cards 0.44 ± 0.05, near meadow cards 0.30 to 0.53.
- **Where the vertex work was added.** The grass-class cards are the largest pool, 1.06 million
  instance vertices, 480,000 more than the unchanged game. The meadow cards added 53,000 near and
  82,000 far. The blades' vertex count did not change, but at the new strength about twice as many
  survive the vertex-stage cut and reach the rasteriser: the blades are the largest single
  increment.

Each thin instance was then classified against the camera's frustum. The portrait window sees about
53 degrees horizontally, about a seventh of the ring the fields fill.

| Layer | Outside the view | Behind the camera |
|---|---|---|
| Meadow cards | 9,850 of 11,393 (86 %) | 5,447 (48 %) |
| Blades | 5,068 of 6,131 (83 %) | 2,681 (44 %) |
| Grass-class cards | 3,872 of 4,559 (85 %) | 2,274 (50 %) |

The direct test: re-uploading all three layers filtered to the frustum saved **0.82 ± 0.14 ms at
native**, which would take the shipped step from +1.23 to about +0.4 ms. At four times the pixels
it saved 0.51 ± 0.42 ms, too noisy to call. Filtering the meadow cards alone saved nothing
measurable at four times the pixels (0.06 ± 0.09 ms). So the lever is the blade clumps and the
grass-class cards, which carry 28 to 784 and 172 to 410 vertices per instance, not the 20-vertex
meadow cards.

## 3. Babylon draws every card behind the camera

Babylon tests a thin-instanced mesh once, against one box around all its instances [1]. A
core maintainer gave the reason: "we do not cull at the single thin instance level (this would
defeat the purpose of using thin instances)" [5]. Day Hike also sets
`alwaysSelectAsActiveMesh` on every grass bucket, the usual workaround because the box is not
recomputed when the instance buffer is updated [6]. So at the canopy pose all of the roughly
11,400 meadow cards, 6,100 blade clumps and 4,600 grass-class cards are vertex-shaded every frame,
and when the player looks at their boots the far ring, entirely off screen, still is.

Instanced vertex shading is per instance per vertex, so the share of instances outside the frustum
is the share of card vertex work wasted. A Unity field of 500,000 instances kept about 89,000 (18 %)
after frustum culling at a 60 degree field of view and a 100 m far plane [7]. A 2026 WebGL
terrain system found per-instance frustum culling halved a 12,000-blade visible set, a heightmap
horizon test cut it to 10 to 20 % in valley views, and the CPU cull took "under a millisecond"
[8]. A disc centred on the player seen through a tall portrait window is the unfavourable
case: the game measured about 85 % of each layer's instances outside the view (section 2.4).

The tempting fix is wrong. Collapsing an instance to a point in the vertex shader saves
rasterisation but still pays the vertex invocation. On an Intel integrated GPU in July 2025, an
early return in the vertex shader plus a fragment `discard` made "0 difference performance wise";
only CPU culling that reduced the drawn count helped [9]. The game's own dither is the
same experiment: it discards most near-card pixels, and the cost still followed the card count.

## 4. The ranked techniques

Ordered by frame expected back per unit of fullness given up. Only the first has been measured
in the game; the rest are estimates from published ratios and the game's own proportionality.

1. **Culling to the view, the blade field and the grass-class cards first.** Back: 0.82 ms at
   native for all three layers, measured. Kept: all of the fullness.
2. **Far sward carried by the terrain shader.** Back: at most the far meadow cards' measured 0.44
   ms at native. Kept: high, if the shader reuses the cards' colour and wind.
3. **Camera-based tilt and ground hugging.** Back: none. Gained: more cover from above.
4. **Root-to-ground colour and coverage-preserving mips.** Back: none. Gained: cards stop reading
   as cut-outs.
5. **Vertex-count LOD per tier.** Back: half the vertices, half the cost. Lost: a quarter of the
   near cover.
6. **Constant-count density tiers.** Back: a quarter of far instances per tier. Kept: coverage, if
   the survivors widen.
7. **Shells for the nearest ring.** Moves cost to fill. Best from above only.
8. **Imposters.** Cheapest per instance; far only.

### 4.1 Culling to the view

The documented pattern is to cut the field into cells, each its own instanced mesh, so the
whole-mesh test does useful work. Godot's Terrain3D uses one MultiMesh per 32 by 32 m cell "so that
these MultiMeshes can be culled by frustum or occlusion" [10]; a 2025 three.js grass uses
256 chunks "for frustum culling benefits" [11]; a Babylon grass demo does LOD "by patch"
at 60 fps most of the time on an Iris Xe [12]. The alternative, one buffer with a CPU
frustum sort and a shrunk instance count, uploads 173 to 640 KB a frame at 2,700 to 10,000
instances, far below what WebGPU guidance calls "perfectly acceptable" for once-per-frame writes
[13].

Sectors fit the game better. The clutter field already rebuilds on a fixed world grid, so a sector
can keep its instances in a static buffer, and that flag matters: a two-million-quad thin-instance
mesh went from 15 to 60 fps when its buffer was marked static [14]. The price is draw
calls. The frame is about 160 draws today, and one Babylon user saw "400+ draw calls" start to hurt
on a 2019 MacBook Pro [15], so sectors are affordable only for a few buckets. The measured
target picks them: the blade clumps and the grass-class cards, which carry most of the per-instance
vertices, while filtering the meadow cards alone saved nothing measurable. The blades are already
thin instances per clump mesh with their own per-instance buffers, so they can be filtered exactly
as the cards can. Each sector needs its box computed once at build, since a refresh walks every
instance in JS.

### 4.2 The far ring on the terrain

Every grass system that publishes its level-of-detail chain ends with the ground carrying the
sward. Ghost of Tsushima's far tier is to "replace entire grass field with a single texture on
terrain", with tiles that double in size at a constant blade count, so "3 out of 4 blades are
dropped" per step, blended so nothing pops [2]. A Godot series ends in an "impostor plane with
no geometry" that reuses the blades' colour noise and wind, and runs a 50 by 50 m field of nominally
10 million triangles in "just under 2 ms" on an unstated machine [16]. Helio's 2026 chain goes
from 11-vertex strips near the eye to "terrain material only" past 120 m, blends height over 2 m
bands, and reports 2.70 ms for a million blades at 1080p [17]. Nanite Foliage keeps an
aggregate's coverage rather than thinning it; the voxels do not port, the policy does, and Epic's
ecosystem advice is that simple grass cards stay ordinary instanced foliage [18],
[19].

For Day Hike that points at the roughly 8,700 far meadow cards between 18 and 40 m. The research
estimated them from proportionality as the largest pool; the profile measured them at 0.44 ms at
native, smaller than the blades or the grass-class cards, so this is second in line. The game already darkens the floor under the sward inside 18 m; the pattern is to push that
outward with a sward colour, a stylised blade normal and the same wind noise, and let the far cards
thin to a constant count per tier. Two cautions. Key the drop to a per-instance hash and the same
origin the dither uses: Godot has an open bug where visibility range and distance fade computed
different origins and flickered at the seam [20]. And keep dither bands narrow, because for
foliage "the more dithered area you have, the more expensive it is" [21]; Godot's hysteresis
mode, two thresholds and no fade, is the cheapest stability tool [22].

### 4.3 Tilt, hugging and colour

Floor showing between vertical cards seen from above is the problem Guerrilla solved in Horizon
Zero Dawn's grass vertex program: "Camera Based Tilting", a displacement toward view-up scaled by
each vertex's height, and "Ground Hugging", which puts each card's base on the heightmap [3]. A
Unity write-up reaches the same fix from the failure: "most grass implementations only look good
at a low view angle", cured by shearing the top vertices so blades "lean in a way that helps to hide
the space between the quads" [23]. Day Hike already leans its cards by a small fixed
amount and conforms their bases. A height-proportional lean toward view-up turns a vertical card
into one that faces a downward eye, visible floor into visible blade, with no added vertex. It
should be clamped and driven by pitch, or cards swing as the player turns.

Colour continuity is the second free lever. Horizon colourises vegetation from world data [3];
Unreal's runtime virtual texture makes "the grass take the color of the landscape below it"
[24]. When a card's lower fifth to third matches the ground, the eye stops seeing its
silhouette and the same count reads denser. With it goes an offline fix: alpha-tested cards thin
with distance because mip averaging drops alpha below the cutoff, until a flower texture
"completely disappears" by mip 5 [25]. Horizon rebuilt each grass mip so its coverage after
the alpha test matches mip 0 [3], which costs nothing at run time.

### 4.4 LOD, tiers, shells and imposters

Vertex-count LOD is proven here and already cost a quarter of the near cover; it should not go
lower before the tilt and colour fixes. Constant-count density tiers, Ghost of Tsushima's policy,
bound the drawn count by tiles rather than area and keep coverage if the survivors widen [2].

Shell texturing moves cost off the vertex stage entirely: N copies of the ground patch, each
fragment hashed and discarded. Sources agree it is "quite powerful and effective, especially at a distance" and that
"near silhouettes the shells become too transparent and their gaps become visible" [26],
[27]; a WebGPU proof of concept notes the angle artifact "can be avoided on geometry like
planes" [28]. From a 1.6 m eye at 1 to 4 m the view crosses the layers nearly head-on, its best
case, but further out they read as stacked contours. It is a candidate for a 0 to 4 m ring, only if
the near field still reads thin after tilt and colour. Octahedral imposters are one quad per
instance, but tools warn of artifacts "near overhead viewing angles" [29] and their
authors use them from 40 m out [30], [17], a ring the terrain sward covers more cheaply.

## 5. What was ruled out

**A depth pre-pass.** It pays when fragment shading dominates. The one controlled 2026 measurement
found a pre-pass cost 0.071 ms and saved 13 % of the frame on Sponza on a laptop RTX 3080 Ti,
because "a depth-only vertex stage reads one attribute and writes no varyings" [31].
Babylon's pre-pass reuses the full material vertex shader, so here it would double the very work
that is the problem. In Babylon 9.18 with alpha-test transparency it also writes depth for the whole
card without discarding, punching holes through what is behind; the fix merged upstream on 23
September 2026, after 9.18 [32]. On Apple GPUs, hidden-surface removal "can reject hidden
fragments as well as depth pre-passes can, but without any additional costs" for opaque draws, and
alpha-tested foliage is the case that defeats it [33].

**Alpha-to-coverage as a saving.** Arm documents that it forces late depth testing just as `discard`
does [34], and it needs MSAA. Babylon 9.18 has only an engine-wide switch, so it would be
toggled around the card draws. Its value is letting fewer, wider cards read as soft blades [35]:
polish, not frame.

**Half-resolution foliage.** No 2023 to 2026 source measures it, and vegetation is the documented
worst case for the depth-aware upsample it needs [36]. An author tuning grass on an M2 found
"vertex processing was never the bottleneck" there, overdraw was, and cut layers instead
[37]. Day Hike's measurement points at the vertex stage, which a half-resolution pass does
not touch.

## 6. The WebGPU route

Shipped GPU-driven grass has one shape: a compute thread per candidate blade culls by frustum and
distance before any vertex work, survivors go to a storage buffer, and an indirect draw consumes
them [38], [2]. The best-documented web example, False Earth (three.js WebGPU, April
2026), renders "over a million grass blades" with "around 80 % of instances never reach[ing] the
vertex shader at all", but gives no frame time or hardware [39]. Ghost of Yōtei's 2025 deep
dive gives culling ratios, over a million trees, rocks and bushes "culled down to about sixty
thousand", not grass milliseconds [40].

Babylon 9.18 has two of the three pieces. `ComputeShader` is WebGPU-only, a `StorageBuffer` can be
flagged for vertex, index or indirect use, and `Mesh.forcedInstanceCount` draws instances straight
from a storage buffer [41]; a compute-written matrix has to be wrapped as four instanced
vertex buffers, since thin instances cannot take a custom buffer [42]. What is
missing is a GPU-driven count: the only indirect-draw sample for Babylon (June 2026, 100,000 coins
at 60 fps on unstated hardware) drops to raw WebGPU through the engine's device handle, leaving
Babylon's materials, shadows and depth integration behind [4]. Storage-backed geometry
with indirect-capable buffers merged on 18 September 2026 in Babylon-Lite, a separate WebGPU-only
engine, not in core Babylon [43].

WebGPU ships by default in Chrome and Edge on macOS and Windows since 113, in Safari 26, and in
Firefox 141 on Windows and 145 on Apple Silicon, but not in Linux Firefox or older Linux Chrome
[44]. Electron follows its bundled Chromium, and Electron 25 and later ship Chromium 114 or
newer [45], so the game's Electron 44 desktop launcher would get it on macOS and Windows. WebGL2
stays the baseline, and every foliage effect in the game is a GLSL material plugin a WebGPU path
would rewrite in WGSL. Measuring is its own problem: Chrome quantises WebGPU timestamps to 100
microseconds unless a developer flag is on [46], and Safari's WebGPU reports that
"Timestamp queries are not supported" at all [47].

## 7. The plan

1. **The ranked follow-up first.** Culling the blade field and the grass-class cards to the view,
   then the far sward on the terrain, the height-proportional tilt and ground hugging, and root-to-ground colour with
   coverage-preserving mips. All WebGL2, all in APIs the game already uses, each measured at the
   same poses by the same paired method before the next goes in.
2. **A bounded WebGPU spike.** Compute-culled blades drawn with an indirect draw through the device
   handle, measured at the same pose as the WebGL2 build, with a fixed time box and a plain
   win-or-lose result. The spike is where the cost of rewriting the plugins in WGSL gets priced.
3. **Upstream if it wins.** The indirect-draw piece goes to Babylon as a contribution, so the game
   does not carry it alone.
4. **A fork only as a last resort.** If upstream cannot take it in time, a small patch set on a
   pinned Babylon version, not a divergent engine.

## 8. What no source measured

- **Any single technique on a card-based field.** Every published figure is whole-system: hexaquo's
  2 ms, Helio's 2.70 ms, and Ghost of Tsushima's often-quoted 83,000 blades in about 2.5 ms, which
  is attributed to the talk video and could not be confirmed from any text source.
- **The culling saving at four times the pixels.** At native it is 0.82 ± 0.14 ms; at four times
  the pixels the machine drifted and the figure (0.51 ± 0.42) does not read. It needs the gates'
  paired method on a quiet machine, as do the blades' split between vertex and fragment work and
  the foliage plugin's own vertex cost. Toggling a layer and reading the delta is the only way to
  attribute time on the web, since neither WebGL2 nor WebGPU gives per-draw timers on Apple hardware, and Safari exposes
  the WebGL2 timer extension to 0.13 % of contexts [48].
- **Shells.** No source gives a cost per shell count, and no shipped 2023 to 2026 game uses shells
  for a first-person ground ring.
- **Alpha-to-coverage on Apple GPUs.** Whether their hidden-surface removal treats it like
  `discard` is inferred from Arm's statement, not stated by Apple.

## 9. Sources

1. Babylon.js Authors, "Thin instances," Babylon.js Documentation. Accessed: Sep. 26, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/mesh/copies/thinInstances.md
2. T. Abrodi, "Grass in Ghost of Tsushima," tigerabrodi.blog. Accessed: Sep. 26, 2026. [Online]. Available: https://tigerabrodi.blog/grass-in-ghost-of-tsushima
3. G. Sanders, "Between tech and art: the vegetation of Horizon Zero Dawn," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2018. Accessed: Sep. 26, 2026. [Online]. Available: https://media.gdcvault.com/gdc2018/presentations/gilbert_sanders_between_tech_and.pdf
4. cx20, "Indirect drawing sample using WGSL," Babylon.js Forum, Jun. 2026. Accessed: Sep. 26, 2026. [Online]. Available: https://forum.babylonjs.com/t/indirect-drawing-sample-using-wgsl/63571
5. E. Popov, "Question about thin instance frustum culling," Babylon.js Forum, Aug. 13, 2023. Accessed: Sep. 26, 2026. [Online]. Available: https://forum.babylonjs.com/t/question-about-thin-instance-frustum-culling/43272
6. E. Popov, "Playing with instances and thininstances," Babylon.js Forum, Feb. 27, 2024. Accessed: Sep. 26, 2026. [Online]. Available: https://forum.babylonjs.com/t/playing-with-instances-and-thininstances/48299
7. Cyanilux, "GPU instanced grass breakdown," Cyanilux. Accessed: Sep. 26, 2026. [Online]. Available: https://www.cyanilux.com/tutorials/gpu-instanced-grass-breakdown/
8. Cinevva, "Terrain occlusion culling," Cinevva blog, May 19, 2026. Accessed: Sep. 26, 2026. [Online]. Available: https://app.cinevva.com/blog/2026-05-19-terrain-occlusion-culling
9. three.js Forum, "Ideas on performing fast per-instance frustum culling on InstancedMesh," Jul. 2025. Accessed: Sep. 26, 2026. [Online]. Available: https://discourse.threejs.org/t/ideas-on-performing-fast-per-instance-frustum-culling-on-instancedmesh/85156
10. Terrain3D Authors, "Foliage instancing," Terrain3D Documentation. Accessed: Sep. 26, 2026. [Online]. Available: https://terrain3d.readthedocs.io/en/latest/docs/instancer.html
11. Codrops, "How to make the fluffiest grass with three.js," Feb. 4, 2025. Accessed: Sep. 26, 2026. [Online]. Available: https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/
12. CrashMaster, "Grass, butterflies and trees with instancing," Babylon.js Forum, Nov. 2023. Accessed: Sep. 26, 2026. [Online]. Available: https://forum.babylonjs.com/t/grass-butterflies-and-trees-with-instancing/45646
13. B. Jones, "WebGPU buffer uploads," toji.dev. Accessed: Sep. 26, 2026. [Online]. Available: https://toji.dev/webgpu-best-practices/buffer-uploads.html
14. Babylon.js Forum, "Mesh with thin instance slower than with full vertices?," Dec. 2023. Accessed: Sep. 26, 2026. [Online]. Available: https://forum.babylonjs.com/t/mesh-with-thin-instance-slower-than-with-full-vertices/46756
15. Babylon.js Forum, "Rendering performance issues." Accessed: Sep. 26, 2026. [Online]. Available: https://forum.babylonjs.com/t/rendering-performance-issues/43140
16. hexaquo, "Grass rendering series part 4: level of detail tricks for infinite plains of grass in Godot," hexaquo.at. Accessed: Sep. 26, 2026. [Online]. Available: https://hexaquo.at/pages/grass-rendering-series-part-4-level-of-detail-tricks-for-infinite-plains-of-grass-in-godot/
17. Pulsar, "Rendering a million blades of grass: Helio's GPU-driven foliage system," Pulsar blog, Aug. 2, 2026. Accessed: Sep. 26, 2026. [Online]. Available: https://pulsarnative.com/blog/2026-08-02-helio-foliage-system
18. Epic Games, "Nanite foliage," Unreal Engine Documentation. Accessed: Sep. 26, 2026. [Online]. Available: https://dev.epicgames.com/documentation/unreal-engine/nanite-foliage
19. StraySpark, "UE5.7 Nanite foliage and PCG: procedural placement and performance," StraySpark blog. Accessed: Sep. 26, 2026. [Online]. Available: https://www.strayspark.studio/blog/ue5-nanite-foliage-procedural-placement-performance
20. Godot Engine contributors, "Issue #114500," godotengine/godot, GitHub. Accessed: Sep. 26, 2026. [Online]. Available: https://github.com/godotengine/godot/issues/114500
21. I. Shinsoj, "Notes on foliage in Unreal 5," Medium. Accessed: Sep. 26, 2026. [Online]. Available: https://medium.com/@shinsoj/notes-on-foliage-in-unreal-5-3522b6eb159f
22. Godot Engine contributors, "Visibility ranges (HLOD)," godot-docs, GitHub. Accessed: Sep. 26, 2026. [Online]. Available: https://github.com/godotengine/godot-docs/blob/master/tutorials/3d/visibility_ranges.rst
23. Vertex Fragment, "Unity deferred grass rendering," vertexfragment.com. Accessed: Sep. 26, 2026. [Online]. Available: https://www.vertexfragment.com/ramblings/unity-deferred-grass-rendering/
24. Epic Games, "Runtime virtual texturing quick start," Unreal Engine Documentation. Accessed: Sep. 26, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/runtimevirtual-texturing-quick-start-in-unreal-engine
25. lisyarus, "Exploring ways to mipmap alpha-tested textures," lisyarus blog. Accessed: Sep. 26, 2026. [Online]. Available: https://lisyarus.github.io/blog/posts/exploring-ways-to-mipmap-alpha-tested-textures.html
26. 80.lv, "Here's how games render grass and fur," 80 Level, 2023. Accessed: Sep. 26, 2026. [Online]. Available: https://80.lv/articles/classic-video-games-trick-for-rendering-grass-fur
27. NVIDIA, "Fur (using shells and fins)," NVIDIA SDK 10.5. Accessed: Sep. 26, 2026. [Online]. Available: https://developer.download.nvidia.com/SDK/10.5/direct3d/Source/Fur/doc/FurShellsAndFins.pdf
28. tmpvar, "Shell texturing," proof of concept. Accessed: Sep. 26, 2026. [Online]. Available: https://tmpvar.com/poc/shell-texturing/
29. Epic Games, "Impostor baker plugin in Unreal Engine," Unreal Engine Documentation. Accessed: Sep. 26, 2026. [Online]. Available: https://dev.epicgames.com/documentation/unreal-engine/impostor-baker-plugin-in-unreal-engine
30. pyrio, "Ashenmere v1.22.0: new grass system, the end of chunk-crossing lag," itch.io devlog. Accessed: Sep. 26, 2026. [Online]. Available: https://pyrio.itch.io/ashenmere/devlog/1526175/v1220-new-grass-system-the-end-of-chunk-crossing-lag
31. ZihanWG, "VulkanEngine pull request #21: depth pre-pass," GitHub, 2026. Accessed: Sep. 26, 2026. [Online]. Available: https://github.com/ZihanWG/VulkanEngine/pull/21
32. Babylon.js Authors, "Babylon.js pull request #18936," GitHub, Sep. 23, 2026. Accessed: Sep. 26, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/pull/18936
33. Apple, "Optimize Metal performance for Apple silicon Macs," presented at WWDC20, Jun. 2020. Accessed: Sep. 26, 2026. [Online]. Available: https://developer.apple.com/videos/play/wwdc2020/10632/
34. Arm, "Depth (Z) and stencil (S) testing," Arm Developer Documentation. Accessed: Sep. 26, 2026. [Online]. Available: https://developer.arm.com/documentation/102540/latest/Depth--Z--and-stencil--S--testing
35. B. Golus, "Anti-aliased alpha test: the esoteric alpha to coverage," 2021, mirror. Accessed: Sep. 26, 2026. [Online]. Available: https://blog.coolcoding.cn/?p=1535
36. A. Pesce, "Low-resolution effects with depth-aware upsampling," c0de517e, Feb. 2016. Accessed: Sep. 26, 2026. [Online]. Available: https://c0de517e.blogspot.com/2016/02/downsampled-effects-with-depth-aware.html
37. A. Gjoreski, "Growing my grass shader," aleksandargjoreski.dev. Accessed: Sep. 26, 2026. [Online]. Available: https://aleksandargjoreski.dev/blog/growing-my-grass-shader/
38. H. Liang, "Grass rendering in game engine," haoranliang.com. Accessed: Sep. 26, 2026. [Online]. Available: https://haoranliang.com/grass-rendering
39. Codrops, "False Earth: from WebGL limits to a WebGPU-driven world," Apr. 21, 2026. Accessed: Sep. 26, 2026. [Online]. Available: https://tympanus.net/codrops/2026/04/21/false-earth-from-webgl-limits-to-a-webgpu-driven-world/
40. Sucker Punch Productions, "Ghost of Yōtei tech deep dive," PlayStation Blog, Oct. 23, 2025. Accessed: Sep. 26, 2026. [Online]. Available: https://blog.playstation.com/2025/10/23/ghost-of-yotei-tech-deep-dive/
41. Babylon.js Authors, "Compute shaders," Babylon.js Documentation. Accessed: Sep. 26, 2026. [Online]. Available: https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/computeShader
42. E. Popov, "How to keep buffers on the GPU when using compute shaders for instancing or vertex data generation," Babylon.js Forum, Nov. 2023. Accessed: Sep. 26, 2026. [Online]. Available: https://forum.babylonjs.com/t/how-to-keep-buffers-on-the-gpu-when-using-compute-shaders-for-instancing-or-vertex-data-generation/45951
43. E. Popov, "feat(mesh): add storage-backed geometry for compute integration," Babylon-Lite pull request #737, GitHub, Sep. 18, 2026. Accessed: Sep. 26, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon-Lite/pull/737
44. GPU for the Web Community Group, "Implementation status," gpuweb wiki, GitHub. Accessed: Sep. 26, 2026. [Online]. Available: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
45. utsubo, "WebGPU three.js migration guide," utsubo blog. Accessed: Sep. 26, 2026. [Online]. Available: https://www.utsubo.com/blog/webgpu-threejs-migration-guide
46. Chrome for Developers, "WebGPU developer features," Google. Accessed: Sep. 26, 2026. [Online]. Available: https://developer.chrome.com/docs/web-platform/webgpu/developer-features
47. three.js Authors, "Issue #30571," mrdoob/three.js, GitHub, Feb. 2025. Accessed: Sep. 26, 2026. [Online]. Available: https://github.com/mrdoob/three.js/issues/30571
48. Web3D Survey, "EXT_disjoint_timer_query_webgl2," web3dsurvey.com. Accessed: Sep. 26, 2026. [Online]. Available: https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2
