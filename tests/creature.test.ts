import { describe, expect, it } from 'vitest';
import { Creature, HEARING } from '../src/game/creature';
import { bfsField } from '../src/world/path';
import { parseLevel, type LevelDef } from '../src/world/level';

const meta = {
  id: 't', name: 't', order: 0, floor: 'stone' as const, playerHeading: 0, rt60: 1,
  clicksEnabled: true, beacon: false, beaconGain: 0,
  creature: { wander: 0.6, investigate: 1.0, hunt: 1.35 },
  narration: { intro: [], win: '', lose: '' },
};

// Corridor: P at col 2, C at col 22 → path distance up to 22.
const corridor: LevelDef = {
  meta,
  map: `#E#######################
#.P...................C.#
#########################`,
};

const ev = { onStateChange: () => {}, onGrowl: () => {}, onCatch: () => {} };

function setup(creatureCol = 10) {
  const l = parseLevel(corridor);
  const c = new Creature(() => 0.5);
  c.spawn(l);
  c.x = creatureCol + 0.5;
  c.y = 1.5;
  const px = 2.5, py = 1.5;
  const field = bfsField(l, 2, 1);
  return { l, c, field, px, py };
}

describe('creature hearing', () => {
  it('click heard within 18 m path distance → investigates', () => {
    const { l, c, field, px, py } = setup();
    c.hearClick(l, field, px, py, ev);
    expect(c.state).toBe('investigate');
  });

  it('click NOT heard beyond 18 m', () => {
    const { l, c, field, px, py } = setup(21);
    // col 21 → distance 19 > 18
    c.hearClick(l, field, px, py, ev);
    expect(c.state).toBe('wander');
  });

  it('footsteps: stone 2.5, wood 3.5, water 6', () => {
    // Distance 4 (col 6): stone/wood out of range, water in range.
    const s1 = setup(6); // dist 4
    s1.c.hearFootstep(s1.l, s1.field, 'stone', s1.px, s1.py, ev);
    expect(s1.c.state).toBe('wander');       // 4 > 2.5
    const s2 = setup(6);
    s2.c.hearFootstep(s2.l, s2.field, 'wood', s2.px, s2.py, ev);
    expect(s2.c.state).toBe('wander');       // 4 > 3.5
    const s3 = setup(6);
    s3.c.hearFootstep(s3.l, s3.field, 'water', s3.px, s3.py, ev);
    expect(s3.c.state).toBe('investigate');  // 4 ≤ 6
  });

  it('sound within 7 m after grace period → hunt + growl', () => {
    const { l, c, field, px, py } = setup(6); // dist 4 < 7
    let growled = false;
    const ev2 = { ...ev, onGrowl: () => { growled = true; } };
    // Age the creature past the 6 s grace period (pin position — it wanders).
    for (let i = 0; i < 70; i++) {
      c.update(l, 0.1, px, py, ev);
      c.x = 6.5; c.y = 1.5;
    }
    c.hearClick(l, field, px, py, ev2);
    expect(c.state).toBe('hunt');
    expect(growled).toBe(true);
  });

  it('within grace period, close sound only investigates', () => {
    const { l, c, field, px, py } = setup(6);
    c.hearClick(l, field, px, py, ev);
    expect(c.state).toBe('investigate');
  });

  it('catch within 0.6 m', () => {
    const { l, c, px, py } = setup();
    let caught = false;
    const ev2 = { ...ev, onCatch: () => { caught = true; } };
    c.x = px + 0.3;
    c.y = py;
    c.update(l, 0.01, px, py, ev2);
    expect(c.state).toBe('caught');
    expect(caught).toBe(true);
  });

  it('thresholds match spec', () => {
    expect(HEARING.click).toBe(18);
    expect(HEARING.footstep.stone).toBe(2.5);
    expect(HEARING.footstep.wood).toBe(3.5);
    expect(HEARING.footstep.water).toBe(6);
    expect(HEARING.catchDist).toBe(0.6);
  });
});
