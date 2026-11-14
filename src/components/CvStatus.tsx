import type { CvState } from '../lib/useOpenCV';

/** Loading / error banner shown while OpenCV.js (about 13 MB of WebAssembly) is being fetched. */
export function CvStatus({ state, retry }: { state: CvState; retry: () => void }) {
  if (state.status === 'ready') return null;
  if (state.status === 'error') {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100">
        <p className="font-semibold">OpenCV.js could not be loaded.</p>
        <p className="mt-1 text-sm">{state.error}</p>
        <button type="button" onClick={retry} className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800">
          Try again
        </button>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      <div>
        <p className="font-semibold">Loading OpenCV.js (WebAssembly)...</p>
        <p className="text-sm">About 13 MB, downloaded once on first use. The glossary works without it.</p>
      </div>
    </div>
  );
}
