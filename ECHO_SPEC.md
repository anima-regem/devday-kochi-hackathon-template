# ECHO — Build Spec

A game played in total darkness, by sound alone. The phone screen stays black during play. The player taps to make a click, hears the echoes of a simulated space in 3D audio through wired earphones, turns by physically turning the phone, and must find the exit — later, while something hunts them by sound.

Build everything in this spec, in the three batches below, and run to completion. Do not stop for review between batches. Every decision here is final unless it is technically impossible; if so, pick the closest equivalent and note it in `NOTES.md`.

---

## 0. Hard constraints

- **Stack:** Vite + TypeScript, no UI framework. Plain DOM for the few visible screens, Canvas 2D for the replay and spectator views. Vitest for unit tests.
- **Audio:** Web Audio API only. **All sounds are synthesized procedurally at load time** (no audio asset files, no downloads, no external sound libraries).
- **Deploy:** Vercel, HTTPS (required for motion sensors on iOS). PWA via `vite-plugin-pwa`; the game must work fully offline after first load.
- **No:** 3D graphics, procedural level generation, multiplayer gameplay, paid APIs, analytics, login.
- **Spectator mode** (section 9) is the only networked feature and is optional at runtime: if its env vars are missing or the network is down, the game is unaffected.

---

## 1. Coordinate conventions

- World is a 2D grid. **1 cell = 1 metre.** Cell `(col, row)`; world position `(x, y)` in metres, `x` grows east, `y` grows south. Cell centre = `(col + 0.5, row + 0.5)`.
- **Heading** `h` in radians, `0` = north (−y), increasing clockwise. Direction vector = `(sin h, −cos h)`.
- **Audio space:** the Web Audio listener stays at the origin facing −Z with up +Y and is never moved. Every sound is placed by its angle **relative to the player's heading** `rel = θ_world − h`, at position `(sin rel, 0, −cos rel)` (unit distance). We compute all distance gain and filtering ourselves; panners use `panningModel: 'HRTF'`, `distanceModel: 'inverse'`, `refDistance: 1`, `rolloffFactor: 0`.

---

## 2. Level format

Levels are ASCII grids in `src/levels/*.ts`, each exporting `{ meta, map }`.

| Char | Meaning |
|---|---|
| `#` | Stone wall |
| `W` | Wood wall |
| `S` | Sacks / cloth (solid, highly absorbent) |
| `.` | Floor (level's default floor material) |
| `~` | Water floor (walkable, splashing footsteps, louder to the creature, 0.6× move speed) |
| `P` | Player start (floor) |
| `E` | Exit (floor; reaching its cell wins). Usually placed in the boundary wall as an opening. |
| `C` | Creature spawn (floor) |

Anything beyond the map edge is **open void**: rays that leave the map return nothing (silence = openness).

`meta` fields:

```ts
{
  id: string; name: string; order: number;
  floor: 'stone' | 'wood';
  playerHeading: number;        // degrees, 0 = north
  rt60: number;                 // reverb tail seconds
  clicksEnabled: boolean;
  beacon: boolean;              // exit emits the sea-breeze beacon
  beaconGain: number;           // 0..1
  creature?: { wander: number; investigate: number; hunt: number }; // m/s
  narration: { intro: string[]; win: string; lose?: string };
  hints?: string[];             // spoken on long-press, in order, tutorial levels only
}
```

### 2.1 The levels (use these exact maps)

**Level 1 — "Wake"** (tutorial: turning and walking). floor stone, heading 270 (facing west, away from the exit), rt60 1.2, clicksEnabled false, beacon true, beaconGain 0.9.
```
#########
#.......#
#.......#
#...P...E
#.......#
#########
```

**Level 2 — "Walls"** (tutorial: the click). floor stone, heading 180 (facing the near south wall), rt60 1.4, clicksEnabled true, beacon **false** — the gap must be found by echo.
```
####EE####
#........#
#........#
#........#
#....P...#
#........#
##########
```

**Level 3 — "Corridor"** (following openings; stone vs wood). floor stone, heading 90, rt60 1.6, clicksEnabled true, beacon true, beaconGain 0.35.
```
################
#P............##
#.............##
############..##
###########W..W#
###########W..W#
###########W..W#
###########W..W#
E.............##
#.............##
################
```

**Level 4 — "Godown"** (a Mattancherry spice warehouse: sacks, water, a decoy area). floor stone, heading 180, rt60 1.3, clicksEnabled true, beacon true, beaconGain 0.25.
```
##################
#P...#......S....#
#....#..SS..S....#
#....#..SS.......#
#........~~~..#..#
#####....~~~..#..#
#...S....~~~..####
#...S..#.........#
#......#..WWW....#
#......#..WWW....E
#..SS..#.........#
##################
```

**Level 5 — "The Hold"** (an old ship's hold at Fort Kochi; the creature). floor wood, heading 90, rt60 0.9, clicksEnabled true, beacon true, beaconGain 0.2, creature `{ wander: 0.6, investigate: 1.0, hunt: 1.35 }`.
```
WWWWWWWWWWWWWWWWWWWW
W..........W.......W
W.P........W...C...W
W.....SS...........W
W.....SS...WWWW....W
W..............W...W
WWWW...WWWW....W...W
W......W.......W...W
W..~~..W...SS......W
W..~~......SS......E
WWWWWWWWWWWWWWWWWWWW
```

**Sandbox** (dev only, reachable via `?level=sandbox`): a 15×15 stone room with an internal wood wall, a sack pile, a 1-cell and a 2-cell doorway, beacon on, clicks on, no creature. Used for tuning.

Write a unit test that parses every level, checks every row has equal length, exactly one `P`, at least one `E`, and that `E` is reachable from `P` by BFS.

---

## 3. Audio engine

### 3.1 Context and routing

- Create the `AudioContext({ latencyHint: 'interactive' })` inside the first user tap. If `navigator.audioSession` exists, set `navigator.audioSession.type = 'playback'` (so the iOS silent switch doesn't mute the game).
- Routing: `voices → sfxBus → master`, `reverbSend → convolver → master`, `ambienceBus → master`, `narrationDuck` multiplies master gain to 0.4 while speech plays (ramp 150 ms).
- Master through a `DynamicsCompressorNode` (gentle, threshold −12 dB) to avoid clipping when many echoes overlap.

### 3.2 Procedural sounds (synthesized into AudioBuffers at boot)

| Sound | Recipe |
|---|---|
| Click | 4 ms white-noise burst × exponential decay, band-passed at 3 kHz (Q 1.2), plus a 1-sample transient; peak-normalized |
| Footstep stone | 30 ms noise burst, band-pass 1.8 kHz, fast decay |
| Footstep wood | 60 ms, band-pass 600 Hz + a short 180 Hz resonant creak, randomized pitch ±8% |
| Footstep water | 180 ms filtered noise with 3 random sub-splashes, low-pass 2.5 kHz |
| Wall bump | 80 ms low thud: 90 Hz sine with fast pitch drop + low-passed noise |
| Sea-breeze beacon (loop) | pink noise, band-pass 400–1200 Hz, slow amplitude LFO 0.15 Hz, seamless 6 s loop |
| Creature breathing (loop) | low-passed noise (500 Hz) with inhale/exhale amplitude envelope, 3.2 s cycle, slight irregularity |
| Creature growl | 900 ms: 70 Hz sawtooth with vibrato, distorted (WaveShaper), low-passed |
| Heartbeat | double thump, 55 Hz sine bursts; rate driven by danger |
| Win sting / lose sting | short synthesized tonal swell / harsh noise-and-growl hit |
| Drip (ambient detail, optional per level) | 10 ms high sine blip with pitch drop, random interval |

### 3.3 The echo model (the core of the game — make this excellent)

On each click at player position `p`, heading `h`:

1. **Play the dry click** centred (rel 0), gain `clickGain` (0.5), and send `reverbSend` gain `reverbAmount` (0.12) into the convolver.
2. **Cast `N` rays** (default 180) at world angles `θ_i = h + 2π·i/N` using a DDA grid traversal up to `maxDist` (20 m). For each ray record: hit distance `d`, wall material `m`, axis-aligned face normal `n`. Rays that leave the map or exceed `maxDist` record no hit.
3. **Diffuse return energy** per ray: `E_i = R_m · |cos φ| / max(d, 0.5)²`, where `φ` is the angle between the ray and the face normal and `R_m` is the material reflectivity.
4. **Bin by relative angle** into `B` bins (default 24, i.e. 15° each). Per bin: `E_bin` = mean energy across that bin's rays (missed rays count as 0), `d_bin` = energy-weighted mean distance, `m_bin` = material with the highest energy share. A bin with no hits emits nothing — **the silence is how openings are heard.**
5. **One echo voice per non-empty bin:**
   - Delay `t = (2·d_bin / 343) · echoTimeScale`. Default `echoTimeScale = 3` (real echoes under ~10 m fuse with the click; we stretch time for readability — tunable 1–6).
   - Amplitude `a = echoGain · sqrt(E_bin)` (default `echoGain` 0.9), clamped to [0, 1].
   - Low-pass cutoff = `min(materialCutoff_m, 16000 / (1 + d_bin / 4))`.
   - Chain: `BufferSource(click) → BiquadFilter(lowpass) → Gain(a) → Panner(HRTF at rel bin centre) → sfxBus`, started at `ctx.currentTime + t`. Disconnect on `ended`.
6. **Near-wall emphasis:** for bins with `d_bin < 1.5`, multiply amplitude by 1.4 so walls within arm's reach are unmistakable.

Materials:

| Material | Reflectivity `R` | Cutoff |
|---|---|---|
| stone | 0.95 | 9000 Hz |
| wood | 0.65 | 3500 Hz |
| sacks | 0.25 | 1500 Hz |

**Reverb tail:** on level load, generate a stereo impulse response: decorrelated white noise × `exp(−6.91·t / rt60)`, length `rt60 · 1.2` s, then set it on the convolver.

All parameters (`N`, `B`, `echoTimeScale`, `echoGain`, `clickGain`, `reverbAmount`, `maxDist`, material values, near-wall boost) live in one `tuning` object, editable live in the debug panel and persisted to `localStorage`.

### 3.4 Positional sources with sound propagation (beacon, creature, drips)

Sound must come **around corners through openings**, not through walls:

- Precompute a BFS distance field over walkable cells from each static source (the exit) at level load; recompute the creature's field from the player's cell each tick (it's cheap at these grid sizes).
- Each frame, for each source: if there is clear line of sight (DDA) from player to source → apparent direction = straight to source, distance = Euclidean, low-pass 12 kHz. Otherwise → follow the path from the player toward the source and take the **furthest path cell still in line of sight of the player** as the apparent position; distance = path length; low-pass 1500 Hz (occluded/diffracted).
- Gain = `baseGain / max(1, distance)`. Smooth position and gain changes (setTargetAtTime, τ 0.08 s) so turning is seamless.

### 3.5 Footsteps and bumps

- A footstep plays every 0.65 m travelled, material from the floor cell (water overrides floor), centred, slightly randomized gain.
- Colliding with a wall plays the bump sound panned toward the wall, triggers `navigator.vibrate?.(35)`, cooldown 400 ms.

---

## 4. Input — fully usable without sight

### 4.1 Phone

- **Turning:** `deviceorientation`. On iOS call `DeviceOrientationEvent.requestPermission()` (and `DeviceMotionEvent.requestPermission()`) inside the boot tap. Heading = `−alpha` relative to the alpha captured when the level starts (so wherever the player faces at level start = the level's `playerHeading`). Handle 0/360 wraparound; smooth with a short low-pass. The phone is held upright like a torch; lock to portrait.
- **Gesture rules** (use a small gesture state machine; `touch-action: none` on the whole page, no zoom, no scroll):
  - **Single tap** (one finger, < 250 ms, no second finger ever joined, < 15 px movement) → **click**. Cooldown 350 ms.
  - **Two or more fingers held** → **walk forward** at 1.1 m/s (0.6× on water) for as long as they're held. Must never also fire a click.
  - **Long press, one finger, 800 ms** → speak the next hint (tutorial levels) or repeat the objective.
  - **Three-finger tap** → pause menu.
- **Fallback turning** if no orientation events arrive within 2 s of the level starting: one-finger horizontal drag turns (1 px = 0.4°), and narrate "Motion sensors unavailable. Drag one finger left or right to turn."
- **Screen:** black during play; request a screen wake lock (`navigator.wakeLock.request('screen')`), re-request on `visibilitychange`.

### 4.2 Desktop (development and backup demo)

`Space` click, `W`/`S` walk forward/back, `A`/`D` or mouse-move (pointer lock) turn, `H` hint, `Esc` pause, `` ` `` toggle debug.

### 4.3 Stretch (only after everything else is done)

Walk-in-place step detection from `devicemotion` (peak detection on vertical acceleration, refractory 300 ms, each step = 0.65 m forward), toggleable in the pause menu.

---

## 5. Player movement

- Position continuous in metres, collision radius 0.28 m against solid cells, slide along walls (resolve x and y separately).
- Reaching the `E` cell → win.

---

## 6. The creature (Level 5)

State machine: `wander → investigate → hunt → (catch)`.

- **Hearing:**
  - Click: heard if BFS path distance ≤ 18 m. Target = the player's position plus Gaussian error with σ = 0.12 × path distance.
  - Footsteps: heard within path distance 2.5 m (stone), 3.5 m (wood floor), 6 m (water).
- **Wander:** pick random reachable cells, A* there at `wander` speed.
- **Investigate:** A* to the last heard target at `investigate` speed. On arrival with nothing new, wander again.
- **Hunt:** entered when a sound is heard within 7 m path distance. Plays the growl once (positional). Moves at `hunt` speed toward the latest heard position; drops back to investigate after 8 s with no new sound.
- **Catch:** within 0.6 m → lose sting, narrate `lose`, restart the level.
- **Audio:** breathing loop as a positional source (3.4), base gain 0.8. Heartbeat starts when the creature's path distance < 7 m; rate scales from 70 to 150 bpm as distance falls to 1 m.
- **Fairness:** the creature never spawns-camps the exit; its first 6 s are spent wandering away from the player.

Every click is a trade-off: information for the player, information for the creature. Don't add any other mechanic that weakens that rule.

---

## 7. Narration and menus (audio-first)

- Use `speechSynthesis` (English voice, rate 1.0), with a queue and master ducking during speech. Never let narration overlap itself.
- **Boot screen (visible):** large title "ECHO", one line "Put on wired earphones. Tap anywhere to begin." Tapping unlocks audio, requests motion permission and wake lock, then fades to black.
- **Audio menu:** narrator says: "Echo. Tap to play level [n], [name]. Swipe left or right to choose a level." Swiping cycles levels (narrating each name; locked levels say "locked"). Progress saved in `localStorage`; all levels unlocked by `?unlock=1` or after finishing Level 5 once.
- **Pause menu (three-finger tap):** "Paused. Tap to resume. Swipe down to restart. Swipe up to return to the menu."
- `?level=<id>` jumps straight into a level (for the demo).

### 7.1 Script (use these lines)

- **Wake intro:** "You wake up somewhere completely dark." / "Hear that? Wind, coming from outside." / "Turn your phone slowly until the wind is straight ahead of you." / "Then hold two fingers on the screen to walk towards it."
- **Wake hints:** "Turn your whole body, holding the phone in front of you, until the wind is centred." / "Hold two fingers down to walk. Lift them to stop."
- **Wake win:** "You found your way out. Next, there won't be any wind to follow."
- **Walls intro:** "No wind this time. You'll have to listen to the room itself." / "Tap the screen once to click." / "The echo tells you what's around you. Close walls answer quickly and loudly. Far walls answer later and softer." / "Somewhere, there's a gap in the wall. A gap gives no echo at all. Find it."
- **Walls hints:** "There's a wall right in front of you. Hear how fast it answers? Now turn around and click again." / "Turn a little at a time and click. When one direction goes quiet, that's the gap."
- **Walls win:** "That's echolocation. Some blind people use exactly this to move through the world."
- **Corridor intro:** "A long corridor. Follow the openings." / "Listen to the walls change. Stone rings sharp and bright. Wood sounds dull and soft." / "The wind is faint, but it's there."
- **Corridor win:** "Good. Your ears are learning."
- **Godown intro:** "An old spice warehouse in Mattancherry." / "Sacks soak up sound. Water splashes. Not every opening leads somewhere."
- **Godown win:** "One more. Somewhere in the dark, you won't be alone."
- **Hold intro:** "The hold of an old ship, docked at Fort Kochi." / "Something is down here with you. It can't see either. It hunts by sound." / "Every click helps you. Every click helps it." / "Find the hatch."
- **Hold win:** "You escaped the hold." **Hold lose:** "It found you."

---

## 8. Replay — the reveal

- **Recorder:** during every run, record at 10 Hz `{ t, x, y, heading }`; events `{ t, type: 'click' | 'bump' | 'hint' | 'creatureState' }` (clicks also store each bin's hit point for visualization); creature `{ t, x, y, state }` at 10 Hz; outcome, duration, click count, bump count, closest creature approach.
- **Results screen (visible, after each level):** the screen lights up with: outcome, time, clicks, bumps, closest approach. A top-down Canvas replay: walls coloured by material, the path as a line drawn over time, each click as an expanding ring with lines to that click's echo hit points (this shows "what you heard"), the creature's path in red with state colouring, a marker at the closest approach. Controls: play/pause, scrubber, 1×/2×/4×, Retry, Next level.
- The narrator also speaks the summary ("You escaped in one minute twelve seconds, using fourteen clicks.") for blind players, with "Tap to continue, swipe down to retry."

---

## 9. Spectator view — `/watch`

Lets the audience watch the blindfolded player live on a projector while the phone stays black.

- **Transport:** Supabase Realtime broadcast channel `echo-<code>` (env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; no database tables needed). If env vars are absent or the connection fails, the game runs normally and the boot screen simply doesn't show a code.
- **Phone side:** the boot screen shows a 4-digit room code (before it goes black). The game publishes player state at 15 Hz plus click/bump/creature events; it never waits on the network.
- **`/watch` page:** enter the code; full-screen live map using the same renderer as the replay: player dot with heading cone, click rings and echo hit lines animating as they happen, creature (toggle with `C`), level name, timer, click count. When the level ends, it automatically plays the replay.

---

## 10. Debug and tuning

- `?debug=1` or `` ` `` shows, on the phone or desktop, a translucent top-down map with the player, heading, last click's rays and bins, creature and its target, and live audio stats (`baseLatency`, `outputLatency`, active voices).
- Tuning panel: sliders for every `tuning` value, a "play test click" button, presets saved to `localStorage`, "reset to defaults".

---

## 11. Project structure

```
src/
  main.ts                 boot, routing (/, /watch)
  audio/engine.ts         context, buses, ducking, reverb IR
  audio/synth.ts          all procedural sounds
  audio/echo.ts           raycast → bins → echo voices
  audio/sources.ts        positional loops with propagation/occlusion
  world/level.ts          parser + validation
  world/grid.ts           DDA raycast, line of sight, collision
  world/path.ts           BFS distance fields, A*
  world/materials.ts
  game/loop.ts  game/player.ts  game/creature.ts  game/state.ts
  input/gestures.ts  input/orientation.ts  input/keyboard.ts  input/steps.ts
  narration/narrator.ts  narration/script.ts
  replay/recorder.ts  replay/render.ts  replay/results.ts
  spectate/net.ts  spectate/watch.ts
  debug/overlay.ts  debug/tuning.ts
  levels/wake.ts walls.ts corridor.ts godown.ts hold.ts sandbox.ts
tests/
  level.test.ts  grid.test.ts  path.test.ts  echo.test.ts  creature.test.ts  gestures.test.ts
```

Required tests: level validation (2.1); DDA hit distance and face normal on known layouts; echo math (a stone wall 2 m straight ahead yields a centre-bin voice with delay `(4/343)·echoTimeScale` and no voice in bins facing an opening); BFS/A* on the Hold map; creature hearing thresholds per floor; gesture state machine (two-finger hold never emits a click).

---

## 12. Batches

**Batch A — Engine.** Scaffold, deploy to Vercel, boot/unlock flow, audio engine, procedural sounds, echo model, positional sources, input (phone + desktop), player movement, sandbox level, debug overlay and tuning panel, tests for grid/echo/gestures.

**Batch B — Game.** All five levels, narration and audio menus, hints, beacon, creature AI and its audio, win/lose flow, progress saving, `?level=` and `?unlock=1`, remaining tests.

**Batch C — Reveal and polish.** Recorder, results screen and replay, spectator view, PWA/offline, wake lock, stretch step-detection, final deploy. Write `NOTES.md` covering anything changed from this spec, and `DEMO.md` with the exact demo steps from section 13.

Done means: all tests pass, the production build deploys, and every level is completable on desktop with keyboard.

---

## 13. Demo flow (for `DEMO.md`)

1. Laptop on projector open at `/watch`. Phone at `/?level=walls`, wired earphones, room code entered on the laptop.
2. Blindfold the judge. Hand over phone and earphones. The room watches the live map as the judge clicks, turns, and finds the gap.
3. Results screen + spectator replay: show the clicks and the echo lines — what they heard.
4. If time allows: `/?level=hold` — the creature.
5. Backup: desktop keyboard version + a pre-recorded run video.

---

## 14. Final manual test checklist (run on real devices before accepting)

- iPhone (Safari) and Android (Chrome), wired earphones, silent mode on and off.
- Blindfolded: can you tell a near wall from a far wall, and find the 2-cell gap in Walls?
- Turning the phone rotates the sound field smoothly with no jumps at 0°/360°.
- Two-finger walk never triggers a click; long-press hints work.
- The beacon is heard around corners in Corridor, not through walls.
- The creature reacts to clicks and water splashes; the heartbeat ramps; being caught restarts the level.
- Screen never sleeps during play.
- Airplane mode after first load: game still works; spectator degrades silently.
- `/watch` follows a live run and plays the replay at the end.
