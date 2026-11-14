/* The GATTACA idea as a classical DIP pipeline, simplified for teaching and for the browser:
 * grayscale -> CLAHE -> denoise -> orientation field -> ridge frequency (PPRP) -> Gabor ridge enhancement
 * -> threshold -> thinning -> minutiae. Runs on procedurally generated sample images only. */
import { grayFrom, imageFromMat, matFromImage, newImage, tracker, type CV, type Mat, type RGBAImage, type Tracker } from './core';
import { dominantPeriod, findMinutiae, type Minutia, gaborKernel, gaussianNoise, mulberry32, normalizeKernel, zhangSuen } from './dsp';
import { Raster } from './draw';
import { forwardDFT, magnitudeOf } from '../demos/frequency';

export interface RidgeOptions {
  /** Simulated distance: the image is shrunk by this factor (INTER_AREA), like a camera moving away. */
  downscale: number;
  /** Sensor noise sigma (gray levels) added after shrinking. */
  noise: number;
  /** Ridges are darker than valleys (typical of real photos and of the synthetic sample). */
  darkRidges: boolean;
  threshold: 'otsu' | 'adaptive';
  claheClip: number;
  seed?: number;
}

export const defaultRidgeOptions: RidgeOptions = { downscale: 1, noise: 4, darkRidges: true, threshold: 'otsu', claheClip: 2.5, seed: 7 };

export interface Stage {
  id: string;
  title: string;
  /** Glossary term ids this stage maps to. */
  termIds: string[];
  image: RGBAImage;
  blurb: string;
  /** The OpenCV call(s) behind the stage (JavaScript). */
  call: string;
}

export interface Exposure {
  level: 'none' | 'low' | 'partial' | 'high';
  label: string;
  detail: string;
}

export interface RidgeResult {
  stages: Stage[];
  width: number;
  height: number;
  /** Pixels per ridge period measured on this (possibly shrunk) image. */
  pprp: number;
  endings: number;
  bifurcations: number;
  /** Minutiae in the coordinates of the original (un-shrunk) image. */
  minutiae: Minutia[];
  /** Fraction of the image with coherent ridge flow. */
  coverage: number;
  exposure: Exposure;
}

/**
 * Indicative exposure from PPRP. Thresholds come from GATTACA's own *synthetic-print* study (identification
 * stayed >= 95% down to about 3.9 px per ridge period and fell to 50% near 2.9; Nyquist is 2).
 * They are not a claim about real people or real devices.
 */
export function exposureFromPprp(pprp: number): Exposure {
  if (!Number.isFinite(pprp) || pprp < 2) return { level: 'none', label: 'Below the Nyquist limit', detail: 'Fewer than 2 pixels per ridge period: the ridge pattern is not sampled at all, so it cannot be recovered.' };
  if (pprp < 2.9) return { level: 'low', label: 'Mostly unrecoverable', detail: 'Just above Nyquist. In the GATTACA synthetic study identification fell below 50% in this range.' };
  if (pprp < 3.9) return { level: 'partial', label: 'Partly recoverable', detail: 'Between about 2.9 and 3.9 px per ridge: partial ridge detail (50% to 95% identification in the synthetic study).' };
  return { level: 'high', label: 'Recoverable', detail: 'About 3.9 or more pixels per ridge period: ridge structure is well sampled (at least 95% identification in the synthetic study).' };
}

const f32 = (cv: CV, t: Tracker, m: Mat, scale = 1): Mat => {
  const o = t.mat();
  m.convertTo(o, cv.CV_32F, scale);
  return o;
};

/** Zero local mean, unit local contrast. */
function localNormalize(cv: CV, t: Tracker, g: Mat, sigma: number): Mat {
  const mean = t.mat();
  cv.GaussianBlur(g, mean, new cv.Size(0, 0), sigma, sigma, cv.BORDER_REFLECT);
  const d = t.mat();
  cv.subtract(g, mean, d);
  const d2 = t.mat();
  cv.multiply(d, d, d2);
  const v = t.mat();
  cv.GaussianBlur(d2, v, new cv.Size(0, 0), sigma, sigma, cv.BORDER_REFLECT);
  const sd = t.mat();
  cv.sqrt(v, sd);
  const eps = t.add(new cv.Mat(g.rows, g.cols, cv.CV_32F, new cv.Scalar(0.01)));
  cv.add(sd, eps, sd);
  const out = t.mat();
  cv.divide(d, sd, out);
  return out;
}

function toGray8(cv: CV, t: Tracker, m: Mat): Mat {
  const n = t.mat();
  cv.normalize(m, n, 0, 255, cv.NORM_MINMAX);
  const u = t.mat();
  n.convertTo(u, cv.CV_8U);
  return u;
}

export function runRidgePipeline(cv: CV, src: RGBAImage, opts: RidgeOptions = defaultRidgeOptions): RidgeResult {
  const t = tracker(cv);
  const stages: Stage[] = [];
  try {
    // ---- 0. acquisition: grayscale, simulated distance (shrink), sensor noise
    const rgba = matFromImage(cv, t, src);
    const gray0 = grayFrom(cv, t, rgba);
    const s = Math.max(1, opts.downscale);
    const w = Math.max(24, Math.round(gray0.cols / s));
    const h = Math.max(24, Math.round(gray0.rows / s));
    const gray = t.mat();
    if (s > 1) cv.resize(gray0, gray, new cv.Size(w, h), 0, 0, cv.INTER_AREA);
    else gray0.copyTo(gray);
    if (opts.noise > 0) {
      const rand = mulberry32(opts.seed ?? 7);
      const d = gray.data as Uint8Array;
      for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, d[i] + gaussianNoise(rand) * opts.noise));
    }
    stages.push({
      id: 'gray',
      title: '1. Grayscale (acquisition)',
      termIds: ['grayscale-image', 'sampling', 'spatial-resolution'],
      image: imageFromMat(cv, gray),
      blurb: s > 1
        ? `The scene was sampled with ${s}x fewer pixels (like a camera ${s}x farther away) and some sensor noise was added. Resolution is fixed here: no later step can add detail that was never sampled.`
        : 'Color is discarded: ridges are a pattern of brightness, so one channel is enough. The sampling grid already decides how much ridge detail can exist.',
      call: 'cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);\ncv.resize(gray, small, new cv.Size(w / s, h / s), 0, 0, cv.INTER_AREA);   // simulated distance',
    });

    // ---- 1. CLAHE
    const eq = t.mat();
    const clahe = t.add(new cv.CLAHE(opts.claheClip, new cv.Size(8, 8)));
    clahe.apply(gray, eq);
    stages.push({
      id: 'clahe',
      title: '2. CLAHE (illumination normalization)',
      termIds: ['clahe', 'histogram-equalization', 'contrast-stretching'],
      image: imageFromMat(cv, eq),
      blurb: 'Uneven lighting would hide ridges in dark or bright patches. Contrast-limited adaptive histogram equalization equalizes small tiles so ridge contrast becomes similar everywhere, without exploding noise.',
      call: `const clahe = new cv.CLAHE(${opts.claheClip}, new cv.Size(8, 8));\nclahe.apply(gray, eq);`,
    });

    // ---- 2. denoise
    const den = t.mat();
    cv.bilateralFilter(eq, den, 5, 20, 3, cv.BORDER_DEFAULT);
    stages.push({
      id: 'denoise',
      title: '3. Denoise (bilateral filter)',
      termIds: ['bilateral-filter', 'gaussian-noise', 'non-local-means'],
      image: imageFromMat(cv, den),
      blurb: 'CLAHE amplifies noise too. A bilateral filter smooths flat areas but keeps the sharp ridge edges (it weights neighbors by intensity similarity as well as distance). GATTACA can also use non-local means.',
      call: 'cv.bilateralFilter(eq, den, 5, 20, 3);',
    });

    // ---- 3. ridge frequency: PPRP from the spectrum
    const sp = forwardDFT(cv, t, den);
    const mag = magnitudeOf(sp.complex.data32F as Float32Array, sp.w, sp.h);
    const per = dominantPeriod(mag, sp.w, sp.h);
    const pprp = Number.isFinite(per.period) ? per.period : 2;
    const logMag = new Float32Array(mag.length);
    for (let i = 0; i < mag.length; i++) logMag[i] = Math.log1p(mag[i]);
    const spec = new Raster(sp.w, sp.h);
    {
      let mn = Infinity;
      let mx = -Infinity;
      for (const v of logMag) {
        mn = Math.min(mn, v);
        mx = Math.max(mx, v);
      }
      const hx = Math.floor(sp.w / 2);
      const hy = Math.floor(sp.h / 2);
      for (let y = 0; y < sp.h; y++)
        for (let x = 0; x < sp.w; x++) {
          const v = Math.round(((logMag[y * sp.w + x] - mn) / (mx - mn || 1)) * 255);
          spec.set((x + hx) % sp.w, (y + hy) % sp.h, [v, v, v]);
        }
      spec.ring(sp.w / 2, sp.h / 2, per.radius, [255, 60, 60]);
      spec.ring(sp.w / 2, sp.h / 2, Math.min(sp.w, sp.h) / 2 - 1, [60, 160, 255]); // Nyquist radius (period = 2 px)
    }
    stages.push({
      id: 'pprp',
      title: '4. Ridge frequency: pixels per ridge period (PPRP)',
      termIds: ['fourier-spectrum-phase', 'pprp', 'nyquist-criterion', 'aliasing'],
      image: spec.img,
      blurb: `The 2-D spectrum shows a ring at the ridge frequency (red circle). Its radius gives the ridge period: ${Number.isFinite(per.period) ? pprp.toFixed(2) : 'n/a'} pixels per ridge (PPRP). The blue circle is the Nyquist limit at 2 pixels per period. A ring near or beyond the blue circle means the ridges are barely sampled.`,
      call: 'cv.dft(complexI, complexI);\ncv.magnitude(re, im, mag);   // radial peak of |F| -> frequency f -> PPRP = 1 / f',
    });

    // ---- 4. orientation field (structure tensor)
    const g = f32(cv, t, den, 1 / 255);
    const norm = localNormalize(cv, t, g, Math.max(3, 1.5 * pprp));
    const gx = t.mat();
    const gy = t.mat();
    const gs = t.mat();
    cv.GaussianBlur(norm, gs, new cv.Size(0, 0), 1, 1);
    cv.Sobel(gs, gx, cv.CV_32F, 1, 0, 3);
    cv.Sobel(gs, gy, cv.CV_32F, 0, 1, 3);
    const sig = Math.max(2, Math.min(8, 0.8 * pprp));
    const sq = (a: Mat, b: Mat): Mat => {
      const p = t.mat();
      cv.multiply(a, b, p);
      const o = t.mat();
      cv.GaussianBlur(p, o, new cv.Size(0, 0), sig, sig, cv.BORDER_REFLECT);
      return o;
    };
    const Gxx = sq(gx, gx);
    const Gyy = sq(gy, gy);
    const Gxy = sq(gx, gy);
    const cxx = t.mat();
    const cyy = t.mat();
    const cxy = t.mat();
    cv.GaussianBlur(Gxx, cxx, new cv.Size(0, 0), sig, sig);
    cv.GaussianBlur(Gyy, cyy, new cv.Size(0, 0), sig, sig);
    cv.GaussianBlur(Gxy, cxy, new cv.Size(0, 0), sig, sig);
    const a = Gxx.data32F as Float32Array;
    const b = Gyy.data32F as Float32Array;
    const c = Gxy.data32F as Float32Array;
    const wa = cxx.data32F as Float32Array;
    const wb = cyy.data32F as Float32Array;
    const wc = cxy.data32F as Float32Array;
    const n = w * h;
    const phi = new Float32Array(n); // gradient (ridge-normal) direction in [0, pi)
    const coh = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      phi[i] = (0.5 * Math.atan2(2 * c[i], a[i] - b[i]) + Math.PI) % Math.PI;
      coh[i] = Math.sqrt((wa[i] - wb[i]) ** 2 + 4 * wc[i] ** 2) / (wa[i] + wb[i] + 1e-9);
    }
    // ridge mask: coherent flow, opened, eroded by one period to avoid border artifacts
    const mask8 = t.mat(h, w, cv.CV_8UC1);
    const md = mask8.data as Uint8Array;
    for (let i = 0; i < n; i++) md[i] = coh[i] > 0.4 ? 255 : 0;
    const ke = t.add(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5)));
    cv.morphologyEx(mask8, mask8, cv.MORPH_OPEN, ke);
    const margin = Math.max(3, Math.round(1.2 * pprp));
    const km = t.add(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(2 * margin + 1, 2 * margin + 1)));
    const maskIn = t.mat();
    cv.erode(mask8, maskIn, km);
    const maskd = maskIn.data as Uint8Array;
    let cover = 0;
    for (let i = 0; i < n; i++) if (maskd[i]) cover++;
    // draw orientation lines (ridge direction = normal + 90 degrees)
    const ori = new Raster(w, h);
    ori.img.data.set(imageFromMat(cv, den).data);
    const step = Math.max(8, Math.round(2 * pprp));
    for (let y = step; y < h - step / 2; y += step)
      for (let x = step; x < w - step / 2; x += step) {
        const i = y * w + x;
        if (!mask8.data[i]) continue;
        const ang = phi[i] + Math.PI / 2;
        const L = step * 0.42;
        ori.line(x - Math.cos(ang) * L, y - Math.sin(ang) * L, x + Math.cos(ang) * L, y + Math.sin(ang) * L, [255, 70, 50]);
      }
    stages.push({
      id: 'orientation',
      title: '5. Orientation field (structure tensor)',
      termIds: ['image-gradient', 'sobel-operator', 'gaussian-smoothing', 'ridge-analysis'],
      image: ori.img,
      blurb: `Sobel gives the gradient (gx, gy) at every pixel. Gradients are noisy and point in opposite directions on the two sides of a ridge, so their products gx*gx, gy*gy and gx*gy are averaged with a Gaussian (sigma ${sig.toFixed(1)}) before the angle is computed. Red segments show the ridge direction where the flow is coherent; ${((100 * cover) / n).toFixed(0)}% of the image qualifies.`,
      call: 'cv.Sobel(norm, gx, cv.CV_32F, 1, 0, 3);\ncv.Sobel(norm, gy, cv.CV_32F, 0, 1, 3);\ncv.GaussianBlur(gx.mul(gx), Gxx, ksize0, sigma);   // same for Gyy, Gxy\n// theta = 0.5 * atan2(2*Gxy, Gxx - Gyy)',
    });

    // ---- 5. Gabor bank, per-pixel orientation selection
    const N = 16;
    const lambda = Math.max(3, pprp);
    const gSigma = 0.5 * lambda;
    const gGamma = 0.7;
    const ksz = Math.min(25, (Math.ceil((3 * gSigma) / gGamma) * 2 + 1) | 1);
    const out = new Float32Array(n);
    const polarity = opts.darkRidges ? Math.PI : 0; // psi = pi flips a dark ridge into a positive response
    for (let i = 0; i < N; i++) {
      const k = normalizeKernel(gaborKernel(ksz, gSigma, (i * Math.PI) / N, lambda, gGamma, polarity));
      const km2 = t.add(cv.matFromArray(ksz, ksz, cv.CV_32F, Array.from(k)));
      const resp = t.mat();
      cv.filter2D(norm, resp, cv.CV_32F, km2, new cv.Point(-1, -1), 0, cv.BORDER_REFLECT);
      const d = resp.data32F as Float32Array;
      for (let j = 0; j < n; j++) {
        const bin = Math.round((phi[j] / Math.PI) * N) % N;
        if (bin === i) out[j] = d[j];
      }
    }
    const enh = t.add(cv.matFromArray(h, w, cv.CV_32F, Array.from(out)));
    const enh8 = toGray8(cv, t, enh);
    stages.push({
      id: 'gabor',
      title: '6. Gabor ridge enhancement',
      termIds: ['gabor-filter', 'band-pass-filter', 'convolution'],
      image: imageFromMat(cv, enh8),
      blurb: `Each pixel is filtered by a Gabor kernel tuned to its own ridge orientation and to the measured period (lambda = ${lambda.toFixed(1)} px). The kernel is a cosine wave under a Gaussian envelope, so it keeps ridge-like structure at that scale and averages away noise along the ridge. If the PPRP is too small there is nothing for it to lock on to.`,
      call: `// ${N} oriented kernels, lambda = ${lambda.toFixed(1)}, sigma = ${gSigma.toFixed(1)}  (cv.getGaborKernel in Python)\ncv.filter2D(norm, resp_i, cv.CV_32F, kernel_i);   // then pick resp_i at each pixel's own orientation bin`,
    });

    // ---- 6. threshold
    const bin = t.mat();
    if (opts.threshold === 'adaptive') cv.adaptiveThreshold(enh8, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, Math.max(3, Math.round(3 * pprp)) | 1, -2);
    else cv.threshold(enh8, bin, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    // remove ridge fragments shorter than about one ridge period (specks); a fixed 3x3 opening would erase thin ridges
    {
      const labels = t.mat();
      const stats = t.mat();
      const cents = t.mat();
      const nl = cv.connectedComponentsWithStats(bin, labels, stats, cents, 8, cv.CV_32S);
      const sd = stats.data32S as Int32Array;
      const ld = labels.data32S as Int32Array;
      const minArea = Math.max(6, pprp * pprp);
      const keepL = new Uint8Array(nl);
      for (let i = 1; i < nl; i++) keepL[i] = sd[i * 5 + cv.CC_STAT_AREA] >= minArea ? 1 : 0;
      const bdat = bin.data as Uint8Array;
      for (let i = 0; i < n; i++) if (bdat[i] && !keepL[ld[i]]) bdat[i] = 0;
    }
    stages.push({
      id: 'threshold',
      title: `7. Binarize (${opts.threshold === 'otsu' ? "Otsu's method" : 'adaptive threshold'})`,
      termIds: ['otsu-thresholding', 'adaptive-thresholding', 'connected-components'],
      image: imageFromMat(cv, bin),
      blurb: 'The enhanced image is split into ridge (white) and valley (black). Otsu picks the threshold that best separates the two histogram modes; the adaptive version uses a local threshold. Fragments shorter than about one ridge period are removed as specks (connected-component analysis).',
      call: opts.threshold === 'otsu' ? 'cv.threshold(enh8, bin, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);\ncv.connectedComponentsWithStats(bin, labels, stats, cents, 8);   // drop components smaller than ~one ridge period' : 'cv.adaptiveThreshold(enh8, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, -2);',
    });

    // ---- 7. thinning
    const b01 = new Uint8Array(n);
    const bd = bin.data as Uint8Array;
    for (let i = 0; i < n; i++) b01[i] = bd[i] && maskd[i] ? 1 : 0;
    const skel = zhangSuen(b01, w, h);
    const sk = newImage(w, h);
    for (let i = 0; i < n; i++) {
      const v = skel[i] ? 255 : 0;
      sk.data[i * 4] = sk.data[i * 4 + 1] = sk.data[i * 4 + 2] = v;
      sk.data[i * 4 + 3] = 255;
    }
    stages.push({
      id: 'thinning',
      title: '8. Thinning (skeleton)',
      termIds: ['skeleton-thinning', 'erosion', 'hit-or-miss'],
      image: sk,
      blurb: 'Ridges are thinned to one-pixel lines without breaking them (Zhang-Suen). Only the coherent ridge region from step 5 is kept. OpenCV.js has no ximgproc.thinning, so this stage runs the same algorithm in TypeScript.',
      call: '// Python: cv2.ximgproc.thinning(bin, thinningType=cv2.ximgproc.THINNING_ZHANGSUEN)\n// OpenCV.js: Zhang-Suen implemented in TypeScript',
    });

    // ---- 8. minutiae
    const mins = findMinutiae(skel, w, h, margin, maskd);
    const over = new Raster(w, h);
    over.img.data.set(imageFromMat(cv, eq).data);
    for (let i = 0; i < n; i++) if (skel[i]) over.set(i % w, Math.floor(i / w), [255, 70, 50]);
    let endings = 0;
    let bifs = 0;
    for (const m of mins) {
      if (m.type === 'ending') {
        endings++;
        over.ring(m.x, m.y, 4, [40, 230, 255]);
      } else {
        bifs++;
        over.ring(m.x, m.y, 4, [255, 230, 40]);
      }
    }
    stages.push({
      id: 'minutiae',
      title: '9. Minutiae (endings and bifurcations)',
      termIds: ['minutiae', 'neighborhood-8', 'biometrics'],
      image: over.img,
      blurb: `On the skeleton, count the 8-neighbors: one neighbor means a ridge ending (cyan), three means a bifurcation (yellow). Found ${endings} endings and ${bifs} bifurcations. Points near the border and outside coherent ridge flow are discarded. More resolution and less blur give more reliable minutiae; this count is what the privacy question is really about.`,
      call: '// crossing number CN = 0.5 * sum |P_i - P_{i+1}| over the 8 neighbors of each skeleton pixel\n// CN = 1: ending, CN = 3: bifurcation',
    });

    const sx = gray0.cols / w;
    const minutiae = mins.map((m) => ({ x: m.x * sx, y: m.y * sx, type: m.type }));
    return { stages, width: w, height: h, pprp, endings, bifurcations: bifs, minutiae, coverage: cover / n, exposure: exposureFromPprp(pprp) };
  } finally {
    t.free();
  }
}

/**
 * Greedy one-to-one match of found minutiae against a reference set (e.g. the full-resolution result, which plays
 * the role of the paired ground truth in the GATTACA study). Returns how many reference minutiae were recovered.
 */
export function matchMinutiae(reference: Minutia[], found: Minutia[], tol: number): { matched: number; spurious: number; missed: number; recovered: number } {
  const used = new Set<number>();
  let matched = 0;
  for (const r of reference) {
    let best = -1;
    let bd = tol;
    found.forEach((f, i) => {
      if (used.has(i)) return;
      const d = Math.hypot(f.x - r.x, f.y - r.y);
      if (d <= bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      matched++;
    }
  }
  return { matched, spurious: found.length - matched, missed: reference.length - matched, recovered: reference.length ? matched / reference.length : 0 };
}
