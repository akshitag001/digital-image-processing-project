import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import katex from 'katex';
import { termById, terms } from '../data/terms';
import { buildLinker, type Segment } from '../lib/linker';
import { goTerm } from '../lib/router';
import { useBookmarks, useRevised } from '../lib/store';
import type { RGBAImage } from '../cv/core';

/* ---------- Math (KaTeX) ---------- */
export function Tex({ tex, block = true }: { tex: string; block?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: block, throwOnError: false, output: 'htmlAndMathml' });
    } catch {
      return null;
    }
  }, [tex, block]);
  if (!html) return <code className="font-mono text-sm">{tex}</code>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ---------- Code with a copy button ---------- */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      ta.remove();
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="group relative rounded-lg border border-slate-200 bg-slate-900 text-slate-100 dark:border-slate-700">
      <button
        type="button"
        onClick={copy}
        aria-label={label ? `Copy ${label}` : 'Copy code'}
        className="absolute right-2 top-2 rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-slate-100 hover:bg-slate-600"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto p-3 pr-16 text-[13px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  );
}

/* ---------- Linked glossary terms inside prose ---------- */
const linker = buildLinker(terms);

export function linkParagraphs(texts: string[], skipId?: string): Segment[][] {
  const linked = new Set<string>(); // each term is linked once per note, so prose stays readable
  return texts.map((t) => linker.link(t, { skipId, linked }));
}

export function TermLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <button type="button" className="term-link" data-term-id={id} onClick={() => goTerm(id)}>
      {children}
    </button>
  );
}

export function Segments({ segs }: { segs: Segment[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.kind === 'term' ? (
          <TermLink key={i} id={s.termId}>
            {s.text}
          </TermLink>
        ) : s.kind === 'em' ? (
          <em key={i}>{s.text}</em>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/** Auto-linked text for a single string (used for captions, blurbs, summaries). */
export function LinkedText({ text, skipId }: { text: string; skipId?: string }) {
  const segs = useMemo(() => linker.link(text, { skipId, linked: new Set() }), [text, skipId]);
  return <Segments segs={segs} />;
}

/* ---------- Term chips ---------- */
export function TermChip({ id, active }: { id: string; active?: boolean }) {
  const term = termById.get(id);
  const { set: revised } = useRevised();
  const { set: marks } = useBookmarks();
  if (!term) return null;
  const done = revised.has(id);
  return (
    <button
      type="button"
      data-term-id={id}
      onClick={() => goTerm(id)}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 ${
        active
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : done
            ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900'
            : 'border-slate-300 bg-white text-slate-800 hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-indigo-400 dark:hover:bg-slate-800'
      }`}
    >
      {done && <span aria-label="revised" className="text-emerald-700 dark:text-emerald-300">{'✓'}</span>}
      <span>{term.name}</span>
      {marks.has(id) && <span aria-label="bookmarked" className="text-amber-500">{'★'}</span>}
    </button>
  );
}

/* ---------- Progress bar ---------- */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.round((100 * value) / max) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
    >
      <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- Canvas for an RGBA image ---------- */
export function ImageCanvas({ image, label, caption }: { image: RGBAImage; label: string; caption?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d');
    ctx?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  }, [image]);
  return (
    <figure className="min-w-0">
      <canvas
        ref={ref}
        role="img"
        aria-label={label}
        className="px h-auto w-full rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
        style={{ maxHeight: 420, objectFit: 'contain' }}
      />
      <figcaption className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        {label}
        {caption ? ` ${caption}` : ''}
      </figcaption>
    </figure>
  );
}
