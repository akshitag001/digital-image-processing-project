import { useMemo } from 'react';
import { terms, termsByUnit } from '../data/terms';
import { units } from '../data/units';
import { demos } from '../demos';
import { hrefFor } from '../lib/router';
import { useBookmarks, useRevised } from '../lib/store';
import { ProgressBar, TermChip } from '../components/basics';

function UnitSection({ unitId, headingLevel = 2 }: { unitId: string; headingLevel?: 1 | 2 }) {
  const unit = units.find((u) => u.id === unitId)!;
  const list = termsByUnit(unitId);
  const { set: revised } = useRevised();
  const done = list.filter((t) => revised.has(t.id)).length;
  const H = headingLevel === 1 ? 'h1' : 'h2';
  const unitDemos = demos.filter((d) => list.some((t) => t.demoId === d.id) || d.termIds.some((id) => list.some((t) => t.id === id)));
  return (
    <section id={`unit-${unit.id}`} aria-labelledby={`h-${unit.id}`} className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Unit {unit.number}</p>
          <H id={`h-${unit.id}`} className="text-xl font-bold sm:text-2xl">
            <a href={hrefFor.unit(unit.id)} className="hover:underline">
              {unit.title}
            </a>
          </H>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{unit.blurb}</p>
        </div>
        <div className="w-40 shrink-0">
          <ProgressBar value={done} max={list.length} label={`Unit ${unit.number} revision progress`} />
          <p className="mt-1 text-right text-xs tabular-nums text-slate-600 dark:text-slate-400">
            {done} of {list.length} revised
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {list.map((t) => (
          <TermChip key={t.id} id={t.id} />
        ))}
      </div>
      {unitDemos.length > 0 && (
        <p className="mt-4 text-sm text-slate-700 dark:text-slate-300">
          Live demos:{' '}
          {unitDemos.slice(0, 6).map((d, i) => (
            <span key={d.id}>
              {i > 0 && ', '}
              <a className="text-indigo-700 underline dark:text-indigo-300" href={hrefFor.playground(d.id)}>
                {d.title}
              </a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

export function GlossaryPage({ unitId }: { unitId?: string }) {
  const { set: marks } = useBookmarks();
  const { set: revised } = useRevised();
  const bookmarked = useMemo(() => terms.filter((t) => marks.has(t.id)), [marks]);

  if (unitId) {
    const idx = units.findIndex((u) => u.id === unitId);
    if (idx < 0) return <p>Unit not found.</p>;
    return (
      <div className="space-y-4">
        <UnitSection unitId={unitId} headingLevel={1} />
        <nav aria-label="Units" className="flex justify-between text-sm">
          {idx > 0 ? (
            <a href={hrefFor.unit(units[idx - 1].id)} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
              {'←'} {units[idx - 1].title}
            </a>
          ) : (
            <span />
          )}
          {idx < units.length - 1 && (
            <a href={hrefFor.unit(units[idx + 1].id)} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
              {units[idx + 1].title} {'→'}
            </a>
          )}
        </nav>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">DIP Explorer</h1>
        <p className="mt-2 max-w-2xl text-indigo-50">
          A Digital Image Processing study guide where every term is hoverable and clickable, with formulas, techniques, OpenCV code and a live demo that runs in your browser.
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-indigo-200">Terms</dt>
            <dd className="text-2xl font-bold">{terms.length}</dd>
          </div>
          <div>
            <dt className="text-indigo-200">Units</dt>
            <dd className="text-2xl font-bold">{units.length}</dd>
          </div>
          <div>
            <dt className="text-indigo-200">Live demos</dt>
            <dd className="text-2xl font-bold">{demos.length}</dd>
          </div>
          <div>
            <dt className="text-indigo-200">Revised</dt>
            <dd className="text-2xl font-bold">
              {revised.size}/{terms.length}
            </dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href={hrefFor.playground()} className="rounded-lg bg-white px-4 py-2 font-semibold text-indigo-800 hover:bg-indigo-50">
            Open the Playground
          </a>
          <a href={hrefFor.case()} className="rounded-lg border border-white/70 px-4 py-2 font-semibold text-white hover:bg-white/10">
            GATTACA case study
          </a>
          <a href={hrefFor.coverage()} className="rounded-lg border border-white/70 px-4 py-2 font-semibold text-white hover:bg-white/10">
            Syllabus coverage
          </a>
        </div>
      </header>

      {bookmarked.length > 0 && (
        <section aria-labelledby="h-marks" className="rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-950/30">
          <h2 id="h-marks" className="text-lg font-bold">
            {'★'} Your bookmarks
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {bookmarked.map((t) => (
              <TermChip key={t.id} id={t.id} />
            ))}
          </div>
        </section>
      )}

      <p className="text-sm text-slate-700 dark:text-slate-300">
        Hover a term for a one-line definition. Click it to open the notes panel (press Esc to close). Terms underlined with dots inside explanations are links too.
      </p>

      {units.map((u) => (
        <UnitSection key={u.id} unitId={u.id} />
      ))}
    </div>
  );
}
