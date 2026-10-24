# DEMO — exact steps

## Setup

1. Deploy to Vercel (`npx vercel --prod`) with `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` set for spectator mode, or run `npm run dev` locally.
2. Laptop on the projector, open `https://<deploy>/watch`.
3. Phone (wired earphones), open `https://<deploy>/?level=walls`.
4. Tap the boot screen once — this unlocks audio, motion sensors, and the wake
   lock, and shows a **4-digit room code**. Enter it on the laptop's `/watch`
   page.

## The demo

1. **Blindfold the judge.** Hand over the phone and earphones.
2. The room watches the live map on `/watch` — player dot, heading cone, click
   rings, and the echo lines showing *what the judge hears*.
3. The judge taps to click, physically turns, and walks (two-finger hold)
   toward the silent gap in the wall.
4. When they reach the exit: the phone shows the **results screen** and
   `/watch` automatically plays the full replay — the path, every click, and
   every echo hit.
5. If time allows: `?level=hold` — the creature that hunts by sound. Watch it
   investigate every click on the projector while the judge tries to sneak
   out. (On `/watch`, press `C` to hide/show the creature.)

## Backup

- Desktop: `Space` = click, `W` = walk, `A`/`D` or mouse = turn, `H` = hint,
  `Esc` = pause, `` ` `` = debug overlay (rays, bins, audio stats, tuning
  sliders).
- A pre-recorded run video covers total network/device failure.
