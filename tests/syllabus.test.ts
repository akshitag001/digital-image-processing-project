import { describe, it, expect } from 'vitest';
import { syllabus } from '../src/data/syllabus';
import { terms, termById } from '../src/data/terms';
import { units } from '../src/data/units';
import { parseHash, hrefFor } from '../src/lib/router';
import { buildLinker, phrasesFor } from '../src/lib/linker';

describe('syllabus coverage', () => {
  it('has a checklist for every unit', () => {
    for (const u of units) expect(syllabus[u.id]?.length, `unit ${u.id}`).toBeGreaterThan(0);
  });

  it('every required sub-topic maps to existing glossary terms in the right unit', () => {
    const problems: string[] = [];
    for (const [unit, items] of Object.entries(syllabus)) {
      for (const item of items) {
        if (item.ids.length === 0) problems.push(`${unit}/${item.label}: no ids`);
        for (const id of item.ids) {
          const t = termById.get(id);
          if (!t) problems.push(`${unit}/${item.label}: unknown term "${id}"`);
          else if (t.unit !== unit) problems.push(`${unit}/${item.label}: "${id}" lives in ${t.unit}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('every unit has at least as many terms as required sub-topics', () => {
    for (const u of units) {
      const n = terms.filter((t) => t.unit === u.id).length;
      expect(n, u.id).toBeGreaterThanOrEqual(syllabus[u.id].length);
    }
  });
});

describe('deep links', () => {
  it('parses term, unit, playground, case-study and coverage routes', () => {
    expect(parseHash('#/term/otsu-thresholding')).toEqual({ name: 'term', id: 'otsu-thresholding' });
    expect(parseHash('#/unit/u4')).toEqual({ name: 'unit', id: 'u4' });
    expect(parseHash('#/playground/clahe')).toEqual({ name: 'playground', demoId: 'clahe' });
    expect(parseHash('#/playground')).toEqual({ name: 'playground', demoId: undefined });
    expect(parseHash('#/case-study')).toEqual({ name: 'case' });
    expect(parseHash('#/coverage')).toEqual({ name: 'coverage' });
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/term')).toEqual({ name: 'home' });
  });

  it('round-trips every term id through hrefFor and parseHash', () => {
    for (const t of terms) expect(parseHash(hrefFor.term(t.id))).toEqual({ name: 'term', id: t.id });
  });
});

describe('term linker', () => {
  const linker = buildLinker(terms);
  const idsIn = (text: string, skipId?: string) =>
    linker
      .link(text, { skipId, linked: new Set() })
      .filter((s) => s.kind === 'term')
      .map((s) => (s as { termId: string }).termId);

  it('links aliases and plurals, and matches short acronyms only in their own case', () => {
    expect(idsIn('The FFT is fast.')).toContain('fft');
    expect(idsIn('the fft is fast')).not.toContain('fft');
    expect(idsIn('Use the Gaussian pyramids here.')).toContain('gaussian-pyramid');
    expect(idsIn("Otsu's method picks T.")).toContain('otsu-thresholding');
  });

  it('does not over-link very common words flagged autoLink: false', () => {
    expect(idsIn('Every image has a pixel at each region and path.')).toEqual([]);
  });

  it('does not turn ordinary words from term-name parentheses into links', () => {
    expect(idsIn('The mean of the shape has intensity.')).toEqual([]);
    expect(idsIn('We apply the DFT then the FFT.')).toEqual(expect.arrayContaining(['dft', 'fft']));
  });

  it('links each term once per call set', () => {
    const linked = new Set<string>();
    const segs = [
      ...linker.link('A histogram is useful.', { linked }),
      ...linker.link('The histogram again.', { linked }),
    ];
    expect(segs.filter((s) => s.kind === 'term' && s.termId === 'histogram').length).toBe(1);
  });

  it('every term can be found by its own name', () => {
    for (const t of terms) {
      if (t.autoLink === false) continue;
      const phrase = phrasesFor(t).find((p) => p.length >= 4);
      if (!phrase) continue;
      const hits = idsIn(`We discuss ${phrase} today.`);
      expect(hits.length, `${t.id} / "${phrase}"`).toBeGreaterThan(0);
    }
  });
});
