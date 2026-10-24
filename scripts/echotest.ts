import { LEVEL_DEFS } from '../src/levels';
import { parseLevel } from '../src/world/level';
import { computeEcho } from '../src/audio/echo';
import { castRay } from '../src/world/grid';
import { defaultTuning } from '../src/audio/tuning';

const l = parseLevel(LEVEL_DEFS.find(d => d.meta.id === 'walls')!);
const px = l.playerStart.col + 0.5, py = l.playerStart.row + 0.5;
const t = defaultTuning();
const TAU = Math.PI * 2;
const norm = (a: number) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const ang = TAU / t.bins;
console.log(`player (${px},${py}) exits ${l.exits.map(e=>`(${e.col},${e.row})`).join(' ')}`);
for (const hd of [0, 45, 90, 180]) {
  const h = hd * Math.PI / 180;
  const rays = Array.from({length: t.rays}, (_, i) => {
    const theta = h + TAU * i / t.rays;
    return { theta, hit: castRay(l, px, py, theta, t.maxDist) };
  });
  const e = computeEcho(l, px, py, h, t);
  console.log(`\n--- heading ${hd}deg: ${e.bins.length} voices ---`);
  // build coverage per bin
  const cov = new Map<number, {hits:number, total:number}>();
  for (const r of rays) {
    const rel = (norm(r.theta - h) + TAU) % TAU;
    const b = Math.round(rel / ang) % t.bins;
    const c = cov.get(b) ?? {hits:0,total:0};
    c.total++; if (r.hit) c.hits++;
    cov.set(b, c);
  }
  for (let i = 0; i < t.bins; i++) {
    const c = i * ang * 180 / Math.PI;
    const cd = c > 180 ? c - 360 : c;
    if (Math.abs(cd) > 60) continue;
    const cv = cov.get(i) ?? {hits:0,total:0};
    const bin = e.bins.find(b => Math.round(((b.rel % TAU + TAU) % TAU) / ang) % t.bins === i);
    console.log(`bin${i} rel ${cd.toFixed(0)}deg cov ${cv.hits}/${cv.total}` +
      (bin ? `  -> d=${bin.dist.toFixed(1)} ${bin.material} E=${bin.energy.toFixed(3)} amp=${bin.amp.toFixed(2)} delay=${(bin.delay*1000).toFixed(0)}ms` : '  -> SILENT'));
  }
}
