import type { Term } from './types';
import { GATTACA_TERM_IDS } from './gattaca';
import { unit1, unit2 } from './terms/unit01-02';
import { unit3, unit4, unit5 } from './terms/unit03-05';
import { unit6, unit7, unit8 } from './terms/unit06-08';
import { unit9, unit10, unit11 } from './terms/unit09-11';
import { unit12, unit13, unit14 } from './terms/unit12-14';
import { unit15, unit16, unit17 } from './terms/unit15-17';

/**
 * The glossary. To add a term, append an entry to the right unit file in `src/data/terms/`
 * (see README "How to add a term"). Nothing in the UI needs to change.
 */
const allTerms: Term[] = [
  ...unit1, ...unit2, ...unit3, ...unit4, ...unit5, ...unit6, ...unit7, ...unit8, ...unit9,
  ...unit10, ...unit11, ...unit12, ...unit13, ...unit14, ...unit15, ...unit16, ...unit17,
];


/** Only the terms GATTACA uses; related links to other terms are dropped. The full course set stays in allTerms. */
export const terms: Term[] = allTerms
  .filter((t) => GATTACA_TERM_IDS.has(t.id))
  .map((t) => ({ ...t, relatedTermIds: t.relatedTermIds.filter((r) => GATTACA_TERM_IDS.has(r)) }))
  .map((t) => (t.relatedTermIds.length ? t : { ...t, relatedTermIds: ['pprp'].filter((x) => x !== t.id) }));
export { allTerms };
export const termById = new Map<string, Term>(terms.map((t) => [t.id, t]));
export const termsByUnit = (unitId: string): Term[] => terms.filter((t) => t.unit === unitId);
