# Mountain Quest

A twelve-chapter HTML5 canvas platformer with a training ground. It is written in vanilla JS, works offline, makes no external requests and runs on phones by touch.

Play: https://wangden-bhutia.github.io/mountain-quest/

## Story
1. **The Empty Bell.** The village bell's clapper broke in an autumn storm, and the wind carried the pieces up the mountain. Grandmother Amu sends her granddaughter to bring them home. She goes through the meadow (Ch 1), the Lake of Echoes (Ch 2) and Whispering Pines, where she finds the first shard (Ch 3), then the Ice Steps (Ch 4).
2. **Rising stakes.** At the Summit (Ch 5) there is only a second shard and huge hoofprints: something took the last piece. She follows them across the Crumbling Ridge (Ch 6), the Windy Pass (Ch 7), Frozen Falls (Ch 8), Starlit Gorge (Ch 9) and Storm Peak (Ch 10), while a storm closes in.
3. **Climax.** In Old Horn's Hollow (Ch 11), Old Horn, the grandfather of all grumps, hoards shiny things. Three bounces on his head change his mind, and he gives up the last piece.
4. **Ending.** In The Long Way Down (Ch 12), she races the storm home with a tailwind. She rings the bell, the yaks come home, and up on the mountain Old Horn hums along.

## Stages
| # | Stage | New in this stage |
|---|---|---|
| 0 | Training Ground | the basics, with a friendly grump |
| 1 | Sunlit Meadow | |
| 2 | Lake Crossing | moving rafts |
| 3 | Whispering Pines | |
| 4 | The Ice Steps | |
| 5 | Summit Trail | |
| 6 | Crumbling Ridge | **cracked stones that fall** (and come back) |
| 7 | The Windy Pass | **wind zones** (head- and tailwinds, shown as streaks) |
| 8 | Frozen Falls | **slippery ice, springs, ice teeth**; a spike field you can only cross with a spring |
| 9 | Starlit Gorge | night theme; movers, crumbles and spikes together |
| 10 | Storm Peak | everything at once |
| 11 | Old Horn's Hollow | **boss**: 3 stomps, gets faster, hops on his last horn; the flag is locked until he is beaten |
| 12 | The Long Way Down | the finale run home |

## Run and test
```
npm ci
npm test               # data checks, physics unit tests, a solvability check for every stage
./serve.sh &           # serves at http://127.0.0.1:8765/mountain-quest/
npx playwright install chromium
npm run test:e2e       # mobile smoke tests, axe, overlap, save/load, input, screenshots
npm run solve          # prints the solver's finishing time for each stage
```
`tests/solver.js` runs a beam search over the real `js/physics.js` at 120 Hz, using left, right and jump inputs in 0.1 s steps. A stage only passes if it can be finished **without losing a life**. A control test checks that an impossible stage is rejected.

## Files
- `index.html` and `css/style.css`: the page, HTML menus and touch controls. A strict CSP allows no external origins.
- `js/shell.js`: full screen, manual landscape and the sound button.
- `js/physics.js`: the world model and fixed-step physics, with no DOM, so node tests can use it.
- `js/data.js`: stages and story text.
- `js/game.js`: rendering, audio, input, menus and saving.
- `js/assets.js`: the original sprites.
- `original.html`: the untouched original, kept for reference (not deployed).
- `docs/audit.md`: the audit of the original.

The GitHub Actions workflow runs every test, then deploys only `index.html`, `css/` and `js/` to Pages.
