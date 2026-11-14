import { useEffect, useMemo, useRef, useState } from 'react';
import { termById, termsByUnit } from '../data/terms';
import { unitById } from '../data/units';
import { snippets } from '../data/snippets';
import { demoById } from '../demos';
import { closeTerm, goTerm, hrefFor } from '../lib/router';
import { useBookmarks, useRevised } from '../lib/store';
import { CodeBlock, Tex, Segments, TermChip, linkParagraphs } from './basics';

function Snippet({ fn }: { fn: string }) {
  const s = snippets[fn];
  const [tab, setTab] = useState<'py' | 'js'>('py');
  if (!s) return null;
  const jsOk = s.js !== null;
  const shown = tab === 'py' || !jsOk ? s.py : (s.js as string);
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex items-center justify-between gap-2">
        <code className="font-mono text-sm font-semibold">{fn}</code>
        <div role="tablist" aria-label={`Language for ${fn}`} className="flex gap-1 text-xs">
          {(['py', 'js'] as const).map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              disabled={k === 'js' && !jsOk}
              onClick={() => setTab(k)}
              className={`rounded px-2 py-1 font-medium ${tab === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}`}
            >
              {k === 'py' ? 'Python' : 'JavaScript'}
            </button>
          ))}
        </div>
      </div>
      <CodeBlock code={shown} label={`${fn} snippet`} />
      {(s.note || !jsOk) && (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
          {!jsOk ? 'Not available in OpenCV.js. ' : ''}
          {s.note}
        </p>
      )}
    </div>
  );
}

export function NotesDrawer({ id }: { id: string }) {
  const term = termById.get(id);
  const { set: revised, toggle: toggleRevised } = useRevised();
  const { set: marks, toggle: toggleMark } = useBookmarks();
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const paragraphs = useMemo(() => (term ? linkParagraphs(term.explanation, term.id) : []), [term]);

  // focus management: move focus in on open, restore it on close, trap Tab, close on Esc
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTerm();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"]),input,select,textarea');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  // scroll to the top when a different term is opened from inside the drawer
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [id]);

  const unit = term ? unitById(term.unit) : undefined;
  const siblings = term ? termsByUnit(term.unit) : [];
  const idx = term ? siblings.findIndex((t) => t.id === term.id) : -1;
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined;
  const demo = term?.demoId ? demoById(term.demoId) : undefined;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={closeTerm} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-title"
        className="drawer-enter fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl sm:w-[34rem] lg:w-[40rem] dark:border-slate-700 dark:bg-slate-900"
      >
        {!term ? (
          <div className="p-6">
            <h2 id="notes-title" className="text-xl font-bold">
              Term not found
            </h2>
            <p className="mt-2">There is no glossary entry called &quot;{id}&quot;.</p>
            <button ref={closeBtn} type="button" onClick={closeTerm} className="mt-4 rounded bg-indigo-600 px-3 py-2 text-white">
              Close
            </button>
          </div>
        ) : (
          <>
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={hrefFor.unit(term.unit)} onClick={() => closeTerm()} className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                    Unit {unit?.number}: {unit?.title}
                  </a>
                  <h2 id="notes-title" className="mt-1 text-2xl font-bold leading-tight">
                    {term.name}
                  </h2>
                </div>
                <button
                  ref={closeBtn}
                  type="button"
                  onClick={closeTerm}
                  aria-label="Close notes (Esc)"
                  className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  {'✕'} Esc
                </button>
              </div>
              <p className="mt-2 text-sm italic text-slate-700 dark:text-slate-300">{term.shortDef}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={revised.has(term.id)}
                  onClick={() => toggleRevised(term.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${revised.has(term.id) ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`}
                >
                  {revised.has(term.id) ? '✓ Revised' : 'Mark as revised'}
                </button>
                <button
                  type="button"
                  aria-pressed={marks.has(term.id)}
                  onClick={() => toggleMark(term.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${marks.has(term.id) ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`}
                >
                  {marks.has(term.id) ? '★ Bookmarked' : '☆ Bookmark'}
                </button>
                {demo && (
                  <a
                    href={hrefFor.playground(demo.id)}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    {'▶'} Try the live demo
                  </a>
                )}
              </div>
            </header>

            <div className="space-y-6 px-5 py-5 text-[15px] leading-relaxed">
              <section aria-labelledby="sec-expl">
                <h3 id="sec-expl" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Explanation
                </h3>
                <div className="space-y-3">
                  {paragraphs.map((segs, i) => (
                    <p key={i}>
                      <Segments segs={segs} />
                    </p>
                  ))}
                </div>
              </section>

              {term.formulas.length > 0 && (
                <section aria-labelledby="sec-formulas">
                  <h3 id="sec-formulas" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Formulas
                  </h3>
                  <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                    {term.formulas.map((f, i) => (
                      <Tex key={i} tex={f} />
                    ))}
                  </div>
                </section>
              )}

              {term.techniques.length > 0 && (
                <section aria-labelledby="sec-tech">
                  <h3 id="sec-tech" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Techniques compared
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                      <thead className="bg-slate-100 dark:bg-slate-800">
                        <tr>
                          <th scope="col" className="p-2 font-semibold">Technique</th>
                          <th scope="col" className="p-2 font-semibold">When to use</th>
                          <th scope="col" className="p-2 font-semibold">Pros</th>
                          <th scope="col" className="p-2 font-semibold">Cons</th>
                        </tr>
                      </thead>
                      <tbody>
                        {term.techniques.map((t) => (
                          <tr key={t.name} className="border-t border-slate-200 align-top dark:border-slate-700">
                            <th scope="row" className="p-2 font-medium">{t.name}</th>
                            <td className="p-2">{t.whenToUse}</td>
                            <td className="p-2">{t.pros}</td>
                            <td className="p-2">{t.cons}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {term.opencvFunctions.length > 0 && (
                <section aria-labelledby="sec-cv">
                  <h3 id="sec-cv" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    OpenCV functions
                  </h3>
                  <div className="space-y-3">
                    {term.opencvFunctions.map((fn) => (
                      <Snippet key={fn} fn={fn} />
                    ))}
                  </div>
                </section>
              )}

              <section aria-labelledby="sec-apps">
                <h3 id="sec-apps" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Applications
                </h3>
                <ul className="list-disc space-y-1 pl-5">
                  {term.applications.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="sec-tips" className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
                <h3 id="sec-tips" className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                  Exam tips
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-amber-950 dark:text-amber-100">
                  {term.examTips.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="sec-rel">
                <h3 id="sec-rel" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Related terms
                </h3>
                <div className="flex flex-wrap gap-2">
                  {term.relatedTermIds.map((r) => (
                    <TermChip key={r} id={r} />
                  ))}
                </div>
              </section>

              <nav aria-label="Neighbouring terms in this unit" className="flex justify-between gap-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
                {prev ? (
                  <button type="button" onClick={() => goTerm(prev.id)} className="rounded-md border border-slate-300 px-3 py-1.5 text-left hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
                    {'←'} {prev.name}
                  </button>
                ) : (
                  <span />
                )}
                {next && (
                  <button type="button" onClick={() => goTerm(next.id)} className="rounded-md border border-slate-300 px-3 py-1.5 text-right hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
                    {next.name} {'→'}
                  </button>
                )}
              </nav>
            </div>
          </>
        )}
      </div>
    </>
  );
}
