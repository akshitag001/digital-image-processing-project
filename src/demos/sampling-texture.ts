import { grayFrom, imageFromFloat, imageFromMat, matFromImage, newImage, num, psnrFromMse, fmtDb, mse8, rgbFrom, bool, str, tracker, type CV, type Mat, type RGBAImage, type Tracker } from '../cv/core';
import { dominantPeriod, gaborKernel, normalizeKernel } from '../cv/dsp';
import { forwardDFT, magnitudeOf } from './frequency';
import { oddSize, type Demo } from './types';

/** Dominant spatial period (px per cycle) of an 8-bit gray Mat, from its DFT. */
function periodOf(cv: CV, t: Tracker, gray: Mat): number {
  const sp = forwardDFT(cv, t, gray);
  const mag = magnitudeOf(sp.complex.data32F as Float32Array, sp.w, sp.h);
  return dominantPeriod(mag, sp.w, sp.h).period;
}

/** Nearest-neighbor enlargement so that small images can be compared at the original size. */
function upNearest(cv: CV, t: Tracker, m: Mat, w: number, h: number): Mat {
  const o = t.mat();
  cv.resize(m, o, new cv.Size(w, h), 0, 0, cv.INTER_NEAREST);
  return o;
}

export const samplingDemos: Demo[] = [
  {
    id: 'sampling-aliasing',
    title: 'Sampling, aliasing and the Nyquist limit (PPRP)',
    group: 'Fundamentals',
    summary: 'Down-sample with and without an anti-aliasing filter. Try the "Synthetic ridges" sample to see pixels per ridge period (PPRP) fall below 2.',
    termIds: ['sampling', 'aliasing', 'nyquist-criterion', 'pprp', 'spatial-resolution'],
    sample: 'zoneplate',
    params: [
      { type: 'range', key: 'f', label: 'Down-sampling factor', min: 1, max: 12, step: 1, default: 4 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const f = Math.max(1, Math.round(num(p, 'f')));
        const w = Math.max(2, Math.floor(gray.cols / f));
        const h = Math.max(2, Math.floor(gray.rows / f));
        const naive = t.mat();
        cv.resize(gray, naive, new cv.Size(w, h), 0, 0, cv.INTER_NEAREST);
        const pre = t.mat();
        const sigma = 0.45 * f;
        if (f > 1) cv.GaussianBlur(gray, pre, new cv.Size(0, 0), sigma, sigma, cv.BORDER_REFLECT);
        else gray.copyTo(pre);
        const filtered = t.mat();
        cv.resize(pre, filtered, new cv.Size(w, h), 0, 0, cv.INTER_NEAREST);
        const p0 = periodOf(cv, t, gray);
        const expected = p0 / f;
        const measured = periodOf(cv, t, naive);
        const below = expected < 2;
        return {
          outputs: [
            { label: `Naive decimation, ${w} x ${h} (shown enlarged)`, image: imageFromMat(cv, upNearest(cv, t, naive, gray.cols, gray.rows)) },
            { label: `Gaussian pre-filter (sigma ${sigma.toFixed(1)}) then decimate`, image: imageFromMat(cv, upNearest(cv, t, filtered, gray.cols, gray.rows)) },
          ],
          stats: [
            { label: 'Dominant period in the original (px)', value: Number.isFinite(p0) ? p0.toFixed(2) : 'n/a' },
            { label: 'Expected period after decimation = PPRP', value: Number.isFinite(expected) ? `${expected.toFixed(2)} px per cycle${below ? '  (BELOW NYQUIST: < 2)' : ''}` : 'n/a' },
            { label: 'Period measured in the naive result', value: Number.isFinite(measured) ? `${measured.toFixed(2)} px per cycle${below ? '  (a false, aliased value)' : ''}` : 'n/a' },
          ],
          caption: 'Naive decimation keeps every f-th pixel, so patterns finer than 2 pixels per cycle fold back into false coarse patterns (moire rings on the zone plate). Blurring first removes what cannot be represented. The period stats are only meaningful for periodic textures like the zone plate or the ridge sample.',
          call: `cv.resize(gray, naive, new cv.Size(${w}, ${h}), 0, 0, cv.INTER_NEAREST);              // aliasing\ncv.GaussianBlur(gray, pre, new cv.Size(0, 0), ${sigma.toFixed(1)}, ${sigma.toFixed(1)});\ncv.resize(pre, filtered, new cv.Size(${w}, ${h}), 0, 0, cv.INTER_NEAREST);   // anti-aliased\n// cv.INTER_AREA does both steps in one call`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'quantization',
    title: 'Quantization and bit depth',
    group: 'Fundamentals',
    summary: 'Reduce the number of gray levels and watch false contours appear.',
    termIds: ['quantization', 'bit-depth', 'intensity-resolution'],
    sample: 'scene',
    params: [{ type: 'range', key: 'bits', label: 'Bits per channel k', min: 1, max: 8, step: 1, default: 3 }],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const k = num(p, 'bits');
        const L = 2 ** k;
        const lut = Array.from({ length: 256 }, (_, r) => Math.round((Math.floor((r / 256) * L) * 255) / (L - 1)));
        const l = t.add(cv.matFromArray(1, 256, cv.CV_8UC1, lut));
        const dst = t.mat();
        cv.LUT(rgb, l, dst);
        const mse = mse8(dst.data, rgb.data);
        return {
          outputs: [{ label: `${L} levels per channel`, image: imageFromMat(cv, dst) }],
          stats: [
            { label: 'Gray levels L = 2^k', value: String(L) },
            { label: 'Storage', value: `${((rgb.cols * rgb.rows * 3 * k) / 8 / 1024).toFixed(1)} KB (8-bit: ${((rgb.cols * rgb.rows * 3) / 1024).toFixed(0)} KB)` },
            { label: 'PSNR vs original', value: fmtDb(psnrFromMse(mse)) },
          ],
          caption: 'Each pixel value is rounded to the nearest of L levels. With few levels, smooth gradients break into flat bands (false contours). This is intensity resolution, independent of the number of pixels.',
          call: `const lut = Uint8Array.from({length: 256}, (_, r) => Math.floor(r / 256 * ${L}) * 255 / ${L - 1});\ncv.LUT(src, lutMat, dst);   // k = ${k} bits`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'bit-planes',
    title: 'Bit-plane slicing',
    group: 'Intensity transformations',
    summary: 'Split an 8-bit image into its eight binary planes.',
    termIds: ['bit-plane-slicing', 'quantization', 'bit-depth'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'plane', label: 'Bit plane (7 = most significant)', min: 0, max: 7, step: 1, default: 7 },
      { type: 'select', key: 'mode', label: 'Show', options: [['single', 'This plane only'], ['upper', 'Reconstruction from this plane and above']], default: 'single' },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const k = num(p, 'plane');
        const dst = t.mat();
        let call: string;
        let mse: number | null = null;
        if (str(p, 'mode') === 'single') {
          const m = t.add(new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1, new cv.Scalar(1 << k)));
          const and = t.mat();
          cv.bitwise_and(gray, m, and);
          cv.threshold(and, dst, 0, 255, cv.THRESH_BINARY);
          call = `cv.bitwise_and(gray, ${1 << k}, plane);   // bit ${k}\ncv.threshold(plane, dst, 0, 255, cv.THRESH_BINARY);`;
        } else {
          const maskVal = (0xff << k) & 0xff;
          const m = t.add(new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1, new cv.Scalar(maskVal)));
          cv.bitwise_and(gray, m, dst);
          mse = mse8(dst.data, gray.data);
          call = `cv.bitwise_and(gray, 0b${maskVal.toString(2).padStart(8, '0')}, dst);   // keep bits ${k}..7`;
        }
        return {
          outputs: [{ label: str(p, 'mode') === 'single' ? `Bit plane ${k}` : `Planes ${k}..7`, image: imageFromMat(cv, dst) }],
          stats: mse === null ? undefined : [{ label: 'PSNR vs original', value: fmtDb(psnrFromMse(mse)) }],
          caption: 'The top planes carry the visible structure; the bottom planes look like noise. Keeping only the top few planes is a crude form of compression.',
          call,
        };
      } finally {
        t.free();
      }
    },
  },
];

// ---------------------------- Gabor / ridges ----------------------------

/** HSV (h in [0,1), s=1, v) -> RGB bytes. */
const hsv = (h: number, v: number): [number, number, number] => {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const q = 1 - f;
  const [r, g, b] = [[1, f, 0], [q, 1, 0], [0, 1, f], [0, q, 1], [f, 0, 1], [1, 0, q]][i % 6];
  return [r * v * 255, g * v * 255, b * v * 255];
};

export function gaborResponse(cv: CV, t: Tracker, gray32: Mat, size: number, sigma: number, theta: number, lambda: number, gamma: number, psi: number): Mat {
  const k = normalizeKernel(gaborKernel(size, sigma, theta, lambda, gamma, psi));
  const km = t.add(cv.matFromArray(size, size, cv.CV_32F, Array.from(k)));
  const out = t.mat();
  cv.filter2D(gray32, out, cv.CV_32F, km, new cv.Point(-1, -1), 0, cv.BORDER_REFLECT);
  return out;
}

export const textureDemos: Demo[] = [
  {
    id: 'gabor',
    title: 'Gabor filter (ridge enhancement)',
    group: 'Representation and description',
    summary: 'An oriented band-pass filter tuned to one orientation and one ridge period.',
    termIds: ['gabor-filter', 'ridge-analysis', 'band-pass-filter', 'texture-analysis'],
    sample: 'fingerprint',
    params: [
      { type: 'range', key: 'lambda', label: 'Wavelength lambda (px per ridge)', min: 3, max: 24, step: 0.5, default: 9 },
      { type: 'range', key: 'theta', label: 'Orientation theta (degrees)', min: 0, max: 179, step: 1, default: 45 },
      { type: 'range', key: 'sigma', label: 'Envelope sigma', min: 1.5, max: 12, step: 0.5, default: 4.5 },
      { type: 'range', key: 'gamma', label: 'Aspect ratio gamma', min: 0.2, max: 1.5, step: 0.05, default: 0.6 },
      { type: 'checkbox', key: 'bank', label: 'Use a bank of 12 orientations (max response + orientation map)', default: false },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const g32 = t.mat();
        gray.convertTo(g32, cv.CV_32F, 1 / 255);
        const lambda = num(p, 'lambda');
        const sigma = num(p, 'sigma');
        const gamma = num(p, 'gamma');
        const size = Math.min(45, oddSize(Math.ceil(6 * sigma / Math.min(1, gamma)) | 1));
        const theta0 = (num(p, 'theta') * Math.PI) / 180;
        const kernelPlain = gaborKernel(size, sigma, theta0, lambda, gamma, 0);
        const kimg = imageFromFloat(kernelPlain, size, size);
        const upscale = newImage(size * 5, size * 5);
        for (let y = 0; y < upscale.height; y++)
          for (let x = 0; x < upscale.width; x++) {
            const s = (Math.floor(y / 5) * size + Math.floor(x / 5)) * 4;
            upscale.data.set(kimg.data.subarray(s, s + 4), (y * upscale.width + x) * 4);
          }
        const outputs: Array<{ label: string; image: RGBAImage }> = [];
        let call: string;
        if (bool(p, 'bank')) {
          const n = 12;
          const w = gray.cols;
          const h = gray.rows;
          const best = new Float32Array(w * h).fill(-Infinity);
          const arg = new Uint8Array(w * h);
          for (let i = 0; i < n; i++) {
            const resp = gaborResponse(cv, t, g32, size, sigma, (i * Math.PI) / n, lambda, gamma, 0);
            const d = resp.data32F as Float32Array;
            for (let j = 0; j < d.length; j++) if (d[j] > best[j]) {
              best[j] = d[j];
              arg[j] = i;
            }
          }
          let mx = 1e-6;
          for (const v of best) mx = Math.max(mx, v);
          const orient = newImage(w, h);
          for (let j = 0; j < w * h; j++) {
            const c = hsv(arg[j] / n, Math.max(0, Math.min(1, best[j] / (mx * 0.6))));
            orient.data[j * 4] = c[0];
            orient.data[j * 4 + 1] = c[1];
            orient.data[j * 4 + 2] = c[2];
            orient.data[j * 4 + 3] = 255;
          }
          outputs.push({ label: 'Max response over 12 orientations', image: imageFromFloat(best, w, h, 0, mx) });
          outputs.push({ label: 'Best orientation (hue) weighted by strength', image: orient });
          call = `for (let i = 0; i < 12; i++) {\n  const k = gaborKernel(${size}, ${sigma}, i * Math.PI / 12, ${lambda}, ${gamma}, 0);   // cv.getGaborKernel in Python\n  cv.filter2D(gray32, resp, cv.CV_32F, k);\n  // keep the per-pixel maximum\n}`;
        } else {
          const resp = gaborResponse(cv, t, g32, size, sigma, theta0, lambda, gamma, 0);
          outputs.push({ label: `Response at theta = ${num(p, 'theta')} degrees`, image: imageFromMat(cv, toU8Local(cv, t, resp)) });
          call = `const k = gaborKernel(${size}, ${sigma}, ${theta0.toFixed(3)}, ${lambda}, ${gamma}, 0);   // cv.getGaborKernel in Python (not in OpenCV.js)\ncv.filter2D(gray32, resp, cv.CV_32F, k);`;
        }
        outputs.push({ label: 'Kernel (enlarged)', image: upscale });
        return {
          outputs,
          caption: 'The kernel is a cosine wave windowed by a Gaussian. It responds strongly where the image has ridges of about this wavelength running perpendicular to the wave direction. Set lambda to the ridge period (about 9 px on the sample) and sweep theta. The bank picks the best orientation per pixel, which is what ridge enhancement does.',
          call,
        };
      } finally {
        t.free();
      }
    },
  },
];

function toU8Local(cv: CV, t: Tracker, m: Mat): Mat {
  const n = t.mat();
  cv.normalize(m, n, 0, 255, cv.NORM_MINMAX);
  const u = t.mat();
  n.convertTo(u, cv.CV_8U);
  return u;
}
