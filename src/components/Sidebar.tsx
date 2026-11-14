import { useEffect, useMemo, useState } from 'react';
import { terms, termsByUnit } from '../data/terms';
import { unitById, units } from '../data/units';
import { goTerm, hrefFor, type PageRoute, type Route } from '../lib/router';
import { searchTerms } from '../lib/search';
import { useRevised } from '../lib/store';
import { ProgressBar } from './basics';

export function Sidebar({ route, base, onNavigate }: { route: Route; base: PageRoute; onNavigate: () => void }) {
  const [query, setQuery] = useState('');
  const { set: revised } = useRevised();
  const results = useMemo(() => searchTerms(query), [query]);
  const activeTerm = route.name === 'term' ? route.id : undefined;
  const activeUnit = route.name === 'unit' ? route.id : base.name === 'unit' ? base.id : activeTerm ? terms.find((t) => t.id === activeTerm)?.unit : undefined;
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeUnit ? [activeUnit] : []));

  // keep the unit that holds the current term expanded
  useEffect(() => {
    if (activeUnit) setOpen((o) => (o.has(activeUnit) ? o : new Set(o).add(activeUnit)));
  }, [activeUnit]);

  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <nav aria-label="Syllabus" className="flex h-full flex-col">
      <div className="border-b border-slate-200 p-3 dark:border-slate-800">
        <label htmlFor="term-search" className="sr-only">
          Search glossary terms
        </label>
        <input
          id="term-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${terms.length} terms (try "otsu" or "blur")`}
          autoComplete="off"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-500 dark:border-slate-600 dark:bg-slate-900"
        />
        {query.trim().length >= 2 && (
          <ul aria-label="Search results" className="mt-2 max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-200 bg-white text-sm dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
            {results.length === 0 && <li className="p-2 text-slate-600 dark:text-slate-400">No matching terms.</li>}
            {results.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  data-term-id={t.id}
                  onClick={() => {
                    goTerm(t.id);
                    onNavigate();
                  }}
                  className="block w-full px-2 py-1.5 text-left hover:bg-indigo-50 dark:hover:bg-slate-800"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">Unit {unitById(t.unit)?.number}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto p-2 text-sm">
        {units.map((u) => {
          const list = termsByUnit(u.id);
          const done = list.filter((t) => revised.has(t.id)).length;
          const isOpen = open.has(u.id);
          return (
            <li key={u.id} className="mb-1">
              <div className={`flex items-center gap-1 rounded-md ${activeUnit === u.id ? 'bg-indigo-50 dark:bg-slate-800' : ''}`}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`tree-${u.id}`}
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} unit ${u.number}`}
                  onClick={() => toggle(u.id)}
                  className="rounded p-2 text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <span aria-hidden="true" className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                    {'▶'}
                  </span>
                </button>
                <a href={hrefFor.unit(u.id)} onClick={onNavigate} className="min-w-0 flex-1 py-1.5 pr-2">
                  <span className="block font-medium leading-snug">
                    {u.number}. {u.title}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="w-full">
                      <ProgressBar value={done} max={list.length} label={`Unit ${u.number} revision progress`} />
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                      {done}/{list.length}
                    </span>
                  </span>
                </a>
              </div>
              {isOpen && (
                <ul id={`tree-${u.id}`} className="ml-6 mt-1 border-l border-slate-200 pl-2 dark:border-slate-700">
                  {list.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        data-term-id={t.id}
                        onClick={() => {
                          goTerm(t.id);
                          onNavigate();
                        }}
                        aria-current={activeTerm === t.id ? 'true' : undefined}
                        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-slate-200 dark:hover:bg-slate-700 ${activeTerm === t.id ? 'bg-indigo-600 text-white hover:bg-indigo-600 dark:hover:bg-indigo-600' : ''}`}
                      >
                        <span aria-hidden="true" className={`w-3 text-xs ${revised.has(t.id) ? (activeTerm === t.id ? 'text-white' : 'text-emerald-700 dark:text-emerald-300') : 'text-transparent'}`}>
                          {'✓'}
                        </span>
                        <span className="truncate">{t.name}</span>
                        {revised.has(t.id) && <span className="sr-only"> (revised)</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
