import type { CV } from './core';

let promise: Promise<CV> | null = null;

/** OpenCV.js exposes either a ready module, a Promise of one, or a module with onRuntimeInitialized. Normalise all three. */
async function whenReady(cv: CV): Promise<CV> {
  if (cv instanceof Promise) return await cv;
  if (cv.Mat) return cv;
  await new Promise<void>((resolve) => {
    const prev = cv.onRuntimeInitialized;
    cv.onRuntimeInitialized = () => {
      prev?.();
      resolve();
    };
  });
  return cv;
}

/**
 * Lazily loads OpenCV.js (WASM, ~13 MB) the first time it is needed.
 * In the browser it is injected with a <script> tag from /opencv.js (copied from node_modules at build time);
 * in Node (tests) it is required from the npm package.
 */
export function loadOpenCV(): Promise<CV> {
  if (promise) return promise;
  promise = (async () => {
    if (typeof window === 'undefined') {
      const spec = 'node:module';
      const { createRequire } = await import(/* @vite-ignore */ spec);
      const req = createRequire(import.meta.url);
      return whenReady(req('@techstark/opencv-js'));
    }
    const w = window as unknown as { cv?: CV };
    if (!w.cv) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `${import.meta.env.BASE_URL}opencv.js`;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Could not download opencv.js. Check your connection and reload.'));
        document.head.appendChild(s);
      });
    }
    return whenReady(w.cv);
  })().catch((e) => {
    promise = null; // allow a retry
    throw e;
  });
  return promise;
}
