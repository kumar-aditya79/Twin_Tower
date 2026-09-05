# Torque Zero

Torque Zero is a browser-only open-world driving simulator and interactive dyno lab. Drive three cars with deliberately different torque curves, watch torque and horsepower change with RPM, and feel how gearing translates engine torque into acceleration on a full 3D circuit.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run build
```

The checked-in browser engine module can be rebuilt with Emscripten 6+:

```bash
npm run build:engine-wasm
npm run test:engine-native
npm run test:engine-wasm
```

Both native and WebAssembly builds run the Engine Simulator core suite: 27 tests covering gas systems, sampled functions, and single-/multi-thread synthesis.

Everything runs in the browser. There is no backend, database, or server-side runtime.

The floating DialKit control opens from the lower-right corner on desktop and the upper-right corner on touch devices, where it stays clear of the driving controls. Its live values and saved presets are maintained separately for each car in local browser storage.

## Engine Workbench

Use the **Workbench** control in the header to open a browser-native interpretation of Engine Simulator's mechanical dashboard. It shares the AudioWorklet's live WebAssembly engine instance, so the cutaway animation and instruments stay synchronized with the RPM, throttle, sound, and active DialKit configuration.

The workbench includes a pan/zoom/rotate React Three Fiber cutaway with pistons, connecting rods, crankshaft journals, intake and exhaust valves, and combustion events; cylinder pressure and temperature gauges; AFR, throttle, intake pressure, airflow, exhaust flow, dyno, performance, firing-order, and oscilloscope panels. Telemetry continues to run while audio is muted. DialKit also exposes ignition advance, volumetric efficiency, and engine bank angle for live experimentation.

## Controls

### iPhone and touch controls

The Drive view becomes a full-height, safe-area-aware cockpit on iPhone and other touch devices. The right-hand drive pad combines the continuous controls: drag up to accelerate, down to brake, left or right to steer, or diagonally to steer while using a pedal. The left-hand transmission deck is designed for the other thumb:

- Manual clutch: press and hold the clutch gate, slide upward or downward to request one shift, then release to engage the clutch.
- Automatic clutch: swipe the same gate to shift; the simulation handles clutch disengagement, rev matching, and engagement without enabling automatic shifting.
- Reverse: hold the separate amber R control to select Reverse and apply reverse throttle; use the drive pad horizontally to steer and drag it downward to brake.
- The HUD buttons switch manual/automatic shifting, manual/automatic clutching, and cycle through the three cars.

The compact mobile HUD keeps gear, speed, RPM, the live torque/horsepower curves, and the current-RPM marker visible. Controls use independent captured pointers, so clutching or reversing does not cancel steering, and all live inputs are released if Safari backgrounds the tab, rotates, or cancels a touch.

### Keyboard controls

- A: select Drive and accelerate forward
- Hold R: select Reverse and accelerate backward; release R to return to Drive
- S: brake
- Shift: clutch pedal (hold to disengage in manual-clutch mode)
- Space: smooth accelerator and clutch inputs while held
- Arrow Left / Right: steer
- Arrow Down / Up: request a downshift / upshift in manual-transmission mode
- = / -: raise / lower the fixed-step simulation frequency
- 1 / 2 / 3: instantly switch cars
- M: enable or mute engine audio
- Speaker button: enable or mute engine audio
- Reset button: return to the starting grid
- Cmd+Shift+R: reset the current car, run, imports, and active DialKit version while preserving every other saved DialKit version

Engine sound is enabled by default and starts on the first keyboard or pointer interaction, as required by browser autoplay policies. Press **M** or use the speaker button to mute it. The output fades out whenever the tab is hidden or loses focus, then returns on focus only if it had not been manually muted.

The header's clutch toggle is independent of the transmission selector. **Manual clutch** requires Shift to be held before an arrow-key shift is accepted and waits until the clutch is physically disengaged before changing gear. **Automatic clutch** opens the clutch, makes the requested change, matches engine RPM to the selected ratio, and smoothly reengages the clutch; it never chooses a gear or enables automatic shifting. The momentary Reverse command always performs its own quick clutch transition: hold R to brake through zero if necessary, select the separate reverse ratio, and apply reverse throttle. Releasing R stops reverse throttle and returns the range to Drive.

All player-facing measurements use US customary units.

## Vehicle physics

The driving scene uses [Rapier](https://rapier.rs/) and its WebAssembly `DynamicRayCastVehicleController`. A dynamic rigid-body chassis is supported by four independently ray-cast wheels with live suspension travel, spring and damping forces, Ackermann steering, front/rear brake balance, configurable drive bias, separate front/rear lateral grip, and tire-force saturation. Rapier owns position, orientation, collision response, weight transfer, and wheel contact; the Engine Simulator drivetrain supplies the RPM-dependent force at the wheels. The road, grass, gravel, terrain, rocks, tire stacks, barriers, fences, gantries, signs, and every other retained solid circuit mesh use fixed Rapier collision bodies. Invisible perimeter walls and a last-safe-ground recovery guard prevent the car from leaving the modeled world or falling beneath it.

This means pitch under acceleration and braking, body roll, understeer, oversteer, and skids come from the same physical chassis and tire contacts instead of canned animations. DialKit's **Vehicle Physics** section exposes wheelbase, track width, center-of-mass height, suspension geometry, spring stiffness, bump/rebound damping, suspension force limit, steering lock and response, speed sensitivity, front/rear response, tire grip limit, brake bias, drive bias, and chassis damping.

The car starts in the pole-side grid slot on the front straight. The toolbar's reset button returns the rigid body to that position and clears its linear and angular velocity.

**Cmd+Shift+R** performs a broader in-app reset without invoking the browser's hard reload. It restores the current car's stock engine and model, cancels active imports, resets the run and simulation frequency, returns the transmission and clutch controls to their defaults, and writes default values only into the currently selected DialKit version. Other DialKit versions remain intact and selected-version identity is preserved.

## Community engines and car models

DialKit's **Imports** panel can apply a `catalog.engine-sim.parts/parts/{id}` URL to the current car. Torque Zero uses the catalog's public, CORS-enabled API and derives the cylinder count, displacement, compression ratio, exhaust length, redline, noise, and preferred simulation frequency from the part's Engine Simulator script. The imported creator and source remain credited in the driving UI.

**Browse Popular Engines** opens the catalog sorted by downloads, while **Browse Downloadable Cars** opens Sketchfab's vehicle category with downloadable-license filters already applied.

The same panel accepts local `.glb` and embedded `.gltf` files, or `.zip` archives containing a glTF scene and its resources. **Upload GLB / glTF / ZIP** opens the browser file picker; files remain local to the browser and are not uploaded to a server. A staged progress display remains over the driving view through reading, downloading, unpacking, material preparation, and final React Three Fiber scene loading.

Sketchfab URLs use Sketchfab's official Web Importer and Download API. Torque Zero first checks the current model metadata and only offers OAuth for models where Sketchfab reports `isDownloadable: true`. **Sign In & Apply Sketchfab Model** then opens Sketchfab's own OAuth login window; Torque Zero never asks for or stores a Sketchfab API key or password. One persistent importer frame retains the authenticated Sketchfab session across model imports. After a successful connection, Torque Zero stores only a `sketchfab-connected` hint in localStorage so it can prewarm that frame after reload; the OAuth grant remains in Sketchfab's own origin and cookie storage. After authorization, the pending model download resumes automatically and is unpacked locally in the browser. Creators can disable API downloads, and store/editorial models may not be downloadable; in that case Torque Zero does not bypass the restriction and directs you to use a legitimately obtained GLB with the local uploader. Imported Sketchfab creator and license details remain visible in the driving UI.

DialKit's **Model Yaw Degrees** and **Model Scale** controls adjust the imported vehicle after its dimensions have been normalized to the track's standard car footprint.

**Reset to Default Engine** restores only the current car's stock engine and sound values, removes its saved community-engine metadata, and leaves chassis, handling, and visual tuning untouched. **Reset to Default Model** revokes the current imported model and immediately restores the bundled car. Either reset also invalidates an import already in progress so a late network response cannot reinstall it.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys `dist` whenever `main` is pushed. In the repository's GitHub settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

## Performance benchmark

The supplied circuit was reduced from 125 MB and 5.34 million rendered vertices to a 2.3 MB meshopt/WebP asset with 448 thousand rendered vertices. A clean Chrome run reports 23 scene meshes, 24 GPU geometries, and approximately 78 thousand visible triangles from the starting grid. Dense decorative garages and trees account for most of the omitted geometry; the driving surfaces and collision-relevant scenery remain.

The selected car is the only vehicle GLB loaded at startup. The renderer caps DPR at 1.25, and the full-screen motion-blur pass uses four samples without a second MSAA pass. Add `?benchmark=1` to expose the app telemetry refs plus the Three.js scene, camera, and renderer for repeatable diagnostics.

## Credits and licenses

### Engine audio

The live engine sound is generated in an AudioWorklet by a WebAssembly port of [Ange Yaghi's Engine Simulator](https://github.com/ange-yaghi/engine-sim), licensed under MIT. The requested [Community Edition repository](https://github.com/Engine-Simulator/engine-sim-community-edition) distributes the application and points to Ange's repository for its source code; Torque Zero vendors that source at commit `85f7c3b959a908ed5232ede4f1a4ac7eafe6b630`.

The port preserves and compiles the upstream gas-system, engine, drivetrain, constraint-solver, filtering, and synthesizer core. Torque Zero adds a small browser acoustic adapter that feeds cylinder firing/exhaust-flow pulses into the upstream synthesizer. RPM and throttle update it in real time, while DialKit exposes cylinder count, displacement in cubic inches, compression ratio, exhaust length, pulse width, exhaust resonance, mechanical noise, and output gain. The live firing-rate and torque-pulse readouts come back from the same Wasm model.

The compiled core also contains Ange Yaghi's [Simple 2D Constraint Solver](https://github.com/ange-yaghi/simple-2d-constraint-solver) and [CSV I/O](https://github.com/ange-yaghi/csv-io), both Copyright © 2022 Ange Yaghi and licensed under MIT. Emscripten and LLVM provide the open-source WebAssembly compilation toolchain. GoogleTest, Copyright © Google Inc., is used by the native and Wasm test targets under its BSD 3-Clause license.

Community engine metadata and scripts are loaded from [The Parts Catalog](https://catalog.engine-sim.parts/), created by Jim C K F. Each imported part's author and source URL are retained in the app so its creator remains credited.

- Full license: [`public/wasm/LICENSE-engine-sim.txt`](public/wasm/LICENSE-engine-sim.txt)

The earlier layered engine samples remain credited to [markeasting/engine-audio](https://github.com/markeasting/engine-audio) by [Mark Oosting](https://github.com/markeasting), under MIT. They are retained in the repository for provenance and comparison but are no longer loaded by the game at runtime.

- Full license: [`public/audio/engine/LICENSE-engine-audio.txt`](public/audio/engine/LICENSE-engine-audio.txt)

### Car models

The three vehicle models are by [Zorg_Sinister](https://sketchfab.com/4130ff15fe394c239cc064b5286c43) and were downloaded from the creator's [Hot Wheels Unleashed collection on Sketchfab](https://sketchfab.com/4130ff15fe394c239cc064b5286c43/collections/hot-wheels-unleashed-1ca206fd4bee4528878b4519cdfca170). Each is licensed under [CC Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) and was converted for efficient web delivery while preserving its overall appearance.

Runtime Sketchfab imports use Sketchfab's hosted [Web Importer](https://sketchfab.com/developers/download-api/libraries), OAuth login, and Download API. Downloadable models are provided by Sketchfab; their creator, source link, and Creative Commons license stay attached to the imported vehicle in the UI.

- **Synkro:** [Hot Wheels — Unleashed: Synkro](https://sketchfab.com/3d-models/hot-wheels-unleashed-synkro-bd74682b98f848c1b223946562068e2a)
- **RD-02:** [Hot Wheels — Unleashed: RD-02](https://sketchfab.com/3d-models/hot-wheels-unleashed-rd-02-2a3a1f1906274d918a21e3fae6686a25)
- **Piledriver:** [Hot Wheels — Unleashed 2: Piledriver](https://sketchfab.com/3d-models/hot-wheels-unleashed-2-piledriver-0af179cf49384269abf71e45931dadf4)

### Track model

The circuit is [Cartoon Race Track — Oval](https://sketchfab.com/3d-models/cartoon-race-track-oval-f88b33a3a65c4965b03578dc7f4f6eb4) by [RCC Design](https://sketchfab.com/retrovalorem), licensed under [CC Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Its materials were converted to standard metallic/roughness rendering, and its geometry and textures were optimized for browser delivery. The exceptionally dense garage and tree meshes were omitted from the web build; the road, runoff, gravel, barriers, fencing, lights, signs, terrain, and other circuit scenery remain.

### Open-source stack

The browser application incorporates the following projects and credits their authors and contributors:

| Project | Credit | License |
| --- | --- | --- |
| [React and React DOM](https://react.dev/) | Copyright © Meta Platforms, Inc. and affiliates | MIT |
| [Three.js](https://threejs.org/) | Copyright © 2010–2026 Three.js authors | MIT |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | Paul Henschel and pmndrs contributors | MIT |
| [Rapier](https://github.com/dimforge/rapier) and [React Three Rapier](https://github.com/pmndrs/react-three-rapier) | Dimforge and pmndrs contributors | Apache 2.0 / MIT |
| [Drei](https://github.com/pmndrs/drei) and [React Postprocessing](https://github.com/pmndrs/react-postprocessing) | react-spring and pmndrs contributors | MIT |
| [Postprocessing](https://github.com/pmndrs/postprocessing) | Copyright © 2015 Raoul van Rüschen | Zlib |
| [Tailwind CSS](https://tailwindcss.com/) | Copyright © Tailwind Labs, Inc. | MIT |
| [shadcn/ui](https://ui.shadcn.com/) | shadcn and contributors; locally adapted components | MIT |
| [DialKit](https://github.com/joshpuckett/dialkit) | Copyright © 2026 Josh Puckett | MIT |
| [Lucide](https://lucide.dev/) | Copyright © 2026 Lucide Icons and Contributors | ISC |
| [Class Variance Authority](https://github.com/joe-bell/cva) | Joe Bell | Apache 2.0 |
| [clsx](https://github.com/lukeed/clsx) | Copyright © Luke Edwards | MIT |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | Dany Castillo and contributors | MIT |
| [fflate](https://github.com/101arrowz/fflate) | Arjun Barrett and contributors | MIT |

### Fonts

- **Inter** — Copyright © 2016 The Inter Project Authors, distributed through [Fontsource](https://fontsource.org/fonts/inter) under the SIL Open Font License 1.1.
- **Space Grotesk** — Copyright © 2020 The Space Grotesk Project Authors, created by Florian Karsten and distributed through [Fontsource](https://fontsource.org/fonts/space-grotesk) under the SIL Open Font License 1.1.

### Development and deployment tooling

[Vite](https://vite.dev/), [TypeScript](https://www.typescriptlang.org/), [ESLint](https://eslint.org/), [Emscripten](https://emscripten.org/), [CMake](https://cmake.org/), [emnapi](https://github.com/toyobayashi/emnapi), and [GitHub Actions/Pages](https://pages.github.com/) provide the development, verification, WebAssembly/N-API compatibility, and static deployment toolchain. Their code is not presented as original Torque Zero work.

The visual presentation is an original homage to the speed, color, and low-horizon perspective of 16-bit futuristic racers. No artwork, code, or audio from F-Zero is included.
