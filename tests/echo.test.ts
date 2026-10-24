import { describe, expect, it } from 'vitest';
import { computeEcho } from '../src/audio/echo';
import { defaultTuning } from '../src/audio/tuning';
import { parseLevel, type LevelDef } from '../src/world/level';

const meta = {
  id: 't', name: 't', order: 0, floor: 'stone' as const, playerHeading: 0, rt60: 1,
  clicksEnabled: true, beacon: false, beaconGain: 0,
  narration: { intro: [], win: '' },
};

const closed: LevelDef = {
  meta,
  map: `#####
#...#
#...#
#.P.#
#E###`,
};

const openNorth: LevelDef = {
  meta,
  map: `##E##
#...#
#...#
#.P.#
#####`,
};

describe('echo model', () => {
  const t = defaultTuning();

  it('stone wall 2 m ahead → centre-bin delay (2·d/343)·echoTimeScale', () => {
    const l = parseLevel(closed);
    // Player at (2.5, 3.0); north wall face at y=1 → straight-ahead distance 2.0.
    const e = computeEcho(l, 2.5, 3.0, 0, t);
    const centre = e.bins.find((b) => b.rel < 0.01 || b.rel > 2 * Math.PI - 0.01);
    expect(centre).toBeDefined();
    expect(centre!.dist).toBeGreaterThanOrEqual(2.0);
    expect(centre!.dist).toBeLessThan(2.15); // off-axis rays are slightly longer
    expect(centre!.delay).toBeCloseTo(((2 * centre!.dist) / 343) * t.echoTimeScale, 8);
    expect(centre!.delay).toBeCloseTo((4 / 343) * t.echoTimeScale, 2);
    expect(centre!.material).toBe('stone');
  });

  it('a gap in the wall gives no voice in that direction', () => {
    const l = parseLevel(openNorth);
    const e = computeEcho(l, 2.5, 3.0, 0, t);
    const centre = e.bins.find((b) => b.rel < 0.01 || b.rel > 2 * Math.PI - 0.01);
    expect(centre).toBeUndefined(); // silence = openness
    // But the sides still answer.
    expect(e.bins.length).toBeGreaterThan(0);
  });

  it('sacks absorb: weaker echo than stone at same geometry', () => {
    const sacks: LevelDef = {
      meta,
      map: `SSSSS
#...#
#...#
#.P.#
#E###`,
    };
    const ls = parseLevel(sacks);
    const lc = parseLevel(closed);
    const es = computeEcho(ls, 2.5, 3.0, 0, t);
    const ec = computeEcho(lc, 2.5, 3.0, 0, t);
    const bs = es.bins.find((b) => b.rel < 0.01)!;
    const bc = ec.bins.find((b) => b.rel < 0.01)!;
    expect(bs.amp).toBeLessThan(bc.amp);
    expect(bs.cutoff).toBeLessThan(bc.cutoff);
  });

  it('near-wall boost applies within 1.5 m', () => {
    const l = parseLevel(closed);
    // y = 2.2 → distance to face y=1 is 1.2 < 1.5.
    const e = computeEcho(l, 2.5, 2.2, 0, t);
    const centre = e.bins.find((b) => b.rel < 0.01)!;
    const raw = Math.min(1, t.echoGain * Math.sqrt(centre.energy));
    expect(centre.amp).toBeCloseTo(Math.min(1, raw * t.nearWallBoost), 6);
  });
});
