import type { Level } from '../world/level';
import { renderMap, type RenderState } from '../replay/render';
import type { Engine } from '../audio/engine';

/**
 * Translucent top-down debug map with player, heading, last click's rays and
 * bins, creature + target, live audio stats. `?debug=1` or backquote.
 */
export class DebugOverlay {
  el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private statsEl: HTMLElement;
  private captionEl: HTMLElement;
  visible = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'debug-overlay';
    this.el.className = 'hidden';
    this.el.innerHTML = `<canvas></canvas><div class="dbg-stats"></div><div class="dbg-caption"></div>`;
    parent.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas')!;
    this.statsEl = this.el.querySelector('.dbg-stats')!;
    this.captionEl = this.el.querySelector('.dbg-caption')!;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
  }

  show(v: boolean): void {
    this.visible = v;
    this.el.classList.toggle('hidden', !v);
  }

  setCaption(text: string): void {
    this.captionEl.textContent = text;
  }

  render(level: Level | null, state: RenderState, engine: Engine | null, extra: Record<string, string>): void {
    if (!this.visible) return;
    const w = Math.min(window.innerWidth, 480);
    const h = Math.min(window.innerHeight * 0.5, 420);
    if (this.canvas.width !== w) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (level) renderMap(this.canvas, level, state);
    const lat = engine?.latencyInfo ?? { baseLatency: 0, outputLatency: 0 };
    this.statsEl.innerHTML = [
      `voices ${engine?.voiceCount ?? 0}`,
      `baseLatency ${(lat.baseLatency * 1000).toFixed(0)}ms`,
      `outputLatency ${(lat.outputLatency * 1000).toFixed(0)}ms`,
      ...Object.entries(extra).map(([k, v]) => `${k} ${v}`),
    ].join('<br>');
  }
}
