export type GamePhase =
  | 'boot'        // visible boot screen, awaiting first tap
  | 'menu'        // audio level-select menu
  | 'intro'       // intro narration before/at level start
  | 'playing'
  | 'paused'
  | 'results';    // visible results + replay

const KEY = 'echo.progress';

export interface Progress {
  /** Highest unlocked campaign order (1-based). */
  unlocked: number;
  finishedAll: boolean;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      return { unlocked: Math.max(1, p.unlocked | 0), finishedAll: !!p.finishedAll };
    }
  } catch { /* private mode */ }
  return { unlocked: 1, finishedAll: false };
}

export function saveProgress(p: Progress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
