import { describe, it, expect } from 'vitest';
import { terms } from '../src/data/terms';
import { parseHash, hrefFor } from '../src/lib/router';
import { buildLinker } from '../src/lib/linker';

describe('deep links', () => {
  it('parses routes', () => {
    expect(parseHash('#/term/otsu-thresholding')).toEqual({ name: 'term', id: 'otsu-thresholding' });
    expect(parseHash('#/glossary')).toEqual({ name: 'glossary' });
    expect(parseHash('#/playground/clahe')).toEqual({ name: 'playground', demoId: 'clahe' });
    expect(parseHash('')).toEqual({ name: 'home' });
  });
  it('round-trips every term id', () => {
    for (const t of terms) expect(parseHash(hrefFor.term(t.id))).toEqual({ name: 'term', id: t.id });
  });
});

describe('term linker', () => {
  const linker = buildLinker(terms);
  const ids = (t: string) => linker.link(t, { linked: new Set() }).filter((s) => s.kind === 'term').map((s) => (s as { termId: string }).termId);
  it('links terms and aliases, case-sensitive acronyms, no ordinary words', () => {
    expect(ids('Apply Otsu thresholding after CLAHE.')).toEqual(expect.arrayContaining(['otsu-thresholding', 'clahe']));
    expect(ids('the fft')).not.toContain('fft');
    expect(ids('The mean of the shape.')).toEqual([]);
  });
});
