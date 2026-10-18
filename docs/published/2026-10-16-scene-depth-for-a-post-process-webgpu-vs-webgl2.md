---
description: Getting per-pixel scene depth to a post process on WebGPU and WebGL2, and the six places the two APIs part ways, from shader uniformity to a lost GPU.
published: 2026-10-16
categories: Rendering
updated: 2026-10-17
source: https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-10-16-scene-depth-webgpu-vs-webgl2.md
---
# Scene depth for a post process: WebGPU against WebGL2

**Question:** A screen-space effect that needs to know how far away each pixel is,
a depth-aware blur, a fog, an outline, an ambient occlusion, has to get the scene's
depth into a texture the post process can read. On WebGL2 that has been done one of
two or three ways for a decade. A renderer that runs on WebGPU as well, which in a
browser engine such as Babylon.js is one flag away, finds that the same job meets
the two APIs' differences one after another. Which of them bite, which are the
engine's rather than the API's, and what does a lost GPU look like on each?

**Short answer:** the depth itself comes from the same three places on both APIs: a
second pass over the scene with a depth-only shader, the scene's own depth buffer,
or the scene drawn once into several targets with depth as one of them. The third
is the right one for a game that is bound by its draw count, and it is what we
shipped. On the way the two APIs parted in six places. WGSL's uniformity analysis
refuses a shader that samples a texture after a branch on a per-pixel value, which
GLSL compiles without a word, and the fix is an explicit sample level [1]. A draw
that leaves one of several targets untouched is a framebuffer state on WebGL2
(`drawBuffers`) and a pipeline's colour write mask on WebGPU, so one call in the
engine becomes two different objects [2], [3]. Multisampling several targets is a
blit per attachment on one and a resolve target per attachment on the other [4],
[5]. The depth's own varying counts against a device limit WebGPU is asked for up
front, which one material already filled [6]. A 32-bit float texture is filterable
on WebGL2 only with an extension and on WebGPU only with a device feature, and WebGPU
makes the mismatch a validation error rather than a wrong result [7], [8]. And losing the GPU is a lost context on
WebGL2 but a lost device on WebGPU, which when the browser's GPU process goes
takes WebGL2 down with it [9], [10]. Three more traps were the engine's and the same
on both: a prepass that reads the wrong camera's post-process chain and switches
itself off, one that rewrites the scene's image-processing flag every frame, and one
that takes up every render target the scene draws, impostor bakes among them.

The worked example is Day Hike, a first-person hiking game in Babylon.js 9.18, public at
[game-dayhike](https://github.com/csarkosh/game-dayhike) and playable at
[games.csarko.sh/dayhike](https://games.csarko.sh/dayhike/). Its high tier draws with
WebGPU in Chrome and Edge and everything else draws with WebGL2
([WebGPU vs WebGL2: what changes and what does not](/research/webgpu-vs-webgl2)).
The post process in question softens the far field, part of the work in
[A full far field](/research/full-far-field-for-browser-worlds): past 80 m of camera
depth the frame is blurred by a radius rising to 5 texels at 450 m, each read kept
only where its own depth is not much nearer than the pixel's, so near grass against
the far field keeps its edge. The machine throughout is an Apple M4 running Chrome 157,
WebGPU through Metal and WebGL2 through ANGLE's Metal backend.

## 1. Three places a depth can come from

Every renderer that wants a depth texture for a post process has the same three
options, and the choice is the same on both APIs.

**A second pass with a depth-only shader.** Babylon's `DepthRenderer` draws the scene
again into a target of its own, with a shader that writes `vViewPos.z` and nothing
else [11]. It needs nothing of the materials and works everywhere, and that is also
its flaw: it draws every mesh again, and with its own vertex stage, so anything a
material plugin did to the geometry (cards turned to face the camera, grass bent by
wind, far cover widened with distance) is missing from its depth. A scene that draws
several hundred thin-instanced buckets a frame pays for all of them twice.

**The scene's own depth buffer.** If the scene is multisampled, which an alpha-tested
world wants, the depth attachment cannot be read: WebGL2 cannot blit a multisampled
depth renderbuffer into a texture a sampler reads [4], and WebGPU allows no resolve
target on a depth attachment [5]. A single-sampled scene gives the depth away for free
and the edges with it.

**The scene drawn once into several targets.** Babylon's `PrePassRenderer` draws the
scene into a multiple render target, the materials' own shaders writing colour to the
first attachment and whatever was asked for, here camera-space depth, to the others
[12]. Every vertex plugin and every alpha test holds in the depth, nothing is drawn
twice, and both APIs take the same path. A post process asks for the depth by
declaring it in a configuration the prepass reads when it updates, the prepass's
targets become the first post process's input, and the multisampling moves to them.

Day Hike built the first and shipped the third. The rest of this note is what the
third asked of each API, and what the first revealed on the way.

## 2. A branch the GLSL accepted and the WGSL refused

The blur leaves early where its radius is under a fifth of a texel, which is most of
the frame, and samples its rings only past that:

```glsl
float r = smoothstep(soft.x, soft.y, d) * soft.z;
if (r < 0.2) { gl_FragColor = c; return; }
for (int i = 0; i < 12; i++) { ... texture2D(textureSampler, vUV + o) ... }
```

WebGL2 compiled and drew it. WebGPU refused the shader:

```
error: 'textureSample' must only be called from uniform control flow
note: control flow depends on possibly non-uniform value
  if ((x_56 < 0.20000000298023223877f)) {
note: return value of 'textureSample' may be non-uniform
  let x_24 : vec4<f32> = textureSample(depthSamplerTexture, depthSamplerSampler, x_22);
```

This is WGSL's uniformity analysis [1]. An implicit-level sample needs screen-space
derivatives, derivatives need every invocation in a quad to reach the same call, and
a branch on a value read from a texture cannot promise that; so the compiler rejects
the program rather than leave the result undefined. GLSL ES 3.00 has the same hazard
and makes it the author's problem: a derivative taken inside non-uniform control flow
is undefined, the driver returns something, and nothing is reported [13]. The same
text is a silent undefined value on one API and a compile error on the other.

The fix is the same on both. Every read goes to an explicit level,
`textureLod(sampler, uv, 0.0)`, which the translator turns into `textureSampleLevel`,
a builtin the analysis leaves alone because it takes no derivative [1]. The early
leave stays. The lesson generalises: on WebGPU, sample at an explicit level in any
post process that branches on what it reads, which is every depth-aware one.

Where the error surfaces depends on where the translation happens. Babylon turns GLSL
into WGSL through SPIR-V and Tint, at run time or ahead of it into a map the build
ships [14], so a shader that fails does so the first time that stage is translated:
on a machine without the shipped map, the first time the page opens. What the failure
did to the page is the subject of section 6.

## 3. A draw that leaves a target alone

The prepass compiles every capable material with as many outputs as there are
targets. A material that cannot write them all, in Babylon any `ShaderMaterial`, is
drawn with only the first target enabled, and the renderer tells the engine so through
one call, `bindAttachments`, that the two engines answer differently:

- **WebGL2** calls `gl.drawBuffers([COLOR_ATTACHMENT0, NONE])` [2]. The framebuffer
  keeps its attachments; the draw writes the first and leaves the second as it was.
  It is a state of the framebuffer, set between draws, and costs nothing.
- **WebGPU** has no such call. A render pass's colour attachments are fixed when the
  pass begins, and a fragment stage must declare an output for every target it writes
  [3]. Babylon's engine keeps the attachment list on its pipeline cache and bakes it
  into the render pipeline as a colour write mask of zero for the targets the draw
  leaves alone [15]. The target stays bound, the shader writes nothing to it, and the
  pipeline is a different pipeline from the one that writes both, so a scene with
  such materials carries two pipelines per material state instead of one.

Babylon's PBR shader carries the seam in its last lines:

```glsl
#ifdef PREPASS
#include<pbrBlockPrePass>
#endif
#if !defined(PREPASS) || defined(WEBGL2)
gl_FragColor=finalColor;
#endif
```

On WebGL2 `gl_FragColor` and `gl_FragData[0]` are the same output and both lines run;
on WebGPU only the prepass block writes [16]. Anything a material plugin does to the
final colour after the prepass block lands on one API and not the other. Day Hike's
plugins all write before it, at the hook above the block, so the two engines draw the
same colour; it is the kind of line to know about before the first "WebGPU looks
different" report.

What the untouched target holds is the clear value, which is 0 on both. The blur reads
0 as the far sky, so a far tree against the sky blurs with it as it should, and nothing
the sky dome does not write needs a special case.

The depth itself costs a varying. Every capable material's vertex stage gains a
`vViewPos` output for the prepass to write the depth from, and on WebGPU that output
counts against `maxInterStageShaderVariables`, a device limit a renderer asks for up
front [6]. Day Hike's giant trees' faded material already filled the 21 it asked for
on the high tier (three shadow cascades, a two-sided fragment reading `front_facing`),
and its pipeline failed with `Total fragment input variables count (22 = 21
(user-defined) + 1 (front_facing) exceeds the maximum (21)`, an uncaptured error that
rebuilt the renderer on WebGL2 once more. The limit the device is asked for rose to 22;
the Apple M4 adapter offers 28. WebGL2 has the same ceiling in `MAX_VARYING_VECTORS`,
but counts vectors the compiler packs scalars into and raised no error here [17].

## 4. Multisampling several targets at once

The scene is drawn at 4 samples a pixel. With one target that is a multisampled
renderbuffer resolved into a texture on WebGL2, or a multisampled texture with a
`resolveTarget` on WebGPU, and the post process reads the resolved texture. With two
targets each needs its own:

- **WebGL2** attaches a multisampled renderbuffer per colour attachment and, at the end
  of the pass, blits each into its texture with `blitFramebuffer`, one read and one draw
  binding per attachment [4].
- **WebGPU** gives each colour attachment of the render pass a multisampled texture and a
  `resolveTarget`, and the resolve is part of ending the pass [5].

Babylon hides both behind one setter on the multiple render target [18]. The engine
sets that instead of the first post process's own sample count, which with the prepass
in front of it would multisample a target nothing draws into. The depth target resolves
along with the colour, which averages the depth across a pixel's samples at an edge;
for a gate that asks only whether a neighbour is much nearer, that is fine, and it is
the same on both APIs.

## 5. Which float a sampler may filter

The prepass stores its depth in a 32-bit float texture where the engine can filter
one, otherwise in a 16-bit float. Both APIs render to both; what they let a sampler
do with them differs:

- **WebGL2** filters a 32-bit float texture only with `OES_texture_float_linear`;
  without it a linear sampler on one returns an incomplete texture's value, and no
  error [7].
- **WebGPU** makes filtering a validation matter. A 32-bit float texture has the sample
  type `unfilterable-float` unless the device was requested with the
  `float32-filterable` feature, and binding it to a filtering sampler is a pipeline
  error [8]. Babylon's WebGPU engine checks the texture's type against the device when
  it builds the bind group layout and, where the texture cannot be filtered, demotes
  the sampler to `non-filtering` and the binding to `unfilterable-float` on its own
  [15].

The blur reads the depth at the texel's centre at an explicit level, so it never needs
filtering and the demotion costs it nothing. A pass that did bilinear reads of a 32-bit
depth would run the same shader text on both APIs and get filtered depth on one and
point-sampled depth on the other.

## 6. Losing the GPU

Three of the first nine runs on WebGPU lost the device, about 25 s after the page
opened, and each time the renderer the engine rebuilt lost it again some 20 s later;
after the second loss the page could not make a WebGL2 context either, since the
browser's GPU process had gone with the device. Chrome's own log carried one line
before each loss, `A valid external Instance reference no longer exists`, and nothing
from Dawn's validation layer [19]. The losses came with a depth texture bound and read
by the post process, twice from the depth renderer's target and once from the
prepass's; a pass that bound the depth and read a constant instead never lost it, nor
did the depth pass drawing with no post process reading it, nor any of six later runs
that read the depth, with and without Dawn's backend validation. The cause was not found
then; the correlation with reading a float render target in a post process was the
strongest there was, and the runs that survived said it was not that alone. It was
found the day after, and the depth texture was a bystander (section 10).

What a lost GPU looks like is itself an API difference:

- **WebGL2** raises `webglcontextlost` on the canvas, and `webglcontextrestored` when
  the browser has a context again; the application is expected to handle both and
  rebuild its resources [9]. The GPU process is usually still there, and a new context
  on a new canvas works.
- **WebGPU** resolves the device's `lost` promise with a reason and a message, the
  device and everything made from it stop working, and the application requests a new
  adapter and device [10]. When the GPU process itself went down, every API it hosted
  goes with it, WebGL2 included, until the browser restarts it.

Day Hike's failure path rebuilds the renderer on a fresh canvas, once on WebGPU again
and then on WebGL2, pins the tab to WebGL2 and remembers the fall-back for the browser
version; on the runs above the second rebuild found no GPU to build on at any tier,
and the page kept its world with no renderer. The player sees the pause screen,
because a rebuild releases the pointer, which is how the problem was first noticed: a
still of the trailhead came out with the pause menu over it, and the shader error of
section 2, reported by Babylon as an uncaptured GPU error, had rebuilt the renderer on
WebGL2 underneath it. A shader that fails on one API is not a visual bug there; it is
an engine change.

A renderer cannot ship a one-in-three device loss in a feature. The softening shipped
on both engines because every run after the first nine, among them a full set of
seven stills at 75 s each, drew with the prepass and lost nothing, and a lost device
is an event the game's telemetry carries with its reason. It returned the day after, on WebGPU, and section 10 has the cause.

## 7. Three traps that were the same on both

Not every difference met was the API's. Three were the engine's, the same on WebGPU
and WebGL2, and they took longer to find than the API differences did, because a
prepass that is silently off draws the same frame on both engines, with no depth in it.

- **The prepass reads the chain from the scene's active camera.** It decides what it
  draws for by walking the active camera's post processes when it updates, which is at
  the first draw after anything marks it dirty: a pass attached or detached, its own
  creation [12]. The first draw of a frame is as often a render target's, a mirror or
  an impostor bake, whose own camera is the active one while it draws and has no chain.
  The prepass then finds nothing, switches itself off, and does not look again until
  something marks it dirty. The fix is to run its update with the chain's camera
  active.
- **The prepass writes the image-processing flag every frame.** It sets the scene's
  image processing to run in a post process only when it finds the engine's own
  image-processing pass in the chain [12]. A renderer with a grade pass of its own gets
  the flag set false, every lit material tone-maps in its shader, and the grade pass
  tone-maps the frame again. The fix is to pin the flag.
- **The prepass takes up every render target the scene draws.** The first time a
  render target clears, the prepass gives it a prepass target of its own and updates,
  which re-reads every material's defines [12]. A renderer that bakes impostors into
  render targets during play gets a re-read with each bake, the bake catches its
  materials mid-recompile and keeps nothing, and the far trees stand as bare poles,
  on both APIs alike. The fix is to opt every render target of one's own out of the
  prepass (`noPrePassRenderer`), so it draws for the scene's camera alone.

## 8. What a new shader variant costs to ship

Turning the prepass on compiles every capable material with a new define. On WebGL2
that is a recompile the browser does the first time it draws each material, from the
GLSL the page already has. On WebGPU each stage must be translated to WGSL, and a
renderer that wants a first visit never to wait on the translator ships the
translations: Day Hike builds a map of them from a recorded corpus, one per quality
tier [14], and a new define on every material is a new stage for every material, so
the corpus is recorded again before the map is built. Where the map is missing, the
page translates at run time and its render pipelines land one by one, so a still of
the meadow shot at 55 s on WebGPU showed the trees as bare poles with their crowns'
pipelines still to come, and the same still at 110 s showed them whole; on WebGL2 the
same page at 55 s was complete. The difference is not the engine's speed. It is where
the translation happens, and WebGPU moves it to the author.

## 9. What was not measured

No frame times were taken for the prepass against the depth renderer or against no
softening, on either API; the prepass was chosen on what it does not do, a second
pass, and on the correctness of its depth, not on a measurement. The device loss had
no reproduction when this was written; section 10 has one. What remains for the next
measurement is the cost of the second target and its resolve at 4 samples on each API.

## 10. Update (2026-10-17): what lost the GPU

The loss returned the day after the softening shipped, on a Mac whose GPU the
renderer's high tier saturates (about 0.8 s a frame with every draw in), in about
half of 60 s runs, and this time it was reproduced and traced. A probe on the page's
queue, a `GPUQueue.onSubmittedWorkDone` after every submit with the render passes
each carried, put every loss after a single frame of about 6 s or more of GPU work;
Chrome's log had the browser's compositor lose its own Dawn device first, `While
calling [Device].ImportSharedTextureMemory`, then the GPU process restart, and the
page's device go with it, which is the one line section 6 quotes [19]. The depth
texture was a bystander. The frames that reached 6 s were the ones drawn while
pipelines were still being created asynchronously, with the meshes whose pipelines
were pending left out: with the ground and the trees missing, the grass, the far
cover and the sky behind them were shaded over the whole screen, and a frame with
fewer draws cost four to seven times the whole one, 4 to 7 s against 1.3 s. The
previous build's partial frames took 5.5 s; the prepass's second target and a third
shadow cascade pushed them over the line. A depth renderer, a second pass over the
scene, added to the same frames, which is why section 6's runs with one lost the
device more often; it was never the read of the float target. The compiles were not
the cost either: every shader compiled in under 10 ms alone, and the seconds they
appeared to take were the GPU process's main thread waiting on the GPU.

Two things follow for a renderer on WebGPU in Chrome. The page's device and the
compositor's share one GPU process, so a frame that holds the GPU for seconds is not
a slow frame, it ends every API the process hosts, WebGL2 included; on a saturated
GPU the frame's time is a hard limit, not a quality setting. And a frame drawn with
draws left out is not a cheaper frame when what is left out is the occluders; a
renderer that creates its pipelines asynchronously does better to hold the frame
while any creation is pending, which keeps the canvas's last image when the canvas
texture is acquired only for a pass that draws, than to draw the scene without its
ground. With the frames held, the same machine lost the device in none of 18 runs.

## Sources

1. A. Baker, M. O. Derin, and D. Neto, Eds., "WebGPU Shading Language," section "Uniformity," W3C Candidate Recommendation Draft. Accessed: Oct. 16, 2026. [Online]. Available: https://www.w3.org/TR/WGSL/#uniformity
2. MDN contributors, "WebGL2RenderingContext: drawBuffers() method," MDN Web Docs, Mozilla. Accessed: Oct. 16, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/drawBuffers
3. K. Ninomiya, B. Jones, and J. Blandy, Eds., "WebGPU," section "GPUFragmentState," W3C Candidate Recommendation Draft. Accessed: Oct. 16, 2026. [Online]. Available: https://www.w3.org/TR/webgpu/#fragment-state
4. MDN contributors, "WebGL2RenderingContext: blitFramebuffer() method," MDN Web Docs, Mozilla. Accessed: Oct. 16, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/blitFramebuffer
5. K. Ninomiya, B. Jones, and J. Blandy, Eds., "WebGPU," section "GPURenderPassColorAttachment," W3C Candidate Recommendation Draft. Accessed: Oct. 16, 2026. [Online]. Available: https://www.w3.org/TR/webgpu/#color-attachments
6. K. Ninomiya, B. Jones, and J. Blandy, Eds., "WebGPU," section "Limits," W3C Candidate Recommendation Draft. Accessed: Oct. 16, 2026. [Online]. Available: https://www.w3.org/TR/webgpu/#limits
7. Khronos WebGL Working Group, "OES_texture_float_linear," WebGL extension registry, Khronos Group. Accessed: Oct. 16, 2026. [Online]. Available: https://registry.khronos.org/webgl/extensions/OES_texture_float_linear/
8. K. Ninomiya, B. Jones, and J. Blandy, Eds., "WebGPU," section "Texture format capabilities," W3C Candidate Recommendation Draft. Accessed: Oct. 16, 2026. [Online]. Available: https://www.w3.org/TR/webgpu/#texture-format-caps
9. MDN contributors, "HTMLCanvasElement: webglcontextlost event," MDN Web Docs, Mozilla. Accessed: Oct. 16, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event
10. MDN contributors, "GPUDevice: lost property," MDN Web Docs, Mozilla. Accessed: Oct. 16, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost
11. Babylon.js Authors, "depthRenderer.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 16, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Rendering/depthRenderer.ts
12. Babylon.js Authors, "prePassRenderer.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 16, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Rendering/prePassRenderer.ts
13. Khronos Group, "The OpenGL ES Shading Language, version 3.00," section 8.9, "Fragment processing functions." Accessed: Oct. 16, 2026. [Online]. Available: https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf
14. C. Sarkosh, "WGSL map per tier: design," game-dayhike design doc, GitHub repository. Accessed: Oct. 16, 2026. [Online]. Available: https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-10-01-wgsl-map-per-tier-design.md
15. Babylon.js Authors, "webgpuCacheRenderPipeline.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 16, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Engines/WebGPU/webgpuCacheRenderPipeline.ts
16. Babylon.js Authors, "pbr.fragment.fx," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 16, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Shaders/pbr.fragment.fx
17. MDN contributors, "WebGLRenderingContext: getParameter() method," MDN Web Docs, Mozilla. Accessed: Oct. 16, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getParameter
18. Babylon.js Authors, "multiRenderTarget.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Oct. 16, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Materials/Textures/multiRenderTarget.ts
19. Dawn Authors, "Dawn, a WebGPU implementation," README, GitHub repository. Accessed: Oct. 16, 2026. [Online]. Available: https://github.com/google/dawn
