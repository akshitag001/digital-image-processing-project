import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { terms } from '../src/data/terms';
import { units } from '../src/data/units';
import { snippets } from '../src/data/snippets';
import { buildLinker } from '../src/lib/linker';

const unitIds = new Set(units.map((u) => u.id));
const ids = new Set(terms.map((t) => t.id));
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

describe('glossary schema', () => {
  it('has 100+ terms and every unit is populated', () => {
    expect(terms.length).toBeGreaterThanOrEqual(100);
    for (const u of units) {
      expect(terms.filter((t) => t.unit === u.id).length, `unit ${u.id} has no terms`).toBeGreaterThan(0);
    }
  });

  it('has unique, kebab-case ids', () => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const t of terms) {
      if (seen.has(t.id)) dups.push(t.id);
      seen.add(t.id);
      expect(t.id, `id "${t.id}" must be kebab-case`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(dups, `duplicate ids: ${dups.join(', ')}`).toEqual([]);
  });

  it('has no broken, self-referencing or duplicate relatedTermIds', () => {
    const problems: string[] = [];
    for (const t of terms) {
      const seen = new Set<string>();
      for (const r of t.relatedTermIds) {
        if (!ids.has(r)) problems.push(`${t.id} -> unknown "${r}"`);
        if (r === t.id) problems.push(`${t.id} references itself`);
        if (seen.has(r)) problems.push(`${t.id} lists "${r}" twice`);
        seen.add(r);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every term follows the field rules', () => {
    const problems: string[] = [];
    for (const t of terms) {
      const p = (msg: string) => problems.push(`${t.id}: ${msg}`);
      if (!t.name.trim()) p('empty name');
      if (!unitIds.has(t.unit)) p(`unknown unit ${t.unit}`);
      if (words(t.shortDef) === 0 || words(t.shortDef) > 20) p(`shortDef has ${words(t.shortDef)} words (1-20 allowed)`);
      if (t.explanation.length < 3 || t.explanation.length > 6) p(`explanation has ${t.explanation.length} paragraphs (3-6 allowed)`);
      if (t.explanation.some((x) => !x.trim())) p('empty paragraph');
      if (t.applications.length === 0) p('no applications');
      if (t.examTips.length === 0) p('no examTips');
      if (t.relatedTermIds.length === 0) p('no relatedTermIds');
      for (const tech of t.techniques) {
        if (!tech.name || !tech.whenToUse || !tech.pros || !tech.cons) p(`incomplete technique "${tech.name}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every formula is valid LaTeX that KaTeX can render', () => {
    const bad: string[] = [];
    for (const t of terms) {
      for (const f of t.formulas) {
        try {
          katex.renderToString(f, { throwOnError: true });
        } catch (e) {
          bad.push(`${t.id}: ${(e as Error).message}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('every opencvFunction has a Python and (or a documented absence of a) JS snippet', () => {
    const missing: string[] = [];
    for (const t of terms) {
      for (const fn of t.opencvFunctions) {
        const s = snippets[fn];
        if (!s) missing.push(`${t.id}: ${fn}`);
        else if (!s.py || (s.js === null && !s.note)) missing.push(`${t.id}: ${fn} (incomplete snippet)`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('auto-linker links other terms but never a term to itself', () => {
    const linker = buildLinker(terms);
    const segs = linker.link('Apply Otsu thresholding after CLAHE, then check the histogram.', { linked: new Set() });
    const linked = segs.filter((s) => s.kind === 'term').map((s) => (s as { termId: string }).termId);
    expect(linked).toContain('otsu-thresholding');
    expect(linked).toContain('clahe');
    expect(linked).toContain('histogram');
    const self = linker.link('Otsu thresholding is automatic.', { skipId: 'otsu-thresholding' });
    expect(self.some((s) => s.kind === 'term')).toBe(false);
  });

  it('reports the TODO flags that still need verification (informational)', () => {
    const todos = terms.flatMap((t) => t.explanation.filter((x) => x.includes('TODO')).map(() => t.id));
    // Not a failure: TODOs are intentional markers for facts that cannot be verified offline.
    console.log(`TODO-flagged terms (${todos.length}): ${todos.join(', ')}`);
    expect(Array.isArray(todos)).toBe(true);
  });
});
