export interface Technique {
  name: string;
  whenToUse: string;
  pros: string;
  cons: string;
}

/** A glossary term. Every term in `terms.ts` follows this schema (validated by tests/terms.test.ts). */
export interface Term {
  id: string; // kebab-case, unique, used in deep links: /#/term/<id>
  name: string;
  unit: string; // unit id, e.g. "u4"
  shortDef: string; // <= 20 words; used in the hover tooltip
  explanation: string[]; // 3-6 short paragraphs, plain English, exam-friendly
  formulas: string[]; // LaTeX, rendered with KaTeX
  techniques: Technique[];
  opencvFunctions: string[]; // e.g. "cv.GaussianBlur" (must exist in src/data/snippets.ts)
  applications: string[];
  relatedTermIds: string[];
  examTips: string[];
  demoId?: string; // links to a live demo in the Playground
  aliases?: string[]; // extra strings the auto-linker should recognise (e.g. "FFT")
  autoLink?: boolean; // set false for very common words (image, pixel...) so text is not over-linked
}

/** What authors write in the data files: optional arrays default to []. */
export type TermInput = Omit<Term, 'unit' | 'formulas' | 'techniques' | 'opencvFunctions'> &
  Partial<Pick<Term, 'formulas' | 'techniques' | 'opencvFunctions'>>;

export function defineUnit(unit: string, inputs: TermInput[]): Term[] {
  return inputs.map((t) => ({
    formulas: [],
    techniques: [],
    opencvFunctions: [],
    ...t,
    unit,
  }));
}

export interface Unit {
  id: string;
  number: number;
  title: string;
  blurb: string;
}

export interface Snippet {
  py: string;
  /** JavaScript for OpenCV.js; null when the function is not in the OpenCV.js build. */
  js: string | null;
  note?: string;
}
