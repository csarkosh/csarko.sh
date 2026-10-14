---
description: How AAA games soften and lighten forest shade, texture and shade bark so it stops looking shiny, and grow moss on trunks, sized for a browser frame.
published: 2026-10-13
categories: Rendering
---
# Soft shade, bark and moss for browser forests

**Question:** A forest drawn with stock physically based materials tends to fail in three ways
at once. The shade under the canopy goes close to black, and the ferns and grass in it turn into
dark cut-outs. The trunks look smooth, smeared and faintly glossy, as if varnished, with a cool
sheen down their edges that matches nothing around them. And the wood looks young: clean bark
from root to crown, none of the moss that says a forest is old. How do shipped games make
foliage shade soft and light, texture bark at close range, keep bark from reflecting the sky,
and put moss on it? And which of those answers fit a browser game on WebGL2 or WebGPU, where a
16.7 ms frame and a download budget both apply?

**Short answer:** shade goes black because a shadow takes the sun away and leaves only the
ambient term, and in most forests that term is wrong in two directions. It is too strong on
trunks, which take the whole open sky's light and reflection although a canopy hangs over them,
and too weak on foliage, which in life glows with light transmitted through its leaves. Engines
fix the cause, not the shadow: leaf transmission or wrapped diffuse on foliage, sky occlusion
that dims the ambient only where the sky is really blocked, and occlusion applied once rather
than painted into the albedo as well. A wider penumbra from a sun of the right angular size and
a softer filter come after that, and a global "shadow darkness" slider is the last resort, since
it lets the sun leak through everything. Bark is a tiling scan of about 2 m of real trunk at
roughly 1,000 pixels per metre, often with a unique texture on the trunk's base. A 4K source
is the right thing to download and the wrong thing to ship to a browser: 2K in KTX2 costs about
a quarter of 4K's GPU memory and is about as sharp as a 1080p screen can show at arm's length.
Bark shines when its roughness is missing or misread, when its F0 is too high, or when an
unoccluded sky probe lights it; the fixes are the scan's own roughness map, F0 near 0.04, and
specular occlusion. Moss is a second material blended in by a mask built from the surface's
facing, its height on the trunk and per-tree noise, and shaded softer than a microfacet model
can: with light wrap, a sheen or fuzz term and dark occlusion that fades at grazing angles.

The questions came from Day Hike, a co-op hiking game in Babylon.js set in the old-growth
forest of a fictional stretch of the Olympic Peninsula. An earlier doc covers what grows there
and where the moss is heaviest ([Olympic Peninsula vegetation for game
worlds](/research/olympic-vegetation-for-games)); another covers wet surfaces in rain
([Photorealistic rain for browser games](/research/photorealistic-rain-for-browser-games)).
This one is about the shading.

## 1. Why forest shade goes black

A cast shadow is the absence of one light. What a shadowed pixel shows is everything else:
the sky's diffuse light, its reflection, bounce light, and in foliage the light that comes
through the leaf from behind. If the shade reads as black, the shadow is rarely the fault; the
other terms are missing or cancelled.

Three things usually go wrong together in a forest.

- **Foliage drawn as opaque card.** A leaf or a fern frond lit by a standard Lambert term on its
  own normal is dark whenever it faces away from the sun, which for a two-sided card is half the
  time. Unreal's documentation shows a plant with its default shading model and notes that the
  result "appears almost black on the underside surfaces" because it "does not simulate any sort
  of light transmission" [1].
- **Occlusion counted twice.** Artists who find the shade too bright in one place darken the
  albedo there (a root darkening on grass, a canopy-shade multiplier on the understory), and then
  the shadow map darkens the same pixel again, and the screen-space occlusion a third time.
  Each term is reasonable; the product is black.
- **The sky's light in the wrong place.** A single sky probe applied at one intensity to the
  whole scene lights a trunk in deep forest as brightly as a rock on a ridge. The trunk then
  looks pale and sky-tinted, while the foliage, which needs more light than the probe gives it,
  stays dark.

Section 2 covers the shadow itself, because its softness matters for the look. The fixes that
lighten the shade are in section 3, the foliage's own lighting and the ambient's occlusion, and
engines apply those first.

## 2. A softer shadow

### 2.1 The sun has a size

The sun covers about half a degree of sky. Unreal's directional light exposes this as Source
Angle, "Angle subtended by a light source in degrees. Defaults to 0.5357, which is the angle for
our sun" [2], and Unity's HDRP uses the light's Angular Diameter to set "the softness of baked,
ray-traced, and PCSS shadows" [3]. A shadow cast by a branch 20 m up has a penumbra of
20 × tan(0.54°), about 19 cm, on the ground; a fern's shadow on the ground 30 cm below it is
almost hard. That variation, sharp at contact and soft far from the caster, is what reads as
natural light under trees. Uniform soft blur at every distance reads as a filter.

Percentage-closer soft shadows (PCSS) produce it: a blocker search finds how far the caster is
from the receiver, and the filter radius grows with that distance. The cost is texture taps. In
Babylon.js 9.18 the cascaded generator's PCSS runs 16 search taps and 16 filter taps at low
quality, 16 and 32 at medium, and 32 and 64 at high [4], against 5×5 for the default
percentage-closer filter (PCF) at high quality [5]. The cascaded generator supports only PCF and
PCSS, and its depth clamp is ignored under PCSS [6]. A browser game can afford PCSS on its
highest tier and on its nearest cascade; a wider fixed PCF kernel on the far cascades costs less
and is hard to tell apart there.

### 2.2 Darkness as a slider, and why it is the last resort

Every engine has a knob that lets light leak into shadow. Unreal calls it Shadow Amount: "A value
of 0 means no occlusion and no shadow" [2]. Babylon's is the generator's darkness, which mixes
the shadowed value toward 1 [5]. It lightens shade at once, but it lightens every shadow by the
same fraction: a trunk's shadow on an open meadow becomes as weak as the shade deep in the wood,
and a sunlit face and its shadowed back converge toward the same flat grey. Weather is the honest
use for it: under overcast the sun's direct term is mostly gone, and a global darkness tied to
cloud cover models that well. For a sunny forest that looks too dark, treat it as a symptom.

### 2.3 Which meshes cast

A forest's shadow pass is where its draw calls go. The team behind Unity's Book of the Dead
forest found that "many of the draw calls used to render your scene are actually coming from
the rendering each cascade", and had "most of our small vegetation assets stop casting shadows at
a distance of around 15 meters" before culling them entirely at about 25 m [7]. Small plants
matter little as casters, because their own shade is better made by the transmission and
occlusion terms below; trunks and crowns matter a great deal, because they make the large, soft
pools of shade a forest floor is made of. A shadow budget spent on near trunks and crowns, with
ground cover receiving and not casting, is the usual trade.

Alpha-tested leaves in a shadow map make hard, speckled shadows. Two cheap mitigations: draw
the caster's back faces only into the map so less bias is needed, and write alpha as a dither
pattern rather than a cut-off so a sparse crown casts a partial shadow. Babylon offers both
(`forceBackFacesOnly` and `enableSoftTransparentShadow`), with the warning that the dither can
show under PCF [5].

### 2.4 Shade beyond the shadow map

A shadow map ends somewhere, usually a few hundred metres out. Past it a forest needs its shade
in the material: a darker, cooler ground under dense canopy, trees with their crowns' self-shade
baked into their billboards. Far Cry 4 went further and used a height map of the whole scene to
compute sky visibility, fading it "to fully visible based upon the height above the terrain"
[8]. That is the same field that solves section 3's ambient problem, so one map can serve both.

## 3. Lighter foliage, the right way

### 3.1 Transmission and wrap

Leaves and fronds are thin. Lit from behind, they glow. Unreal's Two Sided Foliage shading
model "allows light transmission through the surface of the Material", with a Subsurface Color
that defines "the amount of light transmission" [1]. Book of the Dead used HDRP's translucent
material type, "a more simple translucent material with only light transmission", and its team
added separate sliders for direct and indirect transmission, admitting that "this change is not
respecting the PBR rules" [7].

For a forward renderer without a foliage shading model, the cheap equivalents are:

- **Wrapped diffuse.** Replace `max(N·L, 0)` with `max((N·L + w) / (1 + w), 0)`, which lets light
  reach past the terminator. Naughty Dog's moss shader in Uncharted 4 used a wrap that "ignores
  the normal map" and takes a tint colour, so the wrapped light can be green; it is "somewhat
  energy conserving, in that it broadens the terminator without just adding energy" [9].
- **A back-light lobe.** Add `pow(saturate(dot(V, -L)), p) × thickness × transmission` for the
  sun seen through the leaf. Thickness falls toward the leaf's tips.
- **Flattened normals at the root.** Bending a grass or fern normal toward straight up near the
  ground stops a dark band where the card meets the soil.

Two cautions for anyone adding these to an engine's stock material by patching shader text.
First, check which light the patch lands on: a patch keyed to "light 0" applies to whatever light
was created first, which may be a headlamp or a fill, not the sun, and the plants then take the
sun through the stock term with no wrap at all. Second, the shadow term multiplies the result
afterward, so transmission through a leaf in shadow is still zero. That is correct for a leaf in
a trunk's shadow; it is wrong for the back side of a leaf whose own front face cast the shadow,
which is what normal bias and back-face-only casting exist to avoid.

### 3.2 Sky occlusion, not a darker world

The ambient term is the sky. Under a canopy most of it is hidden, and engines compute how much.
Book of the Dead placed occlusion probes in a grid: "Each probe in the 3D grid samples sky
visibility by shooting rays in the upper hemisphere", storing the result as 8 bits, and the sky's
light on everything near the probe is scaled by it [7]. Far Cry 4 built the same visibility from
a height map of the scene, rendered from above and blurred, and faded it out with height above
the terrain [8].

A browser game can do the cheap version with data it probably has: a canopy density field that
already drives tree placement. Sample it in the vertex shader, or bake it into a low-resolution
texture over the world, and scale both the diffuse ambient and the reflection probe's
contribution by `mix(1, skyVisible, canopy)`. Foliage on the floor then gets less sky and
more transmission, and trunks lose the open-sky light they never had.

### 3.3 Occlusion that is soft, and counted once

Screen-space ambient occlusion adds contact darkening at the base of every plant and trunk.
Ground-truth ambient occlusion (GTAO) matches a ray-traced reference and ran at 0.5 ms on a PS4 at
1080p using a half-resolution buffer [10]. Babylon's core ships SSAO2 rather than GTAO, which
costs more for less; in a dense forest at browser frame rates, a baked root darkening in the
vertex colour is often the better buy.

Naughty Dog's "micro shadowing" turns the occlusion map into a soft cone test against the sun:
the occlusion value is read as the half-angle of a visible cone, and light outside the cone is
shadowed, with a soft gradient "since we're representing what percentage of each pixel is in
shadow, not a hard cast shadow". It shows mostly at the terminator and in cracks "where the sun
shadow isn't precise enough", and Uncharted 4 applied it "on every environmental surface" [9].
Their "AO Fresnel" fades occlusion to white at grazing views, because the crevices a normal map
describes would be hidden by real geometry at that angle [9].

Whatever terms are used, list them per material and multiply them on paper: albedo darkening,
vertex occlusion, texture occlusion, screen-space occlusion, shadow, darkness floor. If the
product under a canopy at noon is below about 0.2 of the lit value for a plant that should glow,
one of them is a duplicate.

## 4. Bark at close range

### 4.1 Tiling, a unique base, and texel density

Shipped trees are rarely textured uniquely from root to crown. Book of the Dead's hero trunk was
"composed out of scanned geometry and unique texture for the lower part" joined to "a
procedurally generated trunk with tileable texture for the rest of it", the tile made by
clone-stamping part of the scanned base; branch normals were edited to "blend with the trunk"
[11]. The base is where the player stands, so it earns unique detail; the upper trunk is seen
from metres away and tiles well.

The density that matters is pixels per metre of bark. A player 1.5 m from a trunk, with a
70° horizontal field of view on a 1920-pixel-wide screen, sees about 2.1 m of width across 1,920
pixels, so about 900 screen pixels per metre. A bark scan that covers 2 m in 2,048 pixels supplies
1,024 texels per metre, which matches. The same scan at 4,096 pixels supplies 2,048 per metre, a
level of detail a 1080p player sees only with their nose to the trunk; a 4K screen at arm's
length can use it.

Branches are the other half. SpeedTree's documentation notes that bark captured from trunks
"often appear[s] too dense when mapped to branches", because branches are thinner, and offers
fractional U mapping to match a branch's density to its parent's, at the cost of "a texture seam
running along the branch", best placed "on the top part of the branches for games where the
player might only see the branches from below" [12].

A common failure in converted or game-ready models is the opposite: the trunk's UVs sample a
narrow band of a larger atlas through a texture transform, so a trunk 30 m tall gets a few
hundred texels of vertical resolution however large the image. Check the transform before
buying a bigger texture.

### 4.2 Shipping a 4K source to a browser

GPU memory, not download size, is what a large texture costs a browser. One 4,096² map with
its mip chain is about 85 MB as uncompressed RGBA8, and about 21 MB in a block-compressed format
at one byte per pixel (BC7 or ASTC 4×4). A bark set of three maps (colour, normal, and a packed
occlusion, roughness and height map) is about 64 MB at 4K compressed and about 16 MB at 2K.
Babylon has no texture streaming, so all of it is resident from the first frame.

KTX2 with Basis Universal is the browser's way to ship block-compressed textures to every GPU.
The Khronos guide recommends UASTC for normal and packed maps, gives a high-quality normal-map
command (`--encode uastc --uastc_quality 4 --uastc_rdo_l .25 --uastc_rdo_d 65536 --zcmp 22
--genmipmap --assign_oetf linear`), wants power-of-two sizes, and reports a lamp model of 13 MB
on disk that took 96 MB of GPU memory as JPEG and PNG and 21 MB as KTX2 [13]. Babylon's own
documentation agrees on UASTC for non-colour data and notes that supercompression shrinks the
file, not the GPU memory [14].

The practical rule: download the 4K or 8K scan, author at that size, ship 2K on the top tier
and 1K below it, and add a detail normal at a higher tiling rate for the last metre if close
inspection matters.

## 5. Why bark looks shiny, and how to stop it

### 5.1 Values

Bark is a dielectric. Lagarde's survey of physically based values puts dielectrics in "the
range 0.02-0.05" of specular reflectance at normal incidence, with "no value under 0.02" and 0.04
as the default for an unknown material, and diffuse albedo between 50 and 240 in sRGB [15].
Frostbite's course notes add that a change of 1 to 2% in F0 is barely visible in real time [16].
No published table gives bark a roughness, and none is needed: a scanned bark set ships a
roughness map, and it is high almost everywhere.

### 5.2 Where the shine comes from

When bark looks varnished, one of four things is usually true.

1. **Roughness is missing or misread.** glTF reads roughness from the green channel and
   metalness from the blue channel of one texture, both linear, and both factors default to 1
   [17]. A greyscale roughness image dropped into that slot therefore makes the bark metallic
   wherever it is rough, and metals reflect the sky in their own colour. Poly Haven's packed
   `arm` maps are already occlusion, roughness and metalness in red, green and blue.
2. **F0 or F90 is too high.** Some converters write a specular extension with a weight that
   also sets the grazing reflectance; others write none, leaving full grazing reflectance on
   every edge. At a grazing angle even a rough dielectric reflects strongly, and in a forest the
   thing it reflects is the bright sky.
3. **The sky probe is unoccluded.** The reflection a rough surface shows is a blurred sky. Under
   a canopy that sky is mostly leaves and shade, so a probe captured from the open sky is the
   wrong picture. Section 3.2's canopy factor fixes the reflection as well as the diffuse term.
4. **No specular occlusion.** Occlusion applied only to the diffuse ambient leaves the
   reflection lighting the crevices. Frostbite's empirical fix is
   `saturate(pow(NdotV + AO, exp2(-16 * roughness - 1)) - 1 + AO)`, which returns the occlusion
   unchanged on a fully rough surface and reduces it at normal incidence on glossy ones [16].
   Babylon's PBR material turns on radiance and horizon occlusion by default, but the first
   reads the material's occlusion texture and does nothing without one, and the second needs a
   normal map.

### 5.3 Wet bark

Rain is the one time bark should shine. Lagarde's wet-surface model darkens diffuse by a
porosity-dependent factor and raises gloss toward water's: `factor = lerp(1, 0.2, porosity)`,
`Diffuse *= lerp(1, factor, wet)`, `Gloss = lerp(1, Gloss, lerp(1, factor, 0.5 * wet))`, with
porosity estimated from gloss when no map exists [18]. Bark is porous, so it darkens a great deal
and gains only a little gloss; a wet trunk should read darker and richer, not mirrored.

## 6. Moss

### 6.1 Shading: moss is not a microfacet surface

Naughty Dog's account of Uncharted 4's moss is the most complete public one. Moss "doesn't
follow a standard microfacet brdf model. It's a lot more porous, with a massive amount of
self-shadowing, ambient occlusion, and transmitted light", lighter at the tips than at the base,
and strongly dependent on view angle. A plain microfacet result "looks like hard plastic by
comparison". Their shader layered, in order: a microfacet base; sheen, which "helps a little,
but not nearly enough"; light wrap with a green tint that ignores the normal map; a fuzz or
microfiber lobe with its own colour; parallax shadows where affordable; very dark occlusion that
fades to white at grazing angles, with sun micro shadowing; and a little colour added back where
the occlusion is darkest, standing in for bounce and subsurface light [9].

The lighter versions:

- Unreal's FuzzyShading function "emulates a surface similar to velvet or moss", darkening
  where the normal faces the camera (CoreDarkness, default 0.8) and brightening toward the edges,
  with a falloff Power of 6 [19].
- The Imageworks "Charlie" sheen distribution, designed to be cheap and production friendly [20],
  is the one behind glTF's sheen extension and Babylon's PBR sheen, which the Babylon docs call
  "only useful on rough dielectrics" [21]. Moss is exactly that.
- In a stock forward material, a wrap of 0.3 to 0.5 with a green tint on the moss layer only,
  plus an edge brightening term, gets most of the way for the cost of a few instructions.

### 6.2 Where moss grows: the mask

Moss is a second material blended over bark by a mask. The mask is what makes it look grown
rather than painted. Built from cheap terms, multiplied:

- **Facing.** `saturate(dot(N, D) * k + b)`, where `D` is the wet direction: straight up for
  moss on the tops of limbs and logs, a fixed horizontal direction for the side of trunks that
  faces the prevailing rain. Use the pixel's normal from the bark's normal map, not the vertex
  normal, or the mask follows the mesh's facets.
- **Height band.** Heaviest from the root flare to a few metres up, where the trunk stays damp,
  fading out higher unless the climate is wet enough to moss the whole tree.
- **Per-tree variation.** A per-instance random value shifts the band and the threshold, so
  neighbours differ; older and larger trees get more.
- **Detail.** A tiling noise or the moss texture's own height map breaks the edge, and the bark
  height map pushes moss into crevices first, so it reads as filling the bark rather than lying
  on it.

Unreal's World Aligned Blend material function is the stock version of the facing term. The
moss's own textures are the second layer: an albedo, normal and roughness set like the bark's,
sampled triplanar or on the trunk's UVs.

### 6.3 Moss with a silhouette

A shader layer changes colour, not outline. What sells an old-growth forest from a distance is
moss and lichen that hang: sleeves on lower limbs, beards from branches, ferns growing out of
the moss on a limb. These are cards, a few dozen per tree on the near level of detail, sharing
the foliage's transmission shading. In a temperate rain forest the sleeves are heaviest on
broadleaf trees and low limbs, and much thinner on the upper trunks of tall conifers; the
vegetation doc linked above has the ecology.

## 7. Textures you can ship in an open-source game

A game whose repository is public ships its textures as files anyone can copy, so the licence
has to allow raw redistribution. CC0 does. Poly Haven's assets are "all licensed as CC0", and
"You can redistribute them" [22]; ambientCG's are CC0 and "You can include the raw files in your
project, for example a video game" [23]; cgbookcase publishes its textures as CC0 as well [24].
Scanned libraries sold or given away under store licences generally allow use inside a shipped
game, not loose files in a public repository; read the licence before committing one.

Bark and moss candidates, all CC0, all with colour, normal, roughness, occlusion and height
maps (sizes are the real-world area each texture covers):

| Texture | Covers | Up to | Reads as |
|---|---|---|---|
| [Poly Haven Pine Bark](https://polyhaven.com/a/pine_bark) | 2 × 2 m | 8K | deep fissures and reddish plates: old pine, mature Douglas fir |
| [Poly Haven Metasequoia Bark](https://polyhaven.com/a/metasequoia_bark) | 1.94 × 1.94 m | 8K | long fibrous ridges with lichen: cedar and redwood types |
| [Poly Haven Japanese Cedar Bark](https://polyhaven.com/a/japanese_cedar_bark) | 1 × 2 m | 16K | dark fibrous strips: western red cedar |
| [Poly Haven Tree Bark 03](https://polyhaven.com/a/tree_bark_03) | 1 × 1 m | 8K | grey fissured bark with moss patches |
| [ambientCG Bark 014](https://ambientcg.com/view?id=Bark014) | 1.2 × 1.2 m | 8K | tagged fir; tan furrowed bark |
| [ambientCG Bark 011](https://ambientcg.com/view?id=Bark011) | | 8K | grey bark with green moss: smooth hardwoods such as alder |
| [ambientCG Bark 013](https://ambientcg.com/view?id=Bark013) | | 8K | bark heavily mossed |
| [cgbookcase Mossy Bark 02](https://www.cgbookcase.com/textures/mossy-bark-02) | | 4K | mossed bark; normal map is DirectX, so flip green for glTF |
| [Poly Haven Mossy Rock](https://polyhaven.com/a/mossy_rock) | 3 × 3 m | 8K | a moss layer to blend over any bark |
| [ambientCG Moss 002](https://ambientcg.com/view?id=Moss002) | | 8K | a moss layer |

No CC0 scan found was labelled as Douglas fir, Sitka spruce or red alder by name; the matches
above are by eye. Poly Haven's normal maps come in both OpenGL and DirectX conventions, and glTF
wants OpenGL's.

## 8. An order of work on a browser budget

From cheapest and broadest to most expensive, each step judged before the next:

1. **Audit the bark materials.** Roughness present and in the green channel, metalness zero,
   F0 near 0.04 and F90 sane, texture transforms not squeezing the trunk into a strip.
   No frame cost.
2. **Occlude the sky under the canopy.** Scale diffuse ambient and reflection by a canopy
   visibility term from data the world already has. A texture fetch per pixel at most.
3. **Light the foliage properly.** Wrap and back-light on the sun (check which light that is),
   and remove duplicate darkening. A few instructions in materials already drawn.
4. **New bark.** One tiling 2K KTX2 set per bark type, 1K on lower tiers, with a unique base
   texture for the largest trees if close inspection matters. Memory, not frame time.
5. **Moss.** A mask and a second texture set in the bark material, with wrap and sheen on the
   moss layer. A handful of texture fetches on trunk pixels only.
6. **Softer shadows.** PCSS on the near cascade of the top tier, a wider PCF on far cascades,
   small plants out of the casters. Measure: this is the step most likely to cost milliseconds.
7. **Hanging moss cards.** Draw calls and overdraw on the near level of detail only.

Lowering the shadow darkness belongs nowhere on the list for clear weather. If the shade is too
dark after steps 2 and 3, a term is missing or duplicated.

## Sources

1. Epic Games, "Shading Models in Unreal Engine," Unreal Engine Documentation. Accessed: Oct. 13, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/shading-models-in-unreal-engine
2. Epic Games, "Directional Lights in Unreal Engine," Unreal Engine Documentation. Accessed: Oct. 13, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/directional-lights-in-unreal-engine
3. Unity Technologies, "Light component reference," High Definition Render Pipeline 17.0 Manual. Accessed: Oct. 13, 2026. [Online]. Available: https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/Light-Component.html
4. Babylon.js Authors, "shadowsFragmentFunctions.js," @babylonjs/core 9.18.0, unpkg. Accessed: Oct. 13, 2026. [Online]. Available: https://unpkg.com/@babylonjs/core@9.18.0/Shaders/ShadersInclude/shadowsFragmentFunctions.js
5. Babylon.js Authors, "Shadows," Babylon.js Documentation. Accessed: Oct. 13, 2026. [Online]. Available: https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows
6. Babylon.js Authors, "Cascaded Shadow Maps," Babylon.js Documentation. Accessed: Oct. 13, 2026. [Online]. Available: https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows_csm
7. J. Heijmans, "Book of the Dead: Quixel, Wind, Scene Building and Content Optimization Tricks," Unity Blog, Jun. 29, 2018. Accessed: Oct. 13, 2026. [Online]. Available: https://unity.com/blog/industry/book-of-the-dead-quixel-wind-scene-building-and-content-optimization-tricks
8. S. McAuley, "Rendering the World of Far Cry 4," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2015. Accessed: Oct. 13, 2026. [Online]. Available: https://media.gdcvault.com/gdc2015/presentations/McAuley_Stephen_Rendering_the_World.pdf
9. W. Brinck and A. Maximov, "The Technical Art of Uncharted 4," presented at SIGGRAPH 2016, Anaheim, CA, USA, Jul. 27, 2016. Accessed: Oct. 13, 2026. [Online]. Available: https://advances.realtimerendering.com/other/2016/naughty_dog/NaughtyDog_TechArt_Final.pdf
10. J. Jimenez, X. Wu, A. Pesce, and A. Jarabo, "Practical Realtime Strategies for Accurate Indirect Occlusion," Activision, Tech. Rep. ATVI-TR-16-01, 2016. Accessed: Oct. 13, 2026. [Online]. Available: https://research.activision.com/publications/archives/atvi-tr-16-01practical-realtime-strategies-for-accurate-indirect-occlusion
11. Z. Pavlov, "Book of the Dead: Photogrammetry Assets, Trees, VFX," Unity Blog, Jun. 15, 2018. Accessed: Oct. 13, 2026. [Online]. Available: https://unity.com/blog/industry/book-of-the-dead-photogrammetry-assets-trees-vfx
12. Unity Technologies, "Texel density solutions," SpeedTree Modeler Manual. Accessed: Oct. 13, 2026. [Online]. Available: https://docs.unity3d.com/speedtree-modeler/manual/texel-density-solutions.html
13. Khronos Group, "KTX Artist Guide," 3D Formats Guidelines, GitHub repository. Accessed: Oct. 13, 2026. [Online]. Available: https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md
14. Babylon.js Authors, "KTX2 Compressed Textures," Babylon.js Documentation. Accessed: Oct. 13, 2026. [Online]. Available: https://doc.babylonjs.com/features/featuresDeepDive/materials/using/ktx2Compression
15. S. Lagarde, "Feeding a physically based shading model," Aug. 17, 2011. Accessed: Oct. 13, 2026. [Online]. Available: https://seblagarde.wordpress.com/2011/08/17/feeding-a-physical-based-lighting-mode/
16. S. Lagarde and C. de Rousiers, "Moving Frostbite to Physically Based Rendering 3.0," course notes, SIGGRAPH 2014, Vancouver, BC, Canada, Aug. 2014. Accessed: Oct. 13, 2026. [Online]. Available: https://seblagarde.wordpress.com/wp-content/uploads/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
17. Khronos Group, "glTF 2.0 Specification," Khronos Registry. Accessed: Oct. 13, 2026. [Online]. Available: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
18. S. Lagarde, "Water drop 3b: Physically based wet surfaces," Apr. 14, 2013. Accessed: Oct. 13, 2026. [Online]. Available: https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/
19. Epic Games, "Shading Material Functions in Unreal Engine," Unreal Engine Documentation. Accessed: Oct. 13, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/shading-material-functions-in-unreal-engine
20. A. Conty Estevez and C. Kulla, "Production Friendly Microfacet Sheen BRDF," presented at SIGGRAPH 2017 course Physically Based Shading in Theory and Practice, Los Angeles, CA, USA, Jul. 2017. Accessed: Oct. 13, 2026. [Online]. Available: https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_sheen.pdf
21. Babylon.js Authors, "Master the PBR Material," Babylon.js Documentation. Accessed: Oct. 13, 2026. [Online]. Available: https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR
22. Poly Haven, "License," Poly Haven. Accessed: Oct. 13, 2026. [Online]. Available: https://polyhaven.com/license
23. ambientCG, "License," ambientCG Documentation. Accessed: Oct. 13, 2026. [Online]. Available: https://docs.ambientcg.com/license/
24. cgbookcase, "Bark textures," cgbookcase. Accessed: Oct. 13, 2026. [Online]. Available: https://www.cgbookcase.com/textures/?category=Bark
