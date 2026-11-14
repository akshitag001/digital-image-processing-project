# DIP Explorer

An interactive **Digital Image Processing** study guide and playground. Every DIP term is hoverable and clickable, and every technique can be tried live on an image, in the browser, with **OpenCV.js (WebAssembly)**. No backend, no server: it deploys to Vercel as a static site.

Built as a university DIP course project, adapted from the author's OpenCV hackathon project **GATTACA** (a privacy-awareness tool that measures how much fingerprint ridge detail a photo exposes).

<!-- Screenshots: add docs/screenshots/*.png and link them here -->
> Screenshots placeholder: glossary home, notes drawer, playground, GATTACA case study.

## Features

- **191 glossary terms in 17 units** covering the whole syllabus. Each term has a one-line definition, a 3-6 paragraph explanation, KaTeX formulas, a techniques comparison table, OpenCV functions with copyable **Python and JavaScript** snippets, applications, exam tips and related terms.
- **Hover** any term for a tooltip. **Click** for the notes drawer (slide-in, `Esc` to close). Terms mentioned inside explanations are auto-linked.
- Collapsible unit tree, **fuzzy search**, bookmarks, "mark as revised" with per-unit progress (saved in `localStorage`).
- **Deep links**: `/#/term/otsu-thresholding`, `/#/unit/u4`, `/#/playground/clahe`.
- **Playground**: 49 live OpenCV.js demos with before/after, sliders, the exact OpenCV call and a "what you are seeing" caption. Upload an image or use generated samples.
- **GATTACA case study**: grayscale, CLAHE, denoise, orientation field, PPRP/Nyquist, Gabor, Otsu, thinning, minutiae, plus a distance sweep.
- **Syllabus coverage** page: term counts per unit and a checklist of every required sub-topic (enforced by a test).
- Dark/light theme, responsive, keyboard accessible.

## Syllabus coverage

| Unit | Title | Terms |
|---|---|---|
| 1 | Fundamentals of Digital Images | 19 |
| 2 | Pixel Relationships | 11 |
| 3 | Intensity Transformations | 8 |
| 4 | Histogram Processing | 4 |
| 5 | Spatial Filtering | 16 |
| 6 | Frequency Domain Processing | 14 |
| 7 | Image Restoration | 13 |
| 8 | Color Image Processing | 10 |
| 9 | Geometric Transformations | 11 |
| 10 | Morphological Processing | 12 |
| 11 | Image Segmentation | 17 |
| 12 | Image Compression | 18 |
| 13 | Wavelets and Multiresolution | 6 |
| 14 | Representation and Description | 11 |
| 15 | Feature Extraction and Recognition | 8 |
| 16 | Video and Motion | 5 |
| 17 | Applications | 8 |

The live numbers are on the in-app **Syllabus coverage** page. Facts I could not verify offline are marked `TODO` in the text and listed on that page; check them against your textbook.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173  (copies OpenCV.js into public/ first)
npm test           # schema, syllabus, linker, every demo on real OpenCV.js, case-study pipeline
npm run build      # type-check + production build -> dist/
npm run preview    # serve dist/ locally
```

Requires Node 20+. On Windows run tests from PowerShell or cmd (Git Bash with a lowercase drive letter confuses Vitest's module resolution).

## How to add a term

Everything lives in data files; no UI code changes are needed.

1. Open the right unit file in `src/data/terms/` (for example `unit03-05.ts`) and append an entry to that unit's array:

   ```ts
   {
     id: 'my-term',                      // unique kebab-case id (used in /#/term/my-term)
     name: 'My term',
     shortDef: 'One line, at most 20 words (shown in the hover tooltip).',
     explanation: ['Paragraph 1.', 'Paragraph 2.', 'Paragraph 3.'],   // 3-6 paragraphs
     formulas: [String.raw`s = c\,r^{\gamma}`],                          // LaTeX (KaTeX)
     techniques: [{ name: 'A', whenToUse: '...', pros: '...', cons: '...' }],
     opencvFunctions: ['cv.GaussianBlur'],   // must exist in src/data/snippets.ts
     applications: ['...'],
     relatedTermIds: ['gaussian-smoothing'], // must be existing ids
     examTips: ['...'],
     demoId: 'gaussian',                     // optional: a demo id from src/demos
     aliases: ['alt name'],                  // optional: extra auto-link phrases
   }
   ```

2. For a new OpenCV function add a Python and JS snippet to `src/data/snippets.ts`.
3. Run `npm test`. The schema test checks ids, `relatedTermIds`, word limits, KaTeX syntax and snippet coverage. If the term is a required syllabus item, add it to `src/data/syllabus.ts`.

To add a demo: create a `Demo` object (see `src/demos/types.ts`), register it in `src/demos/index.ts`, and link it from a term with `demoId`.

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
