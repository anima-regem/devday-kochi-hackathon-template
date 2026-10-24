/**
 * Stretch feature — walk-in-place step detection from devicemotion.
 * Peak detection on vertical acceleration, 300 ms refractory.
 * Enabled from the pause menu; each detected step = one walking step forward.
 */
export class StepDetector {
  enabled = false;
  onStep: (() => void) | null = null;
  private lastPeak = 0;
  private prev = 0;
  private rising = false;
  private listener = (e: DeviceMotionEvent) => this.onMotion(e);
  private attached = false;

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('devicemotion', this.listener, true);
  }

  detach(): void {
    window.removeEventListener('devicemotion', this.listener, true);
    this.attached = false;
  }

  onMotion(e: DeviceMotionEvent): void {
    if (!this.enabled) return;
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    // Vertical-ish magnitude: use the dominant axis so any carry works.
    const v = Math.max(Math.abs(a.x ?? 0), Math.abs(a.y ?? 0), Math.abs(a.z ?? 0));
    const now = performance.now();
    const THRESH = 11.5;   // m/s² — above gravity + noise
    const REFRACT = 300;   // ms
    if (v > THRESH) {
      this.rising = true;
      this.prev = Math.max(this.prev, v);
    } else if (this.rising && v < THRESH - 1.5) {
      this.rising = false;
      if (now - this.lastPeak > REFRACT) {
        this.lastPeak = now;
        this.onStep?.();
      }
      this.prev = 0;
    }
  }
}
