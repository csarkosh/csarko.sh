---
description: How WebGPU differs from WebGL2, what it can and cannot make faster, and the porting gotchas, with measurements from a Babylon.js game.
published: 2026-09-27
---
# WebGPU and WebGL2: what changes and what does not

**Question:** Day Hike, our first-person co-op hiking game in Babylon.js 9.18, renders with WebGL2;
a WebGPU path for it is being built and has not shipped. What does WebGPU change about how a frame
is built, where does it make a real game faster, where can it not, and what goes wrong on the way?

**Short answer:** WebGL2 is an OpenGL ES 3.0 state machine behind a canvas context. WebGPU has you
build explicit objects (pipelines, bind groups, command buffers) that are validated mostly when they
are created, leaving lighter checks at each draw, and adds compute shaders, storage buffers,
indirect draws and explicit load and store operations on render passes. No API makes a fragment
shader cheaper, and a frame the GPU limits hides any CPU saving. In Day Hike, on an Apple M4 in
Chrome 153, the WebGPU engine alone drew our heaviest pose about 1.3 to 1.5 ms faster than WebGL2 at
native resolution and 9.93 ms faster at four times the pixels, in a frame where JavaScript was 3.79
ms of 24.2 ms: a gain that grows with pixels, not with draws. Compute-culled grass saved about 1 ms
more but dropped clumps on fast turns, and against a CPU filter that has shipped since, it would be
worth about 0.17 ms. The costs were 2.7 MB of shader translators (913 KB gzipped), a slower cold
start, six fixes before every material compiled, and four defects in the engine and its loaders
(sections 4.4 and 4.8). As of September 2026 WebGPU is on by default in Safari 26; in Chrome and
Edge on Windows, macOS, ChromeOS and most Android devices; and in Firefox on Windows and
Apple-silicon Macs. It is still off for most Linux users, on Windows on Arm, and in Firefox on Linux
and Android, so a WebGL2 fallback is still required.

Day Hike is public at [game-dayhike](https://github.com/csarkosh/game-dayhike) and playable at
[games.csarko.sh/dayhike](https://games.csarko.sh/dayhike/). Its GLSL material plugins are described
in [Babylon.js material plugins: hooks and traps](/research/babylon-material-plugin-traps), and
[Grass fullness without thinning the field](/research/grass-fullness-without-thinning) asked whether
WebGPU compute culling would pay.

## 1. Two mental models

### 1.1 WebGL2: one context, one state machine

WebGL2 is "an API that conforms closely to the OpenGL ES 3.0 API", reached through a canvas context,
with shaders in GLSL ES 3.00 [1]. You bind a program, buffers, textures and framebuffers to
binding points, set blend, depth and cull state, set uniforms, and draw; each draw uses whatever is
bound at that moment. Chrome's migration guide calls that global state "a major source of errors"
[2]. In Chrome the calls go through ANGLE, which translates OpenGL ES to Direct3D 11, Vulkan,
desktop OpenGL or Metal [3]; on our reference Mac the renderer string reads `ANGLE (Apple,
ANGLE Metal Renderer: Apple M4, Unspecified Version)`.

Because state can change between any two draws, it is checked around each draw: an indexed draw that
fetches indices past the end of its element buffer must fail with `INVALID_OPERATION`, and one that
reaches past a vertex buffer must fail or read safe values [4], [1], so each draw is
checked against whatever is bound at that moment.

### 1.2 WebGPU: explicit objects

WebGPU is initialised without a canvas [5]. You ask `navigator.gpu` for an adapter (a GPU
and its driver), ask the adapter for a device with the features and limits you need, and submit work
through the device's queue [6]. Everything else is an object made up front.

| | WebGL2 | WebGPU |
|---|---|---|
| Getting started | `canvas.getContext("webgl2")`, synchronous | `requestAdapter`, `requestDevice` (promises), then configure a canvas context |
| Shaders | a program linked from GLSL ES 3.00 | a WGSL shader module, used by a pipeline |
| Blend, depth, cull, vertex layout | global state, changeable before any draw (vertex layout can be captured in a vertex array object) | baked into an immutable render pipeline |
| Resources | bound to units and binding points before a draw | bind groups, made in advance against a layout |
| Commands | issued straight on the context | recorded into render and compute passes, then submitted |
| Attachments | a framebuffer, cleared by a call | a render pass with a load and a store operation per attachment |
| Errors | `getError()`, synchronous | error scopes and an `uncapturederror` event, asynchronous |
| Under the browser | ANGLE, in Chrome | Dawn, which has D3D12, Metal, Vulkan and OpenGL backends, in Chrome [7]; wgpu in Firefox [8]; WebKit's, on Metal, in Safari [9] |

A pipeline "is immutable"; buffers and textures cannot change size, usage or format [2].

### 1.3 Where validation happens, and when

JavaScript gets its objects back at once; validation runs on the device timeline, in the GPU
process. An object that fails is returned anyway, marked invalid, and invalidity is contagious: "if
a call takes one WebGPU object and returns a new one, the new object is also invalid" [5].
The heavy state checks move to creation time: a pipeline against its shaders and layout, a bind
group against its layout [10], a render bundle when it is recorded, so replaying one can skip
them [11]. Each draw still gets lighter checks, such as whether the bound pipeline and
bind groups fit together and the buffers are large enough [10]. The explainer's case is that
WebGL "doesn't match the design of modern GPUs, causing CPU performance and GPU performance issues"
[5]. That is design intent; section 2 separates it from what has been measured.

### 1.4 How a frame is built

A WebGL2 frame is a stream of calls: bind, set, draw, repeat. A WebGPU frame is recorded, then
submitted: take this frame's canvas texture (a new one each frame [5]), create a command
encoder, begin a render pass that names each attachment's load operation (`clear` or `load`) and
store operation (`store` or `discard`), set a pipeline, bind groups and vertex buffers, draw, end
the pass and submit. Compute passes go in the same encoder, so a culling pass can run just before
the render pass that reads its output.

### 1.5 Shaders: GLSL ES 3.00 and WGSL

WGSL is a new language, not a GLSL dialect [12]. Bindings are explicit (`@group(0) @binding(1)`);
a texture and its sampler are separate variables (`textureSample(t, s, uv)`); there are no `gl_`
built-ins, so the vertex position is a return value marked `@builtin(position)`. The compiler is
stricter. Its uniformity analysis refuses a texture sample with implicit derivatives unless it can
prove the call runs in uniform control flow, because otherwise "incorrect or non-portable behavior
occurs" [12]. It also pins down edge cases: an out-of-bounds access can reach only memory the
module already has (its own variables and bound resources), never anything outside them, and a
signed integer divided by a runtime zero yields the dividend [12].

### 1.6 Errors, and what is asynchronous

In WebGL, `getError()` "causes a flush + round-trip to fetch errors from the GPU process", a
`readPixels()` to the CPU costs a "finish + round-trip", and checking a shader's compile status
blocks until the compile finishes; `KHR_parallel_shader_compile` adds a non-blocking completion
query to poll instead [13].

In WebGPU, adapter and device requests are promises; a buffer is read back with `mapAsync`; and
`createRenderPipelineAsync` is preferred "whenever possible, as it prevents blocking the queue
timeline work on pipeline compilation" [10]. Errors come through `pushErrorScope` and
`popErrorScope`, where "each error scope stores only one error it captures", or the device's
`uncapturederror` event, and a lost device resolves the `device.lost` promise [5].

### 1.7 The same triangle in both

One triangle, coloured by a uniform. WebGL2:

```js
const gl = canvas.getContext("webgl2");
const vs = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;
const fs = `#version 300 es
precision highp float;
uniform vec4 color;
out vec4 outColor;
void main() { outColor = color; }`;
const prog = gl.createProgram();
for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  gl.attachShader(prog, s);
}
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0.5, -0.5, -0.5, 0.5, -0.5]), gl.STATIC_DRAW);
const posLoc = gl.getAttribLocation(prog, "pos");
gl.enableVertexAttribArray(posLoc); // kept in the default vertex array
gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
const colorLoc = gl.getUniformLocation(prog, "color");

// Every frame: set the state, then draw with whatever is bound.
gl.useProgram(prog);
gl.uniform4f(colorLoc, 1, 0.5, 0, 1);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.drawArrays(gl.TRIANGLES, 0, 3);
```

WebGPU:

```js
const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) throw new Error("no WebGPU here: take the WebGL2 path");
const device = await adapter.requestDevice();
const context = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format });

const module = device.createShaderModule({ code: `
  @group(0) @binding(0) var<uniform> color: vec4f;
  @vertex fn vs(@location(0) pos: vec2f) -> @builtin(position) vec4f {
    return vec4f(pos, 0.0, 1.0);
  }
  @fragment fn fs() -> @location(0) vec4f { return color; }` });
const pipeline = device.createRenderPipeline({
  layout: "auto",
  vertex: { module, entryPoint: "vs", buffers: [{ arrayStride: 8,
    attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }] },
  fragment: { module, entryPoint: "fs", targets: [{ format }] },
});
const vbuf = device.createBuffer({ size: 24, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
device.queue.writeBuffer(vbuf, 0, new Float32Array([0, 0.5, -0.5, -0.5, 0.5, -0.5]));
const ubuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: ubuf } }] });

// Every frame: record a pass against objects made once, then submit.
device.queue.writeBuffer(ubuf, 0, new Float32Array([1, 0.5, 0, 1]));
const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass({ colorAttachments: [{
  view: context.getCurrentTexture().createView(),
  clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }] });
pass.setPipeline(pipeline);
pass.setBindGroup(0, bindGroup);
pass.setVertexBuffer(0, vbuf);
pass.draw(3);
pass.end();
device.queue.submit([encoder.finish()]);
```

The WebGPU version is longer to set up and makes more calls per frame, because it records and
submits commands explicitly. None of them re-describes the vertex layout, blend state or target
format, fixed once in the pipeline; WebGL2 keeps the vertex layout in a vertex array, as above.

## 2. Why WebGPU is preferred

Most of the case is capability and design intent; controlled cross-API measurements that state their
hardware are scarce. The last column says which kind each reason is.

| Reason | What it buys | Evidence |
|---|---|---|
| Compute shaders | Culling, simulation and particles on the GPU, feeding draws without a CPU round trip | Capability. WebGL has none; its compute effort stopped when "the decision was made to halt further expansion of the WebGL API" [14] |
| State validated once | Less CPU per draw | Design intent [5]. MDN: "rendering of individual objects is significantly cheaper on the CPU side", no figures [6]. We found no controlled per-draw comparison stating its hardware |
| Render bundles | Recorded draws replayed with less encoding overhead [10] and validation skipped [11] | CPU only: if an application "is GPU bound ... render bundles won't magically improve performance" [11] |
| Storage buffers, indirect draws | Bindings of at least 128 MiB against 64 KiB for uniforms, writable from shaders [10]; draw arguments written by the GPU [15] | Capability, with one measured pitfall below |
| Load and store operations | Clears and discards stated per pass, which the GPU can skip or keep in tile memory; WebGL2 can discard too, with `invalidateFramebuffer` [13] | Hardware-dependent: a clear is "significantly cheaper" on "primarily mobile" hardware [10] |
| A stricter language | Defined behaviour, so a shader fails or works the same everywhere | Specification [12] |
| Many canvases, workers | One device drives any number of canvases [5]; Chrome and Safari allowed at most 16 WebGL canvases at once when Chrome's guide was written [2] | Capability. WebGL2 also runs in workers through `OffscreenCanvas` [16], so workers alone are no reason |
| Timestamp queries | Per-pass GPU time | Capability, quantised in Chrome (section 4.9) |
| Direction | New GPU features land here | Apple: WebGPU "supersedes WebGL on macOS, iOS, iPadOS, and visionOS and is preferred for new sites and web apps" [9] |

**The tenfold figure.** Google's November 2025 post says "Babylon.js' Snapshot Rendering, which uses
GPU Render Bundles, can help render scenes approximately 10 times faster" [17]. Babylon's
documentation gives the conditions: "the scene should be mostly static", and "the performance
improvement is on the JavaScript side only", with GPU time about the same, perhaps a little better
depending on the browser [18]. It is a CPU figure for static scenes.

**Indirect draws can cost more than they save.** Brandon Jones, a WebGPU specification editor,
attached PIX to Chrome on Windows and found, in a scene with 412 indirect draws on one Windows
device, that "of the ~6ms that it takes to execute the render pass on this device, ~3ms of that time
is just performing indirect draw validation"; putting every draw's arguments in one buffer cut it
"from 3ms to just over 10μs" [15]. He scopes it to "Chrome/Dawn on Windows", though a
later edit notes Vulkan backends can behave the same way.

**WebGL is maintained, not extended.** Small extensions still arrive, two approved in April 2024
[19], but the working group halted the API's expansion in favour of WebGPU [14],
and MDN says WebGL "won't get any of these new features" [6].

## 3. Where it can and cannot optimise

### 3.1 Two limits no API removes

**The same shading on the same pixels costs the same.** Day Hike's terrain makes 45 to 80 texture
fetches per pixel, and it makes them on either API. WebGPU can change how many pixels are shaded,
but so can WebGL2, and neither changes the cost of one.

**A frame the GPU limits hides CPU savings.** If the GPU finishes last, a faster CPU side moves
nothing on screen. It frees the main thread, which is worth having, but the frame time stays.

### 3.2 The Day Hike frame

The reference machine is an Apple M4 running Chrome 153 (headless) on Metal, with WebGL2 through
ANGLE's Metal backend and Babylon.js 9.18.0. The pose is a grass sward under a closed canopy, misty,
at noon, on the high quality tier, in a 1200 by 2029 window at device pixel ratio 1. Frames are
measured in pairs of fresh pages, builds alternating, 8 s of frame intervals each, with same-build
rounds for the noise floor; a page counts only within 0.5 ms of its build's lowest mean.

In Day Hike, we measured on WebGL2 a 24.2 ms frame, of which JavaScript was 3.79 ms, over 222 to 229
draw calls. JavaScript is 3.79 ms of it, so the GPU side limits the frame. The WebGPU engine alone,
every material translated from GLSL (section 4.7) after the fixes of section 4.6, drew the same
pose:

| Pixels | WebGL2 | WebGPU | Difference |
|---|---|---|---|
| 1200 by 2029 (2.4 Mpx) | 24.22 ms | 22.69 ms | 1.53 ms faster |
| 2400 by 4058 (9.7 Mpx) | 55.14 ms | 45.21 ms | 9.93 ms faster |

Both rows are lowest quiet means. The second is robust (same-build rounds within 0.02 ms). The first
is weaker: no native pair round was quiet on both pages, and the quiet pages' means give 1.34 to
1.49 ms. Both builds predate the CPU grass filter described in [Grass fullness without thinning the
field](/research/grass-fullness-without-thinning).

A gain that grows about 6.5 times when the pixels grow 4 times is not per-draw work. It grows faster
than the pixels, which pure per-pixel work would not, and that points at memory bandwidth or cache
effects. We have not attributed it: memory traffic, multisample resolves and what each pass loads
and stores are the candidates, and per-pass timestamps (section 4.9) would settle it. We have not
measured the JavaScript frame on WebGPU.

### 3.3 The levers

| Lever | Pays when | Does not pay when | Day Hike |
|---|---|---|---|
| CPU submission: pipelines, bind groups, bundles | The CPU limits the frame | The GPU limits it; the draw set changes every frame, so bundles are re-recorded | JavaScript is 3.79 of 24.2 ms, and culling changes our draws nearly every frame |
| Work moved to compute | Per-frame CPU work the GPU could do in parallel | The work is small or the CPU was not the limit | Blade culling, below |
| GPU-driven submission: compute writes the count, an indirect draw reads it | Many instances are off screen and their vertex work is the cost | A CPU filter already removes most of them | Blade culling, below |
| The shader pipeline | Load time and hitches: native WGSL skips translation | Frame time: same shader, same work | Section 4.7 |
| Pass structure: load, store, multisampling | Memory traffic dominates, at high resolution and on tile-based GPUs | The engine hides the operations, or a pass begins more than once a frame. Not WebGPU-only: WebGL2 can discard with `invalidateFramebuffer` | Section 3.4 |

**Compute culling, measured.** We culled the blade field (6,131 grass clumps at this pose) in a
compute pass, one thread per clump, feeding the survivors to the existing materials. With the count
read back one frame late, it kept 743 clumps and drew the pose 1.03 ms faster than WebGPU without
culling at native resolution (same-build floor plus or minus 0.11 ms), and about 0.87 ms faster at
four times the pixels (by lowest means). But the read-back lags the view: clumps entering the frame
went undrawn, summing over a full turn in place to 14 clump-frames at 90 degrees a second and 484 at
360 degrees a second. Writing the count into the draw's indirect arguments cannot lag, but it has
one round at four times the pixels (0.65 ms faster) and no quiet one at native, so its saving is not
established.

Since then a per-frame CPU frustum filter has shipped on WebGL2. It keeps a larger share of the
clumps (0.263 against 0.121), and at the 1.17 ms per unit share the compute pass saved, what compute
culling would add at rest is about 0.17 ms, derived rather than measured. It would also remove the
filter's 0.19 to 0.35 ms of JavaScript a frame while turning (measured on WebGL2), which a
GPU-limited frame hides. GPU culling competes with the best CPU culling, not with none.

### 3.4 Pass structure: two hypotheses, not results

Neither is measured, and neither is WebGPU-only. Both are ceilings from memory-traffic arithmetic at
an assumed 100 to 120 GB/s, and framebuffer compression could make either far smaller.

**A multisampled main pass that needs none.** Babylon's WebGPU engine with antialiasing on makes the
canvas pass a 4-sample colour target with a 4-sample depth and stencil target [20]. On our
high tier only the last post-process's full-screen quad is drawn there; the scene is antialiased in
its own target. Storing 4 samples of colour (4 B each, 39 MB over 2.435 Mpx) and of depth and
stencil (about 5 B each, 49 MB, for the 24-bit depth plus 8-bit stencil format the game gets by
asking for a stencil buffer) is about 88 MB a frame, 0.73 to 0.88 ms at native. The pass is begun
three times a frame (a clear, a depth clear, the quad); counting three stores, the ceiling is about
2.2 to 2.6 ms, more if the later begins also load. Four identical samples resolve to what one would
have written, so no pixel should change.

**A scene target stored after its resolve.** The scene's 4-sample half-float target resolves inside
its pass, yet its samples and depth are stored every frame and never read: about 127 MB, a ceiling
of about 1.1 to 1.3 ms at native. WebGPU can express the fix, a `discard` store operation; Chrome
146 added transient attachments, which let "render pass operations stay in tile memory" [21]
and must be cleared on load and discarded on store [10]. Babylon 9.18 hard-codes `store` on every
attachment. Its one stated reason, on the canvas pass's colour attachment, is: "don't use
StoreOp.Discard, else using several cameras with different viewports or using scissors will fail
because we call beginRenderPass / endPass several times for the same color attachment" [20];
the render-target path follows the same rule without comment. So a discard is safe only while the
pass begins once a frame: a compute dispatch mid-scene would end the pass and begin it again, and
the second pass would load zeros in place of the first pass's samples [10]. WebGL2 has the same
lever, `invalidateFramebuffer` after the resolve [13]; Babylon 9.18 does not call it on its
WebGL2 path, and neither do we yet.

## 4. Gotchas

### 4.1 Support, as of September 2026

| Browser | Platform | On by default | Not yet |
|---|---|---|---|
| Chrome, Edge | Windows (Direct3D 12), macOS, ChromeOS | 113 | Windows on Arm: behind a flag |
| Chrome | Android 12 or later, Qualcomm, Arm and Intel GPUs | 121 | Imagination from 139 on Android 16; others pending |
| Chrome | Linux | 144 on Intel Gen12 or later; 147 on NVIDIA under Wayland | Other GPUs: behind command-line flags |
| Firefox | Windows | 141 | |
| Firefox | macOS on Apple silicon | 145 on macOS 26; 147 on all versions | Intel Macs: Nightly only |
| Firefox | Linux, Android | | Linux: Nightly only, expected in 2026. Android: behind a flag |
| Safari | macOS, iOS, iPadOS, visionOS | 26 | |

The table follows the WebGPU group's implementation status page, updated 13 August 2026 [22].
Vendor posts back Chrome 113 and 121 (naming only Qualcomm and Arm GPUs), Firefox 141 and 145,
Safari 26 [17], [9], [8], Chrome on Linux (NVIDIA in 147 or 148) [23],
[24] and Firefox 147 [25]. Windows on Arm, Intel and Imagination GPUs on Android, Intel
Macs, and Firefox on Linux and Android rest on the status page alone. Support is per GPU and driver
too, so `requestAdapter` can resolve to `null` in a browser that has WebGPU [10]. Firefox 141
shipped with GPU-process communication that "introduces significant overhead"; the fix landed in
Firefox 142 [8]. Chrome 146 added an opt-in compatibility mode, `featureLevel:
"compatibility"`, for OpenGL ES 3.1 devices, starting with Android [21].

### 4.2 You still need WebGL2

Every entry in the "Not yet" column, and the Firefox Linux and Android row, is a player on WebGL2,
as is anyone whose adapter lacks a limit you need. Babylon's documentation shows the pattern: test
`WebGPUEngine.IsSupportedAsync`, otherwise create a WebGL engine; creating the WebGPU engine is
itself asynchronous [26]. That is two render paths to keep at parity. In Day Hike's WebGPU
path every failure we could force (no WebGPU, a limit short, a stalled adapter, translators that
never load, a lost device, a failing shader) ends on WebGL2.

### 4.3 Limits are small until you ask

A device gets the default limits unless it requests more, and "API calls perform validation
according to these limits (not the adapter's limits)" [10]. The defaults include 4 bind groups, 8
vertex buffers, 16 inter-stage variables, 16 sampled textures and 8 storage buffers per stage, 8,192
texels on a side for a 2D texture, 64 KiB for a uniform binding, and 256-byte alignment for uniform
buffer offsets; under compatibility mode some are lower, such as 15 inter-stage variables, 4,096
texels and 16 KiB [10]. Request a limit the adapter lacks and `requestDevice` rejects with an
`OperationError`; a missing feature rejects with a `TypeError` [10]. Request exactly what you
measured you need: asking for everything the adapter offers lets a pipeline outgrow the defaults on
your machine and fail on a weaker one.

In Day Hike, the grass blade material needed 17 inter-stage variables (Babylon's PBR varyings plus
four of ours), and every instanced layer uses 7 of the 8 vertex buffers. In the compute culling, a
clump's geometry took four buffers and instances at large offsets in one shared buffer six more,
until interleaving put every offset inside the stride.

### 4.4 Device loss, and errors that never surface

A device can be lost at any time, from a driver reset, a GPU process crash or `destroy()`
[5], and anything rendered once, such as a baked impostor, must be rendered again. In Day
Hike, a forced loss started Babylon's own recovery, which threw an uncaught `TypeError` once on our
scene, so we reload instead of relying on it.

Asynchronous errors are easy to lose. In Day Hike, a GLSL shader that failed to translate left only
an unhandled promise rejection and never reached Babylon's `onEffectErrorObservable`; with the
device's other errors held back in a test, the game ran on for 80 s with that effect never drawn. A
broken shader looked like one still compiling; treat a rejection from the shader path as a compile
failure.

### 4.5 Nothing is synchronous

Reading a buffer back means `mapAsync` [10], and Babylon made every pixel-reading method return a
promise, on WebGL too, for that reason [26]. A readback that feeds the next frame lags the
view by at least a frame, which is what dropped grass on turns in section 3.3.

Pipeline creation is the other stall: `createRenderPipeline` returns at once, but compilation can
stall the device timeline anywhere from the call to the first submit that uses the pipeline [10].
Reading Babylon 9.18's source, we found it creates render pipelines synchronously on a cache miss,
and its public pre-warm does not match materials with float or depth textures or instance
attributes: in Day Hike, the terrain, every shadow receiver and every instanced layer. So a new
shader variant, such as the one a joining player's headlamp adds to every lit material, lands as a
hitch we have not yet measured.

### 4.6 WGSL rejects what GLSL accepted

Six changes were needed before every material in Day Hike compiled and drew on WebGPU:

1. **Uniformity.** A post-process sampled a texture after a branch on a varying: "'textureSample'
   must only be called from uniform control flow". WGSL can switch that diagnostic off for a module
   with the directive `diagnostic(off, derivative_uniformity);` or for a function or block with the
   attribute `@diagnostic(off, derivative_uniformity)` [12]; off everywhere, it hides every other
   such fault.
2. **Samplers passed to functions.** Two helpers took a `sampler2D` argument, which the translation
   rejects; Babylon documents the rule and an inliner for it [26]. We made them macros.
3. **A reserved word.** A local named `macro`, which WGSL reserves along with names such as `self`,
   `set`, `ref` and `module` [12].
4. **17 inter-stage variables**, one over the default (section 4.3).
5. **An unbound binding.** A plugin bound no texture while its effect was off; WebGL2 allowed it,
   WebGPU did not. Babylon: "WebGPU is less forgiving than WebGL" here [26].
6. **An extension not imported.** A painted sign threw until the WebGPU engine's dynamic-texture
   extension was imported; the WebGL2 imports never pulled it in.

A seventh failed silently: the forest impostor bake timed out on its 5 s shader budget under the
slower translation, and the far forest did not draw.

Then coordinates and layout. Clip-space depth runs 0 to 1 in WebGPU against minus 1 to 1 in WebGL
[2], so projection matrices differ. Framebuffer, viewport and fragment coordinates start at the
top left with Y down, while clip space keeps Y up [10], [2]; code that flips render targets
needs a second look. A `vec3<f32>` aligns to 16 bytes, and in a uniform buffer so do array elements
and nested structs unless the `uniform_buffer_standard_layout` language extension is available
[12]. There is no `generateMipmap`; you write the downsampling yourself [2].

### 4.7 Porting GLSL means shipping translators

Babylon's WebGPU engine takes WGSL natively, but a GLSL shader goes to SPIR-V through glslang and
then to WGSL through a WebAssembly build of Tint [27], shipped as twgsl [28]. Every
Day Hike material takes that route. The binaries are 943,680 B (glslang) and 1,702,916 B (twgsl),
with loaders of 16,030 B and 74,555 B: 2,737,181 B in all, 913,730 B after gzip, fetched only on the
WebGPU path. In Babylon 9.18 each translation runs synchronously on the main thread [20].

From pressing Play to the first frame, in a fresh browser context with an empty HTTP cache (the GPU
shader cache is shared across contexts, so a new machine is colder), the cold start was 1.37 s on
WebGPU against 1.1 s on WebGL2. We have not split the difference into download, translation and
pipeline compilation.

Dropping them means porting every GLSL shader: in Day Hike, about 1,325 lines across nine plugins,
three post-processing shaders and the sky, kept in step with the GLSL while WebGL2 ships.

### 4.8 Engines lag the API

Reading Babylon 9.18's source, we found no public API for a GPU-written instance count (compute can
write instance data, but an indirect draw's count lives in an internal draw context, which the
engine rewrites from the CPU when its own count changes); for per-pass snapshots (snapshot rendering
records the whole frame, unusable while culling changes the draws); for a pre-warm that matches the
materials of section 4.5; or for a `discard` store operation (section 3.4).

It also has a defect only WebGPU meets. The render pipeline cache keys a vertex layout on each
vertex buffer's hash, which folds in type, normalisation, size, instancing and stride but not the
byte offset [29], while the pipeline bakes in the offset whenever it lies inside the stride
[29], [30]. Two meshes reading one buffer at different offsets share the first one's
pipeline, and the second reads the wrong data: in our culling build, the blades vanished. We add the
offset into those buffers' hash.

The translators' loaders had one of their own. Both are classic scripts that declare a top-level
`var Module` and read it when called, not when loaded. Loaded in parallel, the last to finish owned
the global, and glslang's binary went to twgsl's factory: the engine failed to start on 18 of 19
loads on the development server and 3 of 3 of a production build, falling back to WebGL2 after a 10
s budget. Loading them one after the other fixed it.

Documentation lags too: Babylon's WebGPU status page still says timestamp queries "are currently
disabled in Chrome" [31], while Chrome shipped them, quantised, in version 121 [32].

### 4.9 Measuring and debugging

Timestamp queries are an optional feature a device must request, and their values are "aligned to a
lower precision" for privacy [10]. Chrome quantises them to about 0.1 ms unless the WebGPU
Developer Features flag is on, which is not for production [32], [33]; Google
documents 100 µs, and Dawn truncates to multiples of 65,536 ns [34]. On WebGL2 our timer
extension read about twice the frame interval, as the grass doc records. By our reading of its
source, Babylon's engine reports per-pass GPU time once the feature is requested; we have not
enabled it yet, and section 3.4 needs it.

For debugging, WebGPU objects take labels, and Chrome returns "a call stack for every message that
is returned from the API" [2]. WebGPU Inspector, a browser extension, lists every live GPU
object, captures a frame's commands with each pass's output, and debugs shaders [35]. Native
tools such as PIX attach to Chrome too [15].

## 5. Should you switch?

**Who gains.** Work the CPU limits: many draws, heavy per-frame JavaScript, scenes static enough for
bundles. Work that needs compute: GPU culling, simulation, particles, machine learning. Work at high
resolution, where the engine switch alone was worth 9.93 ms at 9.7 Mpx in Day Hike, for reasons not
yet attributed, and where store operations make discards explicit per pass.

**Who does not.** A frame limited by fragment shading gains nothing from the API, and one the GPU
limits gains nothing from CPU savings. A large GLSL shader base pays in download, cold start and a
second shader language until it is ported.

**A sensible order:**

1. Measure whether the CPU or the GPU limits the frame, at the resolutions players use.
2. Keep WebGL2 as the path everyone reaches; add WebGPU behind a feature check, and make every
   failure fall back.
3. Translate the existing shaders, fix what WGSL rejects, and hold both paths to the same picture
   before comparing frame times.
4. Request per-pass timestamps on a measurement build and go after pass structure, where the
   pixel-scaled gain lives.
5. Only then port shaders to WGSL and move work to compute, one measured lever at a time, each
   against the best WebGL2 version of the same idea.

## 6. Sources

1. K. Gilbert, Ed., "WebGL 2.0 specification," Editor's Draft, Khronos Group, Jun. 30, 2026. Accessed: Sep. 27, 2026. [Online]. Available: https://registry.khronos.org/webgl/specs/latest/2.0/
2. F. Beaufort, "From WebGL to WebGPU," Chrome for Developers, Google, Sep. 19, 2023, updated Sep. 16, 2025. Accessed: Sep. 27, 2026. [Online]. Available: https://developer.chrome.com/docs/web-platform/webgpu/from-webgl-to-webgpu
3. ANGLE Authors, "ANGLE: Almost Native Graphics Layer Engine," README, GitHub repository. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/google/angle
4. K. Gilbert, Ed., "WebGL specification," Editor's Draft, Khronos Group, Jun. 30, 2026. Accessed: Sep. 27, 2026. [Online]. Available: https://registry.khronos.org/webgl/specs/latest/1.0/
5. K. Ninomiya, C. Wallez, and D. Malyshau, Eds., "WebGPU Explainer," Draft Community Group Report, GPU for the Web Community Group, Sep. 23, 2026. Accessed: Sep. 27, 2026. [Online]. Available: https://gpuweb.github.io/gpuweb/explainer/
6. MDN contributors, "WebGPU API," MDN Web Docs, Mozilla. Accessed: Sep. 27, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
7. Dawn Authors, "Dawn, a WebGPU implementation," README, GitHub repository. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/google/dawn
8. J. Blandy, "Shipping WebGPU on Windows in Firefox 141," Mozilla Gfx Team Blog, Jul. 15, 2025. Accessed: Sep. 27, 2026. [Online]. Available: https://mozillagfx.wordpress.com/2025/07/15/shipping-webgpu-on-windows-in-firefox-141/
9. J. Simmons et al., "WebKit Features in Safari 26.0," WebKit blog, Sep. 15, 2025. Accessed: Sep. 27, 2026. [Online]. Available: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
10. K. Ninomiya, B. Jones, and J. Blandy, Eds., "WebGPU," W3C Candidate Recommendation Draft, Sep. 15, 2026. Accessed: Sep. 27, 2026. [Online]. Available: https://www.w3.org/TR/webgpu/
11. B. Jones, "WebGPU render bundle best practices," toji.dev, updated Jan. 22, 2024. Accessed: Sep. 27, 2026. [Online]. Available: https://toji.dev/webgpu-best-practices/render-bundles
12. A. Baker, M. O. Derin, and D. Neto, Eds., "WebGPU Shading Language," W3C Candidate Recommendation Draft, Sep. 21, 2026. Accessed: Sep. 27, 2026. [Online]. Available: https://www.w3.org/TR/WGSL/
13. MDN contributors, "WebGL best practices," MDN Web Docs, Mozilla. Accessed: Sep. 27, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
14. Y. He et al., Eds., "WebGL 2.0 Compute specification," Editor's Draft, Khronos Group, Mar. 31, 2021. Accessed: Sep. 27, 2026. [Online]. Available: https://registry.khronos.org/webgl/specs/latest/2.0-compute/
15. B. Jones, "WebGPU indirect draw best practices," toji.dev, updated Jan. 22, 2024. Accessed: Sep. 27, 2026. [Online]. Available: https://toji.dev/webgpu-best-practices/indirect-draws
16. MDN contributors, "OffscreenCanvas: getContext() method," MDN Web Docs, Mozilla. Accessed: Sep. 27, 2026. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/getContext
17. F. Beaufort, "WebGPU is now supported in major browsers," web.dev, Google, Nov. 25, 2025. Accessed: Sep. 27, 2026. [Online]. Available: https://web.dev/blog/webgpu-supported-major-browsers
18. Babylon.js Authors, "WebGPU snapshot rendering," Babylon.js Documentation, GitHub. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUOptimization/webGPUSnapshotRendering.md
19. Khronos WebGL Working Group, "WebGL extension registry," Khronos Group. Accessed: Sep. 27, 2026. [Online]. Available: https://registry.khronos.org/webgl/extensions/
20. Babylon.js Authors, "webgpuEngine.pure.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Engines/webgpuEngine.pure.ts
21. F. Beaufort, "What's New in WebGPU (Chrome 146)," Chrome for Developers, Google, Feb. 25, 2026. Accessed: Sep. 27, 2026. [Online]. Available: https://developer.chrome.com/blog/new-in-webgpu-146
22. GPU for the Web Community Group, "Implementation status," gpuweb wiki, GitHub, updated Aug. 13, 2026. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
23. F. Beaufort, "What's New in WebGPU (Chrome 144)," Chrome for Developers, Google, Jan. 7, 2026. Accessed: Sep. 27, 2026. [Online]. Available: https://developer.chrome.com/blog/new-in-webgpu-144
24. F. Beaufort, "What's New in WebGPU (Chrome 147-148)," Chrome for Developers, Google, Apr. 22, 2026. Accessed: Sep. 27, 2026. [Online]. Available: https://developer.chrome.com/blog/new-in-webgpu-147-148
25. Mozilla, "Firefox 147.0, see all new features, updates and fixes," Firefox release notes, Jan. 13, 2026. Accessed: Sep. 27, 2026. [Online]. Available: https://www.firefox.com/en-US/firefox/147.0/releasenotes/
26. Babylon.js Authors, "WebGPU breaking changes," Babylon.js Documentation, GitHub. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUBreakingChanges.md
27. Babylon.js Authors, "WebGPU internals: overview," Babylon.js Documentation, GitHub. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUInternals/webGPUOverview.md
28. Babylon.js Authors, "twgsl," README, GitHub repository. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/BabylonJS/twgsl
29. Babylon.js Authors, "buffer.pure.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Buffers/buffer.pure.ts
30. Babylon.js Authors, "webgpuCacheRenderPipeline.ts," Babylon.js, GitHub repository, v9.18.0. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/BabylonJS/Babylon.js/blob/9.18.0/packages/dev/core/src/Engines/WebGPU/webgpuCacheRenderPipeline.ts
31. Babylon.js Authors, "WebGPU status," Babylon.js Documentation, GitHub. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUStatus.md
32. F. Beaufort, "What's New in WebGPU (Chrome 121)," Chrome for Developers, Google, updated Jan. 18, 2024. Accessed: Sep. 27, 2026. [Online]. Available: https://developer.chrome.com/blog/new-in-webgpu-121
33. F. Beaufort, "WebGPU developer features," Chrome for Developers, Google, Jun. 3, 2025. Accessed: Sep. 27, 2026. [Online]. Available: https://developer.chrome.com/docs/web-platform/webgpu/developer-features
34. Dawn Authors, "Constants.h," Dawn, GitHub repository. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/google/dawn/blob/main/src/dawn/common/Constants.h
35. B. Duncan, "WebGPU Inspector," GitHub repository. Accessed: Sep. 27, 2026. [Online]. Available: https://github.com/brendan-duncan/webgpu_inspector
