import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { NotesDrawer } from './components/NotesDrawer';
import { TooltipHost } from './components/TooltipHost';
import { GlossaryPage } from './pages/GlossaryPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { CaseStudyPage } from './pages/CaseStudyPage';
import { CoveragePage } from './pages/CoveragePage';
import { baseRoute, hrefFor, useRoute } from './lib/router';
import { useTheme } from './lib/store';

const NAV: Array<{ label: string; href: string; match: (n: string) => boolean }> = [
  { label: 'Glossary', href: hrefFor.home(), match: (n) => n === 'home' || n === 'unit' },
  { label: 'Playground', href: hrefFor.playground(), match: (n) => n === 'playground' },
  { label: 'GATTACA case study', href: hrefFor.case(), match: (n) => n === 'case' },
  { label: 'Syllabus coverage', href: hrefFor.coverage(), match: (n) => n === 'coverage' },
];

export function App() {
  const route = useRoute();
  const base = baseRoute(route);
  const { dark, toggle } = useTheme();
  const [menu, setMenu] = useState(false);

  // page title + scroll to top when the page (not the drawer) changes
  useEffect(() => {
    const t = { home: 'Glossary', unit: 'Unit', playground: 'Playground', case: 'GATTACA case study', coverage: 'Syllabus coverage' }[base.name];
    document.title = `${t} | DIP Explorer`;
    if (route.name !== 'term') window.scrollTo({ top: 0 });
  }, [base.name, route.name, base.name === 'unit' ? base.id : '']);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[80] focus:rounded focus:bg-indigo-700 focus:px-3 focus:py-2 focus:text-white" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-[110rem] items-center gap-3 px-4 py-2.5">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm md:hidden dark:border-slate-600"
            aria-expanded={menu}
            aria-controls="sidebar"
            onClick={() => setMenu((m) => !m)}
          >
            {'☰'} <span className="sr-only">Toggle syllabus menu</span>
          </button>
          <a href={hrefFor.home()} className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
              {'◢'}
            </span>
            DIP Explorer
          </a>
          <nav aria-label="Main" className="ml-2 hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                aria-current={n.match(base.name) ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${n.match(base.name) ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-pressed={dark}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {dark ? '☀ Light' : '☾ Dark'}
            </button>
          </div>
        </div>
        <nav aria-label="Main (compact)" className="flex gap-1 overflow-x-auto border-t border-slate-200 px-3 py-1.5 lg:hidden dark:border-slate-800">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              aria-current={n.match(base.name) ? 'page' : undefined}
              className={`whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ${n.match(base.name) ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200' : 'text-slate-700 dark:text-slate-300'}`}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="mx-auto flex max-w-[110rem]">
        <aside
          id="sidebar"
          className={`${menu ? 'fixed inset-x-0 bottom-0 top-[5.5rem] z-30 block bg-white dark:bg-slate-950' : 'hidden'} w-full shrink-0 border-r border-slate-200 md:sticky md:top-[3.6rem] md:block md:h-[calc(100vh-3.6rem)] md:w-80 lg:top-[3.6rem] dark:border-slate-800`}
        >
          <Sidebar route={route} base={base} onNavigate={() => setMenu(false)} />
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
          {base.name === 'home' && <GlossaryPage />}
          {base.name === 'unit' && <GlossaryPage unitId={base.id} />}
          {base.name === 'playground' && <PlaygroundPage demoId={base.demoId} />}
          {base.name === 'case' && <CaseStudyPage />}
          {base.name === 'coverage' && <CoveragePage />}
          <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
            DIP Explorer is a course project. All image processing runs in your browser with OpenCV.js (WebAssembly); nothing you load is uploaded or stored.
            Content flagged with TODO needs verification against your textbook.
          </footer>
        </main>
      </div>

      {route.name === 'term' && <NotesDrawer key="drawer" id={route.id} />}
      <TooltipHost />
    </div>
  );
}
