/* Shared types and OpenCV.js helpers used by every demo. */

// OpenCV.js ships a very large, partly inaccurate .d.ts, so the runtime object is typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CV = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Mat = any;

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA, row-major
}

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;
export const num = (p: Params, k: string): number => Number(p[k]);
export const str = (p: Params, k: string): string => String(p[k]);
export const bool = (p: Params, k: string): boolean => Boolean(p[k]);

/** Collects every cv object created during one demo run so they can all be freed (WASM memory is manual). */
export interface Tracker {
  add<T extends { delete?: () => void }>(o: T): T;
  mat(...args: unknown[]): Mat;
  free(): void;
}

export function tracker(cv: CV): Tracker {
  const list: Array<{ delete?: () => void }> = [];
  return {
    add<T extends { delete?: () => void }>(o: T): T {
      list.push(o);
      return o;
    },
    mat(...args: unknown[]): Mat {
      const m = new cv.Mat(...args);
      list.push(m);
      return m;
    },
    free() {
      for (const o of list) {
        try {
          o.delete?.();
        } catch {
          /* already freed */
        }
      }
      list.length = 0;
    },
  };
}

export const newImage = (width: number, height: number): RGBAImage => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

export function matFromImage(cv: CV, t: Tracker, img: RGBAImage): Mat {
  return t.add(cv.matFromImageData(img));
}

export function grayFrom(cv: CV, t: Tracker, rgba: Mat): Mat {
  const g = t.mat();
  cv.cvtColor(rgba, g, cv.COLOR_RGBA2GRAY);
  return g;
}

export function rgbFrom(cv: CV, t: Tracker, rgba: Mat): Mat {
  const g = t.mat();
  cv.cvtColor(rgba, g, cv.COLOR_RGBA2RGB);
  return g;
}

/** Convert any 8-bit Mat (1, 3 or 4 channels) to a displayable RGBA image. */
export function imageFromMat(_cv: CV, m: Mat): RGBAImage {
  const { rows, cols } = m;
  const ch = m.channels();
  const d = m.data as Uint8Array;
  const out = new Uint8ClampedArray(rows * cols * 4);
  const n = rows * cols;
  if (ch === 1) {
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      const v = d[i];
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
  } else if (ch === 3) {
    for (let i = 0, o = 0, s = 0; i < n; i++, o += 4, s += 3) {
      out[o] = d[s];
      out[o + 1] = d[s + 1];
      out[o + 2] = d[s + 2];
      out[o + 3] = 255;
    }
  } else if (ch === 4) {
    out.set(d.subarray(0, n * 4));
  } else {
    throw new Error(`imageFromMat: unsupported channel count ${ch}`);
  }
  return { width: cols, height: rows, data: out };
}

/** Normalise any single-channel Mat to 8-bit (min-max) for display. */
export function toU8(cv: CV, t: Tracker, m: Mat): Mat {
  const n = t.mat();
  cv.normalize(m, n, 0, 255, cv.NORM_MINMAX);
  const u = t.mat();
  n.convertTo(u, cv.CV_8U);
  return u;
}

/** Float32 data -> RGBA gray image (min-max scaled). */
export function imageFromFloat(data: ArrayLike<number>, w: number, h: number, lo?: number, hi?: number): RGBAImage {
  let mn = lo ?? Infinity;
  let mx = hi ?? -Infinity;
  if (lo === undefined || hi === undefined) {
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  const span = mx - mn || 1;
  const img = newImage(w, h);
  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    const v = Math.max(0, Math.min(255, ((data[i] - mn) / span) * 255));
    img.data[o] = v;
    img.data[o + 1] = v;
    img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  return img;
}

/** Downscale a source image so its longest side is <= max (keeps demos fast). */
export function fitSize(w: number, h: number, max: number): { w: number; h: number; scale: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scale: s };
}

export function resizeImage(cv: CV, img: RGBAImage, max: number): RGBAImage {
  const { w, h, scale } = fitSize(img.width, img.height, max);
  if (scale >= 1) return img;
  const t = tracker(cv);
  try {
    const src = matFromImage(cv, t, img);
    const dst = t.mat();
    cv.resize(src, dst, new cv.Size(w, h), 0, 0, cv.INTER_AREA);
    return imageFromMat(cv, dst);
  } finally {
    t.free();
  }
}

// ---------- tiny metrics (TS, so they work for any demo) ----------

export function mse8(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s / n;
}

export function psnrFromMse(mse: number, max = 255): number {
  if (mse <= 1e-12) return Infinity;
  return 10 * Math.log10((max * max) / mse);
}

export const fmtDb = (v: number): string => (Number.isFinite(v) ? `${v.toFixed(2)} dB` : '∞ dB');

/** Mean SSIM of two single-channel 8-bit Mats (11x11 Gaussian window, sigma 1.5). */
export function ssimMat(cv: CV, t: Tracker, a8: Mat, b8: Mat): number {
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const a = t.mat();
  const b = t.mat();
  a8.convertTo(a, cv.CV_32F);
  b8.convertTo(b, cv.CV_32F);
  const blur = (m: Mat): Mat => {
    const o = t.mat();
    cv.GaussianBlur(m, o, new cv.Size(11, 11), 1.5, 1.5, cv.BORDER_REFLECT);
    return o;
  };
  const mul = (x: Mat, y: Mat): Mat => {
    const o = t.mat();
    cv.multiply(x, y, o);
    return o;
  };
  const mu1 = blur(a);
  const mu2 = blur(b);
  const mu1sq = mul(mu1, mu1);
  const mu2sq = mul(mu2, mu2);
  const mu12 = mul(mu1, mu2);
  const s1 = blur(mul(a, a));
  const s2 = blur(mul(b, b));
  const s12 = blur(mul(a, b));
  const n = mu1sq.rows * mu1sq.cols;
  const dA = mu1sq.data32F as Float32Array;
  const dB = mu2sq.data32F as Float32Array;
  const dC = mu12.data32F as Float32Array;
  const eA = s1.data32F as Float32Array;
  const eB = s2.data32F as Float32Array;
  const eC = s12.data32F as Float32Array;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const sigma1 = eA[i] - dA[i];
    const sigma2 = eB[i] - dB[i];
    const sigma12 = eC[i] - dC[i];
    total += ((2 * dC[i] + C1) * (2 * sigma12 + C2)) / ((dA[i] + dB[i] + C1) * (sigma1 + sigma2 + C2));
  }
  return total / n;
}
