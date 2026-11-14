import { describe, it, expect, beforeAll } from 'vitest';
import { loadOpenCV } from '../src/cv/loader';
import type { CV } from '../src/cv/core';
import { fingerprintImage } from '../src/lib/samples';
import { runRidgePipeline, defaultRidgeOptions, exposureFromPprp, matchMinutiae } from '../src/cv/ridge';
import { terms } from '../src/data/terms';

let cv: CV;
beforeAll(async () => {
  cv = await loadOpenCV();
}, 120000);

describe('GATTACA case-study pipeline', () => {
  it('runs all nine stages on the synthetic ridge sample and finds minutiae', () => {
    const r = runRidgePipeline(cv, fingerprintImage(), defaultRidgeOptions);
    expect(r.stages.map((s) => s.id)).toEqual(['gray', 'clahe', 'denoise', 'pprp', 'orientation', 'gabor', 'threshold', 'thinning', 'minutiae']);
    expect(r.pprp).toBeGreaterThan(6);
    expect(r.pprp).toBeLessThan(13);
    expect(r.coverage).toBeGreaterThan(0.2);
    expect(r.endings + r.bifurcations).toBeGreaterThan(5);
    expect(r.exposure.level).toBe('high');
  });

  it('every stage links to real glossary terms', () => {
    const ids = new Set(terms.map((t) => t.id));
    const r = runRidgePipeline(cv, fingerprintImage(), defaultRidgeOptions);
    for (const s of r.stages) for (const id of s.termIds) expect(ids.has(id), `${s.id} -> ${id}`).toBe(true);
  });

  it('moving "farther away" lowers PPRP and the share of reference minutiae that are recovered', () => {
    const img = fingerprintImage();
    const near = runRidgePipeline(cv, img, { ...defaultRidgeOptions, downscale: 1 });
    const far = runRidgePipeline(cv, img, { ...defaultRidgeOptions, downscale: 4 });
    expect(far.pprp).toBeLessThan(near.pprp);
    const self = matchMinutiae(near.minutiae, near.minutiae, 12);
    const m = matchMinutiae(near.minutiae, far.minutiae, 12);
    expect(self.recovered).toBe(1);
    expect(m.recovered).toBeLessThan(0.5);
    expect(m.spurious).toBeGreaterThan(m.matched);
    expect(['none', 'low']).toContain(far.exposure.level);
  });

  it('exposure bands follow the Nyquist limit and the synthetic-study thresholds', () => {
    expect(exposureFromPprp(1.5).level).toBe('none');
    expect(exposureFromPprp(2.5).level).toBe('low');
    expect(exposureFromPprp(3.4).level).toBe('partial');
    expect(exposureFromPprp(5).level).toBe('high');
  });
});
