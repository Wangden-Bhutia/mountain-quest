# Mountain Quest: audit of the original file

The original file is `original.html`: one file, 2224 lines, 279 KB. It is kept in the repo unchanged as the reference, and it is not deployed. About 205 KB of it is a single line holding the two base64 PNGs, the hero torso sprite (147×260) and the face.

Each finding is tagged:
- **[verified]**: reproduced in headless Chromium with `tests/audit/audit-original.mjs` or `tests/audit/audit-rot.mjs`, at 390×844 and 844×390 with touch, or by a data check script.
- **[code]**: found by reading the code but not reproduced at runtime.

Screenshots of the original are in `/workspace/mountain-quest-shots/original/`.

## Architecture
- There are four inline `<script>` blocks:
  1. Touch detection and the select/drag/context-menu blockers.
  2. The page shell: full screen, manual landscape rotation and the sound button.
  3. `const ASSETS`, holding the images.
  4. The game, as one IIFE in strict mode.
- The game renders to a fixed 960×540 canvas, scaled with `object-fit: contain` at up to 2× the device pixel ratio.
- State is a single `G` object. The states are `title`, `story`, `play`, `complete`, `gameover` and `win`.
- There are 6 stages: a Training Ground plus Chapters 1–5. They come with 5 story cards and 5 outro lines.

## Game loop
- `requestAnimationFrame` drives a **variable timestep** capped at 50 ms. **[code]** Physics therefore ran once per rendered frame with that frame's `dt`. On a screen below 20 fps the game slowed down, and results varied slightly between 60 Hz and 120 Hz screens.
- Music is scheduled 300 ms ahead from the loop. When the tab is hidden, rAF stops, so music stops too.

## Input
- Keyboard: arrows, WASD and Space; P pauses, M mutes, Esc, F for full screen, R for rotate.
- Touch: three on-screen pointer buttons. Tapping the canvas means "jump" or "continue" on the menus.
- Jump buffering (0.13 s), coyote time (0.10 s) and variable jump height (velocity cut on release) **already existed** and were kept.
- **[verified] There is no pause on touch devices.** No pause button exists (`hasPauseBtn: false`), and pausing needed the P key.
- **[code] Keys and fingers can get stuck.** Nothing handles `blur` or `visibilitychange`. A key held while the tab loses focus never sends `keyup`, so the hero keeps walking. Touch buttons released through `pointerleave` also drop a finger that slides off the button while still pressed.
- **[code] The game never auto-pauses** when the phone locks or the tab is switched. It resumes in mid-jump when you return.
- **[verified] The M key gets out of sync with the sound button.** After pressing M, the 🔊 button still showed "on" (`className: "ctl"`, with no `off` class).

## Physics and collision
- There are separate X and Y passes against ground blocks (solid), platforms and moving platforms (one-way). Enemies use plain box overlap, and a stomp needs `vy > 120` with the feet in the top 40 px.
- **[verified, data check] Five enemies patrol partly over water**, walking on air past the end of the ground:
  - Ice Steps: the hopper at 1300 and the walker at 3950.
  - Summit Trail: the hopper at 520, the walker at 2500 and the hopper at 2560.
- **[code]** Enemy start direction and coin phase come from `Math.random()`, so a run cannot be repeated exactly.
- **[code]** There is no right-hand world boundary. It doesn't matter in practice because the goal comes first.

## Level format
- Each level is an object with `ground` [x0,x1] spans at y=460, `platforms` [x,y,w], `movers`, `coins`, `enemies` (`walk` or `hop`), `checkpoints` (x positions) and `goal` (x).
- Every original stage turned out to be completable. This was checked by the scripted search in `tests/solver.js` on the same physics.

## Story
- **[verified, text] Plot hole.** Amu says the bell is *in the valley* and its clapper is *up where the meadow ends*. Yet at the summit, Chapter 5's outro says "The clapper fits. The bell rings out", so the bell is rung at the top of the mountain. The win screen then says "All five chapters". The pine-forest card mentions "a shard of the clapper", which suggests pieces, but nothing else follows that up.

## Audio
- Web Audio offers procedural sound effects and a step sequencer for the music, with no audio files.
- **[verified] The AudioContext is created before any user gesture.** `playSong('title')` runs when the page loads, and Chrome logged "The AudioContext was not allowed to start" three times per load. A tap did resume it in Chromium. On iOS, a context created early has a history of staying muted.

## Save data
- **[verified] There is no saving at all** (`localStorage` keys: `[]`). Closing the tab loses all progress, and there is no level select.

## Layout, orientation and accessibility
- **[verified] Manual landscape mode leaves the top controls unrotated.** The 🔄 🔊 ⛶ buttons sit outside the rotated `#stage`, so they appear sideways. See `original/portrait-rotated-play.png`.
- **[verified] In landscape at 844×390, the ▶ pad covers the hero** at the start of every stage. See `original/landscape-play.png`. The 76 px and 96 px pads are 42% opaque.
- In portrait without rotation, the game is a 390×219 strip with the pads below it. It is playable, and the rotate button pulses to suggest landscape.
- Double-tap zoom and long-press are blocked well: `user-scalable=no`, `touch-action: none` and select/contextmenu prevention all hold.
- **[code] All menus are drawn on the canvas,** so screen readers and keyboard focus can't reach them. The buttons' `aria-label`s are terse ("left", "jump").
- **[code] `prefers-reduced-motion` is ignored,** including screen shake, white flashes, confetti, the pulsing hint buttons and the typewriter text.

## Performance
- **[code]** Three canvas gradients (haze, water and shore) are created again on every frame. They are now cached.
- **[code]** `sizeCanvas` runs on every resize event and resets the canvas each time.
- The background layers are pre-rendered offscreen, which is good.

## Security and external requests
- **[verified] No external requests** at either size (`reqs: []`). There are no CDNs, fonts, analytics or `eval`. The images are inline `data:` URIs.
- There is no CSP, because everything was inline.
- **[code]** The file embeds a real photo of a child's face and body as the hero sprite. Publishing the game on GitHub Pages makes that photo public.

## Fixed in v2 (see README)
Every item above marked [verified], plus:
- the stuck keys,
- auto-pause,
- the fixed timestep,
- reduced motion,
- the gradient caching,
- deterministic enemies.

The photo is kept, since it is the game's main character. It is flagged here for the owner.

## v3 additions (5 more stages, install and offline)
- Five chapters were inserted between Starlit Gorge and Storm Peak, so the boss and the ending still come last. The Gorge outro was rewritten to lead into them. Each one passes the solver and layout checks.
- The save version is now 2, with a migration test for v1 saves.
- PWA: manifest, generated service worker and install button. The CSP gains only `worker-src 'self'` and `manifest-src 'self'`.
- Not verified: install on a real phone, and update behaviour across real deploys on a device.

## v4: landscape first
- Portrait turn card, orientation lock attempt and manifest `landscape`. Real-phone lock behaviour is untested.
