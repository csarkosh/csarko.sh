---
description: A survey of how AAA games render rain, from streaks to wet ground, splashes, canopy drip and lens drops, and how to build it on a browser frame budget.
published: 2026-09-30
---
# Photorealistic rain for browser games

**Question:** How do AAA games simulate photorealistic rain, in all its parts: the falling
rain in the air, the wet world of darkened surfaces, puddles, splashes and canopy drip, and
the drops that run down the camera or the screen? What does real rain look and sound like,
with numbers? What does each technique cost per frame, on what hardware, in what year? And
what can a first-person browser game, running on WebGL2 and WebGPU at 60 Hz with a phone
tier, an integrated-GPU tier and a discrete-GPU tier, afford to build and in what order?
The question matters because the obvious approach, a particle emitter that follows the
camera, produces a rain source chasing the player rather than a world that is raining.

**Short answer:** rain is mostly not the streaks. Real rain at the rates a temperate coast
sees most days (a median of 0.8 mm/h while it rains, light rain below 2.5 mm/h) has a few
hundred drops of visible size per cubic metre, falling at 2 to 9 m/s, and a drop is only
resolvable as a streak within about 6 to 25 m of the eye; beyond that, rain is a steady
grey veil indistinguishable from fog. Against a bright overcast sky a drop is invisible,
because a drop is a lens that shows the sky; against dark trunks or in a headlamp it
glows. So the signal that "the world is raining" is carried by the veil, by every surface
turning darker and glossier, by ripples on every puddle, by drips off every edge, by the
sound, and by a few thousand streaks near the camera, not by a dense volume of particles.
Under an old-growth canopy the rain arrives late, about a third of it falls straight
through the gaps, the rest is stored (3.3 mm) for one to two hours and then drips in
drops three to five times the size of raindrops, and the dripping continues long after
the rain has stopped.

Shipped games converge on one answer for the air: a camera-locked volume in which every
streak that leaves one face reappears on the opposite face, so the volume is always full
at every height and there is no leading edge to outrun. Alan Wake 2 does it with 64,000
droplets in a compute shader; NVIDIA's 2007 sample did it with stream-out on a GeForce
8800 GTX, drawing a million stretched sprites at 126 fps; Remember Me did it with four
camera-attached cylinder layers at 1.7 ms on a PlayStation 3. The far field is fog whose
density follows the rain. Occlusion under roofs and canopy is a top-down depth map of the
world around the camera (256 by 256 texels over 20 m, 0.2 to 0.3 ms on 2006-era consoles),
read like a shadow map. Wet surfaces follow Lagarde's rules: darken the diffuse by a
porosity-driven factor, push gloss toward 1, flatten the normal where water pools, and
animate puddle ripples from a 256-texel ring texture at 0.14 ms. Drops on the lens are
either camera-locked sprites on the near plane (0.32 ms on PlayStation 3) or a per-pixel
procedural pass like Heartfelt, gated by whether the camera looks up or stands under
cover. Remember Me's whole rain stack, every layer included, cost 2.8 ms at 720p in 2013.

A browser can run all of it. The cheap primitive is not an engine particle system but a
static buffer of per-drop seeds whose positions are computed in the vertex shader from a
time uniform and wrapped inside the camera volume, so the CPU does nothing per frame and
one code path serves WebGL2 and WebGPU. Fill rate, not update, is the limit: an Intel UHD
620 sustains about 100,000 textured 5-pixel quads at 60 fps in WebGL, and a few thousand
streaks of 2 by 30 pixels are a tenth of that. Our estimate for the whole stack, from the
numbers cited below, is under 1 ms on a phone tier (streaks, veil, wet materials, ripples
and a texture-based lens pass), about 1.8 ms on an integrated GPU (adding the occlusion
map, splashes, drip and streak lighting) and about 2.5 ms on a discrete GPU (adding
procedural lens drops and more streaks). Nobody has published a frame time for rain in a
browser on named hardware; those estimates are scaled from console and desktop figures and
from the one browser particle study that used GPU timer queries.

The questions came from Day Hike, a first-person co-op hiking game in Babylon.js 9.18 set
on a coast and forest like Washington's Olympic Peninsula, whose rain today is a particle
box that follows the camera. It is public at [game-dayhike](https://github.com/csarkosh/game-dayhike)
and playable at [games.csarko.sh/dayhike](https://games.csarko.sh/dayhike/); its
renderer's two paths are described in
[WebGPU and WebGL2: what changes and what does not](/research/webgpu-vs-webgl2), its
post-processing in [Atmosphere and dread shaders](/research/atmosphere-and-dread-shaders),
and its water in
[Photorealistic water rendering: lakes and oceans](/research/photorealistic-water-rendering).
Numbers given without a source are our own arithmetic from the sources beside them: the
Marshall-Palmer drop-size distribution, the Gunn-Kinzer fall speeds, the Koschmieder
visibility law, and the published frame-time tables.

## 1. What real rain looks and sounds like

### 1.1 Drops: sizes, counts and rates

Rain is drops of 0.5 mm and larger; drizzle is drops smaller than 0.5 mm, "very close
together", that appear to float on air currents [1]. Operational observers grade rain
by rate: light up to 0.10 in/h (2.5 mm/h), moderate 0.11 to 0.30 in/h (2.8 to 7.6 mm/h),
heavy above 0.30 in/h (7.6 mm/h) [1]. The same handbook grades it by eye: in light
rain "individual drops are easily seen"; in moderate rain "individual drops are not
clearly identifiable; spray is observable just above pavements"; in heavy rain "rain
seemingly falls in sheets" with "heavy spray to height of several inches" over hard
surfaces [1]. Drizzle is graded by visibility instead, and does not ripple a puddle
[1], [2].

Most rain is light. A NASA survey of 133,000 one-minute disdrometer samples across
climates found rates from 0.01 mm/h to just over 300 mm/h, with a median of about
0.8 mm/h while it is raining, and rates above 10 mm/h "not nearly as frequent or long
lasting" [3]. Drop sizes run from 0.5 mm to just under 10 mm; drops above 1 mm
flatten into oblate spheroids [3]. The mass-weighted mean diameter is 0.9 mm in
light rain, 1.1 mm in moderate and 1.6 mm in heavy, and the measured total concentration
is tens of drops per cubic metre in light rain (median 57), hundreds in moderate (328) and
about a thousand in heavy (869) [3].

The classical model is the Marshall-Palmer exponential, which Garg and Nayar write as
N(a) = 8 × 10^6 exp(−8200 h^−0.21 a) drops per cubic metre per metre of radius, with a the
drop radius in metres and h the rain rate in mm/h; they add that "the drops that make up a
significant fraction of rain are less than 1 mm in size" [4]. Integrating that
distribution gives the counts in the table below, which are our arithmetic. The all-sizes
column is dominated by sub-0.5 mm drops that the 1948 fit extrapolates rather than
measured, and over-counts them; the column for drops of 0.5 mm and above agrees with the
NASA measurements and is the one to use for rendering. The flux column integrates the same
distribution against the fall-speed fit of the next section.

| Rate | Class | Drops per m³, all sizes | Drops per m³ at or above 0.5 mm | Drops per m³ at or above 1 mm | Drops per m² per second at or above 0.5 mm |
|---|---|---|---|---|---|
| 1 mm/h | light | 1,950 | 250 | 32 | 760 |
| 2.5 mm/h | light to moderate | 2,370 | 440 | 80 | about 1,300 |
| 5 mm/h | moderate | 2,740 | 630 | 150 | 2,100 |
| 10 mm/h | heavy | 3,170 | 890 | 250 | 3,100 |
| 25 mm/h | heavy | 3,840 | 1,350 | 480 | 5,100 |
| 100 mm/h | downpour | 5,130 | 2,350 | 1,080 | 9,800 |

Two things follow for a renderer. First, even heavy rain is only a few hundred visible
drops per cubic metre; a 30 m box around a camera holds millions of them, and no game
draws that many (section 3.7). Second, the flux onto the ground, hundreds to thousands of
impacts per square metre per second, is why every puddle in rain is continuously rippled
and why a hard surface in moderate rain carries a visible layer of spray.

### 1.2 How fast it falls and how far it leans

Gunn and Kinzer's 1949 measurements of terminal speed at sea level, as reproduced in a
secondary table we were able to open, give 2.06 m/s for a 0.5 mm drop, 4.03 m/s at 1 mm,
6.49 m/s at 2 mm, 8.06 m/s at 3 mm, 8.83 m/s at 4 mm, and a plateau of 9.1 to 9.2 m/s
from 5 mm up [5]. The radar community's analytic fit, quoted in the NASA taxonomy, is
v = 9.65 − 10.3 exp(−0.6 D) m/s with D in millimetres [3]. Garg and Nayar use the
simpler v = 200 √a with a in metres, which gives 4.5 m/s for a 1 mm drop [4]. A
single rain therefore has a spread of fall speeds from 2 to 9 m/s; the common game value
of one speed for every streak is wrong by a factor of four across the population.

Wind slants the drops by θ = arctan(u / v_t), u the horizontal wind and v_t the terminal
speed [6]. In a two-year field data set the mean wind during rain was 3.0 to
3.2 m/s with maxima of 10.5 to 12.5 m/s [7]; ten of 33 storms at Urbana had
inclinations of 55° or more, and in a South African record 54 percent of rain fell at
angles above 25° [6]. Our arithmetic from the Gunn-Kinzer speeds: in a 3 m/s wind
a 0.5 mm drizzle drop leans 56°, a 1 mm drop 37°, a 2 mm drop 25° and a 4 mm drop 19°; in
a 5 m/s wind those become 68°, 51°, 38° and 30°. The slant is therefore not one angle but
a fan, steepest for the biggest drops. Drops follow gusts with a lag τ = v_t / g, which is
0.8 s for a 3 mm drop [8] and, by the same formula, 0.2 s for a 0.5 mm drop and
0.4 s for a 1 mm drop; in gusty wind the fine rain swings first and the big drops lag.
Turbulence also slows the mean fall of 3 mm drops by up to about 10 percent [8].

### 1.3 Streaks, the rain-visible region, and why far rain is a veil

A falling drop is not seen as a drop. Garg and Nayar showed that a drop crosses a pixel in
less than 1.18 ms while a video camera integrates about 30 ms, so the drop becomes a
faint streak whose brightness increment is a small fraction (their measured slope β lies
between 0 and 0.039 per unit of background) of the drop's own brightness [4]. The
visibility of rain rises as the square of drop size, falls linearly with the brightness
of the background, and falls as 1/√T with exposure time [9], [4]. The human eye
integrates in the same way: under about 100 ms, light and duration trade off (Bloch's
law) [10], and the resolution limit of the eye is about one arc minute [11].

The streak's length is the fall speed times the integration time. Our arithmetic from the
Gunn-Kinzer speeds: at a 60 Hz frame (16.7 ms) a 1 mm drop makes a 6.7 cm streak and a
2 mm drop 10.8 cm; at 30 ms they are 13.4 and 21.6 cm. Streak width is a few pixels, so
"the intensity variation across a rain streak is not significant and can be neglected"
[9].

The decisive result is the rain-visible region. Drops closer than z_m = 2 f a (f the focal
length in pixels, a the drop radius) project larger than a pixel; beyond that the streak
contrast falls as 1/z, and beyond about R z_m, with R ≈ 3 for the camera they tested, the
drop is undetectable: "the visual effects of rain are only due to raindrops that lie close
to the camera (z < R z_m) which we refer to as the rain visible region" [9]. For a 10°
field of view (f ≈ 4,000 px) and 1 mm drops that region is about 24 m; drops beyond it
"only produce aggregate scattering effects similar to fog, no dynamic effects are visible"
[9]. Our arithmetic for a game camera at 1920 px wide: a 90° field of view has
f ≈ 960 px, z_m ≈ 1.9 m and a visible region of about 6 m; a 60° field has f ≈ 1,663 px
and a region of about 10 m. Treating the eye as a camera with one-arc-minute pixels gives
z_m ≈ 7 m and a region of order 20 m. The constant R was fitted for one camera, so these
are orders of magnitude, but the conclusion holds: individual streaks belong within about
6 to 20 m of the viewer, and rain further away is physically a veil, a steady added
radiance plus extinction, which is the fog model [4].

### 1.4 Why a drop is bright, and when it vanishes

A raindrop is a lens with a field of view of about 165°, like a fish-eye; it refracts
light from that whole solid angle toward the viewer, attenuated by only 6 percent, with
specular and internal reflection adding at the rim, so "a drop tends to be much brighter
than its background" and its brightness "does not depend strongly on its background"
[4]. Their photographs under an overcast sky with a striped backdrop show drop peaks
"approximately the same even though the background intensities are very different"
[4]. The streak signal is proportional to the difference between the drop's radiance
and the background's [9]. So against the overcast sky that lit the drop the
difference is near zero and the streak vanishes; against a dark conifer wall it is large
and the streak reads; and a point light near the eye dominates the drop's radiance, which
is why rain in a headlamp beam at night is vivid and why Garg and Nayar's streak database
includes a point source at 1 m [12].

Drops also oscillate as they fall, mainly in two modes, an oblate-prolate mode and a
transverse mode with roughly twice its frequency, and "the brightness pattern of a rain
streak typically includes speckles, multiple smeared highlights and curved brightness
contours"; a spherical drop "is simply not adequate when rendering close-by rain streaks"
[12]. Our arithmetic from their mode formula with water's surface tension gives the
lowest mode at 344 Hz for a 1 mm drop and 121 Hz for a 2 mm drop, so a 2 mm drop's 30 ms
streak carries about four bright-dark speckles along its length.

Games have known for twenty years that physically correct rain reads as too little.
Tatarchuk's ToyShop notes record that "realistic rain is very faint in bright regions of
the scene and tends to appear stronger when light falls in a dark area; if this is
modeled exactly, the rain appears too faint", and so they borrowed the film crew's trick of
adding milk to the rain water, "by biasing rain color and opacity to appear whiter"
[13]. Lagarde's reference notes say the same thing from the other side:
"rain drop are often difficult to see but are highly visible when reflecting light"
[14].

### 1.5 Visibility, mist and fog

Rain alone does not cut visibility much. Extinction by rain follows σ = a R^b with Atlas's
1953 coefficients a from 0.15 to 0.38 per km and b from 0.55 to 0.70 for stratiform rain,
and a 2025 field study in Mexico fitted σ = 0.11 R^0.88 and 0.12 R^0.81, with the
meteorological optical range falling below 1 km only above 60 mm/h [15]. NASA's
taxonomy puts visibility above 9.6 km in light rain, between 2.6 and 9.6 km in moderate
rain, and at or below 2.6 km in heavy rain [3]. Our arithmetic with σ = 0.25 R^0.63
and the Koschmieder range 3/σ: 12 km at 1 mm/h, 4.3 km at 5 mm/h, 2.8 km at 10 mm/h,
1.6 km at 25 mm/h and 1.0 km at 50 mm/h, in agreement with the NASA class boundaries.

The whiteout a walker experiences in rain comes from the accompanying cloud. Fog reduces
visibility below 5/8 of a statute mile (1 km) and mist to between 5/8 and 7 miles [1];
precipitation fog "forms when rain is falling through cold air" [16]. The contrast of
every object then decays as exp(−σ x) toward the sky's luminance, which under overcast is
a bright neutral grey [15]. A renderer should therefore couple the rain to a separate,
stronger mist extinction (σ of 3 to 10 per km for visibilities of 1 km down to 300 m, our
arithmetic) rather than scale fog from the rain rate alone. Rain also puts a glow around
lights: "multiple scattering effects are responsible for the appearance of glow around
light sources in stormy weather" [17].

### 1.6 A temperate rainforest's rain

The Olympic Peninsula is the wettest place in the contiguous United States and the model
for the kind of coast and forest this survey has in mind. The Hoh valley receives 135 in
(343 cm) a year by one National Park Service page [18], 140 in by another [19]
and 140 to 167 in by a third [20]; fog adds more than 30 in of water a year
[18]. The nearest long-record station, Forks, averages 119.94 in (3,046 mm) on 215.1
days a year in the 1991 to 2020 normals, with 23.0 rain days and 19.10 in in January and
10.2 rain days and 2.05 in in July [21]. Nearby Quillayute sees 48 hours of sunshine
in December [22]. Our arithmetic from the Forks normals: 14 mm per rain day over
the year and 21 mm per rain day in January; spread over 8 to 16 hours of rain that is 1.3
to 2.6 mm/h, the "light" class, with about 60 days a year of under 2.5 mm that are drizzle.
A comparable old-growth site in the southern Washington Cascades (2,467 mm a year, less
than 10 percent of it from June to September) records events of 31 hours and 53 mm at
"relatively low rainfall intensity, low net radiation and wind speeds" and 70 hours and
77 mm with "several brief pulses of intense rainfall" [23]. The default sky is a
bright, low, featureless overcast, which is exactly the background against which streaks
are invisible. The visible rain in such a forest is the rain seen against trunks and dark
foliage, the drips, the splashes and the wet.

### 1.7 Under the canopy: interception, delay and drip

The most complete measurements of rain under an old-growth Pacific Northwest canopy come
from the Wind River crane site: a 500-year-old Douglas-fir, western hemlock and western
redcedar canopy about 60 m tall with a leaf area index of 8.6 and about 1.3 tonnes per
hectare of lichen in the upper canopy and a similar mass of bryophytes below [23].
There, 22.8 and 25.0 percent of annual rain never reached the ground in the two years
measured; the direct throughfall fraction, rain falling through gaps untouched, averaged
0.36 (ranging 0.03 to 0.85 between events, with 70 percent of values between 0.20 and
0.50); and the canopy stored 3.3 mm (2.7 to 4.3 mm, and 4.1 mm in summer) before it
dripped [23]. The consequence is "the typical time lag of 1-2 h between significant
cumulative" gross rain and net rain under the trees, "associated with wetting up of the
canopy" [23]. Of the water lost, 47 percent evaporated from the canopy after rain
stopped, 33 percent during rain; evaporation from a saturated canopy ran at 0.14 mm/h
[23]. Stemflow is only about 0.3 percent of rain [23]. Once the canopy is
saturated, throughfall is patchy: 23 percent of 237 gauges recorded as much as or more
than the open-sky rain [23].

Canopy drips are not raindrops. The median drop from Japanese beech foliage is 5.2 mm and
from cypress 4.7 mm; drops above 3 mm need about 12 m of fall to reach terminal speed, and
with branches at about 8 to 9 m "most canopy drips did not reach the terminal velocity";
a single drip point received 11.4 times the throughfall of ordinary under-canopy spots and
8.1 times the open rain, and the kinetic energy per millimetre was 39.2 J/m² at a drip
point, 22.0 under the canopy generally and 4.5 in the open [24]. By the Gunn-Kinzer
curve a 5 mm drop falling 8 to 9 m arrives at roughly 6 to 8 m/s, our arithmetic. So a
walker under old growth sees rain arrive in two populations: a third of the drops falling
straight through the gaps, and, after one to two hours, big slow drops clustered under
drip points, continuing for an hour or more after the sky clears. Woody drip points, "such
as irregular rough points and branch concavities", shed larger drops than leaves [24].

### 1.8 The sound

Rain's sound is impact sound on whatever the drops hit. Underwater acoustics, used as a
rain gauge, separates the drop sizes cleanly: the smallest raindrops (0.8 to 1.2 mm) are
"remarkably loud" from 13 to 25 kHz because each splash entrains a microbubble that rings;
medium drops (1.2 to 2.0 mm) are nearly silent; large drops (2.0 to 3.5 mm and above) are
loud below 10 kHz; and wind above 5 m/s suppresses the small-drop signal by a factor of
three [25]. So the timbre of rain on water shifts from a high hiss to a low roar as
the rain gets heavier, and wind dulls it. In air, the standard laboratory rain for roof
noise is "intense" at 15 mm/h with 2 mm drops at 4 m/s and "heavy" at 40 mm/h with 5 mm
drops at 7 m/s, measured in third-octave bands from 100 Hz to 5 kHz; lightweight roofs
under the heavy rain radiate about 55 to 69 dBA, and lighter rain is often too quiet to
measure [26]. Short-term intensity varies even at a constant rate "because the larger
drops will fall fastest", and in temperate climates drops above 5 to 6 mm break up [26].

Under a canopy the continuous hiss comes from 40 to 60 m overhead, filtered by foliage,
while the near field is a sparse train of 4 to 5 mm drips each carrying five to nine
times the per-millimetre energy of open rain [24]: loud, discrete plops on leaves,
puddles and a hood rather than a hiss. On a jacket the walker hears only the drops that
hit them: in open light rain that is on the order of 750 impacts per square metre per
second (table above); under the canopy, occasional heavy taps.

## 2. What makes a player believe the world is raining

### 2.1 The cues

No perception study lists the cues directly; they fall out of the physics above and from
the inventories kept by people who built production rain. Tatarchuk's list for ToyShop is
the fullest: "strong rainfall; falling raindrops dripping off objects' surfaces; raindrop
splashes and splatters; various reflections in surface materials and puddles; misty halos
around bright lights and objects due to light scattering and rain precipitation; water,
streaming off objects and on the streets; atmospheric light attenuation; water ripples
and puddles on the streets" [17]. Lagarde's observation notes, written from
reference video before Remember Me's rain was built, add that "under strong rain, there is
atmospheric scattering modification (fog) and light through rain produce a misty glow
effect", that lit splashes at night are far more visible than by day because of
backlighting, and that "the long streak is cause by motion blurring of the camera or our
eye" [14].

Put together with section 1, a global rain, as opposed to a local shower, is carried by
six things. The sky: a uniform bright overcast with no visible cloud edge. The far field:
a distance-graded grey veil whose density matches the near-field rain plus mist, with no
rain-free patches on distant slopes. The near field: streaks only within about 6 to 20 m,
only against dark backdrops, slanted by the same wind that moves the trees, in a fan of
angles rather than one. The surfaces: everything wet-dark with sky reflections, puddles
rippled by hundreds of impacts per square metre per second, spray on rock, water streaming
off edges. The sound: a continuous, directionless hiss everywhere, its timbre set by what
is underfoot, plus discrete drips under cover. And persistence: a canopy that is still
dripping when the walker steps under it, and still dripping after the rain has paused.

Because the common case is light rain (mean drop 0.9 mm, about 250 visible drops per
cubic metre), the streak field is sparse and faint, and most of the "it is raining" signal
is in the veil, the wetness, the ripples and the sound. That ordering is the single most
useful fact for a budget: spend on fog, wet-surface response, ripples and drip before
spending on particle count.

### 2.2 The failure mode of an emitter that follows the camera

The naive rain system is a particle emitter parented to the camera: a box some metres
above the player that emits streaks at its top face and lets them fall and die. Tatarchuk
dismissed this in 2006 as what games then did, "simple alpha-blended particle systems for
rain which follow the camera, doesn't look very realistic", that "does not respond to
dynamic lighting" and "requires too many particles for a feeling of strong rainfall"
[13]. NVIDIA's sample, which does follow the camera, states the limitation
plainly: where "the character can move quickly to very different parts of the scene ...
the particle system might take some time to catch up to the camera" [27].

The arithmetic of why is simple. If the emitter plane is 15 m above the eye and the
streaks fall at 11 m/s, a streak takes 1.4 s to reach eye height. A player walking at
5 m/s covers 7 m in that time and one sprinting at 7 m/s covers 10 m. With a box 30 m
across, the rain at eye height therefore begins only 5 to 8 m ahead of a moving player
while trailing 22 to 25 m behind, and when the player stops the rain visibly "catches up"
over about 1.4 s. When rain starts, nothing reaches eye height for 1.4 s. Beyond the box
there is no rain at all, so distant slopes stay dry and the far-field veil is missing.
Any roof or canopy is ignored, so it rains indoors. And the density is thin: 2,000
streaks in a 30 by 30 by 24 m volume is 0.09 per cubic metre against the hundreds per
cubic metre of real rain. The combined read is a rain source chasing the player. None of
these are count problems; they are placement and recycling problems, and section 3.2
shows how shipped games removed them by construction.

## 3. How shipped games draw the falling rain

### 3.1 Two families

NVIDIA's white paper states the taxonomy: "rain is traditionally rendered in one of two
ways; either as a particle system or as camera-centered geometry with scrolling textures"
[27]. The geometry family began with Wang and Wade's 2004 double cone, "several
interpolated hand-drawn textures with constant brightness mapped on a double-cone which is
dynamically aligned to match the camera orientation" [13]; Flight Simulator
2004 used it, and BioShock used cylinder meshes for dripping water [28]. ATI's
ToyShop demo took it to the screen: "a hybrid system: an image-space approach for the
rainfall and a particle-based effects for dripping raindrops and splashes", where the
rainfall is "rendered as a full-screen quad over the scene" and "every pixel on the screen
goes through the rain shader" [13]. One texture fetch from an animated 8-bit
"rainfall position placement texture", with an artist parallax parameter used as the
projective w of the read, fakes several depth layers falling at different speeds in a
single pass; rain direction and speed are set in world space and moved into clip space;
mistiness is a post-process blur of the rain layer; and the layer "does not incur extra
performance overhead for modeling heavy versus light rain, unlike purely particle-based
approaches" [13].

Remember Me (Dontnod, 2013) chose the geometry family for the same reason: "the main
downside of particles system is the lack of scalability; stronger precipitation requires
increasing the number of particles lowering the framerate" [29]. Its rain is a
texture "mapped on a mi-cylinder mi-cone mesh link to the camera and positioned at the
camera origin", rendered from inside, in four layers "each representing an area in front
of the camera", each translating and non-uniformly scaling the same "pre-motion blurred
raindrops texture" at a different speed and size, the far layer using a bigger scale
factor; within each layer a height map gives each drop a depth inside its slab, and the
cone is tilted "to adjust for camera movement" so the rain falls toward the camera as it
moves [29], [28]. NVIDIA's judgement of the geometry family is fair: "these
methods are fast but the results can look like they lack depth. It is also hard for these
methods to exhibit complex dynamics like stormy wind, or respond to local lighting like
street lights in the scene" [27]. Microsoft Research's 2006 system chose particles
over "a single layer of rain" precisely to get parallax, and because particles are
"automatically clipped by the rendering engine at the scene surface", which "gives a
volumetric appearance of rain" [30]. The R4 system of 2013 ran its particle
simulation "entirely in the graphics hardware", checking collisions with the scene, and
rendered streaks from precomputed images "to achieve complex illumination effects" with
"fog, halos and light glows" as hints of the medium [31].

The polished systems layer the two: near particles for parallax and light response, a far
sheet or fog for coverage. Every shipped particle example found stretches a sprite along
velocity; none uses line primitives.

### 3.2 The camera-locked wrapped volume

The shipped answer to the chasing emitter is that particles never die by falling out of
range. Alan Wake 2 (Remedy, 2023) runs "over 128000 particles" of which 64,000 are
droplets, and "the rain renders only in front of the camera, droplets that move out of
camera bounds respawn instantly on the other side, making the most use out of 64000
droplet particles"; the system was written "entirely in HLSL compute shaders" as the
studio's first GPU particle system [32]. NVIDIA's 2007 sample animates its
particles in the vertex shader with stream-out between two vertex buffers, expands each
in the geometry shader to a quad, and "if the rain is to follow the character ... this
position is used to re-spawn any rain particles that have fallen out of bounds"; it starts
from a prepopulated vertex buffer so the volume is full on the first frame [27]. The
stock Unity recipe parents a box emitter to the camera, keeps the simulation in world
space "so the system can follow the camera without existing particles moving with it",
emits 2,500 a second with a cap of 10,000, and renders stretched billboards [33];
the stock Unreal recipe attaches the rain actor to the player on first enabling and tunes
the box radius per game [34].

With wrapping, the box is always full at every height, so a sprinting player never sees a
dry leading edge regardless of fall time, and the 1.4 s latency of a top-plane emitter
does not exist. Biasing the box toward the view direction, as Alan Wake 2 does, halves the
particles wasted behind the player. No source offsets the box along the player's velocity;
with wrapping it is unnecessary.

### 3.3 Streak length and frame time

The streak is a motion blur, so its length belongs to the exposure, and shipped systems
treat the frame as the shutter. Microsoft's system estimates "the length of the matte
shape ... based on the particle's current velocity and the exposure time of the virtual
camera" and stretches or shrinks the sprite to match [30]. Alan Wake 2 does the
inverse: "the rain slows down with lower framerate to preserve more or less the same
length of a raindrop, treating framerate as 'shutter speed' of a camera" [32]. At
60 Hz the physically motivated length for 1 to 2 mm drops is 7 to 11 cm (section 1.3); the
eye's own persistence on a sample-and-hold display adds to that, and games draw longer.

### 3.4 Far rain is fog

Every polished system covers the far field with fog, not particles, and the physics says
it should. Microsoft's team wrote: "Garg et al. analytically showed that rain strokes are
visible in the video only when they are close enough to the camera. When the rain strokes
are far away, it has the appearance of fog. Therefore, to add realism to the rain scene,
we also add homogenous fog", with alpha 1 − exp(−ε d) and ε between 1.35 and 1.8 in their
experiments [30]. NVIDIA's sample pairs its particles with an analytic single-scatter
fog model that "correctly renders the glows around light sources" [27]. Remember Me
desaturates its fog colour under rain with the rainfall density [35]. Nobody tries
to extend particles to the horizon.

### 3.5 Occlusion: keeping rain out from under roofs and canopy

Remember Me renders "a depth map from above looking down" into a 256 by 256 texture over a
20 m by 20 m orthographic frustum, cells of about 7.8 cm, and uses it twice: transferred
to the CPU to place splash particles where drops land, and read on the GPU so that, "just
like with a shadow map, one can project the virtual position of the raindrops and do a
depth comparison" and fade the streak layers under cover [29], [28]. The
occlusion test runs only on the first two cylinder layers at reduced resolution, and a
soft depth test can "progressively decrease the opacity of raindrops" [29]. The map
costs about 0.32 ms on PlayStation 3 and 0.20 ms on Xbox 360, and 0.036 ms to transfer on
PlayStation 3 [29].

Alan Wake 2 does the same at world scale: "rain occlusion is handled by a tiled world
height buffer, a texture containing quite detailed height data of the world that drives
rain's collision rendered in tiles, for performance's sake"; "every droplet can collide
with the ground and spawns a splash in that exact position"; and, the one shipped answer
on trees, "droplets do not collide with trees because ... trees move too much"
[32]. Remedy's engine article adds that GPU-driven rendering is "required, for
example, when rendering rain blocker objects to a dynamic mask that prevents rain from
appearing indoors or under cover" [36]. Assassin's Creed 4 reused its baked world
ambient-occlusion (sky occlusion) as rain occlusion at "no additional runtime cost"
[37]. Unreal's Niagara offers collision "with either line traces on the CPU or
depth buffer/distance field checks on the GPU" [38], and its community rain
recipe keeps the simulation on the CPU only because it wants collisions for splashes:
"if you don't need to have splashes it would be much faster to use GPU sim without a
collision module" [34]. The pattern is one map, read like a shadow map, sized to the
player's surroundings and refreshed as the player moves; dense canopy is either excluded
(Alan Wake 2) or must be drawn into the map from a static proxy, which no source
describes.

### 3.6 Lighting the streaks

Garg and Nayar built a database of rendered streaks, 3,150 images on the database page
(the paper says about 6,300), varying the light's elevation from −90° to 90° and azimuth
from 10° to 170° in 20° steps, the camera's elevation from 0° to 80°, with ten images per
configuration for the oscillation variation, as 16-bit monochrome images up to 32 by
1,050 pixels [39], [12]. The on-line part is cheap: "the distances from the source
and the camera, the size of the drop and the camera's exposure time produce simple
transformations to the streak appearance, that can be efficiently rendered on-line", so
only lighting direction, view direction and oscillation need the database [12].
NVIDIA's sample drops the view-elevation dimension and the negative light elevations,
keeps "over 300 textures" in a texture array ("an atlas or 3D texture would have resulted
in artifacts at edges, and slower access times"), and in the pixel shader picks the four
nearest by the eye and light vectors and lerps them; the demo lights rain and scene with
two point lights and one directional light [27]. ToyShop lights its sheet with a
normal map "of varied individual raindrop shapes", computing reflection and refraction
with Fresnel against the scene lights, attenuates opacity by distance, and fades by
Fresnel "to make the raindrop appear less solid and billboard-like"; its splashes are
"brightened backlit objects" when a light is behind them and ambient otherwise, under an
overhead lightmap standing in for sky and street lamps [13]. Microsoft's system
lights each stroke by precomputed radiance transfer of a spherical drop against the
environment map (16 spherical-harmonic coefficients, transfer vectors for 98,304 view
directions in 6 MB) and blends back 0.7 of the background: "the part of the environment
map corresponding to the viewing direction contributes the most to the radiance of the
raindrop" [30].

The cheapest cue is a headlamp. A point light near the eye dominates the drop's radiance
(section 1.4), so a streak shader that adds a term proportional to the lamp's intensity
over the squared lamp-to-streak distance, multiplied by the streak's distance fade, gives
the night look that NVIDIA gets from its two point lights, without the texture array.

### 3.7 Counts and costs

| System | Year | Falling rain | Count | Hardware, resolution | Cost |
|---|---|---|---|---|---|
| ATI ToyShop [13] | 2006 | full-screen rainfall layer; CPU particles for drips and splashes | 5,000 to 20,000 particles | Radeon X1900 XT, Pentium 4 3.2 GHz | composite rainfall 4.11 ms; raindrop particles 19.45 ms; splashes 20.01 ms; whole rain system 31.25 ms against 15.71 ms without rain; "limited by the CPU" |
| Microsoft Research [30] | 2006 | GPU particles with PRT lighting | 80,000 strokes, all visible | GeForce 7800 GT, 720 by 480 | 77 to 78 fps |
| NVIDIA SDK sample [27] | 2007 | stream-out particles, geometry-shader sprites, Garg textures | 200,000 to 5,000,000 | GeForce 8800 GTX, 1280 by 1024, 45° FOV | simulate: 574, 257, 67 fps at 0.2, 1, 5 million; simulate and draw: 545, 126, 26 fps |
| Remember Me [29], [35] | 2013 | four cylinder layers, top-down depth map | textures, not particles | PlayStation 3 and Xbox 360, 1280 by 720 | streak layers 1.69 ms (PS3) and 1.72 ms (360); depth map 0.32 and 0.20 ms; splashes 0.33 and 0.25 ms; whole rain stack about 2.8 ms against a 3 ms budget in a 33 ms frame |
| Assassin's Creed 4 [37] | 2014 | GPU particles, screen-space collision, bounced drops | up to 320,000 | console generation of 2013 | update under 0.1 ms; collision 0.2 ms; bounced drops under 0.05 ms; draw 0.4 to 4.0 ms |
| Alan Wake 2 [32] | 2023 | compute particles wrapped in front of the camera, tiled height buffer | 64,000 droplets of 128,000 | current consoles and PC | not published |

Two scalings from that table are our arithmetic. NVIDIA's million stretched sprites at
126 fps on an 8800 GTX is about 7.9 ms, and 200,000 at 545 fps about 1.8 ms including the
scene; a 2026 integrated GPU is many times an 8800 GTX, so a budget of 20,000 to 60,000
streaks at 60 Hz is within reach on the GPU side. The hazard is fill. GPU Gems 3 warns
that when particles fill the screen "overdraw can be almost unbounded and frame rate
problems are common, even in technically accomplished triple-A titles", and renders
expensive particles to a target "whose size is a fraction of the frame-buffer size": on an
8800 GTX at 1600 by 1200 a full-resolution case ran at 25 fps and the same at a quarter
resolution each way at 51 to 61 fps [40]. Remember Me's two near, occluded layers
at reduced resolution are the same idea applied to rain [29]. Assassin's Creed 4's
draw range of 0.4 to 4.0 ms for the same particle count says the same: the cost is how
much screen the streaks cover, not how many there are.

## 4. The wet world

### 4.1 Why wet is darker and glossier

Two mechanisms are agreed on from Ångström in 1925 through Lekner and Dorf in 1988 and
Jensen, Legakis and Dorsey in 1999. A water film on a rough surface lets light that the
substrate reflects diffusely strike the water-air interface beyond the critical angle
(48.75° for n = 1.33) and be totally internally reflected back for another round of
absorption; and water filling the pores lowers the relative refractive index of the
grains, which "increases the average degree of forwardness of scattering", so photons
scatter more times before escaping and are more likely absorbed [41],
[42]. Jensen's group modelled the beach scene by changing only the subsurface
phase function (from 0.1 to 0.8 for rock, 0.2 to 0.7 for sand) and concluded that
"subsurface scattering is the most significant reason why materials are darker when wet.
Water present on the surface of a material simply adds a 'glazed' appearance", mainly
visible at grazing angles [43]. Rough and powdered materials (sand, asphalt, clay)
darken; paper and cloth become more transparent, darker lit from the front and brighter
lit from behind [43]. Lagarde's material classes follow: brick, clay, plaster,
concrete, asphalt, wood, stone, sand, dirt, soil, fabric and fur darken; glass, marble,
plastic, metal and painted or polished surfaces barely change [44]. The darkened
colour also saturates, because the extra absorption removes more of the short
wavelengths [45].

The numbers: bare soil on a glacier moraine had an albedo 40 percent lower in the rainy
season than the dry season, 0.16 against 0.26, with an exponential dependence on surface
moisture [46]. Using the Lekner-Dorf model, worn asphalt of dry albedo 0.12 wets
to 0.08, a factor of 0.68; the factor approaches 0.2 for very porous materials, which is
why Lagarde uses 0.2 as full attenuation [47]. Quartz beach sand is the exception
that proves the rule: its wet-dry contrast is strong in the near infrared but "limited" in
the visible, and it took 25 hours to dry from saturation to air-dry in the laboratory
[48]. The darkening factor therefore scales with how dark and porous the dry
material already is: forest soil, duff and moss darken most, compact rock and pale sand
least, and a wet leaf cuticle does not darken but gains a glaze.

### 4.2 Lagarde's rules

Remember Me's wet-surface shading is the most completely published rule set, and most
later systems are variants of it. The first, empirical version: diffuse multiplied by
lerp(1.0, 0.3, WetLevel); gloss multiplied by lerp(1.0, 2.5, WetLevel) and clamped to 1;
and for pooled water, gloss lerped to 1.0, specular lerped to water's 0.02 and the normal
lerped to straight up by an AccumulatedWater term [35]. The physically based
version replaces the fixed 0.3 with a porosity-driven factor: `factor = lerp(1, 0.2,
Porosity)`, diffuse multiplied by lerp(1.0, factor, WetLevel), and gloss set to
lerp(1.0, Gloss, lerp(1, factor, 0.5 × WetLevel)), the 0.5 limiting the specular boost
empirically; with metalness, porosity is scaled by (1 − Metalness) [47]. Porosity
comes from a packed texture channel, or is derived from gloss as
saturate(((1 − Gloss) − 0.5) / 0.4), so anything glossier than 0.5 is treated as
non-porous [47]. The water layer's Fresnel is the full Fresnel at n = 1.33, about
2 percent at normal incidence [44], [14]. The method costs "only few extra
instructions (but this still two textures fetch for the blending)" [47].

Wetness itself is a per-vertex and per-pixel accumulation with four states, dry, wet,
drenched and puddle. The accumulated water is max(min(FloodLevel.x, 1 − Heightmap),
saturate((FloodLevel.y − VertexColor.g) / 0.4)): a global flood level above the pixel's
depth means under water, below it minus a 0.4 transition means dry, in between means
drenched, which gives "a slight smoothing of the normal and a slight boost in specular"
[35], [47]. Vertex colour channels mark puddle areas and depth, sheltered
areas that never wet, and where ripples are allowed; the height map's black marks where
water collects, so cracks fill before flats [35]. The progressive flattening of
the normal toward the vertex normal stands in for rising water depth: a film gives slight
smoothing, a puddle gives "perfect reflection coming from flat normal" [47].

### 4.3 Puddles: placement and reflection

Water collects "in low-depth areas: holes, cracks, and surface depressions"; "large
puddles on dark surfaces behave nearly like mirrors"; ripples appear only where enough
water has accumulated, and their number scales with rain intensity [14]. Shipped
placement is from height and masks. Forza Horizon 5 sweeps its live weather between a
minimum and a maximum road-wetness map derived from terrain and road height, "bottoms of
hills and dips in the road" collecting water, with the maximum carrying "a base wetness
value preventing dry patches during storms" and the swamp biome given extra [49];
Forza Horizon 4 grew and shrank its puddles with the seasons, autumn and spring bringing
"more puddles, sometimes ... standing water" that the cars drive through [50].
Assassin's Creed 4 stored "surface wetness ... in G-buffer", baked for wet areas or
"modified dynamically by weather", used in the lighting pass to "increase the gloss,
darken the albedo", and reflected its puddles with screen-space reflections [37].
Rise of the Tomb Raider limited screen-space reflections "to smooth surfaces; rougher
surfaces receive cubemap reflections only", sampling a downscaled HDR mip chain, and drew
water in truck tracks as transparent geometry in the alpha pass [51]. Watch Dogs
reflected its puddles, car bonnets and glass including flashing neon, let the detail
setting remove "puddles of reflective water", and paid about 5 fps between its High and
Medium reflection settings [52]. ToyShop reflected complex objects as billboard
impostors "dynamically stretched view-dependently" so the reflections read as blurry and
streaky, which also tamed specular aliasing, at 8.74 ms on a Radeon X1900 XT
[13]. The pattern is clear: with puddle normals flattened to the vertex normal,
the puddle pixels are exactly the smooth pixels where screen-space reflection pays, and a
cubemap stands in everywhere else.

### 4.4 Ripples

Three techniques have shipped. The cheapest is Lagarde's ring texture: a 256 by 256
texture whose red channel is the inverted normalised distance from a ring centre, green
and blue the direction from the centre, and alpha a random grey per ring plus a time
offset; the shader takes DropFrac = frac(Ripple.w + CurrentTime), TimeFrac = DropFrac −
1.0 + Ripple.x, DropFactor = saturate(0.2 + Weight × 0.8 − DropFrac), and returns a
normal offset of Ripple.yz × DropFactor × Ripple.x × sin(clamp(TimeFrac × 9.0, 0.0, 3.0)
× π) × 0.35; four layers at TimeMul (1.0, 0.85, 0.93, 1.13) and TimeAdd (0.0, 0.2, 0.45,
0.7), each at its own UV offset, are blended in one per quarter of rain intensity and
summed into the normal, for 0.14 ms on PlayStation 3 and 0.15 ms on Xbox 360
[35]. Assassin's Creed 4 instead spawns and ages ripples in a compute shader
(position, life, maximum life, strength, maximum radius), draws them into a 256 by 256
signed height field (R8 height, R8G8 derivatives) wrapped in world space, and perturbs
normals in one pass: "rain ripples update and texture generation cost about 0.2 ms" and
"perturbing normals can be a separate pass (about 0.4 ms) or combined with lighting
(pipelined well and 'free'!)" [37]. ToyShop simulated a thin elastic membrane on a
256 by 256 lattice, seeding drops stochastically as points "with the RGB value
proportional to the raindrop mass" because direct collision "would require too much
memory", two explicit Euler passes for stability and a Sobel pass for normals, one
simulation sampled by world position for every puddle with a per-object scale and
rotation to hide repetition, at 6.98 ms on the X1900 XT [13]. Community shaders
reproduce the ring-texture idea with a channel-packed ring mask eroded outward by
`mask − (1 − frac(time × speed))` and two networks cross-faded at a UV and time offset
[53], or procedurally with cells, per-cell time offsets and sin((d − t) × 30)
rings, masked to upward faces by a smoothstep on the world normal's Y [33].

At 60 Hz the ring texture is the one to start with: one fetch per layer, no simulation, no
persistent target, and it needs only a "ripples allowed" mask, which a puddle mask already
is. The compute height field buys interacting ripples for a sub-millisecond cost on 2014
hardware; the membrane is the only one that gives wakes, at the price of a ping-pong
target.

### 4.5 Splashes

A drop hitting a thin film throws a crown whose rim goes Rayleigh-Plateau unstable and
sheds droplets within a few milliseconds: in Deegan, Brunet and Eggers's experiment (a
1.55 mm drop at 3.26 m/s onto a film 150 to 300 µm deep, in silicone oil) droplets are
already pinching off in the images at 1.85 and 3.15 ms after impact [54]. Lagarde
distinguishes the "corona splash", a thin crown-shaped sheet rising before breaking into
droplets, from the "prompt splash" of droplets emitted directly from the drop's base, and
Remember Me drew a crown mesh scaled by height and radius plus sprite droplets
[29]. The visible life of a splash is shorter than a 60 Hz frame; what the eye
registers is a brief bright fleck. That argues for small, high-contrast, short-lived
sprites, not detailed crowns.

Placement is the real problem, since real impact rates (section 1.1) are far beyond what
any game draws. Remember Me spawns 20, 40 or 60 splashes for light, moderate and heavy
rain at the collision points read back from its top-down depth map, only on surfaces that
face the rain and are visible in the map, each a short flipbook that fades, at 0.33 ms on
PlayStation 3 in heavy rain [29], [35]. ToyShop collided individual
particles against collider objects and drew one filmed milk-drop splash sequence "for
thousands of particles" with random scale, transparency and a random U flip, lit as
brightened backlit sprites when the light was behind them, at 20.01 ms for 5,000 CPU
particles [13]. Assassin's Creed 4 collided its 320,000 GPU drops in screen
space at 0.2 ms and bounced them [37]; Alan Wake 2 collides every droplet with
its height buffer and spawns the splash "in that exact position" [32]. Watch
Dogs's shader setting "controls rain splashes, with Medium reducing their quantity and
Low disabling them entirely" [52], which is the tiering every game uses. The
handbook's "spray ... several inches" high over hard surfaces in heavy rain [1] is the
look to aim at on rock and road: not individual crowns but a low bright haze of flecks.

### 4.6 Foliage and canopy drip

No shipped-game source describes animated leaf response to rain or canopy drip particles;
the closest is The Last of Us Part II, where the drip effect alone "was placed over five
thousand times" by hand [55], and Lagarde's observation that trees show "selective
wetting, some sides wet, others dry", with droplets falling from edges and making their
own splashes [14]. The physics supplies the design. Under old growth, a third of
the rain falls through gaps and the rest drips after a one-to-two-hour delay in 4 to 5 mm
drops from branch tips, moss clumps and rough bark, concentrated at drip points
(section 1.7) [23], [24]. A leaf struck by a 2 mm drop rings at tens of hertz,
with a resonance at 40 to 50 Hz and a damping ratio of about 0.14, and splashes more
readily at resonance [56]. Moss and rough bark are the canopy's water store
[23], so they should be the first to look saturated and the last to dry.

For a renderer that means two rain populations, not one: inside the canopy, a sparse
field of near-vertical, large, slow drops at about a third of the open-sky flux during
rain, clustered under drip points and persisting after it stops; in gaps and clearings,
the full slanted streak field. Leaf bounce can be a vertex-shader impulse, a damped
oscillator at tens of hertz triggered where the sky mask is open, with no collision.

### 4.7 Open water

Rain roughens water at the centimetre scale and damps the longer waves: during rainfall
"surface-roughening ring waves were generated and longer gravity waves were suppressed",
recovering after the rain [57]. A rained-on lake therefore reads as a matte grey,
mirror-broken surface, with the sheen of the specular spread into a broad highlight. No
opened source describes a dedicated rain-on-water shader in a shipped game; the available
practice is the puddle ripple texture tiled over the water surface [13],
[33], with the long-wave normal animation suppressed and the micro-roughness
raised with rain intensity. Light rain is sparse rings on an intact mirror; heavy rain is
dense rings on a globally matte surface.

### 4.8 Transitions: wetting and drying

Measured drying curves are sigmoidal; the specular fades exponentially and faster, the
diffuse "remains darker longer"; drying is non-homogeneous, by exposure, geometry and
distance from wet boundaries; and "water in small cracks disappears faster than puddles"
[47], [14], [45]. Lagarde's practical advice for a game is to "simply
lerp quickly (1 min) to dry surface state" [47]. Assassin's Creed 4's Caribbean
"goes from dusty and dry to showers and storms within minutes" [37]; Far Cry 6
presents surfaces that soak during storms and "gradually dry out as environments clear"
[58]. A defensible model: wetting fast (exposed ground darkens within seconds of
being hit, the canopy delays it by the 3 mm of storage), drying in stages (sheen in
minutes, diffuse darkening over tens of minutes, cracks and high points first, puddles
last). The post-rain "mist rising" look is evaporation fog, "caused by cold air passing
over warmer water or moist land" [59], which in a rainforest hangs in clearings
and over water.

### 4.9 Costs of the wet world

| System | Year | Element | Hardware | Cost |
|---|---|---|---|---|
| ToyShop [13] | 2006 | membrane ripple simulation, 256 by 256, two Euler passes and Sobel | Radeon X1900 XT | 6.98 ms |
| ToyShop [13] | 2006 | view-dependent reflection impostors | Radeon X1900 XT | 8.74 ms |
| ToyShop [13] | 2006 | splashes, 5,000 CPU particles | Radeon X1900 XT, Pentium 4 | 20.01 ms |
| ToyShop [13] | 2006 | misty silhouette halos with fins | Radeon X1900 XT | 18.93 ms |
| Remember Me [35] | 2013 | four-layer ring-texture ripples | PlayStation 3 and Xbox 360, 720p | 0.14 and 0.15 ms |
| Remember Me [29] | 2013 | top-down depth map, 256 by 256 | PlayStation 3 and Xbox 360 | 0.32 and 0.20 ms |
| Remember Me [29] | 2013 | splashes, heavy rain | PlayStation 3 and Xbox 360 | 0.33 and 0.25 ms |
| Remember Me [47] | 2013 | wet-material shading | consoles | "a few extra instructions" and two fetches |
| Assassin's Creed 4 [37] | 2014 | compute ripples into a 256 by 256 height field | consoles of 2013 | about 0.2 ms, plus 0.4 ms for a separate normal pass or free in lighting |
| Watch Dogs [52] | 2014 | puddle and surface reflections, High against Medium | PC | about 5 fps |

Scaled from the 2013 console numbers, a Lagarde-style stack (ring-texture ripples,
depth-map splashes, wet shading inside the material) is well under 1 ms on any
WebGPU-capable desktop GPU at 1080p, our estimate; the costs that do not scale away are
the extra render target for the top-down map and screen-space reflection for puddles.

## 5. Rain on the lens

### 5.1 The physics of drops on glass

A drop on tilted glass sticks until gravity beats the pinning force set by contact-angle
hysteresis. The Furmidge relation, in Yonemoto's form, balances the weight component along
the slope, ρ V g sin α, against an adhesion force proportional to the contact-line width,
the surface tension and (cos θ_R − cos θ_A), the difference between receding and advancing
contact angles; for drops of 7 to 600 µL the adhesion force grows with volume for large
drops and saturates for small ones, so larger drops slide at smaller tilt [60].
Maurer's tilting-plate experiments with 5 to 30 µL water drops on acrylic glass agree:
"the inclination angle needed to initiate drop motions decreases when the droplet volume
increases", motion starts at the rear contact line, and small drops with little hysteresis
"resemble spherical caps, despite the slope" [61]. So small drops on a pane never
slide; only drops that grow past the critical size, by merging or by being hit, run, and a
running drop leaves re-pinned droplets behind. That is why every lens-rain shader has a
static drop field and a few large sliders with trails.

On a real camera the drops are far out of focus. Photographers' advice is that "water
drops will blur the image" on the front element, that deep telephoto hoods help and
shallow wide-angle hoods do not [62]. The crisp drop with an inverted image inside
it is the window-pane look at close focus, and that is what games draw.

### 5.2 Heartfelt, the canonical procedural pass

Martijn Steinrucken's 2017 Shadertoy "Heartfelt" is the reference implementation that
engine ports copy. Its header lists what it added to his earlier rain: "the glass gets
foggy; drops cut trails in the fog on the glass; the amount of rain is adjustable"
[63]. The mask is three layers. A static-drop layer scales the UV by 40,
hashes each cell, places a drop at (hash − 0.5) × 0.7, and fades it with a saw-tooth in
time. A sliding layer uses a grid of 12 by 2 cells per unit (tall cells), scrolls
uv.y by 0.75 t, gives each column a random vertical shift, wobbles the drop's x by
sin(y + sin(y)) scaled by its distance from the cell edge, moves it down with a saw-tooth
Saw(0.85, frac(t + n.z)), draws the main drop as smoothstep(0.4, 0, d) with d measured in
the cell's aspect, and draws the trail as smoothstep(0.23 r, 0.15 r², |st.x − x|) gated
to the cells above the drop, with droplets along the trail at frac(y × 10). A second
sliding layer runs at 1.85 times the scale. The layer weights follow the rain amount:
static drops smoothstep(−0.5, 1, rain) × 2, layer one smoothstep(0.25, 0.75, rain), layer
two smoothstep(0, 0.5, rain) [63]. The normal is either the finite
difference of three mask evaluations at ±0.001 ("expensive normals") or dFdx and dFdy of
one ("cheap normals (3x cheaper, but 2 times shittier)") [63]. The scene is
then read once at the normal-offset UV with an explicit mip level: focus = mix(maxBlur −
trail, minBlur, smoothstep(0.1, 0.2, drop)), with minBlur = 2 and maxBlur between 3 and
6 by rain amount, so the glass is foggy everywhere, sharp inside drops, and the trails cut
the fog by one level [64]. The port that keeps the faithful
`tex2Dlod(scene, float4(uv + n, 0, focus))` is the Unity one [64]; the
glslViewer mirror replaces it with a plain sample. An optional post block adds a subtle
blue shift and a vignette [64].

The per-pixel cost is our estimate from the code: each mask evaluation is about nine
hashes, two dozen sine-class operations and fifty smoothsteps; the expensive-normal path
evaluates it three times. At 1080p that is a few hundred ALU operations on two million
pixels, fine on a desktop GPU and marginal on an integrated or phone GPU at 60 Hz. The
mip-level trick also needs a mipmapped copy of the scene each frame. A second procedural
pattern, analysed by greentec, loops over four grid scales per pixel and pre-blurs the
background with a mip bias of 1.5; "the nested for-loop ... iterates multiple times per
fragment, potentially impacting lower-end GPUs" [65].

### 5.3 Remember Me's near-plane particles

Dontnod did not use a full-screen pass. Drawing particles directly in screen space "is
not easily done within the particle system framework", so they draw them "as if they were
in view space (on the near plane in front of the camera) and link their transformation to
the one of the camera", spawning through the inverse view matrix so the view transform
has no effect [29]. Artists animate the sliding and running motion; the droplets
distort the scene behind them and are lit from a low-resolution environment cubemap; the
sprites are trimmed to cut fill; and the cost is "approximately 0.32 ms on PS3 and 0.54 ms
on Xbox 360" [29], [28]. The gating is the part later games copied: the
system "generates more droplets when camera faces upward" and is "disabled when player is
under cover (tested via ray collision or depth map reuse)" [29]. Metro: Last
Light's drops, as a forum poster described them, were "a plane really close to the camera
and with a low render queue" acting as a surface for the drops, with shaders making them
"look 3D and refract the world in them" [66]; that is second-hand.

### 5.4 Shipped games and how they gate the effect

Driveclub's windscreen is the most observed. "Depending on speed the car is travelling,
rain drops will stray on the sides of the windshield and will automatically slide down
should you reduce the speed"; "the windshield dries up in proportion to the number of
times the wiper wipes the front shield"; in a tunnel the horizontal streaming stops; and
the rain's apparent angle comes from the car's own velocity [67]. At the E3
build, "realistic drops started to spatter on the car's hood and run up toward the
windshield as the car continued down the track", and at night "each drop took light and
reflected it a bit" [68]. Its art director spoke of "your windscreen wipers
going like crazy and your headlights are reflecting on the snowflakes ahead of you"
[69]. Death Stranding's lens droplets "float upwards instead of down toward the
ground" in its supernatural zones [70]. Metal Gear Solid: Ground Zeroes changes
"the amount of drops that hit the camera depending on your angle, with it becoming much
more prominent if you look directly up" [71]. Metro Exodus, first person
behind a gas mask, lets the player wipe the goggles: reviewers singled out "how he wipes
water off his goggles" as something that "helps dissolve the barrier between player and
character" [72], and the blood wiped off the visor after a close kill
[73]. Battlefield 1, first person without a helmet view, says only that
"raindrops are visible on the weapons" and that rain "can distract and distort your
sight", nothing about the camera [74]. Metal Gear Solid V's related lens dirt is
"generated from some sprites" and composited, with its flares, by "a dozen draw calls
rendering to a half-resolution buffer" blended additively after depth of field
[75].

The gating rules that shipped, then, are four: scale drop spawn by how far the camera
faces up or into the rain; switch off under cover with a ray or depth test; tie the
streaming direction to the relative airflow; and give the player a wipe. No source
documents a "top of frame only" rule; that is a tuning choice.

### 5.5 The first-person debate

The argument against is that a bare-eyed character cannot have water on a lens and that
the effect obscures play. The same argument was made about lens flare: "it's annoying,
pointless, and implausible"; "it sometimes forces you to move the camera away"; "I don't
mind post-processing effects, as long as the dev gives you the ability to adjust the
values or shut them off" [76]. The argument for is that it sells wetness and
speed, reads as cinematic, and "if its done well, it doesn't bother you ... it makes you
squint or look away like in real life" [76]. Players prefer drops that read as
objects to a flat overlay: "too many games feel like it's some sort of screen affect
rather than physical drops in 3d space", and "big visible raindrops ... simply aren't
realistic at all" [71]. The effect is most accepted where a diegetic surface
exists (a helmet, a mask, a windscreen) and third-person "film camera" games use it
freely. For a bare-headed first-person character the defensible options are to frame it
as water on the eyes, soft, sparse, mostly near the top of the frame and blinking away in
a second, or to accept the film-camera convention openly in a game that already runs a
halation, grain and vignette look.

### 5.6 The cheap structure

The engines ship no first-party cost figures. Unity's Shader Graph production samples
include a rain-on-the-lens post-process that "applies refraction to the rendered scene as
if there were rain on the camera lens, so some areas of the image are warped by rain
drops and other areas are distorted by drips running down the screen" [77]; a
community package draws lens rain from a particle system with "control over strength,
amount, size and direction" [78]; an Unreal package claims "fully procedurally
generated" static and rolling drops, "high performance", "no scene capture" [79]. Unreal
forum recipes are a normal map in a post-process material, procedural noise in screen
coordinates, a player-only plane with a timer, or "screenspace particles with a refractive
shader" [80]. Babylon.js recipes from its community forum are the same three: a
second orthographic camera for the drops, the engine's refraction post-process driven by a
normal map, or "a plane ... like a filter of a real world camera before your lens" with
sprites and animated UVs, "8 vertices, 1 texture, 2 lines of code" [81].

From those and from the one shipped cost, the cheap structure is one full-screen pass
that reads a small droplet normal-and-mask texture (the static drops, and a trail
channel), offsets the UV into the scene colour by the normal, and blends toward an
already-existing blurred buffer for the "foggy glass" instead of asking for scene mips;
the few sliding drops are instanced quads moved on the CPU with size-dependent speed and a
sinusoidal wobble, not a per-pixel grid. That is about three texture reads and a few dozen
ALU operations per pixel, bandwidth-bound and comparable to a chromatic-aberration pass.
Folded into an existing full-screen pass it adds no render-target round trip. The
procedural Heartfelt pass is the discrete-GPU luxury.

## 6. What a browser can run

This section reads Babylon.js 9.18.0 as the browser engine, because its two particle
systems and its material plugin hooks are typical of what a web engine offers on WebGL2
and WebGPU; the conclusions carry to three.js and PlayCanvas.

### 6.1 The CPU particle system

Babylon's `ParticleSystem` runs its whole per-particle update in JavaScript on the main
thread every frame: the default update function iterates the live particles, ages,
moves, recycles and applies gradients, and `animate()` derives the number of new
particles from the emit rate times the scaled update speed [82]. Each frame
`render()` writes every live particle into one `Float32Array` and uploads it with
`updateDirectly`, 10 floats (40 bytes) per particle with instancing, plus 3 floats for
the direction when the billboard mode is stretched, plus 4 for ramp gradients
[82]. Two thousand stretched particles are about 104 KB a frame, our
arithmetic. `BILLBOARDMODE_STRETCHED` (constant 8) and `STRETCHED_LOCAL` (9) exist
[83]; in the vertex shader the stretched mode builds a basis from the normalised
direction and the vector to the camera, so the quad's long axis follows the direction but
its length is `size × scaleY`, not the speed [84]. A motion-blur length
proportional to speed therefore needs the length scaled on the CPU or a custom vertex
shader. The docs describe stretched mode as "like full billboard mode but with an
additional rotation to align particles with their direction" and demonstrate it with
sparks [85]; the local variant was added in 2022 after a request for
Unity-style billboards that stay thin seen head-on [86].

Three defaults matter for rain. `applyFog` is false, `preWarmCycles` is 0 and
`worldOffset` is zero [87]. With `applyFog = true` the `FOG` define is added
when the scene has fog, and the particle shaders apply the scene's fog per fragment
[82]. Pre-warm runs `animate()` synchronously `preWarmCycles` times on start,
with `preWarmStepOffset` as a time multiplier, so "your system is in the correct state
before rendering" [88], [82]. `isLocal` generates particles in the
emitter's local space so transforming the emitter transforms the whole system
[88]; on the CPU system it is applied on the CPU side. Sub-emitters spawn a
new system from a particle's death or attach one to each particle; they are "not
supported in GPU particles" [89]. Custom `updateFunction`, `startPositionFunction`
and `startDirectionFunction` hooks replace the engine's logic, and a custom fragment
effect can be passed to the constructor [90]. The docs warn that "the CPU
cannot animate as many particles as the GPU can" [91]. No published number for
JavaScript milliseconds per thousand CPU particles exists in the docs or forum; the only
way to know a phone's cost is to measure it.

### 6.2 The GPU particle system, and its recycled particles

`GPUParticleSystem` is supported where the engine reports transform feedback or compute
shaders; it instantiates a compute-shader back end when `supportComputeShaders` is true
and a WebGL2 transform-feedback back end otherwise [92]. On WebGL2 the update
is a vertex shader whose varyings (position, age, size, life, seed, direction and
optional extras) are captured by `beginTransformFeedback` and a point draw over the active
count [93]. On WebGPU it is a `ComputeShader` over ping-pong storage buffers
with a uniform buffer and random textures, dispatched as ceil(activeCount / 64) workgroups
of 64 [94], [95]. The particle record is 21 floats (84 bytes)
plus options, rounded to a multiple of four floats on WebGPU, in two buffers of capacity
times stride that swap every frame [92]. Random numbers come from two
float textures as wide as the largest supported texture, reducible by `randomTextureSize`
[91]. The docs example initialises a million particles; `activeParticleCount`
limits the active count "if you want to limit GPU usage"; and sub-emitters,
`manualEmitCount`, `disposeOnStop`, dual gradient values, emit-rate gradients and ramp
gradients are unsupported [91]. The 9.18 source stubs the ramp and remap
gradient methods as "not supported by GPUParticleSystem" and has no `updateFunction` and no
sorting [92]. Stretched billboards work on the GPU system; they were broken
until a fix in July 2023 [96]. `isLocal` adds a `LOCAL` define to both the
update and render effects so the emitter matrix is applied at draw time [92].

The caveat that bites rain is emission. Each frame the accumulated count grows by the
emit rate times the time delta, and the integer part is added to the active count; the
count only grows, up to capacity [92]. A forum thread in January 2025 reports
a GPU rain that "appears subtle initially" and "becomes a 'monsoon' after 10-15 minutes";
the engine's author explains that "there is no notion of dead particles. They get
recycled into new ones because the GPU system does not support NOT rendering them", and
that the active count must be set by hand [97]. A rain built on the GPU system
must therefore set `activeParticleCount` to the steady-state count up front and lower it
to lower the intensity. Two further consequences for a camera-following emitter are our
inference from the source: with `isLocal` false, a particle is placed in world space at
spawn, so moving the emitter moves only future spawns and a fast camera leaves the front
of the box empty for up to one lifetime; with `isLocal` true, every live particle is
re-transformed at draw time, so the whole volume slides with the camera and the rain
visibly translates with the player. Neither is the wrapped volume; that needs a custom
shader.

The one measured frame with Babylon GPU particles is a 2023 forum profile: several
systems of under 2,000 particles plus a sky dome ran at 60 fps at 35 to 45 percent GPU on
a GTX 1660 Super, 144 fps on an RTX 3080 and 115 to 120 fps at 90 to 95 percent GPU on an
M1 Pro; profiled on an RTX 3080 Ti the frame was 2.94 ms on WebGL2 and 2.15 ms on
WebGPU, and the particles generated 335 million pixel invocations at 2560 by 1440, about
90 full-screen fills, doubled by the two-pass multiply-add blend mode [98]. The
update was not the cost; the fill of large billboards was.

### 6.3 Vertex-shader wrapped volumes

The cheapest rain primitive is the one every documented web rain converges on: per-drop
seeds in a static buffer, positions computed in the vertex shader from a time uniform,
wrapped inside a camera-centred volume so nothing is respawned on the CPU. The idea is
old; the webglfundamentals answer to a student whose 10,000 JavaScript-updated particles
ran at 15 fps was to store start position, velocity and lifetime per vertex and evaluate
`start + velocity × t + acceleration × t²` in the shader, so "JavaScript is doing almost
nothing" [99]. A three.js rain keeps "a cylindrical rain volume centered on the
player" and "uses shader math to recycle drops vertically so they appear to fall forever
without respawning on the CPU", with the point sprite's UV squashed by the camera's pitch
[100]. A three.js and TSL rain of 2026 instances 5,000 plane streaks with "toroidal
wrapping around camera-centered volume", GPU-side respawn and no readback, and collides
them against a 512 by 512 half-float height map rendered by an orthographic camera at
height 50 over a 100 by 100 unit square centred on the player, refreshed every few
frames, spawning splashes from an atlas; its mobile profile disables lens flare and
ambient occlusion [101]. Neither publishes a frame rate.

Babylon offers three ways to build it. Thin instances "don't create new objects, so you
don't incur any penalty on the JavaScript side by having thousands of them"; custom
per-instance attributes are set with `thinInstanceSetBuffer`, static by default, and
culling is "all or nothing" with one bounding box [102]. A `MaterialPluginBase`
injects code at `CUSTOM_VERTEX_DEFINITIONS`, `CUSTOM_VERTEX_MAIN_BEGIN`,
`CUSTOM_VERTEX_UPDATE_POSITION` and the fragment equivalents, declares uniforms and
attributes, binds per-frame values, and is checked for compatibility with both GLSL and
WGSL [103]. A `ShaderMaterial` must add its own fog by binding `vFogInfos` and
`vFogColor` and including the fog fragment [104]. So a thin-instanced quad mesh
with a static per-drop seed buffer and a plugin that computes
`seed − cameraOffset` modulo the box in the vertex stage is a one-draw-call,
zero-JavaScript rain on both back ends. Compute shaders are WebGPU-only and bind through
an explicit bindings map "because browsers do not currently support reflection for WGSL
shaders"; a storage buffer can double as a vertex buffer with `BUFFER_CREATIONFLAG_VERTEX`
[105]. A rain volume does not need compute; only state that must persist
(splash phases, collision responses) does, which is what the three.js demo uses it for.

### 6.4 Fill rate: the only hard browser numbers

The one browser study that timed particles with GPU timer queries is a 2024 KTH thesis,
run in Chrome Canary at 920 by 920 on an Intel UHD 620 laptop and an RTX 3080. The
particle count sustainable at 60 fps on the UHD 620 was 374,104 points in WebGL and
2,108,690 in WebGPU, or 309,791 textured 2 by 2 px squares in WebGL and 397,560 in WebGPU;
on the RTX 3080, 2.8 million points in WebGL and 37 million in WebGPU, or 2.3 million and
21 million squares [106]. The GPU time per million 2 by 2 squares was 67.0 ms in WebGL
and 41.9 ms in WebGPU on the UHD 620, and 8.16 and 0.76 ms on the RTX 3080 [106]. GPU
time is quadratic in the square's side: at a fixed 100,000 textured squares the UHD 620
held 60 fps only up to 5 px a side in WebGL and 20 px in WebGPU; at a million squares the
RTX 3080 held it to 23 px in WebGL and 45 px in WebGPU; on the Intel GPU both APIs
reached 100 percent GPU use, while on the 3080 WebGPU used about 30 percent [106]. The
update was never the cost: the compute update was about 100 times cheaper than transform
feedback on the 3080 and 5 to 6 times on the UHD 620, but rendering dominated the update
by 14 to 25 times for the squares [106]. The timer was unreliable on a 2019 MacBook Pro
and no Linux machine ran WebGPU, so only Windows hardware was tested [106].

Our arithmetic from that: at 1080p a streak of 2 by 40 px covers 80 px, so 20,000 streaks
all on screen are 1.6 million blended pixels, about three quarters of one 1080p fill. A
few thousand streaks of 2 by 30 px on a 720p-class target are 0.1 to 0.3 million pixels,
about a tenth of the 2.5 million textured pixels the UHD 620 sustained at 60 fps with
nothing else drawn. Rain fill is affordable on a four-core laptop's integrated GPU if the
scene itself leaves headroom, and the cost grows with the streak's on-screen size, not
with its texture. On tile-based mobile GPUs the tile's colour and depth live on-chip, so
"blending is both fast and power-efficient" in bandwidth terms [107]; the cost of
transparency there is the extra shaded fragments.

### 6.5 A top-down depth map

The sun's cascaded shadow maps cannot stand in for a vertical rain map: a cascaded
generator "subdivides the view frustum into several subfrusta" that are re-fitted to the
camera, with an optional depth-bounds pass, and the depth along a texel is along the sun
ray [108]. A rain map is its own target. A `RenderTargetTexture` takes a size, a
`renderList`, its own active camera, a `refreshRate`, and since v5 a
`setMaterialForRendering` that renders listed meshes with a different, cheaper material
[109]. A `ShadowGenerator` on a second, straight-down directional light that is
never used for lighting gives a ready-made depth pass with `renderList`, `refreshRate`
(including `REFRESHRATE_RENDER_ONCE`), `shadowFrustumSize` and custom depth shaders
[110]. The engine's `DepthRenderer` can be built for a chosen camera and size,
but its target follows the screen's aspect unless the camera's projection is frozen for
the target's aspect, and a 2025 forum thread proposed a pull request to pass a custom
target [111]; `renderList` restricts the depth to chosen meshes
[112]. The three.js analogue is a 512 by 512 half-float target over 100 m,
nearest-filtered, refreshed every few frames [101]. Drawing an instanced forest
into a 256 to 1024 texel map is the same draw list as one shadow cascade with a cheaper
material; refreshed only when the player moves more than a texel, the amortised cost is a
fraction of a cascade, our inference, and no measurement exists.

### 6.6 Post-process cost

A Babylon `PostProcess` is one full-screen fragment pass whose resolution is a ratio of
the canvas (0.5 halves width and height); it reads `textureSampler` at `vUV`, can read an
earlier pass with `setTextureFromPostProcess`, and the docs warn to "stay reasonable with
kernel size as it will impact the overall rendering speed" [113]. A low-resolution
pass over a full-resolution scene is built by attaching the pass to the engine rather than
a camera, resizing it by hand, rendering it with the post-process manager's direct render
after the draw phase and compositing with a ratio-1 merge pass [114]. The only
forum cost data point is an unnamed Intel GPU falling to about 19 fps under the depth of
field pipeline, which "needs quite a few pass to render a depth buffer, render the scene,
blur in a special way and blend it all together" [115]. No measured millisecond for
a simple custom pass on an Intel Iris Xe, an Apple M1 or any phone in a browser was found.
Our estimate: a lens pass that reads the scene colour, a small normal texture and an
already-blurred quarter-resolution buffer is 0.3 to 1 ms on integrated desktop GPUs and 1
to 2 ms on mid-range phones at native resolution, bandwidth-bound; a chain that already
has a halation blur should reuse it rather than generate scene mips.

### 6.7 The GLSL-to-WGSL caveat

On WebGPU, Babylon detects GLSL and converts it with "internal tools to compile it to
WGSL", which "takes some time and downloads a WASM library"; it recommends writing WGSL
"for faster startup time and smaller download sizes", `ShaderMaterial` takes a
`shaderLanguage` of WGSL, and material plugins carry both languages [116],
[103]. Every distinct define combination of a particle shader (adding
`BILLBOARDSTRETCHED`, `FOG` or `RAMPGRADIENT`) and every custom plugin or shader material
is a new shader variant on the WebGPU path. A project that translates its shaders ahead
of time, so that the WebGPU path never runs the converter on a player's first visit, must
record each new variant before it ships; switching a rain to stretched billboards or
enabling fog on it is enough to create one. Babylon's own GPU particle compute kernel
ships in WGSL and needs no translation [95].

## 7. A rain system for a browser frame budget, layer by layer

What follows is the recommendation: ten layers, each with what it buys, how to build it
in a browser engine, what it should cost and which tier it belongs on. The tiers are a
phone tier (phones and four-core laptops, 720p-class after scaling, no shadows), an
integrated tier (Intel Iris Xe, Apple M1 class, 1080p) and a discrete tier. The order is
the order to build in, because each layer stands alone and the early ones carry most of
the "it is raining" signal (section 2.1).

### 7.1 The air: a wrapped streak volume

What it buys: rain that is everywhere the player can be, with no leading edge, no
catch-up and no dry start, slanted by the wind in a fan of angles.

How to build it: one thin-instanced quad mesh with a static per-drop buffer of seed
position inside a unit box, drop size, phase and a per-drop fall-speed factor, and a
vertex-stage plugin that computes the world position as the camera position plus
(seed − cameraOffset − fallVector × t × speedFactor) wrapped modulo the box, with the box
biased forward along the view direction as Alan Wake 2 does [32]. Orient the quad
along the fall vector (fall speed down, wind sideways, a per-drop jitter from the gust
lag of section 1.2) and face it to the camera, as Babylon's stretched mode does
[84]; size it to the frame-time streak length (7 to 11 cm at 60 Hz for 1 to
2 mm drops, section 1.3), scaled with the frame's duration so the streak length holds at
lower frame rates [32]. Give each drop one of a few fall speeds from 4 to 9 m/s
rather than one, and stretch by speed. Fade by distance so streaks vanish past the
rain-visible region (6 to 20 m, section 1.3) and apply the scene fog. Keep a box of about
24 m across and 20 m tall with the near 2 m empty of the largest streaks, so no quad grows
to fill the screen. Pre-fill the buffer so the first frame is full. On the phone tier
3,000 to 4,000 streaks; on the integrated tier 10,000 to 15,000; on the discrete tier
30,000.

What it costs: fill. Our estimate from the KTH coefficients and the 2 by 30 px streak: 0.2
to 0.3 ms on the phone tier, 0.4 to 0.5 ms on the integrated tier, under 1 ms on the
discrete tier. The JavaScript cost is a few uniforms a frame.

Tier: all three. This layer replaces the engine particle system entirely; the engine's
CPU system would spend its frame in the JavaScript update and upload (section 6.1), and
its GPU system cannot wrap (section 6.2).

### 7.2 The far field: fog that follows the rain

What it buys: the veil that says the whole valley is raining and the distant slopes are
not dry.

How to build it: raise the scene fog's density with the rain, desaturate its colour toward
the overcast grey as Remember Me does [35], and add a separate, stronger mist term
for the accompanying cloud (visibility of 1 km down to 300 m, section 1.5), uncorrelated
with the rain rate on short time scales. Rain-only extinction (12 km at 1 mm/h, 4 km at
5 mm/h, section 1.5) is too weak to see on its own; the mist carries the look. Where the
project has a volumetric or height-fog pass, the glow around lights in rain belongs there
[27], [17].

What it costs: nothing new; it is parameters on a pass that already runs.

Tier: all three.

### 7.3 Occlusion: a top-down map of the world around the player

What it buys: dry ground under roofs, overhangs and canopy, which is also the mask that
places splashes, drips and the lens drops.

How to build it: a `RenderTargetTexture` with an orthographic camera looking straight
down, 512 texels over 60 to 100 m centred on the player, storing the height of the
topmost surface, drawing terrain, buildings and the tree crowns as a static proxy
(crown discs or the instanced tree meshes with a one-channel material through
`setMaterialForRendering`) [109], refreshed only when the player has moved more
than a texel, as the three.js demo does with a frame skip [101]. Alan Wake 2
excludes trees because they move [32]; a forest game has to include them, and a
static crown proxy is the way, since the map is for occlusion, not shadow. The streak
shader reads the map at the drop's world position and fades the streak where the drop is
below the stored height, with a soft test as Remember Me's [29]. A one-channel
16-bit float target is enough.

What it costs: Remember Me's 256-texel map was 0.2 to 0.3 ms on 2006-era consoles
[29]; drawing a forest's instanced crowns into a 512-texel map is about one cheap
shadow cascade, amortised over the frames between refreshes. Our estimate 0.2 to 0.3 ms
amortised on the integrated tier.

Tier: integrated and discrete. The phone tier runs without shadows and should run without
the map; its rain will fall through the canopy, and the cheap mitigation there is to thin
the streak field under a coarse per-vertex canopy density baked into the terrain.

### 7.4 Lighting the streaks

What it buys: streaks that vanish against the sky and glow against dark trunks, and the
night look in a headlamp beam.

How to build it: in the streak fragment, modulate the streak's alpha by the darkness of
what is behind it, which a fragment cannot read but the vertex can approximate from the
view ray's elevation (sky above the horizon, ground below) and the scene fog; and add a
point-light term for the headlamp proportional to its intensity over the squared distance
from the lamp to the streak, which is the physics of section 1.4 and what NVIDIA's two
point lights do with the Garg textures [27]. Bias the streak whiter than physics
says, as ToyShop did [13]. A one-dimensional slice of the Garg database as a
small texture array is possible on both back ends if the project wants the speckled
streak, but it is not where the signal is.

What it costs: a few ALU operations per streak fragment. Under 0.1 ms, our estimate.

Tier: the elevation fade on all tiers; the headlamp term wherever the game has a
headlamp.

### 7.5 Splashes

What it buys: the spray layer on rock, road and water that marks moderate and heavy rain.

How to build it: a second thin-instanced quad mesh of a few hundred to a few thousand
splash sprites, each a four-to-six-frame flipbook of a crown that lives 50 to 100 ms,
placed in the vertex stage at a random position in a disc of 10 to 15 m around the player
and snapped to the height read from the occlusion map of section 7.3, re-seeded every
lifetime from a hash of the instance and the time, and dropped where the map says the
sky is covered. Scale the count with the rain's rate, as Remember Me's 20, 40 and 60
[29] and Watch Dogs's quantity setting [52] do; draw them as small,
bright, short-lived flecks lit brighter when the sun or the lamp is behind them
[13]. Open water gets the same sprites over its surface.

What it costs: Remember Me's heavy-rain splashes were 0.33 ms on PlayStation 3
[29]; a thousand small sprites are a trivial fill. Our estimate 0.2 to 0.3 ms
including the map read.

Tier: integrated and discrete.

### 7.6 Ripples

What it buys: puddles and the water's edge that are visibly being rained on, which is the
one cue that separates rain from drizzle [1], [2].

How to build it: Lagarde's four-layer ring texture inside the terrain and water
materials' normal computation, blended in a layer per quarter of rain intensity, masked
to the puddle mask [35], and on open water added to the micro-roughness with the
long-wave normal animation damped [57]. It is one 256-texel texture and one fetch
per layer, no simulation and no target. The compute height field of Assassin's Creed 4
[37] is the upgrade if interacting ripples are wanted later.

What it costs: 0.14 ms on PlayStation 3 for four layers [35]; under 0.1 ms on any
current GPU, our estimate.

Tier: all three; the phone tier can take two layers.

### 7.7 Canopy drip

What it buys: the forest that keeps raining after the rain stops, and the big slow drops
that tell the player they are under trees.

How to build it: a second, sparse wrapped volume with the same plugin as section 7.1 but
different seeds: a few hundred drops of 4 to 5 mm falling near-vertically at 6 to 8 m/s
from 8 to 9 m, clustered where a canopy-density value is high (from the terrain's
per-vertex canopy density or the occlusion map), with a slow onset about a minute after
the rain starts in game time (standing in for the 1 to 2 hour canopy wet-up of
section 1.7) and a slow decay of tens of minutes after it stops, driven by a "canopy
water" scalar that fills from the rain and drains to drip and evaporation [23]. Each
drip that reaches the ground is a splash of section 7.5 with a bigger sprite. A leaf-bounce
impulse in the foliage vertex shader, a damped oscillator at tens of hertz [56]
triggered stochastically where the sky is open, sells rain on ferns without collision.

What it costs: a few hundred quads and a scalar. 0.1 to 0.2 ms, our estimate.

Tier: all three; the phone tier takes the drip volume without the leaf bounce.

### 7.8 Wet materials

What it buys: the whole world turning dark and glossy, which is the strongest single cue
and the cheapest.

How to build it: Lagarde's porosity rule in every material plugin, not only the ground:
diffuse multiplied by lerp(1, lerp(1, 0.2, porosity), wetness), gloss pulled toward 1 by
half the same factor, porosity derived from the material's roughness where no channel
exists [47]; a flat-normal, 0.02-specular puddle state driven by the terrain's
puddle mask and a flood level [35]; a dark wet band down the bark for the 0.3
percent of stemflow [23]; a glaze and no darkening on leaf cuticles and smooth rock
[43]; and a wetting-and-drying model in which the sheen decays in minutes and the
darkening over tens of minutes, cracks and high points first, puddles last [47],
[14]. Puddle reflections take the sky cubemap on all tiers and screen-space
reflection, limited to the flattened puddle pixels, on the discrete tier if the project
has a screen-space reflection pass [51].

What it costs: "a few extra instructions" and two fetches per material [47]; 0.1
to 0.2 ms across a frame's materials, our estimate.

Tier: all three.

### 7.9 The lens

What it buys: the sense of being in the rain, and, in a first-person game, the only place
the rain touches the player.

How to build it: the cheap structure of section 5.6. One pass, folded into an existing
full-screen pass before chromatic aberration, that reads a small droplet normal-and-mask
texture (the static drop field and a trail channel), offsets the scene UV by the normal
scaled by a drop strength, and lerps toward the existing quarter-resolution blur for the
foggy glass; plus five to twenty instanced sliding drops moved on the CPU with
size-dependent speed and a sinusoidal wobble. Gate it as the shipped games do: spawn
scaled by how far the camera pitches up and into the wind, zero under cover by the
occlusion map, fading out within a second, soft and sparse and mostly near the top of the
frame for a bare-headed character [29], [71]. The procedural Heartfelt
pass with its three mask layers and mip-level focus [63],
[64] is the discrete-tier version, at half resolution if the project renders
its lens effects at half resolution as Metal Gear Solid V does [75].

What it costs: Remember Me's near-plane particles were 0.32 ms on PlayStation 3
[29]. Our estimate: 0.2 ms for the texture pass folded into an existing pass on
the phone tier, 0.3 to 0.4 ms on the integrated tier, 0.5 to 1 ms for the procedural pass
at full resolution on the discrete tier.

Tier: the texture pass on all three; the procedural pass on the discrete tier.

### 7.10 The sound

What it buys: the uniform, directionless hiss that says the whole world is raining, and
the drips that say the player is under trees.

How to build it: two or three layers. A broadband hiss whose level rises about 5 to 6 dB
per doubling of rain rate and whose spectrum shifts downward as the rain gets heavier
(small drops ring at 13 to 25 kHz on water, large drops boom below 10 kHz [25]), with
the balance set by what is underfoot (water and rock bright, duff and foliage dull); a
sparse random train of discrete plops under the canopy, densest at drip points and
continuing after the rain stops, which is the drip layer of section 7.7 made audible; and
wind that dulls the hiss above 5 m/s [25]. A synthesised band-passed noise layer gives
the hiss; the drips are the only samples needed.

What it costs: audio-thread time only.

Tier: all three.

### 7.11 The budget

| Layer | Phone tier | Integrated tier | Discrete tier |
|---|---|---|---|
| Streak volume (7.1) | 0.3 ms, 4,000 streaks | 0.5 ms, 12,000 | 0.8 ms, 30,000 |
| Far-field fog (7.2) | 0 | 0 | 0 |
| Occlusion map (7.3) | not run | 0.25 ms amortised | 0.3 ms |
| Streak lighting (7.4) | 0.02 ms | 0.05 ms | 0.1 ms |
| Splashes (7.5) | not run | 0.2 ms | 0.3 ms |
| Ripples (7.6) | 0.05 ms, two layers | 0.1 ms | 0.1 ms |
| Canopy drip (7.7) | 0.1 ms | 0.15 ms | 0.2 ms |
| Wet materials (7.8) | 0.1 ms | 0.15 ms | 0.2 ms, plus any screen-space reflection |
| Lens (7.9) | 0.2 ms, texture pass | 0.35 ms, texture pass | 0.7 ms, procedural |
| Sound (7.10) | audio thread | audio thread | audio thread |
| Whole stack | about 0.8 ms | about 1.75 ms | about 2.7 ms |

Every number in the table is our estimate, scaled from the figures cited in sections 3.7,
4.9, 5.3 and 6.4: Remember Me's 2.8 ms for the whole stack at 720p on 2006-era consoles
[35], Assassin's Creed 4's sub-millisecond ripples and collisions [37],
and the KTH fill coefficients for an Intel UHD 620 and an RTX 3080 in a browser [106].
It is a plan for measurement, not a measurement. The right order is to build the streak
volume and the fog first, because they fix the chasing emitter and the missing far field
with no new render target; then the wet materials and ripples, which are the strongest
cues per millisecond; then the occlusion map, which unlocks splashes, drip placement and
the lens gating; and the lens last, because it is the one layer the player may want to
turn off.

## 8. What nobody has measured

Nothing in public reports a frame time for a rain effect in a browser with the GPU named.
The nearest data are the Babylon forum profile of GPU particles on an RTX 3080 Ti, a GTX
1660 Super and an M1 Pro, which is not rain [98]; the KTH thesis's particle
limits on a UHD 620 and an RTX 3080, which are squares, not streaks, at 920 by 920
[106]; and the three.js GPU-collision rain, which publishes its configuration and no
number [101]. No Babylon number exists for JavaScript milliseconds per thousand
CPU particles, for a depth-only render target over an instanced forest, or for a simple
custom post-process on an Intel Iris Xe, an Apple M1 or any phone. No modern console or PC
game since 2014 has published a millisecond cost for its rain, its wet shading, its
splashes or its lens drops; the shipped numbers are from 2006, 2013 and 2014 hardware.
Alan Wake 2's box dimensions, density and height-buffer cost are not published
[32].

On the physics side, no source measures the distance at which a person, rather than a
camera, stops seeing individual streaks; the 6 to 20 m figures of section 1.3 transfer a
camera model. No source measures the eye's effective integration time while tracking
streaks. No source quantifies the brightness of streaks in a headlamp as a function of
distance from the lamp. No field measurement of instantaneous slant against gusts exists,
only paired-gauge averages and the drop response time. No source gives the wetting time
constant of soil under rain or a drying curve for duff, moss or bark; and no source says
how long an old-growth canopy keeps dripping after the rain stops, beyond the share of
water that leaves it by drying [23]. No peer-reviewed in-air spectrum of rain on
foliage or forest floor at a stated distance was found; the roof-noise and underwater
literature is the quantitative basis for the sound. And no shipped game describes, in a
source we could open, how it occludes rain under a dense canopy, how it animates leaves
under rain, or how it draws rain on open water; those three are where a forest game is on
its own.

## 9. Sources

1. Office of the Federal Coordinator for Meteorological Services and Supporting Research, *Federal Meteorological Handbook No. 1: Surface Weather Observations and Reports*, FCM-H1-1995, Washington, DC, USA, Dec. 1995. Accessed: Sep. 30, 2026. [Online]. Available: https://marrella.aos.wisc.edu/aos452/fmh1.pdf
2. A. DeCaria, "ESCI 340: cloud physics and precipitation processes, lesson 9: precipitation," lecture notes, Millersville University, Millersville, PA, USA. Accessed: Sep. 30, 2026. [Online]. Available: https://www.atmos.millersville.edu/~adecaria/ESCI340/esci340-lesson09_precipitation.pdf
3. P. N. Gatlin and W. A. Petersen, "A rain taxonomy for degraded visual environment mitigation," NASA Marshall Space Flight Center, Huntsville, AL, USA, Tech. Memo. NASA/TM-2018-219882, Mar. 2018. Accessed: Sep. 30, 2026. [Online]. Available: https://ntrs.nasa.gov/api/citations/20180002207/downloads/20180002207.pdf
4. K. Garg and S. K. Nayar, "Vision and rain," *Int. J. Comput. Vis.*, vol. 75, no. 1, pp. 3-27, Oct. 2007. Accessed: Sep. 30, 2026. [Online]. Available: https://cave.cs.columbia.edu/Statics/publications/pdfs/Garg_IJCV07.pdf
5. MadSci Network, "Re: terminal velocity of rain," MadSci Network, Jul. 2000, reproducing the table of R. Gunn and G. D. Kinzer, *J. Meteorol.*, vol. 6, pp. 243-248, 1949. Accessed: Sep. 30, 2026. [Online]. Available: https://www.madsci.org/posts/archives/2000-07/962626446.Ph.r.html
6. L. Lyles, "Soil detachment and aggregate disintegration by wind-driven rain," in *Soil Erosion: Prediction and Control*, Ankeny, IA, USA: Soil Conservation Society of America, 1977, pp. 152-159. Accessed: Sep. 30, 2026. [Online]. Available: https://www.ars.usda.gov/ARSUserFiles/30200525/1576-A%20Soil%20detachment%20and%20aggregate%20disintegration%20by%20wind-driven%20rain.pdf
7. K. Helming, "Wind speed effects on rain erosivity," in *Sustaining the Global Farm*, D. E. Stott, R. H. Mohtar, and G. C. Steinhardt, Eds., West Lafayette, IN, USA: Purdue Univ., 2001, pp. 771-776. Accessed: Sep. 30, 2026. [Online]. Available: https://topsoil.nserl.purdue.edu/nserlweb-old/isco99/pdf/ISCOdisc/SustainingTheGlobalFarm/P253-Helming.pdf
8. M. Thurai, V. N. Bringi, P. N. Gatlin, and M. T. Wingo, "Raindrop fall velocity in turbulent flow: an observational study," *Adv. Sci. Res.*, vol. 18, pp. 33-39, Mar. 2021. Accessed: Sep. 30, 2026. [Online]. Available: https://asr.copernicus.org/articles/18/33/2021/
9. K. Garg and S. K. Nayar, "When does a camera see rain?," in *Proc. 10th IEEE Int. Conf. Comput. Vis.*, Beijing, China, Oct. 2005, pp. 1067-1074. Accessed: Sep. 30, 2026. [Online]. Available: https://cave.cs.columbia.edu/Statics/publications/pdfs/Garg_ICCV05.pdf
10. Centre for Vision Research, York University, "Temporal summation (Bloch's law)," York University. Accessed: Sep. 30, 2026. [Online]. Available: https://www.yorku.ca/eye/blochlaw.htm
11. G. Westheimer, "Visual acuity and hyperacuity," in *Handbook of Optics*, ch. 4.1, mirrored at University of Bremen. Accessed: Sep. 30, 2026. [Online]. Available: https://cgvr.cs.uni-bremen.de/teaching/cg_literatur/visual_acuity.pdf
12. K. Garg and S. K. Nayar, "Photorealistic rendering of rain streaks," *ACM Trans. Graph.*, vol. 25, no. 3, pp. 996-1002, Jul. 2006. Accessed: Sep. 30, 2026. [Online]. Available: https://cave.cs.columbia.edu/Statics/publications/pdfs/Garg_TOG06.pdf
13. N. Tatarchuk, "Artist-directable real-time rain rendering in city environments," slides, presented at SIGGRAPH Course Advanced Real-Time Rendering in 3D Graphics and Games, Boston, MA, USA, Jul. 2006. Accessed: Sep. 30, 2026. [Online]. Available: https://advances.realtimerendering.com/s2006/Tatarchuk-Rain.pdf
14. S. Lagarde, "Water drop 1: observe rainy world," Dec. 10, 2012. Accessed: Sep. 30, 2026. [Online]. Available: https://seblagarde.wordpress.com/2012/12/10/observe-rainy-world/
15. G. Montero-Martínez and F. García-García, "The influence of rainfall on the extinction coefficient and the meteorological optical range," *Atmósfera*, vol. 39, 2025. Accessed: Sep. 30, 2026. [Online]. Available: https://www.scielo.org.mx/scielo.php?pid=S0187-62362025000100020&script=sci_arttext_plus&tlng=en
16. National Weather Service, "Fog definitions," NOAA. Accessed: Sep. 30, 2026. [Online]. Available: https://www.weather.gov/source/zhu/ZHU_Training_Page/fog_stuff/fog_definitions/Fog_definitions.html
17. N. Tatarchuk, "Artist-directable real-time rain rendering in city environments," in *Advanced Real-Time Rendering in 3D Graphics and Games*, SIGGRAPH 2006 Course 26, ch. 3, pp. 23-64, Jul. 2006. Accessed: Sep. 30, 2026. [Online]. Available: https://advances.realtimerendering.com/s2006/Chapter3-Artist-Directable_Real-Time_Rain_Rendering_in_City_Environments.pdf
18. U.S. National Park Service, "Weather brochure," Olympic National Park. Accessed: Sep. 30, 2026. [Online]. Available: https://www.nps.gov/olym/planyourvisit/weather-brochure.htm
19. U.S. National Park Service, "Visiting the Hoh Rain Forest," Olympic National Park. Accessed: Sep. 30, 2026. [Online]. Available: https://www.nps.gov/olym/planyourvisit/visiting-the-hoh.htm
20. U.S. National Park Service, "Temperate rain forests," Olympic National Park. Accessed: Sep. 30, 2026. [Online]. Available: https://www.nps.gov/olym/learn/nature/temperate-rain-forests.htm
21. NOAA National Centers for Environmental Information, "U.S. climate normals 1991-2020, monthly, station USC00452914 (Forks 1 E, WA)," NCEI Access Data Service. Accessed: Sep. 30, 2026. [Online]. Available: https://www.ncei.noaa.gov/access/services/data/v1?dataset=normals-monthly-1991-2020&stations=USC00452914&dataTypes=MLY-PRCP-NORMAL,MLY-PRCP-AVGNDS-GE001HI,MLY-PRCP-AVGNDS-GE010HI&format=json
22. Wikipedia contributors, "Forks, Washington," Wikipedia. Accessed: Sep. 30, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Forks,_Washington
23. T. E. Link, M. Unsworth, and D. Marks, "The dynamics of rainfall interception by a seasonal temperate rainforest," *Agric. For. Meteorol.*, vol. 124, no. 3-4, pp. 171-191, Aug. 2004. Accessed: Sep. 30, 2026. [Online]. Available: https://www.fs.usda.gov/pnw/pubs/journals/pnw_2004_link001.pdf
24. A. Katayama, K. Nanko, S. Jeong, T. Kume, Y. Shinohara, and S. Seitz, "Short communication: concentrated impacts by tree canopy drips: hotspots of soil erosion in forests," *Earth Surf. Dyn.*, vol. 11, no. 6, pp. 1275-1282, Dec. 2023. Accessed: Sep. 30, 2026. [Online]. Available: https://esurf.copernicus.org/articles/11/1275/2023/
25. J. A. Nystuen, "Listening to raindrops from underwater: an acoustic disdrometer," *J. Atmos. Ocean. Technol.*, vol. 18, no. 10, pp. 1640-1657, Oct. 2001. Accessed: Sep. 30, 2026. [Online]. Available: https://journals.ametsoc.org/view/journals/atot/18/10/1520-0426_2001_018_1640_ltrfua_2_0_co_2.xml
26. Building Research Establishment, "Rain noise from glazed and lightweight roofing," BRE Information Paper IP 2/06, Watford, U.K., 2006. Accessed: Sep. 30, 2026. [Online]. Available: https://files.bregroup.com/bre-co-uk-file-library-copy/filelibrary/rpts/IP02_06_Rain_noise.pdf
27. S. Tariq, "Rain," NVIDIA DirectX 10 SDK white paper, NVIDIA Corporation, Santa Clara, CA, USA, 2007. Accessed: Sep. 30, 2026. [Online]. Available: https://developer.download.nvidia.com/SDK/10/direct3d/Source/rain/doc/RainSDKWhitePaper.pdf
28. M. Seymour, "Game environments, part B: rain," fxguide, Jun. 5, 2013. Accessed: Sep. 30, 2026. [Online]. Available: https://www.fxguide.com/fxfeatured/game-environments-partb/
29. S. Lagarde, "Water drop 2a: dynamic rain and its effects," Dec. 27, 2012. Accessed: Sep. 30, 2026. [Online]. Available: https://seblagarde.wordpress.com/2012/12/27/water-drop-2a-dynamic-rain-and-its-effects/
30. L. Wang, Z. Lin, T. Fang, X. Yang, X. Yu, and S. B. Kang, "Real-time rendering of realistic rain," Microsoft Research, Redmond, WA, USA, Tech. Rep. MSR-TR-2006-102, Jul. 2006. Accessed: Sep. 30, 2026. [Online]. Available: https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/RealTimeRain_MSTR.pdf
31. C. Creus and G. A. Patow, "R4: realistic rain rendering in realtime," *Comput. Graph.*, vol. 37, no. 1, pp. 33-40, Feb. 2013. Accessed: Sep. 30, 2026. [Online]. Available: https://upcommons.upc.edu/handle/2117/18697?locale-attribute=en
32. D. Kończyk, "Rain of Alan Wake 2," ArtStation, 2023. Accessed: Sep. 30, 2026. [Online]. Available: https://www.artstation.com/artwork/xDPVk2
33. Cyanilux, "Rain effects breakdown," Cyanilux Shader Tutorials, Jul. 4, 2023. Accessed: Sep. 30, 2026. [Online]. Available: https://www.cyanilux.com/tutorials/rain-effects-breakdown/
34. Kids With Sticks, "How to create rain in Unreal Engine 4 Niagara," kidswithsticks.com. Accessed: Sep. 30, 2026. [Online]. Available: https://kidswithsticks.com/how-to-create-rain-in-unreal-engine-4-niagara/
35. S. Lagarde, "Water drop 2b: dynamic rain and its effects," Jan. 3, 2013. Accessed: Sep. 30, 2026. [Online]. Available: https://seblagarde.wordpress.com/2013/01/03/water-drop-2b-dynamic-rain-and-its-effects/
36. Remedy Entertainment, "How Northlight makes Alan Wake 2 shine," Nov. 6, 2023. Accessed: Sep. 30, 2026. [Online]. Available: https://www.remedygames.com/article/how-northlight-makes-alan-wake-2-shine
37. B. Wronski, "Assassin's Creed 4: Black Flag: lighting, weather and atmospheric effects," presented at Digital Dragons, Kraków, Poland, May 2014. Accessed: Sep. 30, 2026. [Online]. Available: https://bartwronski.com/wp-content/uploads/2014/05/assassin_s-creed-4-digital-dragons-2014-no_notes.pdf
38. Epic Games, "Niagara content examples," Unreal Engine 4.27 documentation. Accessed: Sep. 30, 2026. [Online]. Available: https://dev.epicgames.com/documentation/en-us/unreal-engine/niagara-content-examples?application_version=4.27
39. K. Garg and S. K. Nayar, "Rain streak database," Columbia University Computer Vision Laboratory. Accessed: Sep. 30, 2026. [Online]. Available: https://www1.cs.columbia.edu/CAVE/databases/rain_streak_db/rain_streak.php
40. I. Cantlay, "High-speed, off-screen particles," in *GPU Gems 3*, ch. 23, NVIDIA Corporation, 2007. Accessed: Sep. 30, 2026. [Online]. Available: https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles
41. J. Lekner and M. C. Dorf, "Why some things are darker when wet," *Appl. Opt.*, vol. 27, no. 7, pp. 1278-1280, Apr. 1988. Accessed: Sep. 30, 2026. [Online]. Available: https://opg.optica.org/ao/abstract.cfm?uri=ao-27-7-1278
42. S. A. Twomey, C. F. Bohren, and J. L. Mergenthaler, "Reflectance and albedo differences between wet and dry surfaces," *Appl. Opt.*, vol. 25, no. 3, pp. 431-437, Feb. 1986. Accessed: Sep. 30, 2026. [Online]. Available: https://opg.optica.org/ao/abstract.cfm?uri=ao-25-3-431
43. H. W. Jensen, J. Legakis, and J. Dorsey, "Rendering of wet materials," in *Rendering Techniques '99*, Vienna, Austria: Springer, 1999, pp. 273-282. Accessed: Sep. 30, 2026. [Online]. Available: https://groups.csail.mit.edu/graphics/pubs/wet_materials_egwr99.pdf
44. S. Lagarde, "Water drop 3a: physically based wet surfaces," Mar. 19, 2013. Accessed: Sep. 30, 2026. [Online]. Available: https://seblagarde.wordpress.com/2013/03/19/water-drop-3a-physically-based-wet-surfaces/
45. S. Lagarde, "Game environments, part C: making wet environments," fxguide, Jun. 6, 2013. Accessed: Sep. 30, 2026. [Online]. Available: https://www.fxguide.com/fxfeatured/game-environments-partc/
46. S. Gascoin, A. Ducharne, P. Ribstein, E. Perroy, and P. Wagnon, "Sensitivity of bare soil albedo to surface soil moisture on the moraine of the Zongo glacier (Bolivia)," *Geophys. Res. Lett.*, vol. 36, L02405, Jan. 2009. Accessed: Sep. 30, 2026. [Online]. Available: https://api.crossref.org/works/10.1029/2008GL036377
47. S. Lagarde, "Water drop 3b: physically based wet surfaces," Apr. 14, 2013. Accessed: Sep. 30, 2026. [Online]. Available: https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/
48. C. Nolet, A. Poortinga, P. Roosjen, H. Bartholomeus, and G. Ruessink, "Measuring and modeling the effect of surface moisture on the spectral reflectance of coastal beach sand," *PLOS ONE*, vol. 9, no. 11, e112151, Nov. 2014. Accessed: Sep. 30, 2026. [Online]. Available: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0112151
49. N. Mackenzie, "Forza Horizon 5: crafting rich and diverse Mexican biomes," Adobe Substance 3D Magazine, Nov. 15, 2021. Accessed: Sep. 30, 2026. [Online]. Available: https://www.adobe.com/products/substance3d/magazine/forza-horizon-5-crafting-rich-and-diverse-mexican-biomes.html
50. W. Fenlon, "How temperature, puddles, and seasonal minutia will affect Forza Horizon 4's 450+ cars," PC Gamer, Sep. 12, 2018. Accessed: Sep. 30, 2026. [Online]. Available: https://www.pcgamer.com/how-temperature-puddles-and-seasonal-minutia-will-affect-forza-horizon-4s-450-cars/
51. E. López, "The rendering of Rise of the Tomb Raider," elopezr.com, Dec. 31, 2018. Accessed: Sep. 30, 2026. [Online]. Available: https://www.elopezr.com/the-rendering-of-rise-of-the-tomb-raider/
52. A. Burnes, "Watch Dogs graphics, performance and tweaking guide," NVIDIA GeForce, May 26, 2014. Accessed: Sep. 30, 2026. [Online]. Available: https://www.nvidia.com/en-us/geforce/news/watch-dogs-graphics-performance-and-tweaking-guide/
53. T. Korambayil, "Rainy surface shader part 1: ripples," DeepSpaceBanana Art, May 22, 2017. Accessed: Sep. 30, 2026. [Online]. Available: https://deepspacebanana.github.io/blog/shader/art/unreal%20engine/Rainy-Surface-Shader-Part-1
54. R. D. Deegan, P. Brunet, and J. Eggers, "Rayleigh-Plateau instability causes the crown splash," arXiv:0806.3050, Dec. 2008. Accessed: Sep. 30, 2026. [Online]. Available: https://arxiv.org/pdf/0806.3050
55. K. Tokarev, "How Naughty Dog created the immersive world of The Last of Us Part II," 80.lv, Dec. 8, 2020. Accessed: Sep. 30, 2026. [Online]. Available: https://80.lv/articles/how-naughty-dog-created-the-immersive-world-of-the-last-of-us-part-ii
56. Z. Gao, J. Lin, J. Ma, W. Hu, X. Dong, and B. Qiu, "Experimental investigation of droplet impact behavior considering leaf curvature and vibration effects," *BMC Plant Biol.*, vol. 26, art. no. 205, 2025. Accessed: Sep. 30, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC12866050/
57. N. J. M. Laxague and C. J. Zappa, "The impact of rain on ocean surface waves and currents," *Geophys. Res. Lett.*, vol. 47, e2020GL087287, Apr. 2020. Accessed: Sep. 30, 2026. [Online]. Available: https://api.crossref.org/works/10.1029/2020GL087287
58. C. Weick and E. Zhou, "Simulating tropical weather in Far Cry 6," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2022. Accessed: Sep. 30, 2026. [Online]. Available: https://gdcvault.com/play/1027725/Simulating-Tropical-Weather-in-Far
59. Met Office, "What is fog?," Met Office. Accessed: Sep. 30, 2026. [Online]. Available: https://weather.metoffice.gov.uk/learn-about/weather/types-of-weather/fog
60. Y. Yonemoto, Y. Fujii, Y. Sugino, and T. Kunugi, "Relationship between onset of sliding behavior and size of droplet on inclined solid substrate," *Micromachines*, vol. 13, no. 11, art. no. 1849, Nov. 2022. Accessed: Sep. 30, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC9695122/
61. T. Maurer, A. Mebus, and U. Janoske, "Water droplet motion on an inclining surface," in *Proc. 3rd Int. Conf. Fluid Flow, Heat and Mass Transfer*, Ottawa, ON, Canada, May 2016, paper 143. Accessed: Sep. 30, 2026. [Online]. Available: https://www.avestia.com/FFHMT2016_Proceedings/files/paper/143.pdf
62. V. Kovalcik, "Protect your camera in the rain," Learn Photography by Zoner, Oct. 21, 2015. Accessed: Sep. 30, 2026. [Online]. Available: https://learn.zoner.com/protect-your-camera-in-the-rain/
63. M. Steinrucken, "heartfelt.glsl," 2017, mirrored in sanxincao/shadertoy, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/sanxincao/shadertoy/master/heartfelt.glsl
64. Y. Yanagisawa, "Raindrop.shader," Unity-Raindrops, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/yumayanagisawa/Unity-Raindrops/master/Raindrop/Assets/Raindrop.shader
65. H. Kim, "Shadertoy: rain drops," greentec's blog, Jan. 17, 2019. Accessed: Sep. 30, 2026. [Online]. Available: https://greentec.github.io/rain-drops-en/
66. Unity Discussions contributors, "Water drops camera effect," Unity Discussions, Jul. 14, 2013. Accessed: Sep. 30, 2026. [Online]. Available: https://discussions.unity.com/t/water-drops-camera-effect/75864
67. B. Smith, "DriveClub uses real world weather physics, weather effects compared with Forza Horizon 2," GamingBolt, Dec. 17, 2014. Accessed: Sep. 30, 2026. [Online]. Available: https://gamingbolt.com/driveclub-uses-real-world-weather-physics-weather-effects-compared-with-forza-horizon-2
68. D. North, "Driveclub has the best dynamic weather engine I've ever seen," Destructoid, Jun. 11, 2014. Accessed: Sep. 30, 2026. [Online]. Available: https://www.destructoid.com/driveclub-has-the-best-dynamic-weather-engine-ive-ever-seen/
69. F. Dutton, "Your first look at DRIVECLUB's dynamic weather in action," PlayStation Blog, Jul. 8, 2014. Accessed: Sep. 30, 2026. [Online]. Available: https://blog.playstation.com/archive/2014/07/08/first-look-driveclubs-dynamic-weather-action-2
70. D. Moiseyev, "Smalls details and mechanics we love about Death Stranding," TheGamer, Jan. 14, 2023. Accessed: Sep. 30, 2026. [Online]. Available: https://www.thegamer.com/death-stranding-small-details-mechanics-details-we-love/
71. ResetEra contributors, "The illusion of a pouring rainy day in video games," ResetEra, Jun. 22, 2018. Accessed: Sep. 30, 2026. [Online]. Available: https://www.resetera.com/threads/the-illusion-of-a-pouring-rainy-day-in-video-games.50817/
72. N. Plessas, "Metro Exodus review," EGM, Feb. 2019. Accessed: Sep. 30, 2026. [Online]. Available: https://egmnow.com/metro-exodus-review/
73. D. Forman, "Metro: Exodus review," Gamecritics, Feb. 27, 2019. Accessed: Sep. 30, 2026. [Online]. Available: https://gamecritics.com/darren-forman/metro-exodus-review/
74. Electronic Arts, "How dynamic weather changes Battlefield 1," EA, 2016. Accessed: Sep. 30, 2026. [Online]. Available: https://www.ea.com/en-au/games/battlefield/news/battlefield-1-weather
75. A. Courrèges, "Metal Gear Solid V: graphics study," adriancourreges.com, Dec. 15, 2017. Accessed: Sep. 30, 2026. [Online]. Available: https://www.adriancourreges.com/blog/2017/12/15/mgs-v-graphics-study/
76. AnandTech Forums contributors, "Why bother with camera len reflection in first person shooter gaming?," AnandTech Forums, Dec. 30, 2012. Accessed: Sep. 30, 2026. [Online]. Available: https://forums.anandtech.com/threads/why-bother-with-camera-len-reflection-in-first-person-shooter-gaming.2292697/post-34433655
77. Unity Technologies, "Post-process," Shader Graph 17.0 manual, production ready sample content. Accessed: Sep. 30, 2026. [Online]. Available: https://docs.unity3d.com/Packages/com.unity.shadergraph@17.0/manual/Shader-Graph-Sample-Production-Ready-Post.html
78. M. Dean, "LensRain: a screen-space lens rain effect using Unity's V2 post-processing framework," GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/Kink3d/LensRain
79. YHK-UEPlugins-Public, "017_RaindropsOnGlass_Public," GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/YHK-UEPlugins-Public/017_RaindropsOnGlass_Public
80. Epic Developer Community Forums contributors, "Water on camera lense effect," Epic Developer Community Forums, Jul. 2, 2014. Accessed: Sep. 30, 2026. [Online]. Available: https://forums.unrealengine.com/t/water-on-camera-lense-effect/6964
81. HTML5 Game Devs Forum contributors, "Water drops on camera," HTML5 Game Devs Forum, Jul. 28, 2016. Accessed: Sep. 30, 2026. [Online]. Available: https://www.html5gamedevs.com/topic/24133-water-drops-on-camera/
82. Babylon.js Authors, "thinParticleSystem.pure.ts," GitHub repository, v9.18.0. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Particles/thinParticleSystem.pure.ts
83. Babylon.js Authors, "particleSystem.pure.ts," GitHub repository, v9.18.0. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Particles/particleSystem.pure.ts
84. Babylon.js Authors, "particles.vertex.fx," GitHub repository, v9.18.0. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Shaders/particles.vertex.fx
85. Babylon.js Authors, "Color ramps, blends, and billboard mode," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/particles/particle_system/ramps_and_blends.md
86. Babylon.js Forum contributors, "Stretched billboard without rotating," Babylon.js Forum, Oct. 16, 2022. Accessed: Sep. 30, 2026. [Online]. Available: https://forum.babylonjs.com/t/stretched-billboard-without-rotating/34847
87. Babylon.js Authors, "baseParticleSystem.pure.ts," GitHub repository, v9.18.0. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Particles/baseParticleSystem.pure.ts
88. Babylon.js Authors, "Particle system intro," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/particles/particle_system/particle_system_intro.md
89. Babylon.js Authors, "Sub emitters," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/particles/particle_system/subEmitters.md
90. Babylon.js Authors, "Customizing particles," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/particles/particle_system/customizingParticles.md
91. Babylon.js Authors, "GPU particles," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/particles/particle_system/gpu_particles.md
92. Babylon.js Authors, "gpuParticleSystem.pure.ts," GitHub repository, v9.18.0. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Particles/gpuParticleSystem.pure.ts
93. Babylon.js Authors, "webgl2ParticleSystem.pure.ts," GitHub repository, v9.18.0. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Particles/webgl2ParticleSystem.pure.ts
94. Babylon.js Authors, "computeShaderParticleSystem.pure.ts," GitHub repository, v9.18.0. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Particles/computeShaderParticleSystem.pure.ts
95. Babylon.js Authors, "gpuUpdateParticles.compute.fx," GitHub repository, v9.18.0. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/ShadersWGSL/gpuUpdateParticles.compute.fx
96. Babylon.js Forum contributors, "GPU particles disappeared with BILLBOARDMODE_STRETCHED," Babylon.js Forum, Jul. 6, 2023. Accessed: Sep. 30, 2026. [Online]. Available: https://forum.babylonjs.com/t/gpu-particles-disappeared-with-billboardmode-stretched/42199
97. Babylon.js Forum contributors, "GPU particle systems emitting increase over time?," Babylon.js Forum, Jan. 20, 2025. Accessed: Sep. 30, 2026. [Online]. Available: https://forum.babylonjs.com/t/gpu-particle-systems-emitting-increase-over-time/56087
98. Babylon.js Forum contributors, "CustomProceduralTexture + GPUParticleSystem: unstable performance," Babylon.js Forum, Sep. 2023. Accessed: Sep. 30, 2026. [Online]. Available: https://forum.babylonjs.com/t/customproceduraltexture-gpuparticlesystem-unstable-performance/43838
99. G. Tavares, "Efficient particle system in javascript? (WebGL)," WebGL Fundamentals. Accessed: Sep. 30, 2026. [Online]. Available: https://webglfundamentals.org/webgl/lessons/webgl-qna-efficient-particle-system-in-javascript---webgl-.html
100. P. Adams, "Cheap, beautiful rain in three.js," Medium, Apr. 10, 2026. Accessed: Sep. 30, 2026. [Online]. Available: https://medium.com/antaeus-ar/cheap-beautiful-rain-in-three-js-9b62bbeabbf3
101. A. Mancini and Sunag, "threejs-conference," GitHub repository, Sep. 2026. Accessed: Sep. 30, 2026. [Online]. Available: https://github.com/ektogamat/threejs-conference
102. Babylon.js Authors, "Thin instances," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/mesh/copies/thinInstances.md
103. Babylon.js Authors, "Material plugins," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/materials/using/materialPlugins.md
104. Babylon.js Authors, "Supporting fog with ShaderMaterial," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/materials/shaders/Fog+ShaderMat.md
105. Babylon.js Authors, "Compute shaders," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/materials/shaders/computeShader.md
106. S. Palmér, "Performance comparison of WebGPU and WebGL for 2D particle systems on the web: an analysis of GPU time in web-based graphics APIs," M.S. thesis, KTH Royal Inst. Technol., Stockholm, Sweden, Nov. 2024. Accessed: Sep. 30, 2026. [Online]. Available: https://www.diva-portal.org/smash/get/diva2:1945245/FULLTEXT02
107. P. Harris, "The Mali GPU: an abstract machine, part 2: tile-based rendering," Arm Community, Feb. 20, 2014. Accessed: Sep. 30, 2026. [Online]. Available: https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/the-mali-gpu-an-abstract-machine-part-2---tile-based-rendering
108. Babylon.js Authors, "Cascaded shadow maps," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/lights/shadows_csm.md
109. Babylon.js Authors, "Render target texture with multiple passes," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/postProcesses/renderTargetTextureMultiPass.md
110. Babylon.js Authors, "Shadows," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/lights/shadows.md
111. Babylon.js Forum contributors, "Using a DepthRenderer with a specific texture size," Babylon.js Forum, Sep. 2025. Accessed: Sep. 30, 2026. [Online]. Available: https://forum.babylonjs.com/t/using-a-depthrenderer-with-a-specific-texture-size/60374
112. Babylon.js Forum contributors, "Get the depth map of a set of meshes," Babylon.js Forum, Jul. 13, 2023. Accessed: Sep. 30, 2026. [Online]. Available: https://forum.babylonjs.com/t/get-the-depth-map-of-a-set-of-meshes/42368
113. Babylon.js Authors, "How to use post processes," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/postProcesses/usePostProcesses.md
114. Babylon.js Forum contributors, "How to render a low resolution post-process on a full resolution scene?," Babylon.js Forum, Sep. 2, 2025. Accessed: Sep. 30, 2026. [Online]. Available: https://forum.babylonjs.com/t/how-to-render-a-low-resolution-post-process-on-a-full-resolution-scene/60332
115. Babylon.js Forum contributors, "Post process depth of field: really that slow?," Babylon.js Forum. Accessed: Sep. 30, 2026. [Online]. Available: https://forum.babylonjs.com/t/post-process-depth-of-field-really-that-slow/32743
116. Babylon.js Authors, "Writing shaders for WebGPU in WGSL," Babylon.js Documentation, GitHub repository. Accessed: Sep. 30, 2026. [Online]. Available: https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/setup/support/webGPU/webGPUWGSL.md
