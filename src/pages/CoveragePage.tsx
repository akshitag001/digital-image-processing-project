import { terms, termsByUnit } from '../data/terms';
import { units } from '../data/units';
import { syllabus } from '../data/syllabus';
import { demoGroups, demos } from '../demos';
import { hrefFor } from '../lib/router';
import { useRevised } from '../lib/store';
import { ProgressBar, TermChip } from '../components/basics';

export function CoveragePage() {
  const { set: revised } = useRevised();
  const required = Object.values(syllabus).flat();
  const covered = required.filter((s) => s.ids.every((id) => terms.some((t) => t.id === id)));
  const todo = terms.filter((t) => t.explanation.some((p) => p.includes('TODO')));
  const withDemo = terms.filter((t) => t.demoId).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Syllabus coverage</h1>
        <p className="mt-1 max-w-3xl text-slate-700 dark:text-slate-300">
          Every unit with its number of glossary terms, and a checklist of the sub-topics the course requires. A test fails the build if any checklist item is missing from the glossary.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Units', String(units.length)],
          ['Glossary terms', String(terms.length)],
          ['Required sub-topics covered', `${covered.length} / ${required.length}`],
          ['Terms with a live demo', `${withDemo}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-xs text-slate-600 dark:text-slate-400">{k}</dt>
            <dd className="text-2xl font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Terms and required sub-topics per unit</caption>
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th scope="col" className="p-3">#</th>
              <th scope="col" className="p-3">Unit</th>
              <th scope="col" className="p-3 text-right">Terms</th>
              <th scope="col" className="p-3 text-right">Required sub-topics</th>
              <th scope="col" className="p-3">Revised</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const list = termsByUnit(u.id);
              const req = syllabus[u.id] ?? [];
              const ok = req.filter((s) => s.ids.every((id) => terms.some((t) => t.id === id))).length;
              const done = list.filter((t) => revised.has(t.id)).length;
              return (
                <tr key={u.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="p-3 tabular-nums">{u.number}</td>
                  <th scope="row" className="p-3 font-medium">
                    <a href={hrefFor.unit(u.id)} className="text-indigo-700 hover:underline dark:text-indigo-300">
                      {u.title}
                    </a>
                  </th>
                  <td className="p-3 text-right font-semibold tabular-nums">{list.length}</td>
                  <td className="p-3 text-right tabular-nums">
                    <span className={ok === req.length ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>
                      {ok} / {req.length}
                    </span>
                  </td>
                  <td className="w-40 p-3">
                    <ProgressBar value={done} max={list.length} label={`Unit ${u.number} revision progress`} />
                    <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
                      {done}/{list.length}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 font-semibold dark:border-slate-700">
            <tr>
              <td className="p-3" colSpan={2}>
                Total
              </td>
              <td className="p-3 text-right tabular-nums">{terms.length}</td>
              <td className="p-3 text-right tabular-nums">
                {covered.length} / {required.length}
              </td>
              <td className="p-3 text-xs tabular-nums">
                {revised.size}/{terms.length}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section aria-labelledby="checklist">
        <h2 id="checklist" className="mb-2 text-xl font-bold">
          Required sub-topic checklist
        </h2>
        <div className="space-y-4">
          {units.map((u) => (
            <details key={u.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <summary className="cursor-pointer font-semibold">
                Unit {u.number}: {u.title}{' '}
                <span className="font-normal text-slate-600 dark:text-slate-400">
                  ({(syllabus[u.id] ?? []).length} sub-topics)
                </span>
              </summary>
              <ul className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {(syllabus[u.id] ?? []).map((s) => (
                  <li key={s.label} className="flex items-center gap-2 text-sm">
                    <span aria-label="covered" className="text-emerald-700 dark:text-emerald-300">
                      {'✓'}
                    </span>
                    <span className="mr-1">{s.label}</span>
                    {s.ids.map((id) => (
                      <TermChip key={id} id={id} />
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="demo-cov">
        <h2 id="demo-cov" className="mb-2 text-xl font-bold">
          Live demos ({demos.length})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {demoGroups.map((g) => (
            <div key={g.name} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="font-semibold">{g.name}</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {g.demos.map((d) => (
                  <li key={d.id}>
                    <a className="text-indigo-700 underline dark:text-indigo-300" href={hrefFor.playground(d.id)}>
                      {d.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="todo" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
        <h2 id="todo" className="text-lg font-bold">
          Facts flagged TODO ({todo.length})
        </h2>
        <p className="mt-1 text-sm">These notes contain a statement I could not verify offline. Check them against your textbook before quoting them in an exam.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {todo.map((t) => (
            <TermChip key={t.id} id={t.id} />
          ))}
        </div>
      </section>
    </div>
  );
}
