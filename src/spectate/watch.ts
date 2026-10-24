import { getLevel } from '../levels';
import { renderMap } from '../replay/render';
import type { Level } from '../world/level';
import type { Recording } from '../replay/recorder';
import type { CreatureState } from '../game/creature';
import { ResultsScreen } from '../replay/results';
import { SpectateNet, SpectateSub, type SpectateEvent, type SpectateFrame } from './net';

/**
 * /watch — audience view. Enter the 4-digit code; a full-screen live map
 * follows the blindfolded player; when the run ends it plays the replay.
 */
export function startWatchPage(root: HTMLElement): void {
  root.innerHTML = '';
  document.body.className = 'watch';

  if (!SpectateNet.available()) {
    root.innerHTML = `<div class="screen"><div class="watch-form">
      <h1>ECHO — spectator</h1>
      <p>Spectator mode is not configured on this build.</p>
    </div></div>`;
    return;
  }

  const form = document.createElement('div');
  form.className = 'screen';
  form.innerHTML = `<div class="watch-form">
    <h1>ECHO</h1>
    <p>Enter the 4-digit room code shown on the phone.</p>
    <input id="watch-code" inputmode="numeric" maxlength="4" pattern="[0-9]*" autocomplete="off" />
    <button id="watch-join">Watch</button>
    <p id="watch-err" class="err"></p>
  </div>`;
  root.appendChild(form);

  const stage = document.createElement('div');
  stage.className = 'screen hidden watch-stage';
  stage.innerHTML = `
    <div class="watch-hud">
      <span id="watch-level"></span>
      <span id="watch-timer">0:00</span>
      <span id="watch-clicks">0 clicks</span>
      <span class="hint">C toggles creature</span>
    </div>
    <canvas id="watch-canvas"></canvas>`;
  root.appendChild(stage);

  const results = new ResultsScreen(root);
  const sub = new SpectateSub();

  let canvas: HTMLCanvasElement;
  let level: Level | null = null;
  let live: SpectateFrame | null = null;
  let clickFx: { x: number; y: number; hits: { x: number; y: number }[]; at: number }[] = [];
  let path: { x: number; y: number }[] = [];
  let creaturePath: { x: number; y: number }[] = [];
  let showCreature = true;
  let runStart = 0;
  let raf = 0;
  let ended = false;

  const hudLevel = () => stage.querySelector('#watch-level')!;
  const hudTimer = () => stage.querySelector('#watch-timer')!;
  const hudClicks = () => stage.querySelector('#watch-clicks')!;

  sub.onFrame = (f) => {
    live = f;
    if (!level || level.meta.id !== f.levelId) {
      level = getLevel(f.levelId);
      path = [];
      creaturePath = [];
      clickFx = [];
      ended = false;
    }
    if (level && !ended) {
      path.push({ x: f.x, y: f.y });
      if (f.cx !== undefined && f.cy !== undefined) {
        creaturePath.push({ x: f.cx, y: f.cy });
      }
      hudLevel().textContent = f.levelName;
      hudClicks().textContent = `${f.clicks} click${f.clicks === 1 ? '' : 's'}`;
      const s = Math.floor(f.t);
      hudTimer().textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
  };

  sub.onEvent = (e: SpectateEvent) => {
    if (e.type === 'start') {
      level = e.levelId ? getLevel(e.levelId) : level;
      path = []; creaturePath = []; clickFx = [];
      runStart = performance.now();
      ended = false;
      results.hide();
      form.classList.add('hidden');
      stage.classList.remove('hidden');
      hudLevel().textContent = e.levelName ?? '';
    } else if (e.type === 'click' && e.x !== undefined && e.y !== undefined) {
      clickFx.push({ x: e.x, y: e.y, hits: e.hits ?? [], at: performance.now() });
      if (clickFx.length > 12) clickFx.shift();
    } else if (e.type === 'end') {
      ended = true;
      const rec = e.recording as Recording | undefined;
      if (rec && level) {
        stage.classList.add('hidden');
        results.show(rec, level, false);
      }
    }
  };

  async function join(): Promise<void> {
    const input = form.querySelector<HTMLInputElement>('#watch-code')!;
    const err = form.querySelector<HTMLElement>('#watch-err')!;
    const code = input.value.trim();
    if (!/^\d{4}$/.test(code)) {
      err.textContent = 'Enter the 4-digit code.';
      return;
    }
    err.textContent = 'Connecting…';
    const ok = await sub.join(code);
    if (!ok) {
      err.textContent = 'Could not reach the spectator service.';
      return;
    }
    err.textContent = 'Waiting for the player…';
  }

  form.querySelector('#watch-join')!.addEventListener('click', () => void join());
  form.querySelector('#watch-code')!.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void join();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'c' || e.key === 'C') showCreature = !showCreature;
  });

  function loop(): void {
    canvas = stage.querySelector('#watch-canvas')!;
    if (canvas.width !== stage.clientWidth * devicePixelRatio) {
      canvas.width = stage.clientWidth * devicePixelRatio;
      canvas.height = stage.clientHeight * devicePixelRatio;
      canvas.style.width = `${stage.clientWidth}px`;
      canvas.style.height = `${stage.clientHeight}px`;
    }
    if (level && live) {
      const now = performance.now();
      clickFx = clickFx.filter((c) => now - c.at < 2500);
      renderMap(canvas, level, {
        player: { x: live.x, y: live.y, heading: live.heading },
        path,
        clicks: clickFx.map((c) => ({ x: c.x, y: c.y, hits: c.hits, age: (now - c.at) / 1000 })),
        creature: live.cx !== undefined && live.cy !== undefined
          ? { x: live.cx, y: live.cy, state: (live.cstate ?? 'wander') as CreatureState }
          : null,
        creaturePath,
        showCreature,
      });
    } else if (level) {
      renderMap(canvas, level, {});
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  void runStart;
  void raf;
}
