import { useCallback, useEffect, useState } from 'react';
import { loadOpenCV } from '../cv/loader';
import type { CV } from '../cv/core';

export type CvState = { status: 'loading' } | { status: 'ready'; cv: CV } | { status: 'error'; error: string };

/** Lazy-loads OpenCV.js (WASM) the first time a page that needs it is shown. */
export function useOpenCV(): CvState & { retry: () => void } {
  const [state, setState] = useState<CvState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    loadOpenCV()
      .then((cv) => alive && setState({ status: 'ready', cv }))
      .catch((e: unknown) => alive && setState({ status: 'error', error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
