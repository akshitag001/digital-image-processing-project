# DIP in GATTACA

A Digital Image Processing course submission that shows **how DIP concepts are used in the GATTACA project** (a privacy-awareness tool that measures how much fingerprint ridge detail a photo exposes). It is not a general DIP course: it only covers the techniques GATTACA actually uses.

Runs entirely in the browser with OpenCV.js (WebAssembly). No backend; deploys to Vercel as a static site.

## What is on the site

- **GATTACA pipeline (home):** the real pipeline step by step on a generated ridge pattern: grayscale, CLAHE, bilateral denoise, PPRP and Nyquist, orientation field, Gabor, Otsu, thinning, minutiae. Each stage shows the image, the explanation, the OpenCV call and links to the DIP terms. Includes a distance slider and a recoverability sweep.
- **DIP terms used:** 75 terms that GATTACA relies on, each with a definition, explanation, formulas, OpenCV Python/JS code and exam tips. Hover for a one-line definition, click for the notes panel.
- **Playground:** live OpenCV.js demos for the same techniques.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173  (copies OpenCV.js into public/ first)
npm test           # schema, syllabus, linker, every demo on real OpenCV.js, case-study pipeline
npm run build      # type-check + production build -> dist/
npm run preview    # serve dist/ locally
```

Requires Node 20+. On Windows run tests from PowerShell or cmd (Git Bash with a lowercase drive letter confuses Vitest's module resolution).

## Adding a term

Add the term to a file in `src/data/terms/` and add its id to `src/data/gattaca.ts` so it is shown. `npm test` validates the schema.

## Architecture

```
src/data/        terms (17 unit files), units, snippets, syllabus checklist
src/lib/         hash router, search (Fuse.js), term auto-linker, samples, storage
src/cv/          OpenCV.js loader, helpers, DSP in TypeScript, GATTACA ridge pipeline
src/demos/       the 49 demos
src/components/  drawer, sidebar, tooltip, code blocks, canvases
src/pages/       glossary, playground, case study, coverage
tests/           Vitest: data schema, syllabus, linker/router, demos, case study
```

OpenCV.js (13 MB) is copied from `node_modules` to `public/opencv.js` by a `pre*` script and **loaded lazily** with a script tag only when the Playground or case study opens. The glossary works without it.

OpenCV.js 5.0 lacks some functions (`getGaborKernel`, `goodFeaturesToTrack`, `dct`, `fastNlMeansDenoising`, `ximgproc.thinning`, `imencode`). The demos implement those in TypeScript and the notes say so wherever it matters. See `docs/cv-function-map.md` for the GATTACA cv2 to DIP-topic map.

## Ethics and data

All images are processed locally in the browser; nothing is uploaded or stored. The case study uses a **procedurally generated ridge pattern**, not a real fingerprint. GATTACA is a privacy-awareness tool: it estimates exposure risk and does not store biometrics or defeat security systems. Upload only your own images.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New > Project > Import** the repo.
3. Framework preset **Vite**, build command `npm run build`, output directory `dist` (all set in `vercel.json`, including SPA rewrites).
4. Deploy. The build copies `opencv.js` automatically.

## Credits

OpenCV.js via `@techstark/opencv-js`, KaTeX, Fuse.js, React, Vite, Tailwind CSS. Notation follows Gonzalez and Woods, *Digital Image Processing*.
