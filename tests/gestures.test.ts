import { describe, expect, it } from 'vitest';
import { GestureRecognizer, type GestureEvent } from '../src/input/gestures';

function harness() {
  const events: GestureEvent[] = [];
  const g = new GestureRecognizer((e) => events.push(e));
  return { g, events };
}

describe('gesture state machine', () => {
  it('single quick tap → tap', () => {
    const { g, events } = harness();
    g.pointerDown(1, 100, 100, 0);
    g.pointerUp(1, 102, 101, 150);
    expect(events).toEqual([{ type: 'tap' }]);
  });

  it('two-finger hold → walkStart/walkEnd, NEVER a tap', () => {
    const { g, events } = harness();
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 60);
    g.pointerUp(1, 100, 100, 900);
    g.pointerUp(2, 200, 100, 950);
    expect(events.filter((e) => e.type === 'tap')).toHaveLength(0);
    expect(events[0]).toEqual({ type: 'walkStart' });
    expect(events.at(-1)).toEqual({ type: 'walkEnd' });
  });

  it('second finger joining mid-press suppresses the click', () => {
    const { g, events } = harness();
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 100);
    g.pointerUp(2, 200, 100, 200);
    g.pointerUp(1, 100, 100, 240); // within tap window, but everMulti
    expect(events.filter((e) => e.type === 'tap')).toHaveLength(0);
  });

  it('long press → longPress at 800 ms, no tap on release', () => {
    const { g, events } = harness();
    g.pointerDown(1, 100, 100, 0);
    g.tick(850);
    expect(events).toEqual([{ type: 'longPress' }]);
    g.pointerUp(1, 100, 100, 1000);
    expect(events.filter((e) => e.type === 'tap')).toHaveLength(0);
  });

  it('three-finger tap → threeFingerTap', () => {
    const { g, events } = harness();
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 30);
    g.pointerDown(3, 300, 100, 60);
    g.pointerUp(1, 100, 100, 200);
    g.pointerUp(2, 200, 100, 220);
    g.pointerUp(3, 300, 100, 240);
    expect(events).toContainEqual({ type: 'threeFingerTap' });
  });

  it('fast swipe → swipe with dominant direction', () => {
    const { g, events } = harness();
    g.pointerDown(1, 300, 300, 0);
    g.pointerMove(1, 200, 300, 100);
    g.pointerUp(1, 180, 305, 200);
    expect(events).toContainEqual(expect.objectContaining({ type: 'swipe', dir: 'left' }));
  });

  it('slow small drag → no tap (moved too far for tap, too little for swipe)', () => {
    const { g, events } = harness();
    g.pointerDown(1, 300, 300, 0);
    g.pointerMove(1, 290, 300, 400);
    g.pointerUp(1, 280, 300, 800);
    expect(events.filter((e) => e.type === 'tap')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'swipe')).toHaveLength(0);
  });

  it('walk ends only when fewer than two fingers remain', () => {
    const { g, events } = harness();
    g.pointerDown(1, 0, 0, 0);
    g.pointerDown(2, 10, 0, 10);
    g.pointerDown(3, 20, 0, 20); // three held → still walking
    g.pointerUp(1, 0, 0, 500);   // two remain → still walking
    expect(events.at(-1)).not.toEqual({ type: 'walkEnd' });
    g.pointerUp(2, 10, 0, 600);
    expect(events.at(-1)).toEqual({ type: 'walkEnd' });
    g.pointerUp(3, 20, 0, 700);
  });
});
