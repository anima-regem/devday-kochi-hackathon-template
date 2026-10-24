import { defaultTuning, resetTuning, saveTuning, type Tuning } from '../audio/tuning';
import type { WallMaterial } from '../world/materials';

/**
 * Live tuning panel — sliders for every tuning value, presets in
 * localStorage, reset to defaults, "play test click" button.
 */
export class TuningPanel {
  el: HTMLElement;
  tuning: Tuning;
  onTestClick: (() => void) | null = null;
  private presetSel: HTMLSelectElement;

  constructor(parent: HTMLElement, tuning: Tuning) {
    this.tuning = tuning;
    this.el = document.createElement('div');
    this.el.id = 'tuning-panel';
    this.el.className = 'hidden';
    parent.appendChild(this.el);
    this.presetSel = document.createElement('select');
    this.build();
  }

  private slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tune-row';
    const lab = document.createElement('label');
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    const val = document.createElement('span');
    val.textContent = String(get());
    input.addEventListener('input', () => {
      const v = Number(input.value);
      set(v);
      val.textContent = String(v);
      saveTuning(this.tuning);
    });
    row.append(lab, input, val);
    return row;
  }

  private build(): void {
    const t = this.tuning;
    this.el.innerHTML = '<h2>Tuning</h2>';
    const rows: [string, number, number, number, () => number, (v: number) => void][] = [
      ['rays', 36, 720, 4, () => t.rays, (v) => { t.rays = v; }],
      ['bins', 8, 48, 1, () => t.bins, (v) => { t.bins = v; }],
      ['echoTimeScale', 1, 6, 0.1, () => t.echoTimeScale, (v) => { t.echoTimeScale = v; }],
      ['echoGain', 0, 2, 0.05, () => t.echoGain, (v) => { t.echoGain = v; }],
      ['clickGain', 0, 1, 0.02, () => t.clickGain, (v) => { t.clickGain = v; }],
      ['reverbAmount', 0, 0.5, 0.01, () => t.reverbAmount, (v) => { t.reverbAmount = v; }],
      ['maxDist', 4, 40, 0.5, () => t.maxDist, (v) => { t.maxDist = v; }],
      ['nearWallBoost', 1, 3, 0.05, () => t.nearWallBoost, (v) => { t.nearWallBoost = v; }],
      ['nearWallDist', 0.2, 4, 0.1, () => t.nearWallDist, (v) => { t.nearWallDist = v; }],
      ['walkSpeed', 0.4, 2.5, 0.05, () => t.walkSpeed, (v) => { t.walkSpeed = v; }],
    ];
    for (const [label, min, max, step, get, set] of rows) {
      this.el.appendChild(this.slider(label, min, max, step, get, set));
    }
    for (const m of ['stone', 'wood', 'sacks'] as WallMaterial[]) {
      this.el.appendChild(this.slider(`R ${m}`, 0.05, 1, 0.01,
        () => t.materialReflectivity[m], (v) => { t.materialReflectivity[m] = v; }));
      this.el.appendChild(this.slider(`cutoff ${m}`, 500, 16000, 100,
        () => t.materialCutoff[m], (v) => { t.materialCutoff[m] = v; }));
    }

    const btns = document.createElement('div');
    btns.className = 'tune-btns';
    const test = document.createElement('button');
    test.textContent = 'Play test click';
    test.addEventListener('click', () => this.onTestClick?.());
    const reset = document.createElement('button');
    reset.textContent = 'Reset to defaults';
    reset.addEventListener('click', () => {
      const d = resetTuning();
      Object.assign(this.tuning, d);
      this.build();
    });
    const saveP = document.createElement('button');
    saveP.textContent = 'Save preset';
    saveP.addEventListener('click', () => {
      const name = prompt('Preset name?');
      if (!name) return;
      try {
        const all = JSON.parse(localStorage.getItem('echo.tuning.presets') ?? '{}');
        all[name] = this.tuning;
        localStorage.setItem('echo.tuning.presets', JSON.stringify(all));
        this.refreshPresets();
      } catch { /* ignore */ }
    });
    this.presetSel.addEventListener('change', () => {
      try {
        const all = JSON.parse(localStorage.getItem('echo.tuning.presets') ?? '{}');
        const p = all[this.presetSel.value];
        if (p) {
          Object.assign(this.tuning, defaultTuning(), p);
          saveTuning(this.tuning);
          this.build();
        }
      } catch { /* ignore */ }
    });
    this.refreshPresets();
    btns.append(test, reset, saveP, this.presetSel);
    this.el.appendChild(btns);
  }

  private refreshPresets(): void {
    this.presetSel.innerHTML = '<option value="">presets…</option>';
    try {
      const all = JSON.parse(localStorage.getItem('echo.tuning.presets') ?? '{}');
      for (const name of Object.keys(all)) {
        const o = document.createElement('option');
        o.value = name;
        o.textContent = name;
        this.presetSel.appendChild(o);
      }
    } catch { /* ignore */ }
  }

  toggle(): void {
    this.el.classList.toggle('hidden');
    if (!this.el.classList.contains('hidden')) this.build();
  }
}
