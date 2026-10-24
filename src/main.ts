import './style.css';
import { engine } from './audio/engine';
import { synthesize, type SoundSet } from './audio/synth';
import { loadTuning } from './audio/tuning';
import { campaignLevels, getLevel } from './levels';
import type { Level } from './world/level';
import { GestureRecognizer, type GestureEvent } from './input/gestures';
import { OrientationTracker } from './input/orientation';
import { KeyboardInput } from './input/keyboard';
import { StepDetector } from './input/steps';
import { Narrator } from './narration/narrator';
import { MENU } from './narration/script';
import { GameSession } from './game/loop';
import { loadProgress, saveProgress, type GamePhase, type Progress } from './game/state';
import { ResultsScreen } from './replay/results';
import { SpectateNet } from './spectate/net';
import { startWatchPage } from './spectate/watch';
import { DebugOverlay } from './debug/overlay';
import { TuningPanel } from './debug/tuning';
import type { Recording } from './replay/recorder';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;

if (location.pathname === '/watch') {
  startWatchPage(app);
} else {
  boot();
}

function boot(): void {
  // ── DOM scaffold ──────────────────────────────────────────────────────
  app.innerHTML = `
    <div id="boot" class="screen">
      <h1>ECHO</h1>
      <p>Put on wired earphones.<br>Tap anywhere to begin.</p>
      <p class="code" id="speech-note"></p>
    </div>
    <div id="room-code"></div>
    <div id="caption"></div>`;
  const bootEl = app.querySelector('#boot')!;
  const codeEl = app.querySelector('#room-code')!;
  const speechNote = app.querySelector('#speech-note')!;
  const captionEl = app.querySelector<HTMLElement>('#caption')!;

  const results = new ResultsScreen(app);
  const overlay = new DebugOverlay(app);
  const tuning = loadTuning();
  const tuningPanel = new TuningPanel(app, tuning);

  // ── services ─────────────────────────────────────────────────────────
  const narrator = new Narrator();
  const orientation = new OrientationTracker();
  const steps = new StepDetector();
  const net = new SpectateNet();
  const gestures = new GestureRecognizer(handleGesture);
  let sounds: SoundSet | null = null;
  let session: GameSession | null = null;
  let phase: GamePhase = 'boot';
  let progress: Progress = loadProgress();
  const levels = campaignLevels();
  let menuIdx = 0;
  let currentLevel: Level | null = null;
  let lastRec: Recording | null = null;
  let wakeLock: { release(): Promise<void> } | null = null;
  let debugOn = params.get('debug') === '1';
  if (debugOn) overlay.show(true);
  if (params.get('unlock') === '1') {
    progress.unlocked = levels.length;
    progress.finishedAll = true;
  }

  const keyboard = new KeyboardInput({
    onClick: () => { if (phase === 'playing') session?.click(); },
    onHint: () => { if (phase === 'playing') session?.hint(); },
    onPause: () => togglePause(),
    onDebugToggle: () => { overlay.toggle(); tuningPanel.toggle(); },
  });

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  function earcon(): void {
    if (!sounds || !engine.ready) return;
    const ctx = engine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = sounds.earcon;
    const pan = engine.centred();
    src.connect(pan).connect(engine.sfxBus);
    engine.track(src);
    src.start();
  }

  narrator.wire(engine, captionEl, earcon);

  results.onRetry = () => {
    results.hide();
    if (currentLevel) startLevel(currentLevel);
  };
  results.onNext = () => {
    results.hide();
    const n = currentLevel ? nextLevel(currentLevel) : null;
    if (n) startLevel(n); else enterMenu();
  };

  // ── wake lock ─────────────────────────────────────────────────────────
  async function requestWakeLock(): Promise<void> {
    if (wakeLock) return;
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } };
      wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
      // The sentinel is released automatically on visibility change.
      if (wakeLock) {
        (wakeLock as { onrelease?: (() => void) | null }).onrelease = () => { wakeLock = null; };
      }
    } catch { /* unsupported */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && phase !== 'boot') void requestWakeLock();
  });

  // ── boot tap: unlock everything inside the gesture ───────────────────
  let booted = false;
  async function firstTap(): Promise<void> {
    if (booted) return;
    booted = true;
    engine.init();
    narrator.unlock();
    void OrientationTracker.requestPermission();
    void requestWakeLock();
    orientation.attach();
    steps.attach();
    try {
      const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await so.lock?.('portrait');
    } catch { /* best effort — heading math doesn't depend on it */ }

    // Synthesize all sounds (async) while the boot screen fades.
    sounds = await synthesize(engine.ctx);

    // Spectator code (optional; never blocks).
    void net.connect().then((code) => {
      if (code) codeEl.textContent = `room ${code}`;
    });

    if (!narrator.speechAvailable) {
      speechNote.textContent = MENU.noSpeechNotice;
    }
    narrator.say('Echo.');

    gestures.attach(app);
    keyboard.attach(app);
    steps.onStep = () => session?.queueStep();

    bootEl.classList.add('hidden');
    setTimeout(() => bootEl.remove(), 800);

    const levelParam = params.get('level');
    const direct = levelParam ? getLevel(levelParam) : null;
    if (direct) {
      // ?level=<id> jumps straight in for the demo — bypasses the lock.
      startLevel(direct);
    } else {
      enterMenu();
    }
  }

  // ── audio menu ────────────────────────────────────────────────────────
  function announceLevel(): void {
    const l = levels[menuIdx];
    if (l.meta.order <= progress.unlocked || progress.finishedAll) {
      narrator.interrupt(MENU.levelName(l.meta.order, l.meta.name));
    } else {
      narrator.interrupt(`${MENU.levelName(l.meta.order, l.meta.name)} ${MENU.locked}`);
    }
  }

  function enterMenu(): void {
    phase = 'menu';
    menuIdx = Math.min(menuIdx, levels.length - 1);
    const l = levels[menuIdx];
    narrator.say(MENU.intro(l.meta.order, l.meta.name));
  }

  // ── level lifecycle ───────────────────────────────────────────────────
  function startLevel(level: Level): void {
    if (!sounds) return;
    session?.stop();
    currentLevel = level;
    phase = 'playing';
    session = new GameSession({
      engine,
      sounds,
      tuning,
      narrator,
      orientation,
      keyboard,
      steps,
      net,
      overlay,
      isTouch,
      onEnd: onRunEnd,
    });
    session.start(level);
  }

  function onRunEnd(outcome: 'win' | 'caught', rec: Recording): void {
    lastRec = rec;
    phase = 'results';
    const l = currentLevel!;
    if (outcome === 'win') {
      progress.unlocked = Math.max(progress.unlocked, Math.min(levels.length, l.meta.order + 1));
      if (l.meta.order >= levels.length) progress.finishedAll = true;
      saveProgress(progress);
    }
    const next = nextLevel(l);
    results.show(rec, l, outcome === 'win' && next !== null);
    const summary = outcome === 'win'
      ? MENU.winSummary(rec.duration, rec.clicks)
      : MENU.loseSummary(rec.duration, rec.clicks);
    narrator.say(summary);
  }

  function nextLevel(l: Level): Level | null {
    const i = levels.findIndex((x) => x.meta.id === l.meta.id);
    return i >= 0 && i + 1 < levels.length ? levels[i + 1] : null;
  }

  // ── pause ─────────────────────────────────────────────────────────────
  function togglePause(): void {
    if (phase === 'playing') {
      phase = 'paused';
      session?.setPaused(true);
      narrator.say(MENU.pause);
    } else if (phase === 'paused') {
      resume();
    }
  }

  function resume(): void {
    phase = 'playing';
    session?.setPaused(false);
  }

  // ── gesture routing by phase ──────────────────────────────────────────
  function handleGesture(e: GestureEvent): void {
    switch (phase) {
      case 'boot':
        void firstTap();
        break;
      case 'menu': {
        if (e.type === 'swipe') {
          if (e.dir === 'left' || e.dir === 'right') {
            menuIdx = (menuIdx + (e.dir === 'right' ? -1 : 1) + levels.length) % levels.length;
            announceLevel();
          }
        } else if (e.type === 'tap') {
          const l = levels[menuIdx];
          if (l.meta.order <= progress.unlocked || progress.finishedAll) {
            startLevel(l);
          } else {
            narrator.say(MENU.locked);
          }
        }
        break;
      }
      case 'playing':
        if (e.type === 'threeFingerTap') {
          togglePause();
        } else {
          session?.handleGesture(e);
        }
        break;
      case 'paused':
        if (e.type === 'tap') resume();
        else if (e.type === 'swipe' && e.dir === 'down') { session?.stop(); if (currentLevel) startLevel(currentLevel); }
        else if (e.type === 'swipe' && e.dir === 'up') { session?.stop(); session = null; enterMenu(); }
        else if (e.type === 'swipe' && e.dir === 'left') {
          steps.enabled = !steps.enabled;
          narrator.say(steps.enabled ? 'Walk in place: on.' : 'Walk in place: off.');
        }
        break;
      case 'results': {
        if (!lastRec || !currentLevel) break;
        const won = lastRec.outcome === 'win';
        if (e.type === 'tap') {
          results.hide();
          if (won) {
            const n = nextLevel(currentLevel);
            if (n) startLevel(n); else enterMenu();
          } else {
            startLevel(currentLevel);
          }
        } else if (e.type === 'swipe' && e.dir === 'down') {
          results.hide();
          startLevel(currentLevel);
        } else if (e.type === 'swipe' && e.dir === 'up') {
          results.hide();
          enterMenu();
        }
        break;
      }
    }
  }

  // A single tap anywhere starts the boot sequence.
  app.addEventListener('pointerdown', () => {
    if (phase === 'boot') void firstTap();
  }, { once: false });

  // PWA registration (no-op in dev).
  import('virtual:pwa-register')
    .then((m) => m.registerSW({ immediate: true }))
    .catch(() => { /* module absent in dev */ });
}
