/**
 * Spectator transport — Supabase Realtime broadcast on channel `echo-<code>`.
 * Optional at runtime: if env vars are missing or the connection fails, the
 * game is unaffected and the boot screen simply doesn't show a code.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

export interface SpectateFrame {
  t: number;
  x: number;
  y: number;
  heading: number;
  levelId: string;
  levelName: string;
  clicks: number;
  cx?: number;
  cy?: number;
  cstate?: string;
}
export interface SpectateEvent {
  type: 'click' | 'bump' | 'start' | 'end';
  levelId?: string;
  levelName?: string;
  hits?: { x: number; y: number }[];
  x?: number;
  y?: number;
  outcome?: string;
  recording?: unknown;
}

export class SpectateNet {
  code: string | null = null;
  connected = false;
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;

  /** True when env vars exist (spectator mode can work). */
  static available(): boolean {
    return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  }

  async connect(): Promise<string | null> {
    if (!SpectateNet.available()) return null;
    try {
      this.client = createClient(
        import.meta.env.VITE_SUPABASE_URL as string,
        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        { realtime: { params: { eventsPerSecond: 20 } } },
      );
      this.code = String(Math.floor(1000 + Math.random() * 9000));
      this.channel = this.client.channel(`echo-${this.code}`, {
        config: { broadcast: { self: false, ack: false } },
      });
      await new Promise<void>((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('timeout')), 5000);
        this.channel!.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(to);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(to);
            reject(new Error(status));
          }
        });
      });
      this.connected = true;
      return this.code;
    } catch {
      this.connected = false;
      this.code = null;
      return null;
    }
  }

  private send(event: string, payload: unknown): void {
    if (!this.channel || !this.connected) return;
    try {
      void this.channel.send({ type: 'broadcast', event, payload });
    } catch { /* never wait on the network */ }
  }

  frame(f: SpectateFrame): void {
    this.send('frame', f);
  }

  event(e: SpectateEvent): void {
    this.send('event', e);
  }
}

/** Subscriber side for /watch. */
export class SpectateSub {
  private client: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  onFrame: ((f: SpectateFrame) => void) | null = null;
  onEvent: ((e: SpectateEvent) => void) | null = null;

  constructor() {
    this.client = createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    );
  }

  join(code: string): Promise<boolean> {
    this.leave();
    this.channel = this.client.channel(`echo-${code}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    this.channel
      .on('broadcast', { event: 'frame' }, (p) => this.onFrame?.(p.payload as SpectateFrame))
      .on('broadcast', { event: 'event' }, (p) => this.onEvent?.(p.payload as SpectateEvent));
    return new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 6000);
      this.channel!.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(to);
          resolve(true);
        }
      });
    });
  }

  leave(): void {
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = null;
  }
}
