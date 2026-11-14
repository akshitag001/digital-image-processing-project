import { useEffect, useState } from 'react';
import { termById } from '../data/terms';

/** Hash routes: deep links work on any static host (e.g. /#/term/otsu-thresholding). */
export type Route =
  | { name: 'home' }
  | { name: 'unit'; id: string }
  | { name: 'term'; id: string }
  | { name: 'playground'; demoId?: string }
  | { name: 'case' }
  | { name: 'glossary' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case 'term':
      return parts[1] ? { name: 'term', id: parts[1] } : { name: 'home' };
    case 'unit':
      return parts[1] ? { name: 'unit', id: parts[1] } : { name: 'home' };
    case 'playground':
      return { name: 'playground', demoId: parts[1] };
    case 'case-study':
      return { name: 'case' };
    case 'glossary':
      return { name: 'glossary' };
    default:
      return { name: 'home' };
  }
}

export const hrefFor = {
  home: () => '#/',
  unit: (id: string) => `#/unit/${id}`,
  term: (id: string) => `#/term/${encodeURIComponent(id)}`,
  playground: (demoId?: string) => (demoId ? `#/playground/${demoId}` : '#/playground'),
  case: () => '#/case-study',
  glossary: () => '#/glossary',
};

/** The page that sits behind the notes drawer, so closing the drawer returns there. */
let lastBase = '#/';

function rememberBase(hash: string) {
  const r = parseHash(hash);
  if (r.name !== 'term') lastBase = hash || '#/';
  else if (lastBase === '#/') {
    const t = termById.get(r.id);
    if (t) lastBase = hrefFor.unit(t.unit);
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => {
    rememberBase(window.location.hash);
    return parseHash(window.location.hash);
  });
  useEffect(() => {
    const on = () => {
      rememberBase(window.location.hash);
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const goTerm = (id: string) => {
  window.location.hash = hrefFor.term(id);
};

export const closeTerm = () => {
  window.location.hash = lastBase;
};

/** A route that renders a page (everything except the term drawer). */
export type PageRoute = Exclude<Route, { name: 'term' }>;

/** The page to render behind the drawer. */
export function baseRoute(route: Route): PageRoute {
  if (route.name !== 'term') return route;
  const r = parseHash(lastBase);
  return r.name === 'term' ? { name: 'home' } : r;
}
