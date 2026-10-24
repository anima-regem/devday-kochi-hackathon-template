# Change log

## 2026-10-24T21:20:00+05:30 — Template migration + screenshots

- Changed: imported full project into the DevDay template repository; added
  `scripts/screenshots.ts` (renders real level maps + echo hits to PNG) and
  `screenshots/`; filled README/SUBMISSION/AI_USAGE placeholders.
- Why: hackathon requires code, run scripts, and supporting screenshots in the
  provided template repo.
- Validation: `node scripts/.screenshots.mjs` produced all PNGs; visual check
  of `hold-run.png` (walls, path, click rings, echo lines, creature).
- Limitations: screenshots are static renders, not device captures.

## 2026-10-24T21:05:00+05:30 — Initial build: Echo complete

- Changed: full implementation of ECHO_SPEC.md — three batches (engine, game,
  reveal/polish) in one pass. All of `src/`, `tests/`, PWA config, docs.
- Why: build the game to spec.
- Validation: `npm test` 54/54 pass; `tsc` clean; `vite build` + SW generation
  clean; `vite preview` serves 200s.
- Limitations: Vercel deploy and on-device checklist (spec §14) pending;
  deviations logged in NOTES.md.
