---
description: Three ways to put rock on a height field's steep faces, measured in a browser game: paint and cliff kits, relief in the height field, or a finer displaced skin.
published: 2026-10-12
---
# Rock on steep terrain: shape it, cover it, or skin it

**Question:** A height-field world draws its steep ground as the same smooth surface as its
meadows, with a rock texture painted on. From the foot of a 140 m sea scarp that reads as a
sand dune, whatever the colour. The usual answers are to paint strata into the texture and to
stand cliff models on the face. One browser game, Day Hike, tried both over three days and
threw them away. What went wrong, and what works instead: adding rock relief to the height
function itself, or drawing a finer surface over the steep cells with the relief pushed out of
it? What does each cost on a 60 Hz frame, what does each break, and which should a game with a
simulation that owns its terrain choose?

**Short answer:** paint and kits cover a shape; they do not change it. Strata painted on a
smooth face read as paint, because no shading argument can survive a surface with no form under
it, and a kit of scanned cliff pieces stood on the face leaves the seam between model and ground,
leaves the ground between the pieces a dune, and costs a draw of thousands of instances when a
whole dressed face is in view (about 40 ms at 4K on an integrated GPU in the case measured). The
shape has to be in the geometry. Two ways were built against each other on the same relief
function, a cellular field of tilted planes at three scales. Relief in the height function gives
rock at every distance with collision and lighting that agree, but at the terrain mesh's own
vertex spacing (1 m near the camera, coarser beyond), so joints are soft; it also changes the
ground everywhere steep, which moved a level's identity and broke collider, sliding and placement
invariants the simulation relied on. A finer skin, patches of 16 m cells at 0.5, 1 and 2 m
spacing pushed outward along the face's normal, gives crisp joints and small overhangs, leaves the
simulation untouched, and after being spread over frames costs about 3 ms at a cell crossing and
about 100 ms on the first frame of a hike. The game chose the skin. The look lessons were worth as
much as the geometry: the relief function must fill its range, every column needs its own tilt or
all of them face the light the same way, a face needs forms at 10 to 20 m as well as joints at 3,
joints narrower than the vertex spacing smear, and a sun head-on to a face hides everything.

The questions came from Day Hike, a co-op hiking game in Babylon.js set on a fictional stretch
of the Olympic Peninsula. An earlier doc covers how that rock forms and how AAA games build it
with kits and shaped height fields [1]; this one is about what happened when those answers were
tried on a browser frame, and what replaced them.

## 1. The surface under the paint

A height-field terrain is a function `h(x, z)`. In the game measured it is analytic: every
sample returns the height and its exact partial derivatives, so the normal is the gradient and
collision, placement and the mesh all read one function with no stored grid [1]. The mesh is a
geometry clipmap, seven nested rings of 128 cells whose spacing doubles per ring from 1 m, re-sampled
as the camera moves [2]. The rock is a slope class in a triplanar texture that repeats every
1.8 m, with a normal map and a shallow parallax [1].

Walk to the foot of the coast's scarp and this is what the eye gets: a surface whose gradient
runs from 1.5 to 3.3 (58 to 73 degrees) for 80 m of horizontal distance and 140 m of rise, with
no feature between the metre-scale texture grain and the whole face. Texture grain at 1.8 m on a
featureless 140 m slope is sand. A census of the game's world at 8 m steps found 2.3 % of its
area steeper than the standing limit, and 40 % of the box around that scarp; those are the
pixels that read wrong, and they are the pixels the player looks up at.

## 2. Why paint and kits did not work

The first release painted the rock. It classified the steep ground into talus and bedrock by
slope, drew blocks with a cellular hash and bedding with stepped bands into the texture, and
tuned the palette through five passes of feedback. Each pass fixed what the last was told: the
pattern repeated, so the hash got uneven beds and a window; the ledges ran dead level, so they
got a per-boundary fade; the outlines were dark, so they went. The verdict after the fifth pass
was the same as after the first: "odd shapes painted over it in various forms of darkness".
Shading can only argue for a shape that the normals support, and a smooth surface's normals
support none. A painted ledge is a stripe.

The second release stood scanned cliff pieces on the face, a slab and two blocks of granite in
rows down every steep cell, seated into the ground, tinted toward the ground's colour at their
foot, with a ground-plane seam drawn into their material so the wall's rock ran into the module.
It is the industry's answer, and it worked where the industry uses it: a far face dressed in a
kit reads as a wall at 80 m [1], [3], [4]. Three things it could not do. The seam between a scanned
mesh and a painted surface is a seam however it is tinted, because the texture, the normals and
the silhouette change kind at one line. The ground between the pieces is still the dune, and a
camera at the foot of a face sees more ground than piece. And with every steep cell dressed, a
view of a whole face held thousands of instances of a 5,000-triangle model at three detail
levels: the frame at 4K on an integrated GPU went from 46 ms to 87 ms with the face in view.
Palette changes on top of it did what palette changes do: the dune went grey.

Both attempts share the fault. They add something to a shape that is wrong. The fix is the shape.

## 3. One relief function, two surfaces

Both approaches below use the same function `r(x, z)`, so the comparison is of the surface,
not of the noise. It is pure, seeded, trig-free, and carries exact derivatives, because the
height function's own tests demand them.

**A cellular field with a blend.** A lattice of `cell` metres holds one site per cell, jittered,
with a value `o` in [-1, 1]. Worley's cellular basis takes the nearest site's value and switches
at the border [5]. A first version blended the two nearest sites across a joint of width
`border`; it stepped wherever the second-nearest site changed, up to the full range, about once
every 12 m of line, which the derivative tests could not see because the kinks were skipped. The
field that shipped weights all nine sites by their distance beyond the nearest,
`w_k = 1 - smootherstep((F_k - F1) / border)`, and takes the weighted mean: the nearest site's
value inside a cell, the mean of two on a border, a kink only where three meet, a convex
combination so the range holds, in the spirit of the smooth Voronoi that Quilez describes [6].
The nine-cell search misses a true neighbour at high jitter about once in four million samples; the
field widens to twenty-five sites when the nearest distance plus the border reaches the window's
edge, which is exact while `border < (2 - sqrt(2)) * cell`.

**Tilted planes.** With a flat value per cell, every column's face is parallel to the slope it
stands on, and only the joints shade. Each site became a plane: `o * span + tilt * (a * dx + b * dz) / cell`,
with `a` and `b` hashed per site. On a 70 degree face a cell `c` metres across on the map runs
`c` times the gradient up the face, so the cells stand as prisms two to three times taller than
wide without any anisotropy in the function, which is how columnar basalt reads [7].

**Three scales.** Columns at 5 m cells with 0.5 m joints, or blocks at 6 m with 1.4 m joints
plus a 3 m octave, chosen by a 150 m noise so the two never meet on one face, and under both a
coarse octave of 20 m forms with 3.5 m borders at one and a half times the fine weight. Without
the forms a 140 m face with 3 m joints a metre deep is a faint corrugation from the road.

**Gain.** The sum of a value in plus or minus 0.6, a tilt and a mix divided by two and a half
had a typical magnitude of 0.19. A gain of 2.5 before the clamp raised the mean of `|r|` to
0.46 with 7 % of samples clamped, and the scarp's heights moved by a median of 2.7 m instead of
1.1. Nothing in the geometry was wrong before the gain; the function was simply not using its
range, and every still looked the same.

**Mask.** Relief belongs where the ground is too steep to stand on: a smootherstep of the
gradient magnitude from 1.0 to 1.4, with the standing limit at 1.02.

## 4. Approach A: relief in the height field

One more stage in the terrain chain, after the coast and the cove and before the roads, lakes
and trails carve: `h' = h + m(g) * D * r * sqrt(1 + g^2)`, with `D` a half-depth of 2 m measured
along the face's normal and `g` the gradient magnitude, so a push of `D` along the normal is a
vertical change of `D * sqrt(1 + g^2)`. Where the gradient is under 1.0 the stage returns the
same sample object: bit identity for 97.7 % of the world.

**The derivative.** `h'` depends on `g`, and `g`'s derivative is the base height's second
derivative, which the chain does not carry. The stage takes it by differences of the chain
before it, two extra samples at 0.0001 m, on steep points only, and the height function's
derivative test (worst error over steepest slope under 1 %) held at 1.6e-4 on the scarp.

**What it looked like.** Rock at every distance, collision and lighting in agreement, no pop,
and the forms visible from the road once the gain was in. Up close, soft: the clipmap samples the
field at 1 m within 64 m of the camera and at 2 and 4 m beyond, and draws a lifted envelope
between samples, so a 5 m column with a 0.5 m joint is five vertices wide with the joint smeared
over one. A geometry clipmap cannot show a joint narrower than its spacing [2]; the lever is a
finer ring 0, one more ring for the same reach, and it was not taken.

**What it broke.** The paint classifies the surface by its gradient, so the relieved bits of a
face took the grass and sand colours of a gentler slope: lit flecks on a dark wall. That is one
line to fix. The others were not. The level's identity (a hash of the field and every tunable)
moved; fine, it moves once. But the game's own invariants, written for a ground that is smooth
where it is steep, failed and were left failing: the collider sweep found boxes with their backs
exposed, a sliding player came to rest trapped in a relieved pocket, two depenetration tests lost
their clear approach, the crest walk went 0.8 m deep, the forest's coverage lost a chunk, and the
clutter census moved. Each is fixable. Together they say that putting relief into the function
that everything reads is a change to the world, not to its look.

## 5. Approach B: a finer skin over the faces

The height field stays. Over every 16 m cell with any steep grid point, a patch: a finer grid
of the same ground at 0.5 m within 48 m of the camera, 1 m within 160 m and 2 m within 400 m,
each vertex pushed outward along the face's normal by `m(g) * depth * (r + 1) / 2` with a depth
of 4 m, so the smooth face is the deepest joint and no patch vertex is ever under the ground.
The patch is drawn with the terrain's own material, the same triplanar rock, paint, wet layer and
atmosphere, through a second material made by the same factory with a depth offset so it wins
where it coincides with the ground. Collision stays on the height field; a player at the foot of
a face can stand up to a few metres inside the drawn rock, which no one has noticed yet.

Six things had to be right, and each was found by a reviewer or a still, not by the design.

**Normals from the function, not the grid.** Central differences over the 0.5 m grid smoothed
every joint to a metre. The normal of the displaced surface is analytic: with position
`p = g + n * k` and `k = d / sqrt(1 + g^2)`, the tangents are `g_x + n * k_x` and `g_z + n * k_z`,
with `k_x` from the relief's own derivative, dropping the slowly varying terms. A column's flat
face then shades flat and its joint shades steep whatever the spacing. This is the single
largest difference in crispness between the two approaches, and it costs nothing.

**A bend cap.** An offset surface folds where the offset exceeds the radius of a bend [8]. At
depth 2 m nothing folded at the reference view and the pinned "no fold" held; on two other
worlds it did not, at concave creases and, as it turned out, on a sharp convex ridge where the
mask is zero on the crest and one a step down each flank, so a full push cuts a notch. The cap
is the larger absolute principal curvature from one-sided differences at a fixed 0.5 m world
step, forward and back, and `depth / (1 + depth * k / 0.5)`: the push stays under half the bend's
radius. Zero folds on seven worlds since, at a cost of about 20 % of the depth on average.

**Edges and seams.** Two patched neighbours share their boundary points bit for bit because
both evaluate the same function at the same doubles. A fine patch next to a coarse one sets its
edge midpoints to the mean of the coarse endpoints, positions, normals and paint alike. A patch
whose neighbour is outside the reach would end with its relief in the air, a 7 px ledge at 160 m
that pops at every crossing; it tapers to the ground over 3 m toward any open side or corner.

**The ground under it.** The clipmap's coarser rings draw a lifted envelope that stands above
the joints where the push is near zero, so between 64 and 160 m the ground filled the joints.
The clipmap now leaves out every triangle whose three vertices are fully steep and whose 16 m
square is within the patches' reach, border rows and hole rows excepted: 18,000 of 98,000
triangles at the reference view, under 217 squares. The predicate reads the cell the patches
last drew, not the camera's cell, and the rings rebuild on the frame after the patches draw a new
set, so no frame shows sky through a square still being built.

**Everything else that draws the ground.** A lake mirror and a far panorama draw the clipmap
with its holes; the patches register with both, or steep faces reflect as sky. The rain's cover
map registers them, or streaks fall inside the rock.

**Built over frames.** Synchronous, the patches cost about 580 ms at the first update on the
scarp (1,961 cells walked, 362 built, 74,650 vertices) and about 120 ms at each 16 m crossing.
The renderer already spreads its rebuilds over frames with a 4 ms share per frame, and forces
any job older than six frames to finish, which would only have moved the stall to frame six. A
"patient" job kind queues behind every other job and is never forced. The patches are one
patient job per crossing, nearest cells first, each mesh uploaded hidden and all of them shown in
the last slice, with the next crossing's cells built ahead on idle frames along the heading. The
first frame builds only the 0.5 m band, about 100 ms, and the rest fills at 3 ms a frame over
about 2.7 s. A crossing at a walk finds its cells built and costs about 3 ms; one with nothing
built ahead takes about 35 frames at 3 ms each. The simulation did not change, and its level
identity moved only when the cliff kits were switched off.

## 6. What the stills taught

The two approaches were photographed at the same poses after every change, beside each other
and beside the unchanged game. Most of what changed the look was not geometry.

- **A function that does not fill its range looks like no function at all.** Four changes in a
  row read the same from the road until the gain. Measure the field's values before measuring
  anything else.
- **Parallel facets do not shade.** Columns with flat tops, all parallel to the slope, differ
  only at their joints. Tilt each one.
- **Joints narrower than the vertex spacing smear**, and smoothed normals smear them further.
  Analytic normals at the vertex recover the crispness that the grid cannot carry.
- **A face needs forms at the scale of the face.** Joints at 3 m on a 140 m wall are texture.
  Buttresses and gullies at 10 to 20 m are what the eye takes for structure from 80 m.
- **Light head-on hides everything.** A west-facing scarp at 16:00 is lit flat; vertical joints
  throw no shadow, whatever the geometry. Judge rock at noon and at a grazing hour, and judge the
  colour at noon [1].
- **Scale the texture with the relief.** With the rock texture repeating every 1.8 m the faces
  read as gravel at any distance; at 5.4 m each stone reads three times larger and the surface
  reads as broken rock. The texture's 512 pixels then cover 5.4 m, about 95 texels a metre, which
  magnifies at a face's foot.
- **Black shadows are noise.** With clear-sky shadows at full darkness every joint was a black
  line. Babylon's shadow generator sets darkness per light, not per receiver [9], so the lift is
  global: shadows in clear weather keep 17 % of the sun, and a shadowed face about 45 % of its
  lit value instead of 35.
- **A dark grey is a vertex colour, not a texture.** The terrain blend divides each layer's
  texture by its own mean, so the vertex colour is the average screen colour; the faces went from
  (0.17, 0.16, 0.15) to a neutral (0.081, 0.081, 0.081), half the luminance, with the scree at 0.115.
- **The kits looked worse beside the relief than on the dune.** Both approaches read better with
  the scanned pieces gone, and they went.

## 7. Costs at a glance

Measured on one machine (an Apple M4, WebGPU, 1080p for the look and 4K for the frame pairs,
Node for the builds) at the same view, the road under the scarp with the whole face in view.

| | Paint and kits | Relief in the height field | A finer skin |
| --- | --- | --- | --- |
| Where the shape lives | Nowhere; the surface is smooth | The height function | Patch meshes over steep cells |
| Collision and placement | Unchanged | Follow the relief; invariants broke | Unchanged; a player can stand inside drawn rock |
| Level identity | Unchanged | Moves | Unchanged by the relief |
| Joint crispness near the camera | None | Soft (1 m vertices, lifted envelope) | Crisp (0.5 m grid, analytic normals) |
| Overhangs | None | None | Small, capped by the bend |
| Reach | The whole world | The whole world | 400 m, three bands |
| Frame cost at 4K with the face in view | +41 ms (kits) | not measured | not yet measured |
| First frame of a hike at the scarp | 0 | 0 | about 100 ms, then 3 ms a frame for 2.7 s |
| A 16 m crossing | 0 | 0 | about 3 ms at a walk |
| Extra samples per terrain sample | 0 | 2 on steep points | 0 |
| Things that had to learn about the patches | | | the mirror, the panorama, the rain map, the shadow casters |

## 8. Choosing

A game whose simulation owns its terrain and whose peers must agree on it has one strong reason
to put the relief in the function: everything agrees, forever, with no second system. It paid
for that in this case with a level that no longer satisfied its own rules, and would have paid
again for every tool and test that assumed smooth steep ground. The skin leaves the world alone
and changes what is drawn, which is what the look was asking for, at the price of a second
system that every other drawer of the ground has to know about. The deciding factor was the
close view: a hiking game is played at the foot of its walls, and only the skin can show a joint
narrower than a metre there. Where the camera stays far, or the terrain's vertex spacing is
already fine, the first approach is the simpler one.

Either way, the work that made the difference was the relief function and the lessons of section 6,
and those are the same for both.

## 9. Sources

1. C. Sarkosh, "Rock formations of the Olympic Peninsula, and how games build them," csarko.sh, Oct. 9, 2026. Accessed: Oct. 12, 2026. [Online]. Available: https://csarko.sh/research/rock-formations-of-the-olympic-peninsula
2. F. Losasso and H. Hoppe, "Geometry clipmaps: terrain rendering using nested regular grids," *ACM Trans. Graph.*, vol. 23, no. 3, pp. 769-776, Aug. 2004. Accessed: Oct. 12, 2026. [Online]. Available: https://hhoppe.com/proj/geomclipmap/
3. T. Smith, "Ghost of Tsushima: World and Waterfall Shots," ArtStation. Accessed: Oct. 12, 2026. [Online]. Available: https://tsmith3d.artstation.com/projects/48NPak
4. J. van Muijden, "GPU-Based Procedural Placement in Horizon Zero Dawn," GDC 2017, Guerrilla Games. Accessed: Oct. 12, 2026. [Online]. Available: https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn
5. S. Worley, "A cellular texture basis function," in Proc. SIGGRAPH '96, New Orleans, LA, USA, Aug. 1996, pp. 291-294. Accessed: Oct. 12, 2026. [Online]. Available: https://dl.acm.org/doi/10.1145/237170.237267
6. I. Quilez, "Smooth Voronoi." Accessed: Oct. 12, 2026. [Online]. Available: https://iquilezles.org/articles/smoothvoronoi/
7. Wikipedia contributors, "Columnar jointing," Wikipedia. Accessed: Oct. 12, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Columnar_jointing
8. Wikipedia contributors, "Parallel curve," Wikipedia. Accessed: Oct. 12, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Parallel_curve
9. Babylon.js, "Shadows," Babylon.js documentation. Accessed: Oct. 12, 2026. [Online]. Available: https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows
