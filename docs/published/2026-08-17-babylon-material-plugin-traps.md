---
description: Where Babylon.js 9.18 injects material plugin GLSL, what each PBR hook can see, and the silent failures behind preprocessor, comment and bake traps.
published: 2026-08-17
---
# Babylon.js material plugins: hooks and traps

**Question:** Day Hike extends Babylon.js's `PBRMaterial` with material plugins instead of
forking its shaders: wind sway, a base conform that seats trees on slopes, a distance
dither, wing beats for birds, and a terrain plugin that blends CC0 texture maps with
per-layer normals, roughness and Fresnel. Most of the failures met along the way produced
no error, a clean console and a passing test suite. When does a plugin's code
actually reach the shader, what can each injection point see, and which traps are worth
knowing before writing the first line?

**Short answer:** plugin code is spliced in **after `#include` expansion and before the
preprocessor evaluates `#if`**, as plain text. Almost every trap follows from that one
fact: a gate on a define the plugin never declared compiles out, a regex aimed at an
`#include` line matches nothing, and a GLSL comment that merely spells `#ifdef` becomes a
real directive that deletes code. The rest come from passes that never run plugin code
(shadow maps, depth pre-passes, one-shot render targets under their own render pass), from
Babylon 9's split between `.pure` modules and the wrappers that register them, and from
the budgets a terrain shader runs into: 16 texture units and float32 time. The fix for
most of them is the same: run your injected strings through Babylon's real preprocessor in
a unit test, and read the expanded shader rather than the documentation.

Every claim below was checked against the installed `@babylonjs/core` 9.18.0 source, the
version pinned in [game-dayhike](https://github.com/csarkosh/game-dayhike). The
preprocessor traps were also reproduced by running a test plugin through the real PBR
fragment shader and `WebGL2ShaderProcessor` in Node. The earlier
[atmosphere research](/docs/atmosphere-and-dread-shaders) names three of these traps in
passing; this is the long version.

## 1. When plugin code is injected

A `PBRMaterial` builds its effect in this order:

1. The shader source is loaded from the shader store.
2. `ProcessIncludes` expands every `#include<...>`, substituting include parameters.
3. **Plugin code is injected.** The plugin manager's `_injectCustomCode` is passed to the
   effect as `processCodeAfterIncludes`, which `Process` calls on the expanded text.
4. `ProcessShaderConversion` evaluates `#ifdef`, `#if`, `#else` and `#endif` against the
   material's defines, then the WebGL2 processor migrates GLSL ES 1.00 (`attribute`,
   `varying`, `texture2D`) to GLSL ES 3.00.
5. The result goes to the driver.

Named injection points are `#define CUSTOM_...` marker lines in the base shader; the
manager inserts your code on the line before the marker (the first occurrence only). A key
that starts with `!` is a regular expression run against the whole expanded shader, and
its replacement string supports `$1`-style groups.

Because injection happens before step 4, injected code is ordinary shader source: it can
use `#ifdef` on the material's defines, it gets migrated, and it is exposed to every quirk
of Babylon's line-based preprocessor. An experiment that banded direct diffuse light
misread this order, concluded that plugin code arrives after the preprocessor, and gated
its code on a uniform because "a define gate would compile out". The uniform was still the
right choice, for a different reason: flipping a uniform is instant, while flipping a
define recompiles the material. But the wind, ground-conform and terrain plugins all gate
on their own defines, and those gates work.

## 2. What each hook can see

| Hook | In scope | The trap |
| --- | --- | --- |
| `CUSTOM_VERTEX_DEFINITIONS` | Global scope, before `main` | A per-instance attribute needs both the GLSL declaration here and its name in `getAttributes`; the declaration alone compiles but never gets a buffer |
| `CUSTOM_VERTEX_UPDATE_POSITION` | `positionUpdated`, `normalUpdated` in model space | Runs before `instancesVertex` builds `finalWorld`, so there is no world position or instance origin; right for motion in the model's own frame (wing beats), wrong for anything keyed to the world |
| `CUSTOM_VERTEX_UPDATE_WORLDPOS` | `worldPos`, `positionUpdated`, `finalWorld` (column 3 is the instance's world origin) | `vPositionW` and `vNormalW` were written *before* the hook, so a displacement moves the triangle but not the lighting position or normal. Fog, shadow-receiver and view-depth varyings are computed after it and do follow `worldPos` |
| `CUSTOM_FRAGMENT_DEFINITIONS` | Global scope | Samplers must be declared here (see section 3), not through `getUniforms` |
| `CUSTOM_FRAGMENT_MAIN_BEGIN` | Varyings, `vPositionW`, `gl_FragCoord` | Runs before `normalW` and every texture fetch. The cheapest place to `discard`, but a `discard` anywhere in the shader has a cost of its own |
| `CUSTOM_FRAGMENT_UPDATE_ALBEDO` | Inside the `albedoOpacityBlock()` function: its parameters and globals | `main`'s locals are out of scope, and `vAlbedoColor` there is the function's parameter: the material's constant colour, not the textured albedo |
| `CUSTOM_FRAGMENT_BEFORE_LIGHTS` | Final `normalW`, `geometricNormalW`, `viewDirectionW`, `surfaceAlbedo`, `alpha` | The last point where a normal or albedo edit reaches every direct, IBL and ambient term. Roughness and F0 are computed after it, and no hook in `main` exposes them |
| `CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS` | Inside `reflectivityBlock()`, metallic workflow only | Cannot see anything computed in `main`, so per-fragment roughness has to travel through a regex on the call site instead |
| `CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION` | Lit components after `pbrBlockFinalLitComponents` | Direct light is already multiplied into albedo (`finalDiffuse*=surfaceAlbedo`), so banding or tinting light here also bands the paint |
| `CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR` | `finalColor` after fog and image processing | There is no fog hook anywhere; changing the fog means a regex on the fog line, which runs just before this point |

Three details in that table deserve a sentence each.

**Displacing at `UPDATE_WORLDPOS`.** Day Hike's wind moves grass tips by a few centimetres
and its ground conform pushes a root plate down onto the slope inside the contact shadow
under the trunk, so neither rewrites `vPositionW`. A plugin that moves geometry far enough to be lit
differently should assign `vPositionW = vec3(worldPos);` itself.

**Writing `normalW` at `BEFORE_LIGHTS`.** `geometricNormalW` keeps the interpolated normal,
the way it does for a bump map, and the geometry-info block still reads it. That is usually
what you want.

**`vAlbedoColor`.** It is a uniform built from `albedoColor` and `alpha`. Texture, vertex
colour, detail map and base weight are all multiplied in inside `albedoOpacityBlock()`, so
a regex that edits `vAlbedoColor` edits the material constant before any of them. Edit
`surfaceAlbedo` at `BEFORE_LIGHTS` instead.

## 3. Gates, anchors and declarations

These are the traps that follow directly from injecting between include expansion and the
preprocessor. Each was reproduced in Node with a marker line per case.

- **A gate on an undeclared define silently compiles out.** `#ifdef WIND` works because
  the plugin passes `{ WIND: false }` to the base constructor and sets it in
  `prepareDefines`. An `#ifdef` on a name no plugin declares evaluates false, and the code
  inside vanishes with no warning.
- **`#include` lines do not exist at injection time.** A regex key aimed at
  `#include<pbrBlockFinalLitComponents>` matches nothing and injects nothing. Target the
  first statement of the expanded include instead: the banding experiment used
  `aggShadow=aggShadow/numLights;`, which starts `pbrBlockFinalLitComponents`.
- **Include parameters are already substituted.** The PBR fragment includes the fog block
  as `#include<fogFragment>(color,finalColor)`, so the line a regex sees is
  `finalColor.rgb=mix(vFogColor,finalColor.rgb,fog);`, not the include's own `color.rgb=...`.
  Day Hike's shipped fog rewrite anchors on exactly that expanded line
  ([`atmosphere.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/atmosphere.ts)).
- **A regex match can sit inside a conditional block.** `#if` has not been evaluated yet,
  so a rewrite lands wherever the text appears and then lives or dies with that block. The
  `aggShadow` anchor sits in the lit branch of `#ifdef UNLIT`, which is why unlit materials
  skip the banding. The converse matters too: anything a regex rewrite references must be
  declared unconditionally. Day Hike's terrain declares `terrainRough` and `terrainF0` at
  `MAIN_BEGIN` outside any `#ifdef` for exactly this reason.
- **Regex keys replace every match.** The manager forces the `g` flag even when the key
  asks for none. `reflectivityBlock\(` alone would also match the function's definition;
  the terrain key is `reflectivityBlock\(\s*vReflectivityColor`, which only the call site
  contains.
- **Injection points are collected once.** `_addPlugin` calls `getCustomCode` while the
  base constructor is still running, before your subclass has assigned any fields, and
  records the keys it returns. A key that only appears later is never injected. Return
  every key from the start and gate the code inside it on defines.
- **A plugin that is not enabled injects nothing.** `MaterialPluginBase` defaults
  `enable` to `false`; only active plugins contribute code. Call `this._enable(true)` (or
  pass `enable`) and pin it in a test.
- **`getUniforms().fragment` is dropped on WebGL2.** That string replaces
  `#define ADDITIONAL_FRAGMENT_DECLARATION`, which exists only in the non-uniform-buffer
  declaration include. Babylon uses uniform buffers on WebGL2 by default, so the PBR shader
  includes the UBO declaration instead, and the string disappears. Scalars survive through
  the `ubo` list; samplers cannot live in a UBO, so declare them in
  `CUSTOM_FRAGMENT_DEFINITIONS`. A `sampler2DArray` there also needs an explicit `highp`:
  GLSL ES 3.00 has no default precision for it, which only a real driver reports.

## 4. Comments that delete code

Babylon's preprocessor is line-based, and it does not know what a comment is.

`MoveCursorRegex` is `/(#ifdef)|(#else)|(#elif)|(#endif)|(#ifndef)|(#if)/`, unanchored, and
it is tested against every line containing a `#`. `ShaderCodeCursor` passes `//` lines
through untouched. So a comment such as `// see the #ifdef note below` opens a real
conditional block, whose "test" is whatever text surrounds the keyword and evaluated false
in the reproduction. It swallows every following line up to the next real `#endif`, and the block that `#endif` was meant to close now ends somewhere else. In
the Node reproduction the line after such a comment was simply gone from the output. In
Day Hike this deleted the terrain's triplanar rock branch in every browser, and an outline
shader before that; neither produced an error.

The second hazard is semicolons. The cursor splits any code line with a `;` in the middle,
so `float x = 1.0; // one; two` becomes three lines, and `two` is emitted as a bare
statement. That one does fail to compile, but only on a real GPU; a NullEngine test never
sees it.

**The fix** is two tests, both cheap:

1. A string check over every injected snippet: no directive keyword inside any comment,
   and no semicolon in a trailing comment.
2. Run each snippet, wrapped in a minimal `void main`, through Babylon's own `Process()`
   with the real `WebGL2ShaderProcessor` and the defines you expect, and assert that a line
   you care about survives. `Process` is pure string work and runs in Node. The
   [terrain plugin's tests](https://github.com/csarkosh/game-dayhike/blob/main/client/test/game/terrainTexture.test.ts)
   do this for both define states. When a test pins an anchor inside a Babylon include,
   import that include's module first: the include store is only populated when the module
   loads, and an assertion against `undefined` passes vacuously.

## 5. Registration and headless traps

**`.pure` modules register nothing.** Babylon 9 splits most features into a `.pure.js`
module that defines behaviour and a wrapper that registers it. Methods patched onto a
prototype by a wrapper start life as stubs: without
`import "@babylonjs/core/Meshes/thinInstanceMesh.js"`, `mesh.thinInstanceSetBuffer` exists,
is callable, returns `undefined`, and adds nothing. The stub does not warn by default,
because the engine itself calls such methods as feature checks. The same split applies to
`CascadedShadowGenerator` and `ReflectionProbe`, whose wrappers call their register
functions. The rule is simply to import the non-`.pure` path, as
[`lighting.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/lighting.ts)
and [`clutterMeshes.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/clutterMeshes.ts)
do.

**`RegisterMaterialPlugin` only reaches materials created after it.** It subscribes to
`Material.OnEventObservable`'s creation event, so it does reach materials the glTF loader
creates later, but nothing that already exists. Register right after constructing the
scene. The factory may return `null` to decline a material (a sky, a particle material).

**`CascadedShadowGenerator` throws under `NullEngine`.** Its constructor checks
`IsSupported`, which reads the engine's `supportCSM` feature: false on `NullEngine` and on
WebGL1, true on WebGL2 and WebGPU. When unsupported it logs an error and returns before
calling `super()`, which JavaScript turns into a `ReferenceError` about the derived-class
constructor. Every headless test that builds the lighting fails at construction, with an
error that does not mention shadows. Guard with `CascadedShadowGenerator.IsSupported`,
which a low quality tier needs anyway.

**Plugins are GLSL-only unless you say otherwise.** The base `isCompatible` returns true
for GLSL alone, and `_addPlugin` **throws** when it returns false. On a WebGPU engine a
material uses WGSL unless it was created with `forceGLSL` (or `PBRMaterial.ForceGLSL` is
set), so a GLSL plugin registered through a factory makes material creation throw. The
alternatives are to override `isCompatible` and return WGSL from `getCustomCode` when
asked for it, or to force GLSL on the materials that carry plugins. Day Hike creates no
WebGPU engine, so neither has been exercised there.

**Left-handed winding.** Babylon's default world is left-handed. A terrain grid wound in
the textbook right-handed order gets normals of `(0, -1, 0)`: it is lit from below and
back-face culled, so the terrain renders as nothing while every prop on it still draws.
[`clipmap.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/clipmap.ts)
records the winding and a test guards it.

## 6. Passes that never run plugin code

**Shadow maps, depth pre-passes and geometry buffers.** Babylon's `shadowMap`, `depth` and
`geometry` shaders expose only a `DEFINITIONS` hook, and the renderers that use them build
their own effects without the material's plugin manager. A vertex displacement therefore
does not move the cast shadow, and a fragment `discard` does not cut holes in it. The
escape hatch for shadows is a `ShadowDepthWrapper` on the material, which compiles the
material's own shader for depth and has to be measured on its own. Day Hike checked
instead: its ground conform stays inside the contact shadow under each trunk, and neither
the cast shadow nor an outline post-process that then read a depth pre-pass visibly
detached from the conformed base.

**`discard` and early depth.** A `discard` anywhere in a fragment shader can stop the GPU
from rejecting hidden fragments before shading them, so a dither fade belongs on materials
that already alpha-test, not on every opaque material. The measured cost and the fade
design are in [No visible pop-in](/docs/no-visible-pop-in).

**One-shot `RenderTargetTexture` bakes.** Day Hike bakes tree impostors at load by
rendering a cloned LOD into a 256 by 256 render target once. A render target draws under
its **own** `renderPassId`, and each submesh caches its effect per pass. The bake also uses
its own camera, and at least one define differs between that camera's pass and the player
camera's. So `forceCompilationAsync`, which compiles under the default pass, is a cache
miss at bake time: `isReadyForSubMesh` is false mid-render, every submesh is skipped, and
the impostor comes out fully transparent. Measured in the browser: 0 of 65,536 pixels,
with the whole automated suite green, because `NullEngine` render targets hold no pixels.
**The fix** in
[`forestMeshes.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/forestMeshes.ts)
polls `rtt.isReadyForRendering()`, which swaps in the target's camera and render pass and
kicks the right compiles, with a timeout that disables the billboard rather than drawing
grey quads; then it renders once. Confirm a bake by reading its pixels.

**Clones share thin-instance buffers.** Thin-instance attribute buffers live on the
geometry, and `mesh.clone(name, null, false)` shares the geometry. The bake clone draws
non-instanced, so an unguarded read of a per-instance attribute there would read whichever
instance happened to be first. Day Hike's conform and wing plugins wrap the body in
`#ifdef THIN_INSTANCES`, which Babylon sets per submesh from `hasThinInstances`.

## 7. Samplers, texture arrays and per-layer Fresnel

**The 16-unit budget.** WebGL2 guarantees 16 fragment texture units. When per-layer normal
and roughness/AO/height maps were added to the terrain, the material already bound eleven
samplers (five ground layers, asphalt, the road centreline table, and PBR's own
environment, BRDF lookup and shadows). Six layers times two maps is twelve more, which does
not fit. Two `RawTexture2DArray`s do: the fetch count per fragment is the same either way,
only the sampler count changes.

The albedo layers stayed ordinary `Texture`s, and that was deliberate: a
`RawTexture2DArray` takes raw typed-array pixels, so every layer has to be decoded to RGBA
on the CPU first, while a `Texture` gets loading and orientation from the browser. For the
data maps
[`groundMaps.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/groundMaps.ts)
decodes each layer with
`createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" })`,
draws it to an `OffscreenCanvas` and reads the bytes back. Both options matter: these are
vectors and scalars, not colours, and colour management or premultiplication would bend
them. One more surprise: Chromium refuses the flip-on-upload flag for 3D and array textures
("FLIP_Y or PREMULTIPLY_ALPHA isn't allowed for uploading 3D textures"), so the array is
created with `invertY` false and each layer's rows are flipped on the CPU, to keep `v`
running the same way as the albedo `Texture`s over the same UVs.

**Per-layer roughness and F0 through `reflectivityBlock`.** The terrain's sheen at grazing
angles is Fresnel, not roughness, so each ground layer needs its own F0 as well as its own
roughness. Neither has a hook in `main`. In the metallic workflow `vReflectivityColor` is
`(metallic, roughness, ior, f0)`: the material computes `f0` from the index of refraction,
and `reflectivityBlock` reads roughness from `.g` and the dielectric F0 from `.a`. The
terrain plugin's regex key rewrites the call's first argument:

```glsl
reflectivityBlock(
vec4(vReflectivityColor.r, vReflectivityColor.g * terrainRough,
     vReflectivityColor.b, vReflectivityColor.a * terrainF0)
```

`terrainRough` and `terrainF0` are blends of per-layer tables computed at `BEFORE_LIGHTS`.
Scaling rather than replacing keeps the material's own roughness authoritative, so the
weather code that scales the terrain material's roughness when the ground is wet keeps
working. The key is version-fragile by
nature; a test that runs it against the real shader source catches a Babylon rename.

## 8. Normal maps without tangents

**Verify the hook by reading the expanded shader.** Before writing `normalW` at
`CUSTOM_FRAGMENT_BEFORE_LIGHTS`, check what runs between the normal blocks and the hook.
In 9.18 the fragment runs `pbrBlockNormalGeometric`, `bumpFragment` and
`pbrBlockNormalFinal`, then only the albedo/opacity block, `UPDATE_ALPHA` and
`depthPrePass`, then the hook. Nothing in between caches a normal-derived value, so a write
there reaches every lighting and IBL term. The same reading answers a plugin's other
questions faster than the documentation does; `effect.fragmentSourceCode` and a
`processCodeAfterIncludes` wrapper both expose it.

The banding experiment adds a related lesson: at the default noon-and-mist session, direct
diffuse is a minority of the final pixel under ambient-dominant light, so its toggle looked
broken when it was not. The low sun at 17:00 in clear weather was where the difference read
at a glance. When a plugin looks like it does nothing, confirm it from the compiled shader
and the bound uniform before tuning it.

**Planar layers need no TBN.** Grass, forest floor, sand and pebble are projected on world
XZ, so their UV axes *are* world X and Z. A tangent-space texel's `x` maps to world X and
its `y` to world Z, and the terrain adds that perturbation to the interpolated normal
(UDN-style) and renormalizes, with no tangent basis to build or store and no new vertex
data. Rock is triplanar, so each of its three projections gets the matching axis frame,
blended by the same weights as its albedo. The perturbed normal fades back to the
interpolated one with the same distance term as the albedo detail, so the far field keeps
the terrain's analytic normal and never shimmers.

**Check handedness with light, not algebra.** Which way `v` runs against world Z depends
on the texture class's `invertY` default, which is why the arrays flip rows themselves.
The test that settles it is a shot of an asymmetric feature, such as a pebble field, lit
from one side: the lit faces must point at the sun.

## 9. Float32 time

A shader animation that feeds `performance.now() / 1000` straight into a float32 uniform
degrades with uptime. After a day (86,400 seconds) a float32 can only represent multiples of
1/128 second, about 7.8 ms, so frame-to-frame time advances in uneven steps; at the wind's
2 Hz flutter that is about 0.1 radian of phase per step. (Derived from float32's 24-bit
significand, not measured.)

**The rule** in
[`windPlugin.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/windPlugin.ts)
and [`wingPlugin.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/wingPlugin.ts):
wrap time on the CPU, `(performance.now() / 1000) % 300`, and make every temporal frequency
an exact multiple of 2π / 300. The wind's gust, second gust and flutter use multiples 18,
42 and 600. At the wrap every phase jumps by a whole number of turns, so there is no visible
snap, and the largest `sin()` argument stays under about 3,800.

## Sources

| Source | Covers |
| --- | --- |
| Installed `@babylonjs/core` 9.18.0: `Engines/Processors/shaderProcessor.js`, `shaderCodeCursor.js`, `Materials/materialPluginManager.pure.js`, `materialPluginBase.pure.js`, `PBR/pbrBaseMaterial.pure.js`, `Shaders/pbr.vertex.js`, `pbr.fragment.js` and their includes, `Lights/Shadows/cascadedShadowGenerator.pure.js`, `Materials/Textures/renderTargetTexture.pure.js`, `Misc/devTools.js` | Every hook, order and behaviour claim |
| [Babylon.js material plugins](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins) | The plugin API |
| [Babylon.js tree shaking](https://doc.babylonjs.com/setup/treeshaking) | `.pure` modules and side-effect imports |
| [Blending in Detail](https://blog.selfshadow.com/publications/blending-in-detail/) (Barré-Brisebois and Hill) | UDN-style normal blending |
| [createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) (MDN) | `colorSpaceConversion` and `premultiplyAlpha` |
| [game-dayhike](https://github.com/csarkosh/game-dayhike) client source and tests | The shipped plugins and the measured bake failure |
