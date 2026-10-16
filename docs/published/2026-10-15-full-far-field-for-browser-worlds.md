---
description: How shipped open-world games keep the distance looking full, from far terrain and vegetation to the camera-side tricks that hide the seams, for a browser frame.
published: 2026-10-15
categories: Rendering, Worlds and terrain
---
# A full far field: how games fill the distance

**Question:** A world that reads as photographic at arm's length tends to fall apart past
a few dozen metres. The grass stops at a line and a flat plane carries on behind it. The
ground goes to one tiling texture, then to one colour. The trees become dark cut-outs with
ragged edges against the sky. Hills meet forest along a hard seam. The whole far field
reads as sparse and low in polygons, and the eye, which trusts the distance to say how
big a place is, stops believing the place. How do shipped open-world games keep the far
field looking full, and what do they do on the camera's side, with fog, scattering, blur
and anti-aliasing, to hide what they could not afford to draw? And which of those answers
fit a browser game on WebGL2 or WebGPU, with a 16.7 ms frame and a download budget?

**Short answer:** the distance looks thin for one reason with three faces. Every system
that makes the near field rich (grass blades, detail textures, full tree meshes, shadow
maps) stops at a radius, and past that radius nothing stands in for it: the ground loses
the colour and the roughness the cover gave it, the vegetation loses its mass, and the
silhouettes lose their softness. Shipped games answer each face in the same way: they keep
a cheaper stand-in running all the way to the horizon, and they colour-match the stand-in
to the thing it replaces so the handover is invisible. Terrain carries a baked far albedo
and normal, a macro colour map and a detail layer that fades out by distance, cached in a
virtual texture [1], [2]. Vegetation runs as a chain of levels that ends in billboards or
impostors, and grass thins and widens by rule until it becomes a texture on the ground
[3], [4]. The handovers are dithered under temporal anti-aliasing, the alpha edges come
from signed distance fields so they stay clean when small, and the far shadows come from
a coarse cascade with a cross-fade [3], [5]. Then the camera does the rest: aerial
perspective desaturates and lifts the distance toward the sky by depth [6], fog hides what
the budget could not draw [7], specular is filtered so far surfaces stop sparkling [8],
[9], and temporal anti-aliasing turns sub-pixel foliage into a soft mass instead of noise.
For a browser, the cheap wins are the colour-matched far ground, a density ramp for the
cover with a far-ground texture under it, an impostor atlas for far trees, per-pixel aerial
perspective from the sky model, and dithered fades under temporal anti-aliasing; the costly
ones are virtual texturing and full impostor parallax.

## 1. Why the distance looks thin

Near-field richness comes from systems with a radius: geometry grass and ground cover out
to a few tens of metres, tiling detail textures that only make sense while a texel is
bigger than a pixel, full tree meshes out to some tens or hundreds of metres, cascaded
shadows out to a cascade's far plane. Each radius is a budget decision, and each radius is
also a seam. At the seam the eye sees three things at once:

- **The cover stops.** Blades and cards end at a line, and the ground behind the line is
  a plane with a texture on it. If the plane's colour is the soil's and not the cover's,
  the line is a change of colour as well as of relief, and nothing hides it.
- **The surface goes flat.** A detail texture tiled at a metre becomes, at a hundred
  metres, a single averaged colour with a faint repeat in it, with none of the variation a
  real hillside has at that scale: drifts of colour, wet and dry, the shadow of a slope.
  The normal map averages to flat as well, so the far ground stops responding to light.
- **The silhouettes go to confetti.** An alpha-tested crown that was a tree at twenty
  metres is, at two hundred, a cloud of pixels, each on or off. Without anti-aliasing on
  the alpha edge the crown reads as a dark cut-out with a ragged rim, lit as a flat card.

Every technique below attacks one of these three. The thread through all of them is
continuity: a far stand-in that is tuned to look like the near thing's average, and a
handover that nobody can point at.

## 2. Terrain at distance

### 2.1 Bake the far look and fade the detail into it

Far Cry 5's terrain is a quad tree of 64 m tiles, six levels deep, streamed by distance
from the camera, and every node carries a baked payload: a height map, a world-space normal
map that also packs smoothness and specular occlusion, an albedo map, a colour modulation
map and a splat map [1]. The far terrain is shaded directly and cheaply from that baked
albedo and normal, and only the near terrain pays for the splat map and its detail
textures, which are sampled by world position, blended across the four nearest splat
texels by their material heights, and cached into a virtual texture so the expensive blend
runs once a page rather than once a pixel [1]. The team's stated goal was that rocks, trees
and grass "blend with, and be grounded in, the terrain", at about 2 ms of GPU for the whole
terrain full screen [1].

Battlefield 3's terrain took the same shape a generation earlier: a height field with the
mesh built at runtime, shaded by procedural splatting (arbitrary shaders applied by painted
masks) with a colour map used as an overlay on top of the splat, and the whole result cached
into a procedural virtual texture at 32 samples a metre so the splat's cost does not scale
with view distance, with a per-tile fade factor that blends a newly composited tile in over
its predecessor [2]. The point of both designs is the same: the far field is a cached,
baked picture of the near field's average, not a cheaper shader that looks different.

Engines without a virtual texture ship the same idea as a blend. Open 3D Engine's terrain
has a macro material (a low-frequency colour and normal over the whole terrain) and a detail
material blended over it near the camera, with a cutoff distance and a fade range past
which only the macro remains [10]. The macro is what the eye sees from far away in any case,
so the fade removes nothing it could have seen; what it adds is the large-scale variation
the detail texture never had.

### 2.2 Keep the far surface alive

Three details make a far terrain read as real rather than as a plane:

- **A colour modulation map.** Far Cry 5 carries one in every node beside the albedo [1];
  Battlefield 3 paints a colour map over the splat [2]. It is the drift of colour across a
  hillside at the ten-to-hundred-metre scale: wetter, greener, more mineral, more dead.
  Without it, a far hillside has exactly one colour, and that is the single strongest
  tell of a game world from the distance.
- **Screen-constant tiling on steep ground.** Cliffs are seen from far away, so a tiling
  scale tuned for the near field repeats visibly across a whole mountainside. Far Cry 5
  changes the tiling scale with distance so the texture's period stays roughly constant in
  screen space, which works because rock textures are close to fractal and read at more
  than one scale [1].
- **Stochastic blends where blends are expensive.** For far cliffs, Far Cry 5 picks one
  material and one projection per pixel by a stable hashed noise instead of blending them
  all, and alpha-blends only two tiling scales on top: eight texture samples instead of
  forty-eight, with the noise invisible because the far colour data has so little contrast
  [1]. The lesson generalises: at a distance, noise that averages right is cheaper than
  arithmetic that is right, and the eye cannot tell them apart.

### 2.3 Ground what stands on the terrain

Objects that sit on the ground give the far field away when their footprint is a hard
edge. Far Cry 5 renders rock and root decals into the terrain's virtual texture and gives
each a small matching mesh for shape, so the object's colour is already part of the ground
before its geometry stands on it [1]. The principle for any engine: whatever cover a
hillside has, its ground colour under and around the cover should already be the cover's
average, so that when the cover's geometry stops the colour does not.

## 3. Vegetation at distance

### 3.1 A chain that ends in a card

Horizon Zero Dawn's trees run five levels: about 10,000 triangles, 2,600, 1,200, then about
200 triangles with a 12-triangle billboard fading in, then the billboard alone; plants run
four, ending in an 8-triangle billboard; grass runs three, from 20 to 36 triangles down to
10 to 18 on a cheaper shader [3]. Two decisions in that chain do the far field's work. The
billboard does not replace the last mesh at a line; it fades in alongside it over the
fourth level, so the crown's mass never drops. And the vegetation is colourised in the
shader from world data (erosion, flow, closeness to water, baked into a 512 by 512 world
texture) and by ecotope, with an "illuminate" blend that tints the albedo [3], which means
the near mesh and the far card draw their colour from the same source and cannot drift
apart. Far Cry 4 moved the same way, from modelled leaves up close to tessellated, displaced
billboards at a distance that still carry the wind [11].

The modern card is the octahedral impostor: a single sprite of 8 triangles whose texture
holds a grid of captures of the mesh from directions laid out over a hemisphere, with the
three captured frames nearest the current view blended at runtime. Epic's baker stores base
colour and normal, with optional depth, roughness and subsurface, at 2048 pixels for its own
projects; Fortnite uses a 12 by 12 grid, 144 frames, for most of its distant foliage, and
upper-hemisphere impostors for all its trees when Nanite is off, because they look better
from far away than billboards [12]. Lighting works because the impostor carries a normal map
and the engine lights it as it lights the mesh; a parallax mode traces the depth captures
so the card has thickness near the handover [12]. On the far field the impostor's value is
not its cheapness so much as its stability: a tree that keeps the same colour, normal
response and silhouette mass from 50 m to 500 m, under the same sun.

### 3.2 Grass: thin by rule, then become the ground

Ghost of Tsushima draws its fields as individual blades generated on the GPU, and its
distance scheme is the clearest statement of the rule [4]. Near blades have 15 vertices,
far blades 7 with a simpler curve, and the near shape blends toward the far shape as it
nears the switch so there is no pop. Tiles double in size with distance and keep the same
blade count, so far grass stands twice as far apart; the near grass drops three blades in
four as it approaches that line, gradually, so the density already matches when the tile
size changes. Beyond the last tile the field is replaced by a texture on the terrain, and
blades past the maximum distance are culled on the GPU before a vertex is built [4], [13].
Horizon's grass scales its whole animation down with distance and pushes its vertices
toward the ground by a percentage of the object's height, so far grass is shorter, calmer
and denser-looking per pixel than near grass [3].

A single-plane far grass is a legitimate stand-in when it is shaded like the grass it
replaces. One Godot write-up builds its far plane from the same world-space noise the
blades use for their patches, a baked top-down normal map of real blades, matched
backlight, roughness and specular constants, and a view-angle term that shows more ground
through the plane when the camera looks down and more blade tips when it looks across;
the impostor fades in from 5 to 10 units and the blades fade out from 10 to 20, by dithered
alpha, and the whole thing costs under 2 ms [14]. The numbers are one project's; the
structure is the industry's: the far plane is not a flat colour but a shaded surface built
from the near grass's own ingredients.

### 3.3 Density by distance, not by cutoff

Battlefield 3 stores terrain decoration (trees, bushes, grass) as instance lists in quad
tree payloads at several depths, and overlaps them: a payload near the root holds a sparse
set of trees seen from far away, the next level adds more trees at a medium distance, the
next adds bushes near the camera, each level only adding to what the coarser one already
drew [2]. The far field therefore always holds the trees that matter at that distance,
and density grows toward the camera without a line where it begins.

## 4. The handover

### 4.1 Dither the fade and let the anti-aliasing resolve it

A cross-fade between two levels of detail by alpha blending costs sorting and overdraw;
the common alternative is a dithered opacity mask whose threshold ramps over the transition
while both levels draw, so each pixel shows one level or the other, and temporal
anti-aliasing, whose noise pattern changes every frame, averages the two into a smooth
blend over a few frames [5]. The pattern is visible without temporal history, and both
levels are drawn for a fraction of a second, which are the costs. Far Cry 5's stochastic
material blends rest on the same insight, stabilised with the position hash and screen
gradients of hashed alpha testing so the noise neither swims under camera motion nor
aliases [1], [15].

### 4.2 Keep the alpha edge clean when it is small

A crown's alpha channel, mipmapped, turns into a soft blur that alpha-testing then cuts at
an arbitrary level, which is where confetti comes from. Horizon stores its vegetation alpha
as a signed distance texture, so the mip chain stays a clean edge at every size and the
artists control the quality over distance by hand [3]. Signed distance alpha is cheap to
produce offline and free at runtime, and it fixes the ragged far silhouette at its source.

### 4.3 Far shadows from a coarse cascade

Horizon's sun shadows run four cascades: a 1024 map for the player alone, a 2048 map to 8 m,
a 2048 map to 80 m, and a distant 1536 map covering a 1.5 km square from a height-field
based system, with a smooth alpha-blended cross-fade between cascades; vegetation casts
shadows from separate, cheaper meshes, alpha-tested and animated in the near cascades and
neither in the far one [3]. The far field then keeps its slope shadows and tree-line
shadows, which are most of what makes a hillside read as three-dimensional, without paying
for a full-resolution map over kilometres.

## 5. The camera's part

### 5.1 Aerial perspective is the far field's main light

The single strongest cue of distance in a landscape is the air itself: light scattered
into the view path lifts far surfaces toward the sky's colour and lowers their contrast,
and light scattered out of it attenuates what they reflect. Hillaire's atmosphere model
computes exactly that per pixel with a small set of look-up tables: a transmittance table,
a sky-view table for the distant sky, and a camera-frustum volume whose texels hold the
in-scattered luminance and the transmittance from the camera to that depth, applied to
every scene pixel by its depth [6]. The result is the hazing and the blueing of the far
hillside, decoupled from screen resolution and costing about a millisecond for the tables.
For the far field this does three jobs at once: it hides the loss of detail by lowering
the contrast where detail is gone, it unifies the ground, the trees and the sky into one
palette by depth, and it tells the eye how far away the far field is, which is the thing a
thin far field fails to do.

### 5.2 Fog has always hidden the budget

Distance fog was used, in Wronski's words, as very thick linear fog to hide a very short
streaming distance, and volumetric fog is the modern, physically-shaped version of the same
instrument [7]. A height fog that thickens in valleys and a distance term that follows the
weather are not only atmosphere: they are the knob that sets where the far field's
substitutes must still convince and where the air may take over. Real haze falls off
exponentially, not linearly, and a fog that reaches its colour too early reads as a wall.

### 5.3 Stop the sparkle

Far surfaces shine wrongly because mipmapping averages a normal map's direction but not its
roughness, so a rough surface seen from afar keeps the gloss of its bumps and sparkles.
LEAN mapping stores the bump statistics in a form that filters linearly, so the highlight
widens as the bumps shrink below a pixel [8]; the cheaper Toksvig correction reads the
averaged normal's shortened length as a roughness increase and needs nothing but the normal
map already in hand [9]. On a far field, a roughness ramp with distance in the shader does
most of the same work: whatever the detail normal said, the far hillside and the far water
should go matte.

### 5.4 Resolution, mip bias and temporal filtering

Temporal anti-aliasing matters more at a distance than anywhere else: it is what turns an
alpha-tested crown's sub-pixel leaves into a soft mass, a dithered fade into a blend, and
a stochastic material blend into a colour [5], [15]. Without it the far field is noise.
A negative mip bias on foliage alpha and ground detail sharpens the mid field at the price
of shimmer that temporal filtering then has to absorb; a positive bias on the far field
softens it on purpose. Depth of field is the last veil, used sparingly at distance: a
slight far blur reads as a long lens and hides the far field's edges, but it also removes
the sharpness that says "far", so it is a lens choice rather than a fix.

## 6. What fits a browser frame

A browser build has the same three faces of the problem and a tighter budget, so the order
is by payoff per millisecond.

1. **Colour-match the far ground to the cover.** The ground under the cover should be
   the cover's average colour and roughness, read from the same source, so the cover's
   edge is a change of relief and not of colour. This is a shader constant and a texture
   choice, and it removes the sharpest line in the frame. A far-ground texture built from a
   top-down render of the near cover, tiled with world-space noise, carries it further for
   one texture sample.
2. **Thin the cover by rule and let the ground take over.** Drop density toward the edge
   in steps the eye cannot see, widen what remains so coverage holds, and fade the last of
   it by dithered alpha under the temporal pass. The edge then has no line to point at.
3. **Give far trees an impostor atlas with normals.** One sprite a tree, a hemisphere of
   captures, three frames blended, lit by the same sun as the near mesh, and a crown alpha
   from a signed distance field. On WebGL2 the capture is an offline bake; the runtime is
   three texture reads.
4. **Add a macro colour map to the terrain.** A single low-frequency colour and roughness
   variation over the world, blended in by distance, so a far hillside is a field of
   drifts and not a colour. It costs one texture read and it is the difference between a
   plane and a landscape.
5. **Compute aerial perspective per pixel from the sky model.** A scene that already has a
   sky model has everything the froxel volume needs; even the analytic single-scatter
   version, applied by depth, unifies the far field's palette and contrast.
6. **Ramp roughness with distance and keep a far shadow cascade.** Both are a few lines
   of shader and a cascade setting, and both stop the far field from looking like plastic
   under a flat light.

What does not fit: a virtual texture cache, which needs a page table, a feedback pass and
a compositing pipeline; full impostor parallax at every tree; and shadow maps over
kilometres at near-field resolution. The far field in a browser is a well-matched set of
stand-ins under a believable atmosphere, which is, in the end, what the far field is in
every shipped game too.

## Sources

1. J. Moore, "Terrain Rendering in 'Far Cry 5'," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2018. Accessed: Oct. 15, 2026. [Online]. Available: https://media.gdcvault.com/gdc2018/presentations/TerrainRenderingFarCry5.pdf
2. M. Widmark, "Terrain in Battlefield 3: A Modern, Complete and Scalable System," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2012. Accessed: Oct. 15, 2026. [Online]. Available: https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/gdc12-terrain-in-battlefield3.pdf
3. G. Sanders, "Between Tech and Art: The Vegetation of Horizon Zero Dawn," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2018. Accessed: Oct. 15, 2026. [Online]. Available: https://media.gdcvault.com/gdc2018/presentations/gilbert_sanders_between_tech_and.pdf
4. E. Wohllaib, "Advanced Graphics Summit: Procedural Grass in 'Ghost of Tsushima'," presented at Game Developers Conf., San Francisco, CA, USA, Jul. 2021. Accessed: Oct. 15, 2026. [Online]. Available: https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass
5. Cesium, "Smoother LOD Transitions in Cesium for Unreal with Dithered Opacity Masking," Cesium Blog, Oct. 20, 2022. Accessed: Oct. 15, 2026. [Online]. Available: https://cesium.com/blog/2022/10/20/smoother-lod-transitions-in-cesium-for-unreal/
6. S. Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique," *Comput. Graph. Forum*, vol. 39, no. 4, pp. 13-22, Jul. 2020. Accessed: Oct. 15, 2026. [Online]. Available: https://diglib.eg.org/handle/10.1111/cgf14050
7. B. Wronski, "Volumetric Fog: Unified Compute Shader-Based Solution to Atmospheric Scattering," presented at ACM SIGGRAPH, Vancouver, BC, Canada, Aug. 2014. Accessed: Oct. 15, 2026. [Online]. Available: https://bartwronski.com/wp-content/uploads/2014/08/bwronski_volumetric_fog_siggraph2014.pdf
8. M. Olano and D. Baker, "LEAN Mapping," in *Proc. ACM SIGGRAPH Symp. Interactive 3D Graphics and Games (I3D)*, Feb. 2010. Accessed: Oct. 15, 2026. [Online]. Available: https://www.cse.chalmers.se/edu/year/2011/course/TDA361/Advanced%20Computer%20Graphics/LEANMapping.pdf
9. S. Hill and D. Baker, "Rock-Solid Shading: Image Stability Without Sacrificing Detail," presented at ACM SIGGRAPH, Los Angeles, CA, USA, Aug. 2012. Accessed: Oct. 15, 2026. [Online]. Available: https://www.selfshadow.com/talks/rock_solid_shading_v1.pdf
10. Open 3D Engine Contributors, "Terrain Macro Material Component," Open 3D Engine Documentation. Accessed: Oct. 15, 2026. [Online]. Available: https://docs.o3de.org/docs/user-guide/components/reference/terrain/terrain-macro-material/
11. S. McAuley, "Rendering the World of Far Cry 4," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2015. Accessed: Oct. 15, 2026. [Online]. Available: https://www.gdcvault.com/play/1022235/Rendering-the-World-of-Far
12. Epic Games, "Impostor Baker Plugin in Unreal Engine," Unreal Engine Documentation. Accessed: Oct. 15, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/impostor-baker-plugin-in-unreal-engine
13. T. Abrodi, "Grass in Ghost of Tsushima," tigerabrodi.blog. Accessed: Oct. 15, 2026. [Online]. Available: https://tigerabrodi.blog/grass-in-ghost-of-tsushima
14. hexaquo, "Grass Rendering Series Part 4: Level-Of-Detail Tricks for Infinite Plains of Grass in Godot," hexaquo.at. Accessed: Oct. 15, 2026. [Online]. Available: https://hexaquo.at/pages/grass-rendering-series-part-4-level-of-detail-tricks-for-infinite-plains-of-grass-in-godot/
15. C. Wyman and M. McGuire, "Hashed Alpha Testing," in *Proc. ACM SIGGRAPH Symp. Interactive 3D Graphics and Games (I3D)*, Feb. 2017. Accessed: Oct. 15, 2026. [Online]. Available: https://casual-effects.com/research/Wyman2017Hashed/index.html
