import { grayFrom, imageFromMat, matFromImage, num, rgbFrom, str, tracker, type CV, type Mat, type Params, type RGBAImage, type Tracker } from '../cv/core';
import { curveImage, histogramImage } from '../cv/draw';
import type { Demo } from './types';

/** Apply a 256-entry table to an RGBA Mat with cv.LUT. Returns an RGB Mat. */
function applyLut(cv: CV, t: Tracker, rgba: Mat, lut: number[]): Mat {
  const rgb = rgbFrom(cv, t, rgba);
  const l = t.add(cv.matFromArray(1, 256, cv.CV_8UC1, lut.map((v) => Math.max(0, Math.min(255, Math.round(v))))));
  const dst = t.mat();
  cv.LUT(rgb, l, dst);
  return dst;
}

const lutOf = (fn: (r: number) => number): number[] => Array.from({ length: 256 }, (_, r) => fn(r));

export function hist256(cv: CV, t: Tracker, gray: Mat): number[] {
  const vec = t.add(new cv.MatVector());
  vec.push_back(gray);
  const hist = t.mat();
  cv.calcHist(vec, [0], t.mat(), hist, [256], [0, 255], false);
  return Array.from(hist.data32F as Float32Array);
}

export function histStats(h: number[]): { mean: number; std: number; min: number; max: number; entropy: number } {
  const n = h.reduce((a, b) => a + b, 0) || 1;
  let mean = 0;
  for (let i = 0; i < 256; i++) mean += (i * h[i]) / n;
  let v = 0;
  let min = 255;
  let max = 0;
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    v += (((i - mean) ** 2) * h[i]) / n;
    if (h[i] > 0) {
      min = Math.min(min, i);
      max = Math.max(max, i);
      const p = h[i] / n;
      entropy -= p * Math.log2(p);
    }
  }
  return { mean, std: Math.sqrt(v), min, max, entropy };
}

const lutDemo = (
  id: string,
  title: string,
  summary: string,
  termIds: string[],
  params: Demo['params'],
  build: (p: Params) => { lut: number[]; call: string; caption: string },
  sample = 'scene',
): Demo => ({
  id,
  title,
  group: 'Intensity transformations',
  summary,
  termIds,
  sample,
  params,
  run(cv, src, p) {
    const t = tracker(cv);
    try {
      const m = matFromImage(cv, t, src);
      const { lut, call, caption } = build(p);
      const out = applyLut(cv, t, m, lut);
      return { outputs: [{ label: 'After', image: imageFromMat(cv, out) }, { label: 'Transformation s = T(r)', image: curveImage(lut) }], caption, call };
    } finally {
      t.free();
    }
  },
});

export const intensityDemos: Demo[] = [
  {
    id: 'negative',
    title: 'Image negative',
    group: 'Intensity transformations',
    summary: 'Reverse every gray level: s = 255 - r.',
    termIds: ['negative-transformation', 'intensity-transformation'],
    sample: 'scene',
    params: [],
    run(cv, src) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const dst = t.mat();
        cv.bitwise_not(rgb, dst);
        return {
          outputs: [{ label: 'Negative', image: imageFromMat(cv, dst) }, { label: 'Transformation s = 255 - r', image: curveImage(lutOf((r) => 255 - r)) }],
          caption: 'Dark becomes bright and bright becomes dark. The transformation curve is a line sloping downwards.',
          call: 'cv.bitwise_not(src, dst);   // dst = 255 - src for 8-bit',
        };
      } finally {
        t.free();
      }
    },
  },
  lutDemo(
    'log',
    'Log transformation',
    's = c log(1 + r) expands dark values and compresses bright ones.',
    ['log-transformation', 'intensity-transformation'],
    [{ type: 'range', key: 'c', label: 'Scale c (relative)', min: 0.4, max: 2, step: 0.05, default: 1 }],
    (p) => {
      const c = (255 / Math.log(256)) * num(p, 'c');
      return {
        lut: lutOf((r) => c * Math.log(1 + r)),
        call: `const lut = Uint8Array.from({length: 256}, (_, r) => c * Math.log(1 + r));   // c = ${c.toFixed(2)}\ncv.LUT(src, lutMat, dst);`,
        caption: 'The curve rises steeply at first, so shadows are lifted a lot while highlights barely change.',
      };
    },
    'lowcontrast',
  ),
  lutDemo(
    'gamma',
    'Power-law (gamma) correction',
    's = 255 (r/255)^gamma. gamma < 1 brightens, gamma > 1 darkens.',
    ['power-law-transformation', 'intensity-transformation'],
    [{ type: 'range', key: 'gamma', label: 'Gamma', min: 0.1, max: 5, step: 0.05, default: 0.5 }],
    (p) => {
      const g = num(p, 'gamma');
      return {
        lut: lutOf((r) => 255 * Math.pow(r / 255, g)),
        call: `const lut = Uint8Array.from({length: 256}, (_, r) => 255 * Math.pow(r / 255, ${g}));\ncv.LUT(src, lutMat, dst);`,
        caption: g < 1 ? 'Gamma below 1 lifts the shadows: dark detail becomes visible.' : g > 1 ? 'Gamma above 1 pulls everything darker and keeps contrast in the highlights.' : 'Gamma = 1 is the identity.',
      };
    },
    'lowcontrast',
  ),
  lutDemo(
    'contrast-stretch',
    'Contrast stretching',
    'Linearly map [low, high] onto [0, 255].',
    ['contrast-stretching', 'histogram-equalization'],
    [
      { type: 'range', key: 'low', label: 'Input low r1', min: 0, max: 200, step: 1, default: 60 },
      { type: 'range', key: 'high', label: 'Input high r2', min: 50, max: 255, step: 1, default: 140 },
    ],
    (p) => {
      const lo = num(p, 'low');
      const hi = Math.max(lo + 1, num(p, 'high'));
      return {
        lut: lutOf((r) => ((r - lo) / (hi - lo)) * 255),
        call: `// s = (r - ${lo}) / (${hi} - ${lo}) * 255, clipped\ncv.convertScaleAbs(src, dst, ${(255 / (hi - lo)).toFixed(3)}, ${(-lo * 255 / (hi - lo)).toFixed(1)});`,
        caption: 'Values below r1 turn black, above r2 white, and the band in between is stretched. Match r1 and r2 to the image histogram for the best result.',
      };
    },
    'lowcontrast',
  ),
  {
    id: 'threshold',
    title: 'Thresholding and gray-level slicing',
    group: 'Intensity transformations',
    summary: 'Binary, inverse, truncate, to-zero, and a band (gray-level slicing) mode.',
    termIds: ['thresholding', 'gray-level-slicing', 'binary-image'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'mode', label: 'Mode', options: [['binary', 'Binary'], ['inv', 'Binary inverse'], ['trunc', 'Truncate'], ['tozero', 'To zero'], ['band', 'Band (slice A..B)']], default: 'binary' },
      { type: 'range', key: 'T', label: 'Threshold T (or band start A)', min: 0, max: 255, step: 1, default: 120 },
      { type: 'range', key: 'B', label: 'Band end B (band mode)', min: 0, max: 255, step: 1, default: 200 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const dst = t.mat();
        const T = num(p, 'T');
        const mode = str(p, 'mode');
        let call: string;
        if (mode === 'band') {
          const lo = t.add(new cv.Mat(gray.rows, gray.cols, gray.type(), new cv.Scalar(T)));
          const hi = t.add(new cv.Mat(gray.rows, gray.cols, gray.type(), new cv.Scalar(Math.max(T, num(p, 'B')))));
          cv.inRange(gray, lo, hi, dst);
          call = `cv.inRange(gray, ${T}, ${Math.max(T, num(p, 'B'))}, dst);   // gray-level slicing`;
        } else {
          const typ = { binary: cv.THRESH_BINARY, inv: cv.THRESH_BINARY_INV, trunc: cv.THRESH_TRUNC, tozero: cv.THRESH_TOZERO }[mode] as number;
          const name = { binary: 'THRESH_BINARY', inv: 'THRESH_BINARY_INV', trunc: 'THRESH_TRUNC', tozero: 'THRESH_TOZERO' }[mode];
          cv.threshold(gray, dst, T, 255, typ);
          call = `cv.threshold(gray, dst, ${T}, 255, cv.${name});`;
        }
        return {
          outputs: [{ label: 'After', image: imageFromMat(cv, dst) }, { label: 'Histogram (red = T)', image: histogramImage([hist256(cv, t, gray)], { marker: T }) }],
          caption: 'Pixels on one side of T are set to white (or kept), the rest to black. The red line on the histogram shows where T cuts the gray levels.',
          call,
        };
      } finally {
        t.free();
      }
    },
  },
];

export const histogramDemos: Demo[] = [
  {
    id: 'histogram',
    title: 'Histogram viewer',
    group: 'Histogram processing',
    summary: 'See how gray levels are distributed.',
    termIds: ['histogram'],
    sample: 'lowcontrast',
    params: [{ type: 'select', key: 'channel', label: 'Channel', options: [['gray', 'Gray'], ['rgb', 'R, G, B overlay']], default: 'gray' }],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const m = matFromImage(cv, t, src);
        const gray = grayFrom(cv, t, m);
        let image: RGBAImage;
        let call: string;
        if (str(p, 'channel') === 'rgb') {
          const rgb = rgbFrom(cv, t, m);
          const planes = t.add(new cv.MatVector());
          cv.split(rgb, planes);
          const series: number[][] = [];
          for (let i = 0; i < 3; i++) {
            const pl = planes.get(i);
            series.push(hist256(cv, t, pl));
            pl.delete();
          }
          image = histogramImage(series);
          call = 'cv.split(rgb, planes);\nfor each plane: cv.calcHist([plane], [0], new cv.Mat(), hist, [256], [0, 255]);';
        } else {
          image = histogramImage([hist256(cv, t, gray)]);
          call = 'cv.calcHist([gray], [0], new cv.Mat(), hist, [256], [0, 255]);';
        }
        const s = histStats(hist256(cv, t, gray));
        return {
          outputs: [{ label: 'Histogram', image }],
          stats: [
            { label: 'Mean', value: s.mean.toFixed(1) },
            { label: 'Std dev (contrast)', value: s.std.toFixed(1) },
            { label: 'Min / Max', value: `${s.min} / ${s.max}` },
            { label: 'Entropy', value: `${s.entropy.toFixed(2)} bits` },
          ],
          caption: 'Each bar counts the pixels at one gray level. A narrow bunch means low contrast; a bunch on the left means a dark image.',
          call,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'hist-eq',
    title: 'Histogram equalization',
    group: 'Histogram processing',
    summary: 'Spread the gray levels using the cumulative distribution.',
    termIds: ['histogram-equalization', 'histogram', 'contrast-stretching'],
    sample: 'lowcontrast',
    params: [],
    run(cv, src) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const eq = t.mat();
        cv.equalizeHist(gray, eq);
        const before = hist256(cv, t, gray);
        const after = hist256(cv, t, eq);
        const sb = histStats(before);
        const sa = histStats(after);
        return {
          outputs: [
            { label: 'Equalized (gray)', image: imageFromMat(cv, eq) },
            { label: 'Histogram before', image: histogramImage([before]) },
            { label: 'Histogram after', image: histogramImage([after]) },
          ],
          stats: [
            { label: 'Std dev before / after', value: `${sb.std.toFixed(1)} / ${sa.std.toFixed(1)}` },
            { label: 'Entropy before / after', value: `${sb.entropy.toFixed(2)} / ${sa.entropy.toFixed(2)} bits` },
          ],
          caption: 'The CDF of the input is used as the mapping, so the output histogram is spread across the full range and is flatter (not perfectly flat: discrete levels cannot be split).',
          call: 'cv.equalizeHist(gray, dst);',
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'clahe',
    title: 'CLAHE',
    group: 'Histogram processing',
    summary: 'Contrast-limited adaptive histogram equalization, with a clip limit and tiles.',
    termIds: ['clahe', 'histogram-equalization'],
    sample: 'lowcontrast',
    params: [
      { type: 'range', key: 'clip', label: 'Clip limit', min: 1, max: 40, step: 0.5, default: 3 },
      { type: 'range', key: 'tile', label: 'Tile grid (N x N)', min: 2, max: 16, step: 1, default: 8 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const clip = num(p, 'clip');
        const tile = num(p, 'tile');
        const out = t.mat();
        const clahe = t.add(new cv.CLAHE(clip, new cv.Size(tile, tile)));
        clahe.apply(gray, out);
        const glob = t.mat();
        cv.equalizeHist(gray, glob);
        return {
          outputs: [
            { label: 'CLAHE', image: imageFromMat(cv, out) },
            { label: 'Global equalization (for comparison)', image: imageFromMat(cv, glob) },
            { label: 'Histogram after CLAHE', image: histogramImage([hist256(cv, t, out)]) },
          ],
          caption: 'Each tile is equalized separately and its histogram is clipped, so local detail improves without the strong noise boost of plain equalization. Raise the clip limit for more contrast.',
          call: `const clahe = new cv.CLAHE(${clip}, new cv.Size(${tile}, ${tile}));\nclahe.apply(gray, dst);`,
        };
      } finally {
        t.free();
      }
    },
  },
];

