---
description: Laying a painted look, a stroke filter and a palette grade, over a physically based browser render, and the four places WebGPU and WebGL2 part ways doing it.
published: 2026-10-17
categories: Rendering
source: https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-10-17-painted-post-webgpu-vs-webgl2.md
---
# A painted look over a photoreal render: WebGPU against WebGL2

**Question:** A renderer built to read as a photograph, physically based materials,
a scattering sky, a height fog, can be given the look of a landscape in oils without
rebuilding any of it: a post chain that flattens texture into strokes while it keeps
edges, and a grade that pulls the frame's values and colours toward a palette the
game can change at will. The chain is two fragment shaders written once in GLSL. On
a browser engine that runs them on WebGPU as well as WebGL2, which of the two APIs'
differences does a painterly post chain meet, and what does the same shader cost on
each?

**Short answer:** the look is the same on both, because it is fragment work on
full-screen passes, which both have in the same shape: a half-float render target,
a sampler, a quad. The two parted in four places. The stroke filter's loops, with
trip counts set by a uniform and early exits inside them, translate to WGSL and run,
but the textbook shape of the filter, its eight sectors' sums in function-scope
arrays indexed by a loop variable, costs six times on WebGPU what it costs on
WebGL2; the same sums as named variables, added to by a function called once a
sector with the sector a constant, cost the same on both [1]. WGSL's
uniformity analysis sees a texture read inside a loop whose exits depend only on
uniforms as uniform control flow, which is what the filter needs, where a read under
a branch on a per-pixel value is the case the previous article met [2], [3]. A
palette of nine small uniforms is nine uniform calls a draw on WebGL2 and one buffer
with 16-byte alignment on WebGPU, which the engine hides and which decides how a
palette should be packed [4], [5]. And a frame rate read with no post chain at all
is capped by the display on one engine and not on the other, so a cost measured as
a difference of frame rates can be wrong by the whole cap [6]. One more thing was the
same on both and took longest: a stroke filter on linear high-dynamic-range colour
turns every leaf against a low sun cyan-white unless its statistics are taken on a
compressed range and its output is a linear mean.

The worked example is Day Hike, a first-person hiking game in Babylon.js 9.18, public at
[game-dayhike](https://github.com/csarkosh/game-dayhike) and playable at
[games.csarko.sh/dayhike](https://games.csarko.sh/dayhike/). Its high tier draws with
WebGPU in Chrome and Edge and everything else draws with WebGL2
([WebGPU vs WebGL2: what changes and what does not](/research/webgpu-vs-webgl2)); the
post chain's prepass for the far field is the subject of
[Scene depth for a post process](/research/scene-depth-for-a-post-process-webgpu-vs-webgl2).
The machine throughout is an Apple M4 running Chrome 157, WebGPU through Metal and
WebGL2 through ANGLE's Metal backend, with the render at 1200 by 675.

## 1. What a painted look is made of

Three things, read off landscape painting in oils, and each a different part of
the chain.

**Strokes, not pixels.** Fine texture is gone, replaced by strokes that keep the
edges: bark is a few marks, grass a field of strokes, the sky a wash. The filter that
does this is the Kuwahara filter and its descendants [7], [8], [1]: the window round
each pixel is cut into sectors, each sector's mean and variance are taken, and the
pixel becomes the means weighted by how flat each sector is. An edge is kept where
the sectors on either side of it disagree, and the texture inside a region flattens
into a stroke. The generalized form [8] weights each tap by a smooth function of
where it lies in its sector; the anisotropic form [1] stretches the sectors along the
image's structure so strokes follow bark and grass. What follows uses the generalized
form with round sectors.

**Value over hue.** The pictures live on a wide tonal range, deep warm darks against
a luminous sky, with muted colour inside it. A grade after the tone map widens the
lit values round middle grey and leaves the deep shadow and the brightest lights
where the render put them.

**A warm, drained palette.** Shadows go to an umber, midtones to an olive, highlights
to a cream, the whole drained of a tenth of its saturation and its blacks lifted a
shade. This is a split-tone, three tints with their amounts, and it belongs to the
game rather than to the shader: a record the game sets by name and fades between,
so a place or an event can turn the atmosphere.

The chain, then: the stroke filter first on the scene's linear colour, the grade
after it with the palette's nine uniforms, and the rest of the chain as it was. None
of this touches a material or a light. In Day Hike the world was also moved a step
toward the palette afterward (a drearier opening weather, a warmer ground haze, the
cover's green toward a sage, the sky's aerosols up for a paler noon), which is
ordinary tuning and the same on both APIs.

## 2. One filter, two speeds

The filter as first written was the textbook shape: one scan of the window, and at
each tap a loop over the eight sectors adding the tap into that sector's mean,
square and weight, the three held in function-scope arrays indexed by the sector.
It compiles on both engines and draws the same picture on both. It does not cost the
same.

| Engine, medium tier, 1200 by 675, display cap off | No stroke filter | Sector arrays | Named sums |
|---|---|---|---|
| WebGL2 (ANGLE, Metal) | 55.3 fps, 18.1 ms | 49.6 fps, 20.2 ms | 49.1 fps, 20.4 ms |
| WebGPU (Dawn, Metal) | 76.9 fps, 13.0 ms | 39.3 fps, 25.5 ms | 65.5 fps, 15.3 ms |

The stroke radius is 2 px on this tier, 25 taps a window, and the frames were
counted over 15 s with the display's cap off in Chrome (`--disable-frame-rate-limit
--disable-gpu-vsync`), without which the WebGPU column reads 60 with no filter and
the filter's cost cannot be told from the cap [6]. The array shape costs 2.1 ms on
WebGL2 and 12.5 ms on WebGPU. The same filter with its sums as named variables, a
function called eight times a tap with the sector's direction a constant and the
window's loops run to the radius rather than to a fixed reach, costs 2.3 ms on
both. A third shape tried between them, the sectors taken one after another with
their own scan of the window each, no array but eight times the texture reads, cost
more than the arrays on WebGL2 and about the same on WebGPU: the reads, not the
arrays, were its cost.

What the two paths do with the same source explains it. On WebGL2, ANGLE translates
GLSL ES 3.00 to Metal directly [9]. On WebGPU, Babylon.js translates GLSL to SPIR-V
with glslang and the SPIR-V to WGSL with Tint, and the browser's Dawn compiles the
WGSL to Metal again [10], [4]. A function-scope array indexed by a loop variable is,
in WGSL, a variable in the function address space whose elements are addressed at
run time [11]; the compiler at the end of the longer chain did not keep the eight
accumulators in registers, and every tap's eight updates went through memory. The
shorter chain did keep them. Writing the filter with no array to index is a change
of shape and not of arithmetic, and it is the shape to write first on any shader
that will run through a translation: the index that a compiler can see through on
one path is one it may not on the other.

## 3. Loops that end on a uniform, and the uniformity analysis

The filter's window is a loop whose bound is the radius, a uniform, with an early
exit inside it: a tap past the radius's circle is skipped with `continue`. GLSL ES
3.00 allows loops with any bound and any
exit [12]. WGSL allows them too, and translates them; what WGSL adds is the
uniformity analysis, which refuses a `textureSample` that it cannot prove is reached
by every invocation of a quad together [2]. The previous article met the refusal:
a texture read after a branch on a per-pixel value, fixed by reading an explicit
level instead [3]. The filter's reads are inside loops whose exits depend on the loop
counters, on the radius uniform and on the tap's place in its sector, none of them
per-pixel, so the analysis accepts them as written, and the pass compiles with no
diagnostic. The filter's reads are also made at an explicit level, which is the
other way to satisfy the analysis and costs nothing on a target with one level.

The one pass in the chain that reads the scene under a per-pixel branch, the film
finish, whose peripheral overlap reads the scene a second time inside a branch on
the pixel's distance from the frame's centre, turns the analysis off for itself:
the engine honours a per-shader define, `DISABLE_UNIFORMITY_ANALYSIS`, which it
turns into WGSL's `diagnostic(off, derivative_uniformity)` for that one translation
[13], [4]. It is safe there because the target has one mip level, so the level of
detail an implicit-derivative read gives up cannot select another; it would not be
safe on a mipmapped texture, where the read's derivatives are undefined on both APIs
[12]. The engine also has the same switch page-wide, for every shader it translates,
and that is the wrong tool on a renderer with hundreds of stages: the analysis is
the one place that says which reads are the unsafe ones. Day Hike leaves the
page-wide switch on, lets one stage turn the analysis off, and makes both the
page-wide state and each stage's own switch part of the key under which its
precompiled WGSL is looked up, so a translation made under one setting is never
served under the other.

## 4. Nine small uniforms

The palette is nine uniforms: three tints as `vec3`, three amounts as `vec2`, a
saturation, a curve as `vec2`, a lift as `vec3`. The engine's post process takes a
list of uniform names and a callback that sets them each frame, and that is the whole
of the API on both engines. Underneath it is not the same object. On WebGL2 each
name is a uniform location and each set is a call [14]. On WebGPU a post process's
uniforms are one uniform buffer, and WGSL lays a buffer out with alignment rules:
a `vec3` of f32 is 12 bytes in size but aligned to 16, so three tints as `vec3` are
padded to 48 bytes, and a `vec2` is aligned to 8 [5]. The engine writes the buffer
with those rules, and nothing in the shader changes. What the rules decide is how a
palette should be declared when it grows: a tint and its amount as one `vec4` each
(the three channels and the density, the saturation beside the next) is 16 bytes a
band with no padding and one set a band, where `vec3` and `vec2` apart are 32 bytes
and two sets. The nine uniforms here are set once a frame and cost nothing either
way; a palette set a draw, or a hundred of them, would be packed.

## 5. The targets, the same on both

The chain runs on linear colour in a half-float render target, so the stroke filter
sees the scene's dynamic range and the tone map in the grade sees the filter's
output as the renderer made it. A half-float target is renderable on WebGL2 through
`EXT_color_buffer_float` and on WebGPU as the `rgba16float` format [15], [16]; the
engine asks for the one it has and the chain is built on it. The first pass of the
chain owns the scene's render target and carries its multisampling, a blit to
resolve on one API and a resolve target on the other, which the previous article
covered [3]. Where the stroke filter is first in the chain it takes that place; where
the far field's prepass is first, the filter follows it and reads its output. Nothing
here differed between the engines beyond what the earlier article found.

## 6. The trap that was the same on both: strokes on linear light

The stroke filter was written on the scene's linear colour, before the tone map,
and at noon it painted. At a low sun it turned every crown against the sky
cyan-white, with holes where leaves had been, on both engines alike. Two things
compound. A sun seen through a crown is a texel of ten or a hundred where the leaves
beside it are tenths; in a sector's mean and variance the one texel owns the sector,
and the flattest sector near a crown is the sky's. And a leaf seen against a bright
sky takes the sky's sector, because it is the flattest, and vanishes into it.

The first fix, taking the statistics on the colour compressed toward one (c over
1 + c) and expanding the chosen mean again, made it worse in a way worth recording:
a mean taken in the compressed range and expanded is not a mean of the colours, and
near the top of the range it bends toward whichever channel was brighter, so a
salmon leaf beside a pale sky came back cyan. The filter now judges its sectors on
the compressed colour, so the bright texel is one among the others, and writes the
sectors' mean of the linear colour itself, capped, so the colour written is a colour
the scene had. A sector whose mean is far from the pixel's own colour weighs less,
so a thin leaf keeps its own sector against a flat sky. With that the crowns stood
at every hour.

The grade's value curve met a cousin of the same thing: widening the lit values
round middle grey pushed the brightest leaf past one and it clipped channel by
channel to the same cyan. The curve now rolls off above the upper midtones, and the
deep shadow is left alone from the other side, so a dark evening stays legible.

## 7. The palette as something the game turns

Because the split-tone is a record and not a constant, the frame's tonal identity is
a thing the game can set: the default oils; an ash, cold and drained, for a dead
place; an amber, an evening gone to gold; and none, the render as the tone map
leaves it. A palette is set by name and the frame fades from the one it wears to the
new one over three seconds, every value of the record interpolated. This costs
nothing on either engine beyond the nine uniforms, and it is the part of the work
that a game can build on: a weather that carries its own palette, a place that fades
one in as the player enters it, a palette as the sign that something has changed.

## 8. What was not measured

The frame rates are from one machine, through two translation chains, at one
resolution; the rig pairs on a discrete GPU, where the array shape may well cost
what it should, were not taken. The anisotropic form of the filter, whose sectors
follow the image's structure tensor, is the one the paper recommends and costs a
pass more to build the tensor, a fragment pass to a texture on WebGL2 or either that
or a compute pass on WebGPU; its cost on each was not measured. And the uniformity
diagnostic the film finish still logs was read, not removed.

## Sources

1. J. E. Kyprianidis, H. Kang, and J. Döllner, "Image and Video Abstraction by Anisotropic Kuwahara Filtering," *Comput. Graph. Forum*, vol. 28, no. 7, pp. 1955-1963, 2009. Accessed: Oct. 17, 2026. [Online]. Available: https://diglib.eg.org/handle/10.2312/CGF.v28i7pp1955-1963
2. A. Baker, M. O. Derin, and D. Neto, Eds., "WebGPU Shading Language," section "Uniformity," W3C Candidate Recommendation Draft. Accessed: Oct. 17, 2026. [Online]. Available: https://www.w3.org/TR/WGSL/#uniformity
3. C. Sarkosh, "Scene depth for a post process: WebGPU against WebGL2," csarko.sh. Accessed: Oct. 17, 2026. [Online]. Available: https://csarko.sh/research/scene-depth-for-a-post-process-webgpu-vs-webgl2
4. Babylon.js contributors, "Writing shaders for WebGPU in WGSL," Babylon.js Documentation. Accessed: Oct. 17, 2026. [Online]. Available: https://doc.babylonjs.com/setup/support/webGPU/webGPUWGSL
5. A. Baker, M. O. Derin, and D. Neto, Eds., "WebGPU Shading Language," section "Memory Layout," W3C Candidate Recommendation Draft. Accessed: Oct. 17, 2026. [Online]. Available: https://www.w3.org/TR/WGSL/#memory-layouts
6. MDN contributors, "Window: requestAnimationFrame() method," MDN Web Docs, Mozilla. Accessed: Oct. 17, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
7. Wikipedia contributors, "Kuwahara filter," Wikipedia. Accessed: Oct. 17, 2026. [Online]. Available: https://en.wikipedia.org/wiki/Kuwahara_filter
8. G. Papari, N. Petkov, and P. Campisi, "Artistic Edge and Corner Enhancing Smoothing," *IEEE Trans. Image Process.*, vol. 16, no. 10, pp. 2449-2462, Oct. 2007. Accessed: Oct. 17, 2026. [Online]. Available: https://doi.org/10.1109/TIP.2007.903912
9. ANGLE contributors, "ANGLE: Almost Native Graphics Layer Engine," GitHub repository. Accessed: Oct. 17, 2026. [Online]. Available: https://github.com/google/angle
10. Babylon.js contributors, "WebGPU Support," Babylon.js Documentation. Accessed: Oct. 17, 2026. [Online]. Available: https://doc.babylonjs.com/setup/support/webGPU
11. A. Baker, M. O. Derin, and D. Neto, Eds., "WebGPU Shading Language," section "Address Spaces," W3C Candidate Recommendation Draft. Accessed: Oct. 17, 2026. [Online]. Available: https://www.w3.org/TR/WGSL/#address-spaces
12. R. J. Simpson and J. Kessenich, Eds., "The OpenGL ES Shading Language, Version 3.00," Khronos Group. Accessed: Oct. 17, 2026. [Online]. Available: https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf
13. A. Baker, M. O. Derin, and D. Neto, Eds., "WebGPU Shading Language," section "Diagnostics," W3C Candidate Recommendation Draft. Accessed: Oct. 17, 2026. [Online]. Available: https://www.w3.org/TR/WGSL/#diagnostics
14. MDN contributors, "WebGLRenderingContext: uniform methods, uniform1f to uniform4fv," MDN Web Docs, Mozilla. Accessed: Oct. 17, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/uniform
15. MDN contributors, "EXT_color_buffer_float extension," MDN Web Docs, Mozilla. Accessed: Oct. 17, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float
16. K. Ninomiya, B. Jones, and J. Blandy, Eds., "WebGPU," section "Texture format capabilities," W3C Candidate Recommendation Draft. Accessed: Oct. 17, 2026. [Online]. Available: https://www.w3.org/TR/webgpu/#texture-format-caps
