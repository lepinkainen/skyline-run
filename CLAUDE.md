# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser endless runner in the style of Canabalt (one-button rooftop running), with a neon cyberpunk look. Built with **Phaser 4** (4.2.x), TypeScript and Vite. The working title shown in-game is "Skyline//Run".

**IP constraint:** use only the general cyberpunk aesthetic (neon, rain, megatowers, holograms, katakana signage). Never use Cyberpunk 2077 / CD Projekt names, logos, fonts, characters, locations (e.g. "Night City") or art.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc` type-check, then production build into `dist/`
- `npx tsc` — type-check only

There are no tests or linter. Verify changes by running the game (a headless Chromium screenshot via `playwright-core` with `--use-angle=swiftshader` works for visual checks).

## Deployment

Output is fully static (`dist/`). `vite.config.ts` sets `base: './'` so the build works from any subpath (GitHub Pages project sites, itch.io); keep it relative. Build target is `es2022` because `src/main.ts` uses top-level await.

## Architecture

- **No image assets.** Every texture is generated at boot in `src/textures.ts` with canvas 2D (`scene.textures.createCanvas`). `BootScene` calls `generateTextures`, then starts `GameScene`.
- **Runner animation lives in `src/runner.ts`** (pure canvas, no Phaser): a jointed skeleton with keyframed pose functions (`runPose`, `airPose`, `landPose`), `drawRunner`, the clothing `PALETTES` and the sheet layout. `makeRunner` bakes one sheet per palette (`runner0..N`) with frames `run0..31`, `stand`, and `<jump>-air0..15` / `<jump>-land0..9` for every jump style (`leap`, `tuck`, `airrun`). `RUNNER_STYLE` in `src/config.ts` picks the baked run style and the jump style (`'random'` = a new one each jump). There is no Phaser animation: `GameScene.updatePlayerAnim` sets the frame directly from a run phase (cadence scales with speed), from vertical speed while airborne, and from a short landing timer. A random palette is chosen each run.
- **Fonts are loaded before Phaser starts** (`main.ts` awaits `document.fonts.load`, with a timeout) because canvas textures bake in text. Fonts come from Google Fonts via `index.html`.
- **Custom physics, not Arcade.** `GameScene.stepPhysics` integrates the player manually: position is the player's *bottom-centre* (`px`, `py`), with a box hitbox from `RUN.halfWidth`/`RUN.height`. Landing = crossing a roof top while falling; hitting a wall = crossing a building's left edge while below its top → `slam()` → death. Jump has variable height (reduced gravity while held, up to `RUN.holdMax`), a coyote time and a press buffer. All tuning lives in `RUN` in `src/config.ts`.
- **World generation:** `BuildingGenerator` (`src/world/Buildings.ts`) keeps arrays of `buildings` and `crates`, spawns ahead of the camera (`fill`) and destroys behind it (`cull`). Gap width and rise are scaled from the current speed so jumps stay possible; changing jump physics in `RUN` may require retuning `spawnNext`. Each building owns its Phaser objects in `objects[]` so culling destroys its decorations too. Rooftop props are decorative only; crates are the only rooftop obstacles.
- **Camera and parallax:** the camera is positioned manually each frame (`updateCamera`), not with `startFollow`. Background layers are screen-space (`setScrollFactor(0)`) TileSprites/Images moved by `cam.scrollX/scrollY * factor`. Flying cars and holograms are screen-space objects that drift by `camDX * factor` per frame.
- **Depth layering** (set explicitly): sky 0, skyline/fog layers 1–6, buildings ~10, crates 11, player 12, particles 13, rain 20, scanlines 30, HUD/overlays 40.
- **Post-processing uses the Phaser 4 filter API** (`camera.filters.external.*`), not Phaser 3's `postFX`. Bloom is built from `addParallelFilters()` (threshold + blur on `top`, blended with ADD); there is no built-in bloom filter. The death glitch adds a temporary `Blocky` filter and removes it with `filters.external.remove`.
- **Scene restart reuses the instance:** `GameScene.create` resets all run state with `Object.assign`. Any new per-run field must be added there.
- State machine in `GameScene`: `ready` → `running` → (`dying` after a wall hit) → `over`. The best distance is stored in `localStorage` (wrapped in try/catch).
