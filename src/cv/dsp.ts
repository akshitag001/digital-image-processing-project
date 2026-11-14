/* Pure TypeScript signal-processing routines for things OpenCV.js 5.0 does not expose
 * (Gabor kernel, thinning, DCT, non-local means) plus small numeric helpers. No OpenCV needed here. */

/** Deterministic PRNG so demos and tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussianNoise(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Poisson sample (Knuth for small lambda, normal approximation for large). */
export function poisson(lambda: number, rand: () => number): number {
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussianNoise(rand)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

// ---------------- Gabor ----------------

/** Real Gabor kernel (same definition as cv2.getGaborKernel). Returns a size*size Float32Array. */
export function gaborKernel(size: number, sigma: number, theta: number, lambda: number, gamma: number, psi: number): Float32Array {
  const k = new Float32Array(size * size);
  const half = (size - 1) / 2;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - half;
      const dy = y - half;
      const xr = dx * c + dy * s;
      const yr = -dx * s + dy * c;
      k[y * size + x] = Math.exp(-(xr * xr + gamma * gamma * yr * yr) / (2 * sigma * sigma)) * Math.cos((2 * Math.PI * xr) / lambda + psi);
    }
  }
  return k;
}

/** Zero-mean, L1-normalised copy (so flat regions respond with 0). */
export function normalizeKernel(k: Float32Array): Float32Array {
  let mean = 0;
  for (const v of k) mean += v;
  mean /= k.length;
  let l1 = 0;
  const out = new Float32Array(k.length);
  for (let i = 0; i < k.length; i++) {
    out[i] = k[i] - mean;
    l1 += Math.abs(out[i]);
  }
  for (let i = 0; i < out.length; i++) out[i] /= l1 || 1;
  return out;
}

// ---------------- Thinning + minutiae ----------------

/** Zhang-Suen thinning on a 0/1 image (1 = foreground). Returns a new thinned array. */
export function zhangSuen(bin: Uint8Array, w: number, h: number): Uint8Array {
  const img = Uint8Array.from(bin);
  const toDelete: number[] = [];
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      toDelete.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!img[i]) continue;
          const p2 = img[i - w];
          const p3 = img[i - w + 1];
          const p4 = img[i + 1];
          const p5 = img[i + w + 1];
          const p6 = img[i + w];
          const p7 = img[i + w - 1];
          const p8 = img[i - 1];
          const p9 = img[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A =
            (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
            (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
          if (A !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          toDelete.push(i);
        }
      }
      if (toDelete.length) changed = true;
      for (const i of toDelete) img[i] = 0;
    }
  }
  return img;
}

export interface Minutia {
  x: number;
  y: number;
  type: 'ending' | 'bifurcation';
}

/** Crossing-number minutiae on a one-pixel-wide skeleton. CN=1 ending, CN=3 bifurcation. */
export function findMinutiae(skel: Uint8Array, w: number, h: number, margin = 8, mask?: Uint8Array): Minutia[] {
  const out: Minutia[] = [];
  for (let y = Math.max(1, margin); y < h - Math.max(1, margin); y++) {
    for (let x = Math.max(1, margin); x < w - Math.max(1, margin); x++) {
      const i = y * w + x;
      if (!skel[i]) continue;
      if (mask && !mask[i]) continue;
      // neighbours in circular order
      const n = [skel[i - w], skel[i - w + 1], skel[i + 1], skel[i + w + 1], skel[i + w], skel[i + w - 1], skel[i - 1], skel[i - w - 1]];
      let cn = 0;
      for (let k = 0; k < 8; k++) cn += Math.abs(n[k] - n[(k + 1) % 8]);
      cn /= 2;
      if (cn === 1) out.push({ x, y, type: 'ending' });
      else if (cn === 3) out.push({ x, y, type: 'bifurcation' });
    }
  }
  return out;
}

// ---------------- DCT (8x8) ----------------

const T8: Float64Array = (() => {
  const t = new Float64Array(64);
  for (let u = 0; u < 8; u++) {
    const a = u === 0 ? Math.sqrt(1 / 8) : Math.sqrt(2 / 8);
    for (let x = 0; x < 8; x++) t[u * 8 + x] = a * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
  return t;
})();

/** Orthonormal 8x8 DCT-II: C = T B T^T. */
export function dct8(block: ArrayLike<number>): Float64Array {
  const tmp = new Float64Array(64);
  const out = new Float64Array(64);
  for (let u = 0; u < 8; u++)
    for (let y = 0; y < 8; y++) {
      let s = 0;
      for (let x = 0; x < 8; x++) s += T8[u * 8 + x] * block[y * 8 + x];
      tmp[y * 8 + u] = s;
    }
  for (let v = 0; v < 8; v++)
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let y = 0; y < 8; y++) s += T8[v * 8 + y] * tmp[y * 8 + u];
      out[v * 8 + u] = s;
    }
  return out;
}

export function idct8(coef: ArrayLike<number>): Float64Array {
  const tmp = new Float64Array(64);
  const out = new Float64Array(64);
  for (let x = 0; x < 8; x++)
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let u = 0; u < 8; u++) s += T8[u * 8 + x] * coef[v * 8 + u];
      tmp[v * 8 + x] = s;
    }
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let v = 0; v < 8; v++) s += T8[v * 8 + y] * tmp[v * 8 + x];
      out[y * 8 + x] = s;
    }
  return out;
}

/** Standard JPEG luminance quantisation table (Annex K), row-major. */
export const JPEG_LUMA_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

/** IJG quality scaling of the quantisation table. */
export function scaledQuantTable(quality: number): number[] {
  const q = Math.max(1, Math.min(100, quality));
  const scale = q < 50 ? 5000 / q : 200 - 2 * q;
  return JPEG_LUMA_Q.map((v) => Math.max(1, Math.min(255, Math.floor((v * scale + 50) / 100))));
}

/** Zigzag order of an 8x8 block: ZIGZAG[k] = row-major index of the k-th coefficient. */
export const ZIGZAG: number[] = (() => {
  const order: number[] = [];
  for (let s = 0; s < 15; s++) {
    const cells: number[] = [];
    for (let y = 0; y < 8; y++) {
      const x = s - y;
      if (x >= 0 && x < 8) cells.push(y * 8 + x);
    }
    if (s % 2 === 0) cells.reverse();
    order.push(...cells);
  }
  return order;
})();

// ---------------- Haar wavelet ----------------

/** One level of the 2-D orthonormal Haar transform on the top-left (w x h) region of `a` (stride = full width). */
export function haarLevel(a: Float32Array, stride: number, w: number, h: number): void {
  const tmp = new Float32Array(Math.max(w, h));
  const r = Math.SQRT1_2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w / 2; x++) {
      const p = a[y * stride + 2 * x];
      const q = a[y * stride + 2 * x + 1];
      tmp[x] = (p + q) * r;
      tmp[w / 2 + x] = (p - q) * r;
    }
    for (let x = 0; x < w; x++) a[y * stride + x] = tmp[x];
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h / 2; y++) {
      const p = a[2 * y * stride + x];
      const q = a[(2 * y + 1) * stride + x];
      tmp[y] = (p + q) * r;
      tmp[h / 2 + y] = (p - q) * r;
    }
    for (let y = 0; y < h; y++) a[y * stride + x] = tmp[y];
  }
}

export function ihaarLevel(a: Float32Array, stride: number, w: number, h: number): void {
  const tmp = new Float32Array(Math.max(w, h));
  const r = Math.SQRT1_2;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h / 2; y++) {
      const s = a[y * stride + x];
      const d = a[(h / 2 + y) * stride + x];
      tmp[2 * y] = (s + d) * r;
      tmp[2 * y + 1] = (s - d) * r;
    }
    for (let y = 0; y < h; y++) a[y * stride + x] = tmp[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w / 2; x++) {
      const s = a[y * stride + x];
      const d = a[y * stride + w / 2 + x];
      tmp[2 * x] = (s + d) * r;
      tmp[2 * x + 1] = (s - d) * r;
    }
    for (let x = 0; x < w; x++) a[y * stride + x] = tmp[x];
  }
}

// ---------------- Non-local means ----------------

/** Basic non-local means on an 8-bit gray image. `h` is the filtering strength, patch is odd, search is odd. */
export function nonLocalMeans(src: Uint8Array | Uint8ClampedArray, w: number, hgt: number, h: number, patch = 3, search = 11): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * hgt);
  const pr = (patch - 1) / 2;
  const sr = (search - 1) / 2;
  const h2 = h * h;
  const inv = 1 / (patch * patch);
  const px = (x: number, y: number) => src[Math.min(hgt - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let wsum = 0;
      for (let dy = -sr; dy <= sr; dy++) {
        for (let dx = -sr; dx <= sr; dx++) {
          let d = 0;
          for (let j = -pr; j <= pr; j++)
            for (let i = -pr; i <= pr; i++) {
              const diff = px(x + i, y + j) - px(x + dx + i, y + dy + j);
              d += diff * diff;
            }
          const wt = Math.exp(-(d * inv) / h2);
          sum += wt * px(x + dx, y + dy);
          wsum += wt;
        }
      }
      out[y * w + x] = sum / wsum;
    }
  }
  return out;
}

// ---------------- FFT helpers (interleaved complex Float32Array as produced by cv.dft) ----------------

/** Signed frequency index of bin k in an n-point DFT: 0..n/2 then negative. */
export const freqIndex = (k: number, n: number): number => (k <= n / 2 ? k : k - n);

/** Swap quadrants of a w x h scalar array so that zero frequency is at the centre. */
export function fftshift(a: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(a.length);
  const hx = Math.floor(w / 2);
  const hy = Math.floor(h / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[((y + hy) % h) * w + ((x + hx) % w)] = a[y * w + x];
  return out;
}

/**
 * Estimate the dominant spatial period (pixels per cycle) of an image from its 2-D spectrum.
 * Excludes very low frequencies. Meaningful only for periodic textures such as ridge patterns.
 */
export function dominantPeriod(mag: Float32Array, w: number, h: number): { period: number; radius: number } {
  const n = Math.min(w, h);
  const bins = new Float64Array(Math.floor(n / 2) + 1);
  const counts = new Float64Array(bins.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = freqIndex(x, w) / w;
      const fy = freqIndex(y, h) / h;
      const r = Math.sqrt(fx * fx + fy * fy) * n;
      const b = Math.round(r);
      if (b < bins.length) {
        bins[b] += mag[y * w + x];
        counts[b] += 1;
      }
    }
  }
  // Natural spectra fall off roughly as 1/f, so weight each radial mean by r^1.5 (whitening) before taking the
  // peak. Low-frequency illumination then no longer wins over a ridge-like ring.
  const mean = (b: number) => (counts[b] ? bins[b] / counts[b] : 0);
  let best = -1;
  let bestV = 0;
  for (let b = 6; b < bins.length - 1; b++) {
    const smooth = (mean(b - 1) + mean(b) + mean(b + 1)) / 3;
    const score = smooth * Math.pow(b, 1.5);
    if (score > bestV) {
      bestV = score;
      best = b;
    }
  }
  if (best < 0) return { period: Infinity, radius: 0 };
  return { period: n / best, radius: best };
}
