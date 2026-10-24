import { circleHitsWall, floorAtPos, onExit } from '../world/grid';
import type { Level } from '../world/level';
import type { FloorMaterial } from '../world/materials';

export interface PlayerEvents {
  onFootstep(floor: FloorMaterial): void;
  onBump(hitDir: { x: number; y: number }): void;
}

export class Player {
  x = 0;
  y = 0;
  /** radians, 0 = north (−y), clockwise. */
  heading = 0;
  radius = 0.28;
  private stepAccum = 0;
  private bumpCooldown = 0;
  /** Accumulated footsteps distances by surface (for creature hearing). */
  lastStepFloor: FloorMaterial | null = null;

  spawn(l: Level): void {
    this.x = l.playerStart.col + 0.5;
    this.y = l.playerStart.row + 0.5;
    this.heading = (l.meta.playerHeading * Math.PI) / 180;
    this.stepAccum = 0;
    this.bumpCooldown = 0;
  }

  /**
   * Advance one tick. moveDir: +1 forward, −1 back. turnSpeedDeg applied to
   * heading (desktop keys / fallback drag). Returns true when the exit cell
   * was reached.
   */
  update(
    l: Level,
    dt: number,
    moveDir: number,
    turnDeltaRad: number,
    speed: number,
    waterMul: number,
    events: PlayerEvents,
  ): boolean {
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    this.heading += turnDeltaRad;
    const twoPi = Math.PI * 2;
    this.heading = ((this.heading % twoPi) + twoPi) % twoPi;

    if (moveDir !== 0) {
      const floor = floorAtPos(l, this.x, this.y);
      const mul = floor === 'water' ? waterMul : 1;
      const v = speed * mul * moveDir;
      const dx = Math.sin(this.heading) * v * dt;
      const dy = -Math.cos(this.heading) * v * dt;

      // Resolve x and y separately for wall sliding.
      let bumped = false;
      let hx = 0, hy = 0;
      let nx = this.x + dx;
      if (circleHitsWall(l, nx, this.y, this.radius)) {
        nx = this.x;
        bumped = true;
        hx = dx > 0 ? 1 : -1;
      }
      let ny = this.y + dy;
      if (circleHitsWall(l, nx, ny, this.radius)) {
        ny = this.y;
        bumped = true;
        hy = dy > 0 ? 1 : -1;
      }
      const moved = Math.hypot(nx - this.x, ny - this.y);
      this.x = nx;
      this.y = ny;

      this.stepAccum += moved;
      while (this.stepAccum >= 0.65) {
        this.stepAccum -= 0.65;
        const f = floorAtPos(l, this.x, this.y);
        this.lastStepFloor = f;
        events.onFootstep(f);
      }

      if (bumped && this.bumpCooldown <= 0) {
        this.bumpCooldown = 0.4;
        // Direction the wall pushes from — pan the thud toward it.
        const hd = Math.hypot(hx, hy) || 1;
        events.onBump({ x: hx / hd, y: hy / hd });
      }
    }

    return onExit(l, this.x, this.y);
  }
}
