import type { Term } from '../data/types';

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'term'; text: string; termId: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Phrases that should link to a term: its name, the name without a "(...)" suffix, and its aliases. */
export function phrasesFor(t: Term): string[] {
  const out = new Set<string>();
  const add = (p: string) => {
    const x = p.trim();
    if (x.length >= 2) out.add(x);
  };
  add(t.name);
  add(t.name.replace(/\s*\([^)]*\)\s*/g, ' '));
  const paren = /\(([^)]+)\)/.exec(t.name);
  if (paren && /^[A-Za-z0-9-]{2,8}$/.test(paren[1])) add(paren[1]);
  t.aliases?.forEach(add);
  return [...out];
}

export interface Linker {
  /** Split text into plain / emphasised / term segments. Each term is linked once per `linked` set. */
  link(text: string, opts?: { skipId?: string; linked?: Set<string> }): Segment[];
}

/** Build a linker from the glossary. Used for explanations, so mentions of other terms become links. */
export function buildLinker(terms: Term[]): Linker {
  const phraseToId = new Map<string, string>();
  for (const t of terms) {
    if (t.autoLink === false) continue;
    for (const p of phrasesFor(t)) {
      // Short phrases (acronyms such as FFT) must match case-sensitively; skip ones that are too short to be safe.
      if (p.length < 3) continue;
      const key = p.toLowerCase();
      if (!phraseToId.has(key)) phraseToId.set(key, t.id);
    }
  }
  const phrases = [...phraseToId.keys()].sort((a, b) => b.length - a.length);
  const caseSensitive = new Map<string, string>(); // original-case phrase for short acronyms
  for (const t of terms) for (const p of phrasesFor(t)) if (p.length < 5) caseSensitive.set(p.toLowerCase(), p);

  const re = phrases.length
    ? new RegExp(`(?<![A-Za-z0-9])(${phrases.map(escapeRe).join('|')})(?:es|s)?(?![A-Za-z0-9])`, 'gi')
    : null;

  function resolve(match: string): { id: string; phrase: string } | null {
    const lower = match.toLowerCase();
    const tries = [lower, lower.replace(/es$/, ''), lower.replace(/s$/, '')];
    for (const k of tries) {
      const id = phraseToId.get(k);
      if (!id) continue;
      const cs = caseSensitive.get(k);
      if (cs && !match.startsWith(cs)) return null; // short acronym: case must match
      return { id, phrase: k };
    }
    return null;
  }

  function linkPlain(text: string, opts: { skipId?: string; linked?: Set<string> }, out: Segment[]) {
    if (!re) {
      out.push({ kind: 'text', text });
      return;
    }
    re.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const hit = resolve(m[0]);
      if (!hit || hit.id === opts.skipId || opts.linked?.has(hit.id)) continue;
      if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
      out.push({ kind: 'term', text: m[0], termId: hit.id });
      opts.linked?.add(hit.id);
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  }

  return {
    link(text, opts = {}) {
      const out: Segment[] = [];
      // *emphasis* markers used in the data files
      const parts = text.split(/(\*[^*]+\*)/g);
      for (const part of parts) {
        if (!part) continue;
        if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) out.push({ kind: 'em', text: part.slice(1, -1) });
        else linkPlain(part, opts, out);
      }
      return out;
    },
  };
}
