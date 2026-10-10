---
description: How the Olympic Peninsula's crags, talus, cirques and sea stacks formed and what they look like, and how AAA games build rock formations that convince.
published: 2026-10-09
---
# Rock formations of the Olympic Peninsula, and how games build them

**Question:** Day Hike, a co-op hiking game in Babylon.js, is set on a fictional stretch of the
Olympic Peninsula's coast and foothills. Its steep ground reads flat: a pale cobbled hillside, a
rock band that should look jagged and three-dimensional, and cliff models that stand in rows
rather than making a wall. How do rock formations actually occur in the Pacific Northwest, what do
they look like at the 10 to 100 m a walker sees them from, and how do AAA games build convincing
ones?

**Short answer:** the Olympics are sea floor stood on end. Sandstone, shale and slate scraped off
the Juan de Fuca plate were folded until their beds stand steep or vertical, and a horseshoe of
pillow basalt, estimated at up to 7.6 km thick on the northern Peninsula, wraps them [1],
[2], [3]. Ice cut cirques into them, bowls whose walls run to about 200 m in
comparative data; frost breaks the walls into talus that rests at roughly 28 to 36 degrees; and
rivers and waves cut bluffs of 15 to 90 m and leave stacks of the harder rock standing in the surf
[4], [5], [6], [1]. What a walker reads is structure at three scales:
blocks of 0.1 to 2 m, ledges and beds of a few metres, and walls of tens to hundreds of metres.
Games get there the same way almost everywhere: the terrain carries the large shape, and meshes
carry the rock. Cliffs and rock assemblies are authored as kits, placed by hand or by rules read
from the terrain, and blended into the ground at the seam [7], [8], [9], [10],
[11]. A height field alone cannot make an overhang or a sharp facet at the spacing a game can
afford [12], [13]. Browser engines have instancing, triplanar materials and compute,
but no tessellation stage and no production virtual geometry, so a browser game has the cliff kit
and the shaped height field to work with, not the tessellated ground of the last console
generation [14], [15], [16].

The game is public at [game-dayhike](https://github.com/csarkosh/game-dayhike); this note pairs
with [the lakes note](https://csarko.sh/research/olympic-lakes-for-game-worlds) [17], whose
cirques are the same ones.

**Part one: how rock formations occur in the Pacific Northwest**

## 1. A sea floor stood on end

The Olympic Mountains are basalt and sedimentary rock laid down offshore between about 57 and 18
million years ago, then uplifted, bent, folded and eroded as the Juan de Fuca plate was forced under
North America [1]. The sedimentary core began as turbidites: undersea landslides of mud, sand
and gravel that hardened into shale, sandstone and conglomerate, and under more pressure into
slate. The subducting plate scraped them off and wedged them beneath older rock, so that, in the
Park Service's words, rocks laid down on the ocean floor "now stand vertically" [2].
The mapped structure is a core of folded, faulted and overturned beds, wrapped by the basalt
horseshoe [18]. The core units run from intact interbedded sandstone and slate to
"broken formation", sandstone pulled apart into lenses in a matrix of slate or phyllite
[18].

The horseshoe is the Crescent Formation: mostly oceanic basalt of the early and middle Eocene,
erupted on the sea floor as pillows and flows, and the oldest rock in the range with a few
exceptions [2], [18]. It is pillow basalt, flow breccia, amygdaloidal basalt
and tuff; it thins westward from an estimated 7.6 km (25,000 ft) in the southeast to 2.0 km
(6,500 ft) near Bear Creek [3]. It forms the ridges and peaks along the north, east and
south margins of the Olympics, Hurricane Ridge among them [2].

The range still rises. Uplift and erosion are in balance at about 1 mm a year
[2]; thermochronology fits an erosion rate of 0.9 to 1.0 mm a year, and a wedge in
steady state since about 14 million years ago [19]. So Mount Olympus, 2,432 m (7,980 ft), is
not getting taller [2]. For a game the consequence is that rock everywhere is being
broken down as fast as it rises: fresh faces, steep gullies, and debris below them.

## 2. Ice: cirques, headwalls, moraines and erratics

Two ice systems worked the range. The Cordilleran ice sheet advanced about 16,900 years ago and
stood until about 14,000 years ago, about 1,100 m thick [1]. It split against the Olympics,
scoured their north and east edges, and dropped granite carried from British Columbia on their
slopes: boulders of rock types from the North Cascades and the Coast Ranges lie up to about 1,070 m
(3,500 ft) around the north and northeast end of the range, though "there is no bedrock of granite
anywhere in the Olympics" [20], [2]. The Park's handbook records granite
erratics 40 km (25 miles) up the Elwha and at about 900 m (3,000 ft) on Klahhane Ridge
[21].

The second system was the range's own glaciers. They flowed from high cirques down the valleys, as
much as 40 to 64 km (25 to 40 miles) down the Hoh, Queets and Quinault, and a terminal moraine still
dams Lake Quinault [21]. A cirque is a bowl with walls on three sides and an open lip.
In a comparative dataset of 1,593 cirques the medians are 625 m long, 656 m wide, with walls 210 m
high and a steepest headwall gradient of 57 degrees [4]. Most Olympic mountain lakes lie in
such bowls between about 900 and 2,000 m [17].

## 3. Frost, gravity, rivers and waves

**Frost and talus.** Water freezing in joints expands by about 9 %, enough to open cracks or wedge
blocks loose, though how much force ice in open joints can apply is debated [22]. What falls
gathers at the foot of the wall as talus (scree). Its slope is the angle of repose of its debris:
the average slope of talus cones at four sites in the Alps and on La Réunion was 28 to 36 degrees
[5], and natural repose on talus in Lanzarote and the South Shetlands 28.0 to 33.4 degrees
[23]. The textbook account is that a talus slope is sorted, larger blocks running out to its
foot [22]. A measured study of runout found no clear relation between block size and how far a
block travels, and could neither confirm nor reject that sorting [5]. A game should not lean
hard on it. By definition scree is "a collection of broken rock fragments at the base of a cliff or
other steep rocky mass that has accumulated through periodic rockfall" [22]: a deposit with a
source above it, not a surface that any slope of the right angle carries.

**Rivers.** The larger western rivers have cut through 30 to 90 m (100 to 300 ft) of Pleistocene
deposits into older bedrock, and the Hoh and Queets valleys carry at least two prominent terraces
[6]. Cliffs of 15 to 90 m (50 to 300 ft) are common "along the coast and at many places along
the principal streams" [6].

**Waves.** The coast is cut in the Hoh rock assemblage, a mélange: hard volcanic rock and sandstone
held in softer mudstone. Waves remove the mudstone and leave the hard rock as sea stacks, as at
Ruby Beach and Third Beach [1]. At Ruby Beach, massive, badly fractured sandstone forms the
lower 15 m (50 ft) of the cliffs and the stacks on and off shore, its fractures filled largely with
calcite; from Abbey Island north to the Hoh the cliffs in many places rise over 46 m (150 ft)
[24]. Stacks fail as well as form: a 15 m (50 ft) stack at Rialto Beach collapsed
entirely in a winter of storms around 2015 to 2016 [25]. James Island at La Push, a former stack, is
49 m (160 ft) high [26].

**Part two: what they typically look like**

## 4. Forms and scales

| Form | Where on the Peninsula | What it is made of | Scale |
|---|---|---|---|
| Pillows | Crescent ridges (Hurricane Ridge, the eastern peaks) | Basalt, each pillow a humped lobe draped over the one below [20] | Pillows typically 0.5 to 1 m across, from tens of centimetres to several metres [27] |
| Bedded crags and slabs | The core peaks | Sandstone and slate, beds steep to vertical, sheared and lensed [18], [2] | Thin-bedded to very thick-bedded; the structural study gives no general bed thickness [18] |
| Cirque headwall | High basins (Royal Basin, Seven Lakes Basin, Lake Angeles) | Either rock, glacially steepened | Walls about 210 m, headwall up to about 57 degrees (comparative medians) [4] |
| Talus apron and cone | Below every wall and gully | Angular blocks from the wall above | Slope 28 to 36 degrees [5], [23] |
| Erratic boulder | North and northeast slopes to about 1,070 m | White granite, foreign to the range [20] | Large single boulders [20] |
| River bluff and terrace | Hoh, Queets, Elwha | Glacial gravel and sand over bedrock | Bluffs 15 to 90 m; deposits 30 to 90 m thick [6] |
| Sea cliff | Outer coast | Fractured sandstone and volcanic breccia [24] | Over 46 m north of Ruby Beach [24]; up to about 90 m in places [6] |
| Sea stack and arch | Ruby, Rialto, Second and Third beaches; Point of the Arches | The hard blocks of the mélange [1] | 15 m at Rialto [25]; 49 m at James Island [26] |

At a walker's distances the three scales that matter are these. **Blocks of 0.1 to 2 m** make talus
and the surface of a crag; a pillow is one. **Ledges and beds of 1 to 20 m** set the profile of a
wall. **Walls of 20 to 200 m** set the skyline: a cirque headwall, a stack, a bluff. A slope that
shows only one of these reads as a texture. A slope that shows two reads as rock.

## 5. Colour, cover and texture

**Rock colour.** The core sandstone is light grey with visible grains, the shale dark grey to black,
and the slate splits along smooth fractures [20]. In the photographs below, the crags of
the northern and eastern peaks are dark grey to brown and the pillow basalt grey under pale lichen.
The coastal sandstone's fractures are filled largely with calcite [24]. A walker on the
north side sees white granite boulders that match nothing around them [20].

**Lichen and moss.** Crustose lichens grow so tightly on rock that they cannot be removed without
damaging it. In the neighbouring Cascades they include the map lichens (*Rhizocarpon*), common in
the alpine zone, and the bright orange sunburst lichen [28]. In the photographs the rock is
patched, not uniform: grey-green crusts on the open faces, moss and grass on every ledge that holds
soil, and on the coast trees on the stack tops.

**What the photographs show.** All are on Wikimedia Commons under the licences given in the
sources.

- *Sea stack at Ruby Beach* [29]. A single stack perhaps 15 to 20 m high, judged by the
  surf (an estimate), dark brown-grey, its outline stepped in blocks, and a near-vertical seaward
  face. Vegetation is confined to a few tufts on the top.
- *Point of the Arches* [30]. A large pyramidal stack capped by conifers and grass, its
  lower half bare grey rock streaked with lichen. Beside it stand slender pinnacles 2 to 4 times
  as tall as they are wide, also an estimate from the image. The beach between is studded with
  dark, weed-covered reef rocks a metre or two across.
- *Second Beach* [31]. A flat-topped, sheer-sided stack with a forest on its top. The
  black-green lower walls are cut by vertical joints. Lower, squared-off stacks stand farther out.
- *Rialto Beach, Hole-in-the-Wall* [32]. The inside of an arch, wet and nearly black, framing a
  tall stack. The stack's faces are planar facets meeting at sharp edges, with trees on the
  summit.
- *Rocks off Beach 4, Kalaloch* [33]. Seen from a forested bluff top, low dark rocks
  scattered in the surf, a few metres across, with Destruction Island on the horizon.
- *Pillow basalt*, eastern Olympics, at 47.86 N, 123.05 W by the file's coordinates
  [34]. A crag of rounded, bulbous grey lumps about the size of pillows, each outlined by
  dark cracks. Pale lichen crusts cover the tops, and grass and wildflowers fill every gap.
- *Steeple Rock on Hurricane Ridge* [35]. A lone fin of pale grey-tan rock jutting from a
  forested slope. Its faces are split into slabs, and small pale scree runs from its foot into
  the meadow.
- *Mount Angeles from Eagle Point* [36]. From several kilometres the rock is only at the
  summit: a dark, reddish-grey crag with gullies, the forest climbing to its foot. Pale scree
  chutes run down the meadows on its right.
- *Sundial from Royal Basin* [37]. A dark crag of many small towers, its ledges and
  gullies picked out by snow. The ledges are short and broken and step up the face at
  irregular intervals. They do not run continuously across it.
- *Royal Basin from Royal Lake* [38]. The most useful single image for a game. Dark crags
  above, then smooth grey talus cones and aprons fanning from every gully, uniform in slope and
  paler than the crags. A lobe of large dark blocks runs to the lake shore. A lone boulder a few
  metres across sits on the meadow in front, and grass reaches the foot of the talus.
- *Seven Lakes Basin* [39]. A basin floor of pale, smoothed bedrock slabs and boulder
  litter holding small tarns. The rock is lighter and smoother than any wall above it.
- *Talus near Mount Angeles* [40]. A close view of a talus surface: angular fragments of
  2 to 15 cm (judged by the flowers on it, an estimate), grey, red-brown and buff, packed with no
  soil showing.

Three things recur across them. Walls are darker than the talus beneath them: on crops of the
Royal Basin image the talus cones' median linear luminance is 2.2 to 4.5 times the crags', and
the crags' coefficient of variation 1.1 to 1.6 against the talus's 0.6 to 0.9 [38]. That
is one photograph under one sun, so it is a direction, not a constant. Every ledge that can
hold soil is green. And the outline of rock, at any distance, is made of straight segments meeting
at angles, never a smooth curve.

## 6. What this means for a game seen on foot

Three consequences for a walker's view follow from the sections above.

- **The rock class of a slope is set by its angle.** Loose debris rests at up to about 28 to 36
  degrees, the talus slope's angle of repose [5], [23], [22]; ground standing
  steeper than that is bedrock. A game that paints its steepest band as loose scree and the
  gentler band as solid rock has the order backwards.
- **Talus needs a wall above it, and covers the ground.** It accumulates from rockfall at the
  base of a cliff [22]; in the photographs it is a packed surface of fragments, not a
  scatter [38], [40].
- **The silhouette is made of facets and steps.** Bedding, shearing and jointing break walls into
  ledges and blocks [18]: short, broken ledges on the Sundial face, planar facets on the
  Rialto stack [37], [32].

**Part three: how AAA games create realistic rock formations**

## 7. Two families, used together

Every documented open-world pipeline splits the job. The terrain, a height field, carries the
large landform; meshes carry the rock that a height field cannot.

Horizon Zero Dawn's world data shows the split in its formats. A terrain height at 0.5 m sits beside
a separate object height layer at 0.5 m. There are 1 m maps of rock colour variance and of lichen
density, and 0.5 m maps of erosion wear, flow, deposition and terrain cavity. Together that is about
4 MB per square kilometre, all generated and all paintable, read by a GPU placement system that
"assembles fully-fledged environments while the player walks through them" [10]. For Horizon
Forbidden West, Guerrilla first hand-annotated "lots of the rocks, the cliffs, the mountain sides"
for climbing. It then switched to a system that detects a handhold in the geometry itself
[41], which only works if the cliffs are meshes. On Ghost of Tsushima the world team
sculpted the terrain by hand and authored custom cliffs and rock arrangements, for which one artist
sculpted more than 100 rocks, weighing "shader versatility" and "low visual noise" [7]. The
GPU placement language and runtime systems behind that world are in Sucker Punch's GDC talk
[42].

## 8. Cliff kits and rule-based placement

**Generated from the terrain.** Far Cry 5 built Houdini tools that, among biomes and rivers,
"generate cliff rocks" over 100 square kilometres whose terrain changed daily [8]. Ghost Recon
Wildlands scattered rocks with Houdini by rules read from the terrain: material, curvature,
alignment to slope, cliff and road detection. Its rock materials used detail maps with masks "for
better sharp blending" and per-ecosystem dirt, snow and moss layers [43].

**Assembled by hand, reused by rule.** Unreal's Electric Dreams sample builds its large cliff from
"Assemblies", arrangements of rock meshes saved as data and dropped into the world. One assembly
can be laid along a procedurally generated path, and a flat-area detector places "hero rock
assemblies" without floating them [9], [44]. A cliff is designed once as a group of rock
pieces and then placed as a unit.

**Captured from the real thing.** Kojima Productions scouted Iceland and converted its photographs
to 3D data for "rocks, cliffs, lava, or terrain" in Death Stranding [45].

**Kept small.** On Days Gone, a senior environment artist recommended "weighted normals and tiling
materials with vert blends for as much content as you can". The aim was a small, flexible library
varied by material and colour swaps and by placement rather than by unique meshes [46].

What these share: the rock a player looks at is a mesh, placed by hand or by rules read from the
terrain, in pieces designed to be combined, and its shading is made to agree with the ground's
(§10).

## 9. Terraces and strata in the height field

Terracing is a standard height-field operation. Houdini's terrace node steps the terrain to a
maximum step height and fades between terrace and source, and its documentation says plainly that
out of the box "terraces often look artificial, because they have hard edges", and that they
need masks, smoothing and erosion to look natural [47]. Gaea's Stratify makes "broken
strata": layers created in confined local zones, such as between two broken plates, each
independent of the rest, with a second level of substrata between them [48]. Research
systems go further: implicit blocks generated from fracture patterns build cliffs, crags and
promontories whose blocks follow strata and terrain [49], and layered material stacks with
implicit surfaces produce overhangs, arches and rock piles [50].

A height field's limit is its sample spacing. A feature shorter than about two samples cannot be
represented and aliases or blurs when it is drawn [13]. Ghost Recon Wildlands kept its
height map at 50 cm because "too much precision is just overkill", and put hardware tessellation on
top for the foreground [51]. At the 0.5 to 1 m spacing games use, ledges of several metres
can live in a height field; blocks of a metre, and anything overhanging, cannot.

## 10. Blending meshes into the terrain

A rock mesh that meets the ground on a hard line reads as placed. The documented fixes are these.

- **Pixel depth offset.** The material pushes its own depth, so the seam is dithered between rock and
  ground rather than cut [52].
- **Runtime virtual texturing.** The terrain's shading is cached in a virtual texture that other meshes
  sample, so a rock's base can wear exactly the ground it sits in. The cache suits static objects
  only and is not updated every frame [11].
- **Height-lerp blending.** Two layers blend by their height maps, not their weights alone, so "tops of
  cobble-stones remain pure whereas sand lies in cracks between them" [53].
- **Shared world-space materials.** Both rock and ground take the same texture by world position
  (triplanar), so the pattern runs across the seam [54], [12].
- **Deforming the terrain around the mesh.** Unreal's Landscape Patch lets a mesh carry a patch that
  edits the heightmap and weightmaps around it, in the editor only [55]. Horizon's object height
  layer lets placement read where objects already stand [10].

## 11. Surface detail: triplanar, variation, parallax and facets

**Triplanar projection** textures steep surfaces without UV stretch by projecting along three axes
and blending; a blend range of about 10 to 20 degrees works well [12]. It is also often done
wrong for normal maps, which need their own reorientation per projection [54].

**Macro variation.** Tiled rock repeats. Horizon paints rock colour variance and lichen density as
world maps at 1 m [10], and Wildlands layers detail maps, masks, dirt, snow and moss per ecosystem
[43]. Days Gone varies a small kit by vertex blends and colour swaps [46].

**Parallax.** Red Dead Redemption 2 ships parallax occlusion mapping as a setting, with ultra 4 %
slower than the rest. Its tessellation setting governs trees, mud and other deformable surfaces,
and turning tree tessellation off gains up to about 10 % [56]. Parallax is a near-field
treatment of small relief. It cannot change a silhouette.

**Flat-shaded facets.** Rock reads as hard when its faces catch light differently from their
neighbours. Day Hike's own rock props were cut at load by planar fractures with flat-shaded faces,
after a probe found their normal maps contributed nothing visible on a smooth shape
[57].

## 12. Beyond the height field: voxels and virtual geometry

**Voxels and signed distance fields.** A density function meshed by marching cubes gives caves,
overhangs and arches that "the simple height fields that the CPU can process do not offer"
[12]. Its costs are generation and level of detail. The GPU Gems 3 implementation built
blocks of 32³ voxels at 6.6 to 260 per second on a GeForce 8800, depending on method [12], and
stitching neighbouring resolutions needs a dedicated method such as Transvoxel [58]. A
2026 browser series building voxel terrain on WebGPU reached the Transvoxel seam stage as test
rigs, with no frame figures [59].

**Virtualized geometry.** Nanite splits meshes into a hierarchy of triangle clusters and swaps them
by screen error, so it suits meshes with many or very small triangles and many instances, rock and
cliff kits in particular [60]. Its designers' aim is to draw about the same number of
clusters every frame whatever the scene holds, and to handle "a million instances easily"
[61]. Nanite tessellation adds runtime displacement by map or material [60]. A
WebGPU reimplementation in TypeScript runs in Chrome with meshlet levels of detail, culling and a
software rasterizer, on demo scenes of 640 million and 1.7 billion triangles [16].

## 13. What browser engines can do

- **Stages.** WebGPU's shading language has vertex, fragment and compute stages, and no
  tessellation or geometry stage [14]. WebGL 2 follows OpenGL ES 3.0 [62], and
  tessellation and geometry shaders "don't arrive until ES 3.2" [63]. Displacement must come
  from geometry that already exists or from compute.
- **Instancing.** Babylon's thin instances draw large numbers of one mesh from a matrix buffer with
  no per-instance JavaScript objects, but all or none of them are drawn, a single bounding box
  covers them all, and instances whose matrices have mixed positive and negative determinants do
  not render correctly in one mesh [15]. Mirrored rock variants therefore need a mesh of their
  own. Three.js's BatchedMesh draws different geometries with one material in one multi-draw call,
  with per-object frustum culling [64].
- **Materials.** Babylon ships a triplanar material that needs no UVs, with per-axis diffuse and normal
  maps [65]; custom terrain shaders can do the same in plugins.
- **What is missing.** No engine-level runtime virtual texturing, no Nanite-class geometry outside
  demos, no tessellation. The tools left are the ones the 2010s consoles used: a well-shaped
  height field, instanced kits with levels of detail, triplanar and height-blended materials, and
  careful seams.

## 14. What Day Hike tried, read against the above

Day Hike's simulation owns its height field, and every peer must agree on it. Its cliff bands
are a terrace remap on a 26 m period whose risers take 80 % of each band's rise, with walkable
benches between [66]. Its rock ground is a slope class in a tiled triplanar texture
[67]. Three attempts so far, and what the research says of each:

- **Deeper parallax on steep rock** lifted the cobbles at 10 m, stepped at grazing
  angles and left the crest smooth [68]. Confirmed: parallax is near-field relief
  and cannot change a silhouette (§11).
- **Displacing the drawn terrain** with folds of 1 to 2 m on a 0.5 to 1 m vertex lattice broke the crest
  head-on, but a wind-streaked dune from the side and dimples from above, and the same flat sheet from 80 m
  [68]. Confirmed: under two samples per wavelength the fold aliases (§9). The same
  section qualifies the diagnosis that a scarp needs 4 to 20 m ledges. Such ledges are within a height field's
  reach, and in a game whose simulation owns the height field they belong there, where collision
  agrees with sight.
- **Cliff modules**: two granite cliff models, first one per 12 m cell, then laid in runs along the
  contour with overlap and made solid [68]. They read as bands of wall from 80 m and
  along the face, but as a jumble of boulders along the crest at 30 m, at +1.68 ms at four times
  native pixels [69]. Confirmed as the industry's answer (§7, §8). The research
  adds three things the runs lack: rock of the Peninsula's own kind, bedded and steep (§1, §5); a
  shared material at the seam (§10); and talus at the foot (§3).

## 15. Costs at a glance

| Technique | Documented cost or limit | Needs from the terrain |
|---|---|---|
| GPU rule placement (Horizon) | World data about 4 MB per km² [10] | Painted and generated maps; object height layer |
| Height map plus tessellation (Wildlands) | 50 cm height map; tessellation in foreground [51] | A tessellation stage (none in browsers) |
| Parallax occlusion (Red Dead Redemption 2) | Ultra 4 % slower [56] | Nothing; near field only |
| Tessellation of trees (Red Dead Redemption 2) | Off gains up to about 10 % [56] | A tessellation stage |
| Virtual geometry (Nanite) | About constant clusters per frame [61] | Meshes; engine support |
| Voxel terrain (GPU Gems 3) | 6.6 to 260 blocks of 32³ per second on a 2007 GPU [12] | Replaces the height field |
| Runtime virtual texture blend | Static objects; cache not updated every frame [11] | A virtual texture system |
| Cliff runs (Day Hike) | +0.69 ms on 167 modules, +1.68 ms on 302, at 4× pixels [69] | Steep rock ground; colliders for solidity |

## 16. What no source measured

No studio publishes a frame cost for its cliff kits, or a rule for how dense talus must be before it
reads as talus. The sources on block sorting disagree. The photographs give shapes and colours, not
dimensions; the sizes taken from them above are marked as estimates. And no browser project has
shown voxel or virtual-geometry terrain at open-world scale with frame times. Every cost in a
browser proposal built on this note has to come from the game's own paired measurements.

## 17. Sources

1. U.S. National Park Service, "Geology of Olympic," Olympic National Park. Accessed: Oct. 9, 2026. [Online]. Available: https://www.nps.gov/olym/learn/nature/geology.htm
2. U.S. National Park Service, "Geology of the Olympic Peninsula: Three Stones, One Story," Olympic National Park, May 2004. Accessed: Oct. 9, 2026. [Online]. Available: https://www.nps.gov/olym/planyourvisit/upload/geology.pdf
3. W. W. Rau, "Foraminifera from the northern Olympic Peninsula, Washington," U.S. Geological Survey Professional Paper 374-G, 1964. Accessed: Oct. 9, 2026. [Online]. Available: https://www.npshistory.com/publications/geology/pp/374-G/sec1.htm
4. I. S. Evans and N. J. Cox, "Size and shape of glacial cirques: comparative data in specific geomorphometry," in Proc. Geomorphometry 2015, Poznań, Poland, Jun. 2015. Accessed: Oct. 9, 2026. [Online]. Available: https://geomorphometry.org/uploads/pdf/pdf2015/EvansCox2015geomorphometry.pdf
5. K. Wegner, F. Haas, T. Heckmann, A. Mangeney, V. Durand, N. Villeneuve, P. Kowalski, A. Peltier, and M. Becht, "Assessing the effect of lithological setting, block characteristics and slope topography on the runout length of rockfalls in the Alps and on the island of La Réunion," Nat. Hazards Earth Syst. Sci., vol. 21, pp. 1159-1177, 2021. Accessed: Oct. 9, 2026. [Online]. Available: https://nhess.copernicus.org/articles/21/1159/2021/
6. C. T. Lupton, "Oil and gas in the western part of the Olympic Peninsula, Washington," U.S. Geological Survey Bulletin 581-B, 1915. Accessed: Oct. 9, 2026. [Online]. Available: https://npshistory.com/publications/geology/bul/581-B/sec4.htm
7. T. Smith, "Ghost of Tsushima: World and Waterfall Shots," ArtStation. Accessed: Oct. 9, 2026. [Online]. Available: https://tsmith3d.artstation.com/projects/48NPak
8. E. Carrier, "Procedural World Generation of Far Cry 5," GDC 2018. Accessed: Oct. 9, 2026. [Online]. Available: https://gdcvault.com/play/1025215/Procedural-World-Generation-of-Far
9. Epic Games, "Electric Dreams Environment in Unreal Engine," Unreal Engine documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/electric-dreams-environment-in-unreal-engine
10. J. van Muijden, "GPU-Based Procedural Placement in Horizon Zero Dawn," GDC 2017, Guerrilla Games. Accessed: Oct. 9, 2026. [Online]. Available: https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn
11. Epic Games, "Runtime Virtual Texturing," Unreal Engine documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/runtime-virtual-texturing-in-unreal-engine
12. R. Geiss, "Generating Complex Procedural Terrains Using the GPU," in GPU Gems 3, ch. 1, NVIDIA, 2007. Accessed: Oct. 9, 2026. [Online]. Available: https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu
13. I. Quilez, "Bandlimiting." Accessed: Oct. 9, 2026. [Online]. Available: https://iquilezles.org/articles/bandlimiting/
14. W3C, "WebGPU Shading Language," W3C Candidate Recommendation. Accessed: Oct. 9, 2026. [Online]. Available: https://www.w3.org/TR/wgsl/
15. Babylon.js, "Thin Instances," Babylon.js documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances
16. Scthe, "nanite-webgpu," GitHub. Accessed: Oct. 9, 2026. [Online]. Available: https://github.com/Scthe/nanite-webgpu
17. C. Sarkosh, "Olympic Peninsula lakes for game worlds," csarko.sh, Oct. 8, 2026. Accessed: Oct. 9, 2026. [Online]. Available: https://csarko.sh/research/olympic-lakes-for-game-worlds
18. R. W. Tabor and W. M. Cady, "The Structure of the Olympic Mountains, Washington: Analysis of a Subduction Zone," U.S. Geological Survey Professional Paper 1033, 1978. Accessed: Oct. 9, 2026. [Online]. Available: https://npshistory.com/publications/geology/pp/1033/contents.htm
19. G. E. Batt, M. T. Brandon, K. A. Farley, and M. Roden-Tice, "Tectonic synthesis of the Olympic Mountains segment of the Cascadia wedge, using two-dimensional thermal and kinematic modeling of thermochronological ages," J. Geophys. Res., vol. 106, no. B11, pp. 26731-26746, 2001. Accessed: Oct. 9, 2026. [Online]. Available: https://authors.library.caltech.edu/records/3xgjg-3xn61
20. R. W. Tabor, "Geologic Guide to the Deer Park Area," Olympic Natural History Association, 1965. Accessed: Oct. 9, 2026. [Online]. Available: https://npshistory.com/publications/olym/deer_park_geology/index.htm
21. U.S. National Park Service, "Glaciation," in NPS Natural History Handbook: Olympic, NPS History. Accessed: Oct. 9, 2026. [Online]. Available: https://npshistory.com/handbooks/natural/1b/nh1bc.htm
22. Wikipedia contributors, "Scree," Wikipedia. Accessed: Oct. 9, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Scree
23. K. Kreczmer, M. Dąbski, and A. Zambrowska, "Comparative analysis of the morphodynamics of talus slopes on Earth and Mars," Miscellanea Geographica, 2026. Accessed: Oct. 9, 2026. [Online]. Available: https://reference-global.com/article/10.2478/mgrsd-2025-0032
24. W. W. Rau, "Geology of the Washington Coast between Point Grenville and the Hoh River," Washington Dept. of Natural Resources, Bulletin 66, 1973. Accessed: Oct. 9, 2026. [Online]. Available: https://npshistory.com/publications/geology/state/wa/1973-66/sec2-14.htm
25. P. Dorpat, "Seattle Now & Then: A Fallen Seastack at Rialto Beach, 2009," pauldorpat.com, Jan. 9, 2020. Accessed: Oct. 9, 2026. [Online]. Available: https://pauldorpat.com/2020/01/09/seattle-now-then-a-fallen-seastack-at-rialto-beach-2009/
26. Wikipedia contributors, "James Island (La Push, Washington)," Wikipedia. Accessed: Oct. 9, 2026. [Online]. Available: https://en.wikipedia.org/wiki/James_Island_(La_Push,_Washington)
27. A. Strekeisen, "Pillow lava," alexstrekeisen.it. Accessed: Oct. 9, 2026. [Online]. Available: https://alexstrekeisen.it/english/vulc/pillow.php
28. U.S. National Park Service, "Crustose Lichens," Mount Rainier National Park. Accessed: Oct. 9, 2026. [Online]. Available: https://www.nps.gov/mora/learn/nature/crustose-lichens.htm
29. R. Clausen, "Sea stack at Ruby Beach, Washington coast," Wikimedia Commons, Sep. 27, 2017, CC BY-SA 4.0. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Sea_stack_at_Ruby_Beach,_Washington_coast.jpg
30. R. Clausen, "Point of the Arches sunny day," Wikimedia Commons, CC BY-SA 4.0. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Point_of_the_Arches_sunny_day.jpg
31. King of Hearts, "Second Beach Olympic June 2018 008," Wikimedia Commons, Jun. 9, 2018, CC BY-SA 4.0. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Second_Beach_Olympic_June_2018_008.jpg
32. Olympic National Park, "Rialto beach hole in the wall 39," Wikimedia Commons, Feb. 2, 2011, public domain. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Rialto_beach_hole_in_the_wall_39_(23104362626).jpg
33. J. Mabel, "Rocks off Beach 4, Kalaloch Beach, Washington 01," Wikimedia Commons, Nov. 7, 2020, CC BY-SA 4.0. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Rocks_off_Beach_4,_Kalaloch_Beach,_Washington_01.jpg
34. brewbooks, "Pillow basalt," Wikimedia Commons, Jun. 4, 2016, CC BY-SA 2.0. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Pillow_basalt_-_Flickr_-_brewbooks.jpg
35. R. Clausen, "Steeple Rock on Hurricane Ridge," Wikimedia Commons, Sep. 27, 2014, CC BY-SA 4.0. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Steeple_Rock_on_Hurricane_Ridge.jpg
36. R. Clausen, "Mount Angeles from Eagle Point," Wikimedia Commons, Jun. 2015, CC BY-SA 4.0. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Mount_Angeles_from_Eagle_Point.jpg
37. brewbooks, "Sundial viewed from Royal Basin," Wikimedia Commons, May 12, 2004, CC BY-SA 2.0. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Sundial_viewed_from_Royal_Basin.jpg
38. D. Nevill, "Martin Peak, Royal Basin," Wikimedia Commons, Jul. 25, 2020, CC BY 2.0. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Martin_Peak,_Royal_Basin.jpg
39. G. Wall, "Photograph - Seven Lakes Basin - 20050918," Wikimedia Commons, Sep. 18, 2005, public domain. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Photograph_-_Seven_Lakes_Basin_-_20050918.jpg
40. B. Cody, "Collomia larsenii," Wikimedia Commons, Jul. 16, 2020, CC BY 4.0. Accessed: Oct. 9, 2026. [Online]. Available: https://commons.wikimedia.org/wiki/File:Collomia_larsenii.jpg
41. GamingBolt, "Horizon Forbidden West – Free Climbing, World Size, and More Revealed," Jun. 3, 2021 (quoting M. de Jonge to IGN). Accessed: Oct. 9, 2026. [Online]. Available: https://gamingbolt.com/horizon-forbidden-west-free-climbing-world-size-and-more-revealed
42. M. Pohlmann, "Samurai Landscapes: Building and Rendering Tsushima Island on PS4," GDC 2021. Accessed: Oct. 9, 2026. [Online]. Available: https://gdcvault.com/play/1027352/Samurai-Landscapes-Building-and-Rendering
43. 80 Level, "Landscape and Material Pipeline of Ghost Recon Wildlands," 80 Level. Accessed: Oct. 9, 2026. [Online]. Available: https://80.lv/articles/landscape-and-material-pipeline-of-ghost-recon-wildlands/
44. Epic Games, "Procedural Content Generation in Electric Dreams," Unreal Engine documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-in-electric-dreams
45. A. Sakamoto, H. Sasaki, and H. Yoshiike, Kojima Productions technical team AMA, 505 Games, Sep. 21, 2020. Accessed: Oct. 9, 2026. [Online]. Available: https://deathstrandingpc.505games.com/en/?p=7726
46. S. I. Runnels, interviewed in "Developing Content for Huge Worlds of Days Gone," 80 Level, Aug. 20, 2019. Accessed: Oct. 9, 2026. [Online]. Available: https://80.lv/articles/developing-content-huge-worlds-for-days-gone/
47. SideFX, "Terracing," Houdini 21.0 documentation, Heightfields and terrains. Accessed: Oct. 9, 2026. [Online]. Available: https://www.sidefx.com/docs/houdini/heightfields/terracing.html
48. QuadSpinner, "Stratify," Gaea documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://docs.quadspinner.com/Reference/Erosion/Stratify.html
49. A. Paris, A. Peytavie, E. Guérin, J.-M. Dischler, and E. Galin, "Modeling Rocky Scenery using Implicit Blocks," The Visual Computer, vol. 36, no. 10, 2020. Accessed: Oct. 9, 2026. [Online]. Available: https://perso.liris.cnrs.fr/aparis/public_html/projects/paris2020_Blocks.html
50. A. Peytavie, E. Galin, J. Grosjean, and S. Merillou, "Arches: a Framework for Modeling Complex Terrains," Computer Graphics Forum, vol. 28, no. 2, pp. 457-467, 2009. Accessed: Oct. 9, 2026. [Online]. Available: https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf
51. B. Martinez and V. Delassus, interviewed in "Procedural Technology in Ghost Recon Wildlands," 80 Level, Apr. 13, 2017. Accessed: Oct. 9, 2026. [Online]. Available: https://80.lv/articles/procedural-technology-in-ghost-recon-wildlands/
52. Epic Games, "Material Inputs," Unreal Engine documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/material-inputs-in-unreal-engine
53. A. Mishkinis, "Advanced Terrain Texture Splatting," GameDev.net. Accessed: Oct. 9, 2026. [Online]. Available: https://www.gamedev.net/tutorials/_/technical/graphics-programming-and-theory/advanced-terrain-texture-splatting-r3287/
54. B. Golus, "Normal Mapping for a Triplanar Shader," Medium, Sep. 17, 2017. Accessed: Oct. 9, 2026. [Online]. Available: https://bgolus.medium.com/normal-mapping-for-a-triplanar-shader-10bf39dca05a
55. Epic Games, "Landscape Patch System," Unreal Engine documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://dev.epicgames.com/documentation/unreal-engine/landscape-patch-system
56. PC Optimized Settings, "Red Dead Redemption 2 (RDR2) Optimized Settings for PC," 2024. Accessed: Oct. 9, 2026. [Online]. Available: https://pcoptimizedsettings.com/red-dead-redemption-2-rdr2-optimized-settings-for-pc-2024/
57. C. Sarkosh, "Rock relief: fractured rock instead of a textured loaf," game-dayhike, docs/rendering, Sep. 23, 2026. Accessed: Oct. 9, 2026. [Online]. Available: https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-09-23-rock-relief-design.md
58. E. Lengyel, "The Transvoxel Algorithm," transvoxel.org. Accessed: Oct. 9, 2026. [Online]. Available: https://transvoxel.org/
59. O. Sidorkin, "Open world in the browser, part 9: Transvoxel, first cut," Cinevva, Feb. 25, 2026. Accessed: Oct. 9, 2026. [Online]. Available: https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-09-transvoxel-first-cut
60. Epic Games, "Nanite Virtualized Geometry," Unreal Engine documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine
61. B. Karis, R. Stubbe, and G. Wihlidal, "A Deep Dive into Nanite Virtualized Geometry," SIGGRAPH 2021 Advances in Real-Time Rendering. Accessed: Oct. 9, 2026. [Online]. Available: https://advances.realtimerendering.com/s2021/Karis_Nanite_SIGGRAPH_Advances_2021_final.pdf
62. Khronos Group, "WebGL 2.0 Specification," Khronos registry. Accessed: Oct. 9, 2026. [Online]. Available: https://registry.khronos.org/webgl/specs/latest/2.0/
63. F. Bösch, "Re: [Public WebGL] WebGPU," Khronos public_webgl mailing list, Feb. 8, 2017. Accessed: Oct. 9, 2026. [Online]. Available: https://www.khronos.org/webgl/public-mailing-list/public_webgl/1702/msg00026.php
64. three.js, "BatchedMesh," three.js documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://threejs.org/docs/pages/BatchedMesh.html
65. Babylon.js, "Tri-Planar Material," Babylon.js materials library documentation. Accessed: Oct. 9, 2026. [Online]. Available: https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/triPlanarMat
66. C. Sarkosh, "cliffs.ts: cliff bands and lowland outcrops," game-dayhike, client/src/sim. Accessed: Oct. 9, 2026. [Online]. Available: https://github.com/csarkosh/game-dayhike/blob/main/client/src/sim/cliffs.ts
67. C. Sarkosh, "terrainSurface.ts," game-dayhike, client/src/game. Accessed: Oct. 9, 2026. [Online]. Available: https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/terrainSurface.ts
68. C. Sarkosh, "Cliff modules: rock-wall models on the steep faces," game-dayhike, docs/rendering, Sep. 24, 2026. Accessed: Oct. 9, 2026. [Online]. Available: https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-09-24-cliff-modules-design.md
69. C. Sarkosh, "Cliff modules: verification," game-dayhike, docs/rendering, Sep. 25, 2026. Accessed: Oct. 9, 2026. [Online]. Available: https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-09-25-cliff-modules-verification.md
