import { grayFrom, imageFromFloat, imageFromMat, matFromImage, newImage, num, rgbFrom, str, tracker, toU8, type CV, type Mat, type RGBAImage, type Tracker } from '../cv/core';
import { gaussianNoise, mulberry32 } from '../cv/dsp';
import { oddSize, type Demo } from './types';

/** Add salt-and-pepper noise to an RGB Mat in place (seeded). */
export function addSaltPepper(m: Mat, amount: number, seed = 5): void {
  const rand = mulberry32(seed);
  const d = m.data as Uint8Array;
  const ch = m.channels();
  const n = m.rows * m.cols;
  for (let i = 0; i < n; i++) {
    const r = rand();
    if (r < amount / 2) for (let c = 0; c < ch; c++) d[i * ch + c] = 0;
    else if (r < amount) for (let c = 0; c < ch; c++) d[i * ch + c] = 255;
  }
}

export function addGaussian(m: Mat, sigma: number, seed = 5): void {
  const rand = mulberry32(seed);
  const d = m.data as Uint8Array;
  for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, d[i] + gaussianNoise(rand) * sigma));
}

/** Show a small kernel as a magnified gray image (for the kernel panel). */
export function kernelImage(weights: ArrayLike<number>, k: number, cell = 10): RGBAImage {
  const size = Math.min(200, k * cell);
  const cs = Math.floor(size / k);
  const img = newImage(cs * k, cs * k);
  let mx = 0;
  for (let i = 0; i < k * k; i++) mx = Math.max(mx, Math.abs(weights[i]));
  for (let y = 0; y < k * cs; y++)
    for (let x = 0; x < k * cs; x++) {
      const w = weights[Math.floor(y / cs) * k + Math.floor(x / cs)];
      const v = 255 * (w / (mx || 1));
      const o = (y * img.width + x) * 4;
      img.data[o] = v >= 0 ? 255 - v * 0.8 : 255 + v * 0.1;
      img.data[o + 1] = v >= 0 ? 255 - v * 0.8 : 255 + v * 0.1;
      img.data[o + 2] = v >= 0 ? 255 : 255 + v;
      img.data[o + 3] = 255;
    }
  return img;
}

function gaussWeights(k: number, sigma: number): number[] {
  const half = (k - 1) / 2;
  const w: number[] = [];
  let s = 0;
  for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) {
    const v = Math.exp(-((x - half) ** 2 + (y - half) ** 2) / (2 * sigma * sigma));
    w.push(v);
    s += v;
  }
  return w.map((v) => v / s);
}

const f32 = (cv: CV, t: Tracker, m: Mat): Mat => {
  const o = t.mat();
  m.convertTo(o, cv.CV_32F);
  return o;
};

export const filteringDemos: Demo[] = [
  {
    id: 'gaussian',
    title: 'Gaussian and box blur',
    group: 'Spatial filtering',
    summary: 'Smoothing with a Gaussian-weighted or a uniform kernel.',
    termIds: ['gaussian-smoothing', 'box-filter', 'kernel'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'type', label: 'Filter', options: [['gaussian', 'Gaussian'], ['box', 'Box (mean)']], default: 'gaussian' },
      { type: 'range', key: 'k', label: 'Kernel size', min: 1, max: 41, step: 2, default: 9 },
      { type: 'range', key: 'sigma', label: 'Sigma (Gaussian)', min: 0.3, max: 12, step: 0.1, default: 2 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const m = matFromImage(cv, t, src);
        const k = oddSize(num(p, 'k'));
        const sigma = num(p, 'sigma');
        const dst = t.mat();
        let call: string;
        let weights: number[];
        if (str(p, 'type') === 'box') {
          cv.blur(m, dst, new cv.Size(k, k));
          call = `cv.blur(src, dst, new cv.Size(${k}, ${k}));`;
          weights = new Array(k * k).fill(1 / (k * k));
        } else {
          cv.GaussianBlur(m, dst, new cv.Size(k, k), sigma, sigma, cv.BORDER_DEFAULT);
          call = `cv.GaussianBlur(src, dst, new cv.Size(${k}, ${k}), ${sigma}, ${sigma}, cv.BORDER_DEFAULT);`;
          weights = gaussWeights(k, sigma);
        }
        return {
          outputs: [{ label: 'Smoothed', image: imageFromMat(cv, dst) }, { label: 'Kernel weights', image: kernelImage(weights, k) }],
          caption: 'Each pixel becomes a weighted average of its neighborhood, so noise and fine detail fade. The box kernel weights all neighbors equally; the Gaussian weights fall off smoothly.',
          call,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'median',
    title: 'Median filter vs. mean on impulse noise',
    group: 'Spatial filtering',
    summary: 'Salt-and-pepper noise is removed by the median, not by averaging.',
    termIds: ['median-filter', 'salt-and-pepper-noise', 'order-statistic-filters'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'noise', label: 'Noise amount (%)', min: 0, max: 40, step: 1, default: 10 },
      { type: 'range', key: 'k', label: 'Kernel size', min: 3, max: 11, step: 2, default: 3 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const noisy = t.mat();
        rgb.copyTo(noisy);
        addSaltPepper(noisy, num(p, 'noise') / 100);
        const k = oddSize(num(p, 'k'));
        const med = t.mat();
        cv.medianBlur(noisy, med, k);
        const mean = t.mat();
        cv.blur(noisy, mean, new cv.Size(k, k));
        return {
          outputs: [
            { label: 'Noisy input', image: imageFromMat(cv, noisy) },
            { label: 'Median', image: imageFromMat(cv, med) },
            { label: 'Mean (box) for comparison', image: imageFromMat(cv, mean) },
          ],
          caption: 'The median throws away outliers because they sit at the ends of the sorted neighborhood. The mean spreads each outlier into its neighbors and leaves gray smudges.',
          call: `cv.medianBlur(noisy, dst, ${k});   // ksize must be odd`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'bilateral',
    title: 'Bilateral filter',
    group: 'Spatial filtering',
    summary: 'Edge-preserving smoothing using spatial and intensity weights.',
    termIds: ['bilateral-filter', 'gaussian-smoothing', 'non-local-means'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'd', label: 'Diameter d', min: 3, max: 15, step: 2, default: 9 },
      { type: 'range', key: 'sc', label: 'sigmaColor', min: 5, max: 200, step: 5, default: 60 },
      { type: 'range', key: 'ss', label: 'sigmaSpace', min: 3, max: 100, step: 1, default: 9 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const d = oddSize(num(p, 'd'));
        const sc = num(p, 'sc');
        const ss = num(p, 'ss');
        const bil = t.mat();
        cv.bilateralFilter(rgb, bil, d, sc, ss, cv.BORDER_DEFAULT);
        const g = t.mat();
        cv.GaussianBlur(rgb, g, new cv.Size(d, d), ss / 3, ss / 3, cv.BORDER_DEFAULT);
        return {
          outputs: [{ label: 'Bilateral', image: imageFromMat(cv, bil) }, { label: 'Gaussian (same extent)', image: imageFromMat(cv, g) }],
          caption: 'Pixels across a strong edge differ a lot in intensity, so they get almost no weight. Flat areas are smoothed, edges stay sharp. The Gaussian blurs the edges as well.',
          call: `cv.bilateralFilter(rgb, dst, ${d}, ${sc}, ${ss}, cv.BORDER_DEFAULT);`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'sharpen-laplacian',
    title: 'Laplacian sharpening',
    group: 'Spatial filtering',
    summary: 'g = f - c * Laplacian(f) with a negative-center kernel.',
    termIds: ['laplacian', 'unsharp-masking', 'high-boost-filtering'],
    sample: 'scene',
    params: [{ type: 'range', key: 'c', label: 'Strength c', min: 0, max: 2, step: 0.05, default: 0.8 }],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const c = num(p, 'c');
        const f = f32(cv, t, rgb);
        const lap = t.mat();
        cv.Laplacian(f, lap, cv.CV_32F, 1, 1, 0, cv.BORDER_DEFAULT);
        const scaled = t.mat();
        lap.convertTo(scaled, cv.CV_32F, c);
        const sharp32 = t.mat();
        cv.subtract(f, scaled, sharp32);
        const sharp = t.mat();
        sharp32.convertTo(sharp, cv.CV_8U);
        const gray = t.mat();
        cv.cvtColor(lap, gray, cv.COLOR_RGB2GRAY);
        const g = gray.data32F as Float32Array;
        return {
          outputs: [{ label: 'Sharpened', image: imageFromMat(cv, sharp) }, { label: 'Laplacian response (0 = mid-gray)', image: imageFromFloat(g, gray.cols, gray.rows, -128, 128) }],
          caption: 'The Laplacian is large at edges and zero in flat areas. Subtracting it (the center weight is negative) makes the bright side brighter and the dark side darker at every edge.',
          call: `cv.Laplacian(f32, lap, cv.CV_32F, 1);   // ksize 1: [0 1 0; 1 -4 1; 0 1 0]\ncv.subtract(f32, lap.mul(${c}), sharp);`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'unsharp',
    title: 'Unsharp mask and high-boost',
    group: 'Spatial filtering',
    summary: 'g = f + k (f - blur(f)). k = 1 is unsharp masking, k > 1 is high-boost.',
    termIds: ['unsharp-masking', 'high-boost-filtering', 'gaussian-smoothing'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'sigma', label: 'Blur sigma', min: 0.5, max: 10, step: 0.1, default: 2 },
      { type: 'range', key: 'k', label: 'Amount k', min: 0, max: 5, step: 0.1, default: 1.5 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const sigma = num(p, 'sigma');
        const k = num(p, 'k');
        const blur = t.mat();
        cv.GaussianBlur(rgb, blur, new cv.Size(0, 0), sigma, sigma, cv.BORDER_DEFAULT);
        const out = t.mat();
        cv.addWeighted(rgb, 1 + k, blur, -k, 0, out);
        const mask = t.mat();
        cv.addWeighted(rgb, 1, blur, -1, 128, mask);
        return {
          outputs: [{ label: 'Sharpened', image: imageFromMat(cv, out) }, { label: 'Mask f - blur (+128)', image: imageFromMat(cv, mask) }],
          caption: 'The mask holds just the edges and fine detail (gray = no change). Adding it back with weight k boosts them; k above 1 is high-boost filtering.',
          call: `cv.GaussianBlur(src, blur, new cv.Size(0, 0), ${sigma}, ${sigma});\ncv.addWeighted(src, ${(1 + k).toFixed(2)}, blur, ${(-k).toFixed(2)}, 0, dst);   // f + k (f - blur)`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'sobel',
    title: 'Gradient operators (Sobel, Scharr, Prewitt, Roberts)',
    group: 'Spatial filtering',
    summary: 'First-derivative edge strength and its horizontal and vertical parts.',
    termIds: ['sobel-operator', 'image-gradient', 'prewitt-operator', 'scharr-operator', 'roberts-operator'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'op', label: 'Operator', options: [['sobel', 'Sobel'], ['scharr', 'Scharr'], ['prewitt', 'Prewitt'], ['roberts', 'Roberts cross']], default: 'sobel' },
      { type: 'range', key: 'gain', label: 'Display gain', min: 0.5, max: 6, step: 0.1, default: 2 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const op = str(p, 'op');
        const gain = num(p, 'gain');
        const gx = t.mat();
        const gy = t.mat();
        let call: string;
        if (op === 'sobel') {
          cv.Sobel(gray, gx, cv.CV_32F, 1, 0, 3);
          cv.Sobel(gray, gy, cv.CV_32F, 0, 1, 3);
          call = 'cv.Sobel(gray, gx, cv.CV_32F, 1, 0, 3);\ncv.Sobel(gray, gy, cv.CV_32F, 0, 1, 3);\ncv.magnitude(gx, gy, mag);';
        } else if (op === 'scharr') {
          cv.Scharr(gray, gx, cv.CV_32F, 1, 0);
          cv.Scharr(gray, gy, cv.CV_32F, 0, 1);
          call = 'cv.Scharr(gray, gx, cv.CV_32F, 1, 0);\ncv.Scharr(gray, gy, cv.CV_32F, 0, 1);\ncv.magnitude(gx, gy, mag);';
        } else {
          const kx = op === 'prewitt' ? [-1, 0, 1, -1, 0, 1, -1, 0, 1] : [-1, 0, 0, 1];
          const ky = op === 'prewitt' ? [-1, -1, -1, 0, 0, 0, 1, 1, 1] : [0, -1, 1, 0];
          const n = op === 'prewitt' ? 3 : 2;
          const A = t.add(cv.matFromArray(n, n, cv.CV_32F, kx));
          const B = t.add(cv.matFromArray(n, n, cv.CV_32F, ky));
          cv.filter2D(gray, gx, cv.CV_32F, A);
          cv.filter2D(gray, gy, cv.CV_32F, B);
          call = `const kx = cv.matFromArray(${n}, ${n}, cv.CV_32F, [${kx.join(', ')}]);\nconst ky = cv.matFromArray(${n}, ${n}, cv.CV_32F, [${ky.join(', ')}]);\ncv.filter2D(gray, gx, cv.CV_32F, kx);\ncv.filter2D(gray, gy, cv.CV_32F, ky);\ncv.magnitude(gx, gy, mag);`;
        }
        const mag = t.mat();
        cv.magnitude(gx, gy, mag);
        const show = (m: Mat, absolute: boolean) => {
          const o = t.mat();
          if (absolute) cv.convertScaleAbs(m, o, gain / 2, 0);
          else m.convertTo(o, cv.CV_8U, gain / 2);
          return imageFromMat(cv, o);
        };
        const gxAbs = t.mat();
        cv.convertScaleAbs(gx, gxAbs, gain, 0);
        const gyAbs = t.mat();
        cv.convertScaleAbs(gy, gyAbs, gain, 0);
        return {
          outputs: [{ label: 'Gradient magnitude', image: show(mag, false) }, { label: '|Gx| (vertical edges)', image: imageFromMat(cv, gxAbs) }, { label: '|Gy| (horizontal edges)', image: imageFromMat(cv, gyAbs) }],
          caption: 'Gx responds to vertical edges and Gy to horizontal ones. The magnitude sqrt(Gx^2 + Gy^2) combines them. Roberts is noisiest, Sobel and Scharr smooth while they differentiate.',
          call,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'canny',
    title: 'Canny edge detector',
    group: 'Spatial filtering',
    summary: 'Smoothing, gradient, non-maximum suppression and hysteresis thresholds.',
    termIds: ['canny-edge-detector', 'edge-detection', 'hough-transform'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'sigma', label: 'Gaussian sigma', min: 0.5, max: 4, step: 0.1, default: 1.4 },
      { type: 'range', key: 'low', label: 'Low threshold', min: 0, max: 255, step: 1, default: 50 },
      { type: 'range', key: 'high', label: 'High threshold', min: 0, max: 255, step: 1, default: 130 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const sigma = num(p, 'sigma');
        const low = Math.min(num(p, 'low'), num(p, 'high'));
        const high = Math.max(num(p, 'low'), num(p, 'high'));
        const blur = t.mat();
        cv.GaussianBlur(gray, blur, new cv.Size(0, 0), sigma, sigma, cv.BORDER_DEFAULT);
        const edges = t.mat();
        cv.Canny(blur, edges, low, high, 3, false);
        const gx = t.mat();
        const gy = t.mat();
        cv.Sobel(blur, gx, cv.CV_32F, 1, 0, 3);
        cv.Sobel(blur, gy, cv.CV_32F, 0, 1, 3);
        const mag = t.mat();
        cv.magnitude(gx, gy, mag);
        const m8 = toU8(cv, t, mag);
        return {
          outputs: [{ label: 'Canny edges', image: imageFromMat(cv, edges) }, { label: 'Sobel magnitude (before thinning)', image: imageFromMat(cv, m8) }],
          caption: 'Canny thins the thick Sobel ridges to one pixel (non-maximum suppression) and keeps weak edges only if they touch strong ones (hysteresis between the low and high thresholds).',
          call: `cv.GaussianBlur(gray, blur, new cv.Size(0, 0), ${sigma}, ${sigma});\ncv.Canny(blur, edges, ${low}, ${high}, 3, false);`,
        };
      } finally {
        t.free();
      }
    },
  },
];
