import Fuse from 'fuse.js';
import { terms } from '../data/terms';
import type { Term } from '../data/types';

interface Doc {
  term: Term;
  name: string;
  aliases: string;
  shortDef: string;
  body: string;
}

const docs: Doc[] = terms.map((term) => ({
  term,
  name: term.name,
  aliases: (term.aliases ?? []).join(' '),
  shortDef: term.shortDef,
  body: term.explanation.join(' '),
}));

/** Fuzzy search over names, aliases, one-line definitions and explanations. */
const fuse = new Fuse(docs, {
  keys: [
    { name: 'name', weight: 4 },
    { name: 'aliases', weight: 3 },
    { name: 'shortDef', weight: 1.5 },
    { name: 'body', weight: 0.4 },
  ],
  threshold: 0.32,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

export function searchTerms(query: string, limit = 12): Term[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return fuse.search(q, { limit }).map((r) => r.item.term);
}
