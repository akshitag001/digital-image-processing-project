import { describe, it, expect, beforeAll } from 'vitest';
import { demos, demoById, defaultParams } from '../src/demos';
import { samples, sampleById } from '../src/lib/samples';
import { terms, termById } from '../src/data/terms';
import { loadOpenCV } from '../src/cv/loader';
import type { CV } from '../src/cv/core';
import { findMinutiae, zhangSuen, dct8, idct8, haarLevel, ihaarLevel, scaledQuantTable } from '../src/cv/dsp';

let cv: CV;
beforeAll(async () => {
  cv = await loadOpenCV();
}, 120000);

describe('demo registry', () => {
  it('has unique ids and every linked term / demoId exists', () => {
    const ids = demos.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of demos) {
      expect(d.termIds.length, d.id).toBeGreaterThan(0);
      for (const t of d.termIds) expect(termById.has(t), `${d.id} -> term ${t}`).toBe(true);
      expect(sampleById(d.sample).id, `${d.id} sample`).toBe(d.sample);
    }
    for (const t of terms) if (t.demoId) expect(demoById(t.demoId), `${t.id} -> demo ${t.demoId}`).toBeTruthy();
  });

  it('keeps the demos behind the GATTACA pipeline', () => {
    const need = ['clahe', 'bilateral', 'fft-spectrum', 'gabor', 'otsu', 'adaptive-threshold', 'thinning', 'morphology', 'sobel', 'optical-flow', 'jpeg-quality', 'sampling-aliasing', 'orb'];
    for (const id of need) expect(demoById(id), id).toBeTruthy();
  });
});

describe('every demo runs on OpenCV.js with its default parameters', () => {
  for (const d of demos) {
    it(d.id, async () => {
      const src = sampleById(d.sample).make();
      const res = await d.run(cv, src, defaultParams(d));
      expect(res.outputs.length).toBeGreaterThan(0);
      expect(res.caption.length).toBeGreaterThan(20);
      expect(res.call.length).toBeGreaterThan(5);
      for (const o of res.outputs) {
        expect(o.image.width, `${d.id}/${o.label}`).toBeGreaterThan(0);
        expect(o.image.height).toBeGreaterThan(0);
        expect(o.image.data.length).toBe(o.image.width * o.image.height * 4);
      }
    });
  }
});

describe('demo results are numerically sensible', () => {
  const run = async (id: string, over: Record<string, number | string | boolean> = {}, sample?: string) => {
    const d = demoById(id)!;
    return d.run(cv, sampleById(sample ?? d.sample).make(), { ...defaultParams(d), ...over });
  };
  const stat = (r: Awaited<ReturnType<typeof run>>, label: string) => r.stats?.find((s) => s.label.startsWith(label))?.value ?? '';

  it('Otsu finds a threshold between the two modes of the coins image', async () => {
    const r = await run('otsu');
    const T = Number(stat(r, 'Threshold T'));
    expect(T).toBeGreaterThan(40);
    expect(T).toBeLessThan(200);
  });

  it('Lucas-Kanade recovers a known shift within 1 px', async () => {
    const r = await run('optical-flow', { dx: 6, dy: -3, rot: 0 });
    const m = /\(([-\d.]+), ([-\d.]+)\)/.exec(stat(r, 'Mean LK'))!;
    expect(Math.abs(Number(m[1]) - 6)).toBeLessThan(1);
    expect(Math.abs(Number(m[2]) + 3)).toBeLessThan(1);
  });

  it('JPEG quality falls with lower quality: smaller file and lower PSNR', async () => {
    const hi = await run('jpeg-quality', { quality: 90 });
    const lo = await run('jpeg-quality', { quality: 10 });
    const kb = (x: typeof hi) => parseFloat(stat(x, 'File size'));
    const db = (x: typeof hi) => parseFloat(stat(x, 'PSNR'));
    expect(kb(lo)).toBeLessThan(kb(hi));
    expect(db(lo)).toBeLessThan(db(hi));
  });

  it('PPRP demo flags decimation below Nyquist on the ridge sample', async () => {
    const r = await run('sampling-aliasing', { f: 6 }, 'fingerprint');
    expect(stat(r, 'Expected period')).toContain('BELOW NYQUIST');
    const ok = await run('sampling-aliasing', { f: 2 }, 'fingerprint');
    expect(stat(ok, 'Expected period')).not.toContain('BELOW NYQUIST');
  });
});

describe('TypeScript DSP routines', () => {
  it('DCT then inverse DCT recovers the block', () => {
    const b = Array.from({ length: 64 }, (_, i) => (i * 7) % 255);
    const r = idct8(dct8(b));
    for (let i = 0; i < 64; i++) expect(Math.abs(r[i] - b[i])).toBeLessThan(1e-6);
  });
  it('Haar transform is perfectly invertible', () => {
    const a = Float32Array.from({ length: 64 }, (_, i) => (i * 13) % 200);
    const b = Float32Array.from(a);
    haarLevel(b, 8, 8, 8);
    ihaarLevel(b, 8, 8, 8);
    for (let i = 0; i < 64; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-3);
  });
  it('quality scaling makes the table coarser at low quality', () => {
    expect(scaledQuantTable(10)[0]).toBeGreaterThan(scaledQuantTable(90)[0]);
  });
  it('Zhang-Suen thins a thick horizontal bar to a line with 2 endings', () => {
    const w = 40;
    const h = 15;
    const img = new Uint8Array(w * h);
    for (let y = 5; y < 10; y++) for (let x = 5; x < 35; x++) img[y * w + x] = 1;
    const sk = zhangSuen(img, w, h);
    const rows = new Set<number>();
    sk.forEach((v, i) => v && rows.add(Math.floor(i / w)));
    expect(rows.size).toBeLessThanOrEqual(2);
    const m = findMinutiae(sk, w, h, 1);
    expect(m.filter((x) => x.type === 'ending').length).toBeGreaterThanOrEqual(2);
  });
  it('samples are the requested size and fully opaque', () => {
    for (const s of samples) {
      const im = s.make();
      expect(im.data.length).toBe(im.width * im.height * 4);
      expect(im.data[3]).toBe(255);
    }
  });
});
