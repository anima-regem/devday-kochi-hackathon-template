import { describe, expect, it } from 'vitest';
import { yawFromOrientation } from '../src/input/orientation';

describe('torch-heading yaw', () => {
  it('flat phone (beta=0) → null (back points down)', () => {
    expect(yawFromOrientation(0, 0, 0)).toBeNull();
  });

  it('nearly flat → null (projection below 0.2)', () => {
    expect(yawFromOrientation(0, 10, 0)).toBeNull();
  });

  it('upright, back pointing north → 0°', () => {
    // Screen facing south (toward the holder), top up: alpha=0, beta=90, gamma=180.
    expect(yawFromOrientation(0, 90, 180)).toBeCloseTo(0, 5);
  });

  it('upright, back pointing east → 90°', () => {
    expect(yawFromOrientation(0, 90, -90)).toBeCloseTo(90, 5);
  });

  it('upright, back pointing west → 270°', () => {
    expect(yawFromOrientation(0, 90, 90)).toBeCloseTo(270, 5);
  });

  it('tilted 45° still produces a heading', () => {
    const y = yawFromOrientation(0, 45, 180);
    expect(y).not.toBeNull();
    expect(y!).toBeCloseTo(0, 5);
  });

  it('360° sweep has no jumps', () => {
    // Rotate the body slowly; heading should track monotonically.
    const samples: number[] = [];
    for (let a = 0; a <= 350; a += 5) {
      const y = yawFromOrientation(a, 90, 180);
      expect(y).not.toBeNull();
      samples.push(y!);
    }
    for (let i = 1; i < samples.length; i++) {
      let d = samples[i] - samples[i - 1];
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      expect(Math.abs(d)).toBeLessThan(10);
    }
  });
});
