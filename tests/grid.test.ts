import { describe, expect, it } from 'vitest';
import { parseLevel, type Level } from '../src/world/level';
import { castRay, circleHitsWall, lineOfSight, resolveCircle } from '../src/world/grid';
import type { LevelDef } from '../src/world/level';

const box: LevelDef = {
  meta: {
    id: 't', name: 't', order: 0, floor: 'stone', playerHeading: 0, rt60: 1,
    clicksEnabled: true, beacon: false, beaconGain: 0,
    narration: { intro: [], win: '' },
  },
  map: `E####
#...#
#...#
#.P.#
#####`,
};

const gapNorth: LevelDef = {
  ...box,
  map: `##E##
#...#
#...#
#.P.#
#####`,
};

let L: Level;
let G: Level;

function levels() {
  L = parseLevel(box);
  G = parseLevel(gapNorth);
}
levels();

describe('castRay (DDA)', () => {
  it('hits north wall at exact distance with south-facing normal', () => {
    const hit = castRay(L, 2.5, 3.5, 0, 20)!; // heading 0 = north
    expect(hit).not.toBeNull();
    expect(hit.dist).toBeCloseTo(2.5, 6);
    expect(hit.normal).toEqual({ x: 0, y: 1 });
    expect(hit.material).toBe('stone');
  });

  it('hits east wall with west-facing normal', () => {
    const hit = castRay(L, 2.5, 3.5, Math.PI / 2, 20)!; // 90° = east
    expect(hit.dist).toBeCloseTo(1.5, 6);
    expect(hit.normal).toEqual({ x: -1, y: 0 });
  });

  it('diagonal ray hits a corner cell', () => {
    const hit = castRay(L, 2.5, 3.5, Math.PI / 4, 20)!; // NE
    expect(hit).not.toBeNull();
    expect(hit.dist).toBeCloseTo(Math.SQRT2 * 1.5, 5);
  });

  it('returns null through a boundary opening (open void)', () => {
    const hit = castRay(G, 2.5, 3.5, 0, 20); // through the E gap
    expect(hit).toBeNull();
  });

  it('returns null when exceeding maxDist', () => {
    const hit = castRay(L, 2.5, 3.5, 0, 1.0);
    expect(hit).toBeNull();
  });
});

describe('lineOfSight', () => {
  it('clear within a room', () => {
    expect(lineOfSight(L, 1.5, 1.5, 3.5, 3.5)).toBe(true);
  });
  it('blocked by a wall', () => {
    const inner: Level = parseLevel({
      ...box,
      map: `E####
#.#.#
#.#.#
#P#.#
#####`,
    });
    expect(lineOfSight(inner, 1.5, 3.5, 3.5, 3.5)).toBe(false);
  });
});

describe('collision', () => {
  it('circle overlaps a wall near the boundary', () => {
    expect(circleHitsWall(L, 1.2, 2.5, 0.28)).toBe(true);
    expect(circleHitsWall(L, 1.4, 2.5, 0.28)).toBe(false);
  });
  it('resolveCircle pushes out of the wall', () => {
    const r = resolveCircle(L, 1.2, 2.5, 0.28);
    expect(r.hit).toBe(true);
    expect(r.x).toBeGreaterThanOrEqual(1.28 - 1e-6);
  });
  it('out-of-bounds counts as solid for movement', () => {
    expect(circleHitsWall(L, 0.1, 2.5, 0.28)).toBe(true);
  });
});
