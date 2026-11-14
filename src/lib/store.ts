import { useCallback, useEffect, useState } from 'react';

/* localStorage helpers. Every access is wrapped in try/catch: storage can be blocked or unavailable
 * (private windows, embedded previews) and the app must still work without it. */

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

/** A persisted set of ids (revised terms, bookmarks). Shared across components through a custom event. */
function useIdSet(key: string) {
  const [set, setSet] = useState<Set<string>>(() => new Set(read<string[]>(key, [])));
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) setSet(new Set(read<string[]>(key, [])));
    };
    window.addEventListener('dipx-store', on);
    return () => window.removeEventListener('dipx-store', on);
  }, [key]);
  const toggle = useCallback(
    (id: string) => {
      const next = new Set(read<string[]>(key, []));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(key, [...next]);
      setSet(next);
      window.dispatchEvent(new CustomEvent('dipx-store', { detail: key }));
    },
    [key],
  );
  return { set, toggle };
}

export const useRevised = () => useIdSet('dipx.revised');
export const useBookmarks = () => useIdSet('dipx.bookmarks');

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('dipx.theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
    setDark(next);
  }, []);
  return { dark, toggle };
}
