import { grayFrom, imageFromFloat, imageFromMat, matFromImage, mse8, num, psnrFromMse, fmtDb, ssimMat, str, bool, tracker, type CV, type Mat, type Tracker } from '../cv/core';
import { dominantPeriod, fftshift, freqIndex, gaussianNoise, mulberry32, nonLocalMeans, poisson } from '../cv/dsp';
import { addGaussian, addSaltPepper } from './filtering';
import { oddSize, type Demo } from './types';

export interface Spectrum {
  complex: Mat; // CV_32FC2, in-place DFT of the padded image
  w: number; // padded width
  h: number; // padded height
  w0: number;
  h0: number;
}

/** Pad an 8-bit gray Mat to an optimal DFT size and take its forward DFT. */
export function forwardDFT(cv: CV, t: Tracker, gray: Mat): Spectrum {
  const h0 = gray.rows;
  const w0 = gray.cols;
  const h = cv.getOptimalDFTSize(h0);
  const w = cv.getOptimalDFTSize(w0);
  const padded = t.mat();
  cv.copyMakeBorder(gray, padded, 0, h - h0, 0, w - w0, cv.BORDER_REPLICATE, new cv.Scalar(0));
  const f = t.mat();
  padded.convertTo(f, cv.CV_32F);
  return dftFromReal(cv, t, f, w0, h0);
}

export function dftFromReal(cv: CV, t: Tracker, f32: Mat, w0 = f32.cols, h0 = f32.rows): Spectrum {
  const zeros = t.add(cv.Mat.zeros(f32.rows, f32.cols, cv.CV_32F));
  const planes = t.add(new cv.MatVector());
  planes.push_back(f32);
  planes.push_back(zeros);
  const complex = t.mat();
  cv.merge(planes, complex);
  cv.dft(complex, complex);
  return { complex, w: f32.cols, h: f32.rows, w0, h0 };
}

/** Inverse DFT of interleaved complex data; returns the real part as a Float32Array (w*h). */
export function inverseDFT(cv: CV, t: Tracker, data: Float32Array, w: number, h: number): Float32Array {
  const c = t.mat(h, w, cv.CV_32FC2);
  (c.data32F as Float32Array).set(data);
  const out = t.mat();
  cv.dft(c, out, cv.DFT_INVERSE | cv.DFT_SCALE);
  const o = out.data32F as Float32Array;
  const real = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) real[i] = o[2 * i];
  return real;
}

export const magnitudeOf = (c: Float32Array, w: number, h: number): Float32Array => {
  const m = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = Math.hypot(c[2 * i], c[2 * i + 1]);
  return m;
};

const logSpectrumImage = (mag: Float32Array, w: number, h: number) => {
  const l = new Float32Array(mag.length);
  for (let i = 0; i < mag.length; i++) l[i] = Math.log1p(mag[i]);
  return imageFromFloat(fftshift(l, w, h), w, h);
};

const cropToImage = (real: Float32Array, w: number, w0: number, h0: number, lo = 0, hi = 255) => {
  const crop = new Float32Array(w0 * h0);
  for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) crop[y * w0 + x] = real[y * w + x];
  return imageFromFloat(crop, w0, h0, lo, hi);
};

type FilterKind = 'ideal' | 'butterworth' | 'gaussian';

/** Low-pass transfer function value at radius D (in frequency-bin units) for cutoff D0. */
export function lowPassGain(kind: FilterKind, D: number, D0: number, order: number): number {
  if (kind === 'ideal') return D <= D0 ? 1 : 0;
  if (kind === 'butterworth') return 1 / (1 + Math.pow(D / D0, 2 * order));
  return Math.exp(-(D * D) / (2 * D0 * D0));
}

/** Build H(u,v) in unshifted layout. highPass = 1 - lowpass; emphasis adds the original back (a + b*Hhp). */
function buildH(w: number, h: number, kind: FilterKind, D0: number, order: number, high: boolean, emphasis: boolean): Float32Array {
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const D = Math.hypot(freqIndex(x, w), freqIndex(y, h));
      let g = lowPassGain(kind, D, D0, order);
      if (high) {
        g = 1 - g;
        if (emphasis) g = 0.5 + 1.5 * g;
      }
      H[y * w + x] = g;
    }
  return H;
}

function freqFilterDemo(id: string, high: boolean): Demo {
  return {
    id,
    title: high ? 'High-pass filtering in the frequency domain' : 'Low-pass filtering in the frequency domain',
    group: 'Frequency domain',
    summary: high ? 'H = 1 - H_lowpass. Sharpen or extract edges.' : 'Ideal, Butterworth and Gaussian low-pass filters.',
    termIds: high ? ['high-pass-filter', 'frequency-domain-filtering', 'ideal-filter'] : ['low-pass-filter', 'ideal-filter', 'butterworth-filter', 'gaussian-low-pass'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'kind', label: 'Filter', options: [['ideal', 'Ideal'], ['butterworth', 'Butterworth'], ['gaussian', 'Gaussian']], default: high ? 'gaussian' : 'ideal' },
      { type: 'range', key: 'cut', label: 'Cutoff D0 (% of Nyquist radius)', min: 2, max: 100, step: 1, default: high ? 12 : 20 },
      { type: 'range', key: 'order', label: 'Butterworth order n', min: 1, max: 10, step: 1, default: 2 },
      ...(high ? [{ type: 'checkbox' as const, key: 'emph', label: 'High-frequency emphasis (keep the original too)', default: true }] : []),
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const sp = forwardDFT(cv, t, gray);
        const n = Math.min(sp.w, sp.h);
        const D0 = Math.max(1, (num(p, 'cut') / 100) * (n / 2));
        const kind = str(p, 'kind') as FilterKind;
        const order = num(p, 'order');
        const emph = high && bool(p, 'emph');
        const H = buildH(sp.w, sp.h, kind, D0, order, high, emph);
        const data = Float32Array.from(sp.complex.data32F as Float32Array);
        for (let i = 0; i < sp.w * sp.h; i++) {
          data[2 * i] *= H[i];
          data[2 * i + 1] *= H[i];
        }
        const real = inverseDFT(cv, t, data, sp.w, sp.h);
        const out = high && !emph ? cropToImage(real, sp.w, sp.w0, sp.h0, -64, 64) : cropToImage(real, sp.w, sp.w0, sp.h0);
        const filt = new Float32Array(sp.w * sp.h);
        for (let i = 0; i < filt.length; i++) filt[i] = Math.hypot(data[2 * i], data[2 * i + 1]);
        return {
          outputs: [
            { label: high ? 'High-pass result' : 'Low-pass result', image: out },
            { label: 'Transfer function H(u,v) (center = zero frequency)', image: imageFromFloat(fftshift(H, sp.w, sp.h), sp.w, sp.h, 0, Math.max(1, ...H.subarray(0, 1000))) },
            { label: 'Filtered spectrum (log)', image: logSpectrumImage(filt, sp.w, sp.h) },
          ],
          stats: [{ label: 'Cutoff D0', value: `${D0.toFixed(1)} bins` }, { label: 'Padded size', value: `${sp.w} x ${sp.h}` }],
          caption: kind === 'ideal'
            ? 'The ideal filter cuts frequencies abruptly, which shows up as ringing (ripples) beside edges. Try Gaussian: the same cutoff with no ringing.'
            : 'The image is multiplied by H(u,v) in the frequency domain and transformed back. A lower cutoff keeps less of the high-frequency detail.',
          call: `cv.dft(complexI, complexI);                   // forward DFT of the padded image\n// multiply re/im by H(u,v):  ${kind}, D0 = ${D0.toFixed(1)}${kind === 'butterworth' ? `, n = ${order}` : ''}${high ? ' (high-pass = 1 - H_lp)' : ''}\ncv.dft(filtered, out, cv.DFT_INVERSE | cv.DFT_SCALE);`,
        };
      } finally {
        t.free();
      }
    },
  };
}

export const frequencyDemos: Demo[] = [
  {
    id: 'fft-spectrum',
    title: 'Fourier magnitude spectrum and phase',
    group: 'Frequency domain',
    summary: 'See which spatial frequencies an image contains.',
    termIds: ['fourier-spectrum-phase', 'dft', 'fft', 'fourier-transform'],
    sample: 'fingerprint',
    params: [
      { type: 'checkbox', key: 'log', label: 'Log scale (log(1 + |F|))', default: true },
      { type: 'checkbox', key: 'phaseOnly', label: 'Reconstruct from phase only (magnitude = 1)', default: false },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const sp = forwardDFT(cv, t, gray);
        const data = sp.complex.data32F as Float32Array;
        const mag = magnitudeOf(data, sp.w, sp.h);
        const disp = new Float32Array(mag.length);
        for (let i = 0; i < mag.length; i++) disp[i] = bool(p, 'log') ? Math.log1p(mag[i]) : mag[i];
        const shown = fftshift(disp, sp.w, sp.h);
        const phase = new Float32Array(mag.length);
        for (let i = 0; i < phase.length; i++) phase[i] = Math.atan2(data[2 * i + 1], data[2 * i]);
        const outputs = [
          { label: 'Magnitude spectrum (center = zero frequency)', image: imageFromFloat(shown, sp.w, sp.h, 0, bool(p, 'log') ? undefined : Math.max(...mag) * 0.01) },
          { label: 'Phase angle', image: imageFromFloat(fftshift(phase, sp.w, sp.h), sp.w, sp.h, -Math.PI, Math.PI) },
        ];
        if (bool(p, 'phaseOnly')) {
          const unit = Float32Array.from(data);
          for (let i = 0; i < sp.w * sp.h; i++) {
            const m = mag[i] || 1;
            unit[2 * i] /= m;
            unit[2 * i + 1] /= m;
          }
          const real = inverseDFT(cv, t, unit, sp.w, sp.h);
          outputs.push({ label: 'Phase-only reconstruction', image: imageFromFloat(real.subarray(0, sp.w * sp.h), sp.w, sp.h) });
        }
        const per = dominantPeriod(mag, sp.w, sp.h);
        return {
          outputs,
          stats: [{ label: 'Dominant period (periodic textures only)', value: Number.isFinite(per.period) ? `${per.period.toFixed(2)} px per cycle` : 'n/a' }],
          caption: 'Bright points far from the center are strong fine-scale patterns. On the ridge sample the ring is the ridge frequency. The phase image looks like noise but carries where things are: rebuild from phase alone and the edges survive.',
          call: 'cv.merge(planes, complexI);\ncv.dft(complexI, complexI);\ncv.split(complexI, planes);\ncv.magnitude(planes.get(0), planes.get(1), mag);\ncv.log(mag + 1, mag);   // then swap quadrants (fftshift)',
        };
      } finally {
        t.free();
      }
    },
  },
  freqFilterDemo('freq-lowpass', false),
  freqFilterDemo('freq-highpass', true),
];

// ---------------------------- Restoration ----------------------------

type Noise = 'gaussian' | 'saltpepper' | 'speckle' | 'poisson';

export function addNoiseGray(cv: CV, gray: Mat, kind: Noise, amount: number, seed = 5): Mat {
  const out = new cv.Mat();
  gray.copyTo(out);
  const d = out.data as Uint8Array;
  const rand = mulberry32(seed);
  if (kind === 'gaussian') addGaussian(out, amount);
  else if (kind === 'saltpepper') addSaltPepper(out, amount / 100);
  else if (kind === 'speckle') for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, d[i] + d[i] * gaussianNoise(rand) * (amount / 100)));
  else {
    const scale = Math.max(0.02, amount / 25); // smaller scale = fewer photons = more noise
    for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, poisson(d[i] * scale, rand) / scale));
  }
  return out;
}

function degrade(w: number, h: number, kind: string, size: number): Float32Array {
  // PSF in wrap-around layout (centred at the origin), normalised to sum 1
  const psf = new Float32Array(w * h);
  let sum = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = freqIndex(x, w);
      const fy = freqIndex(y, h);
      let v = 0;
      if (kind === 'motion') v = fy === 0 && Math.abs(fx) <= size / 2 ? 1 : 0;
      else v = Math.exp(-(fx * fx + fy * fy) / (2 * size * size * 0.25));
      psf[y * w + x] = v;
      sum += v;
    }
  for (let i = 0; i < psf.length; i++) psf[i] /= sum;
  return psf;
}

export const restorationDemos: Demo[] = [
  {
    id: 'noise-denoise',
    title: 'Add noise, then denoise (with PSNR and SSIM)',
    group: 'Image restoration',
    summary: 'Compare mean, Gaussian, median, bilateral and non-local means filters on different noise models.',
    termIds: ['gaussian-noise', 'salt-and-pepper-noise', 'speckle-noise', 'poisson-noise', 'non-local-means', 'psnr', 'ssim', 'mse'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'noise', label: 'Noise model', options: [['gaussian', 'Gaussian (sigma)'], ['saltpepper', 'Salt-and-pepper (%)'], ['speckle', 'Speckle (% of intensity)'], ['poisson', 'Poisson (shot) noise']], default: 'gaussian' },
      { type: 'range', key: 'amount', label: 'Noise amount', min: 1, max: 60, step: 1, default: 20 },
      { type: 'select', key: 'method', label: 'Denoising filter', options: [['none', 'None'], ['mean', 'Mean (box)'], ['gaussian', 'Gaussian'], ['median', 'Median'], ['bilateral', 'Bilateral'], ['nlm', 'Non-local means (slow)']], default: 'median' },
      { type: 'range', key: 'k', label: 'Filter size / strength', min: 3, max: 11, step: 2, default: 5 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        // Work at <= 200 px so non-local means stays fast in the browser.
        const m0 = matFromImage(cv, t, src);
        const m = t.mat();
        const s = Math.min(1, 200 / Math.max(m0.cols, m0.rows));
        cv.resize(m0, m, new cv.Size(Math.round(m0.cols * s), Math.round(m0.rows * s)), 0, 0, cv.INTER_AREA);
        const gray = grayFrom(cv, t, m);
        const noisy = t.add(addNoiseGray(cv, gray, str(p, 'noise') as Noise, num(p, 'amount')));
        const k = oddSize(num(p, 'k'));
        const method = str(p, 'method');
        const den = t.mat();
        let call: string;
        if (method === 'mean') {
          cv.blur(noisy, den, new cv.Size(k, k));
          call = `cv.blur(noisy, dst, new cv.Size(${k}, ${k}));`;
        } else if (method === 'gaussian') {
          cv.GaussianBlur(noisy, den, new cv.Size(k, k), 0, 0, cv.BORDER_DEFAULT);
          call = `cv.GaussianBlur(noisy, dst, new cv.Size(${k}, ${k}), 0, 0);`;
        } else if (method === 'median') {
          cv.medianBlur(noisy, den, k);
          call = `cv.medianBlur(noisy, dst, ${k});`;
        } else if (method === 'bilateral') {
          cv.bilateralFilter(noisy, den, k, 50, 5, cv.BORDER_DEFAULT);
          call = `cv.bilateralFilter(noisy, dst, ${k}, 50, 5);`;
        } else if (method === 'nlm') {
          const r = nonLocalMeans(noisy.data, noisy.cols, noisy.rows, 4 + k * 3, 3, 9);
          den.create(noisy.rows, noisy.cols, cv.CV_8UC1);
          (den.data as Uint8Array).set(r);
          call = '// cv.fastNlMeansDenoising(noisy, dst, h, 7, 21) is not in the OpenCV.js build,\n// so this demo runs a TypeScript non-local-means implementation.';
        } else {
          noisy.copyTo(den);
          call = '// no denoising';
        }
        const mseN = mse8(noisy.data, gray.data);
        const mseD = mse8(den.data, gray.data);
        const ssN = ssimMat(cv, t, gray, noisy);
        const ssD = ssimMat(cv, t, gray, den);
        return {
          outputs: [
            { label: 'Original (gray, reference)', image: imageFromMat(cv, gray) },
            { label: 'Noisy', image: imageFromMat(cv, noisy) },
            { label: 'Denoised', image: imageFromMat(cv, den) },
          ],
          stats: [
            { label: 'PSNR noisy -> denoised', value: `${fmtDb(psnrFromMse(mseN))} -> ${fmtDb(psnrFromMse(mseD))}` },
            { label: 'SSIM noisy -> denoised', value: `${ssN.toFixed(3)} -> ${ssD.toFixed(3)}` },
            { label: 'MSE noisy -> denoised', value: `${mseN.toFixed(1)} -> ${mseD.toFixed(1)}` },
          ],
          caption: 'Higher PSNR and SSIM mean closer to the clean original. The best filter depends on the noise: median wins on salt-and-pepper, averaging or non-local means on Gaussian, and bilateral keeps edges.',
          call,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'wiener',
    title: 'Deblurring: inverse filter vs. Wiener filter',
    group: 'Image restoration',
    summary: 'Blur with a known PSF, add noise, then restore in the frequency domain.',
    termIds: ['wiener-filtering', 'inverse-filtering', 'blur-psf', 'degradation-model'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'psf', label: 'Blur (PSF)', options: [['gaussian', 'Gaussian'], ['motion', 'Horizontal motion']], default: 'motion' },
      { type: 'range', key: 'size', label: 'Blur size (px)', min: 2, max: 24, step: 1, default: 12 },
      { type: 'range', key: 'noise', label: 'Noise sigma (gray levels)', min: 0, max: 15, step: 0.5, default: 2 },
      { type: 'select', key: 'method', label: 'Restoration', options: [['inverse', 'Inverse filter G / H'], ['wiener', 'Wiener filter']], default: 'wiener' },
      { type: 'range', key: 'k', label: 'Wiener K = 10^-x   (x)', min: 0.5, max: 5, step: 0.1, default: 2.5 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const m0 = matFromImage(cv, t, src);
        const m = t.mat();
        const s = Math.min(1, 256 / Math.max(m0.cols, m0.rows));
        cv.resize(m0, m, new cv.Size(Math.round(m0.cols * s), Math.round(m0.rows * s)), 0, 0, cv.INTER_AREA);
        const gray = grayFrom(cv, t, m);
        const sp = forwardDFT(cv, t, gray);
        const { w, h } = sp;
        const F = sp.complex.data32F as Float32Array;
        const psf = degrade(w, h, str(p, 'psf'), num(p, 'size'));
        const Hs = dftFromReal(cv, t, t.add(cv.matFromArray(h, w, cv.CV_32F, Array.from(psf))));
        const H = Hs.complex.data32F as Float32Array;
        // degrade: G = F * H, then spatial noise
        const G = new Float32Array(w * h * 2);
        for (let i = 0; i < w * h; i++) {
          G[2 * i] = F[2 * i] * H[2 * i] - F[2 * i + 1] * H[2 * i + 1];
          G[2 * i + 1] = F[2 * i] * H[2 * i + 1] + F[2 * i + 1] * H[2 * i];
        }
        const blurred = inverseDFT(cv, t, G, w, h);
        const rand = mulberry32(9);
        const sigma = num(p, 'noise');
        const g = new Float32Array(w * h);
        for (let i = 0; i < g.length; i++) g[i] = sigma > 0 ? Math.max(0, Math.min(255, Math.round(blurred[i] + gaussianNoise(rand) * sigma))) : blurred[i];
        const gm = t.add(cv.matFromArray(h, w, cv.CV_32F, Array.from(g)));
        const Gs = dftFromReal(cv, t, gm);
        const Gd = Gs.complex.data32F as Float32Array;
        const K = Math.pow(10, -num(p, 'k'));
        const inv = str(p, 'method') === 'inverse';
        const R = new Float32Array(w * h * 2);
        for (let i = 0; i < w * h; i++) {
          const hr = H[2 * i];
          const hi = H[2 * i + 1];
          const mag2 = hr * hr + hi * hi;
          let cr: number;
          let ci: number;
          if (inv) {
            const den = Math.max(mag2, 1e-4); // |H| floored at 0.01 so we never divide by ~0
            cr = (hr / den);
            ci = (-hi / den);
          } else {
            cr = hr / (mag2 + K);
            ci = -hi / (mag2 + K);
          }
          R[2 * i] = Gd[2 * i] * cr - Gd[2 * i + 1] * ci;
          R[2 * i + 1] = Gd[2 * i] * ci + Gd[2 * i + 1] * cr;
        }
        const restored = inverseDFT(cv, t, R, w, h);
        const toGray = (a: Float32Array) => {
          const o = new Float32Array(sp.w0 * sp.h0);
          for (let y = 0; y < sp.h0; y++) for (let x = 0; x < sp.w0; x++) o[y * sp.w0 + x] = Math.max(0, Math.min(255, a[y * w + x]));
          return o;
        };
        const orig = Float32Array.from(gray.data as Uint8Array);
        const deg = toGray(g);
        const res = toGray(restored);
        const mseOf = (a: Float32Array) => {
          let s2 = 0;
          for (let i = 0; i < a.length; i++) s2 += (a[i] - orig[i]) ** 2;
          return s2 / a.length;
        };
        return {
          outputs: [
            { label: 'Original (gray)', image: imageFromFloat(orig, sp.w0, sp.h0, 0, 255) },
            { label: 'Degraded: blur + noise', image: imageFromFloat(deg, sp.w0, sp.h0, 0, 255) },
            { label: inv ? 'Inverse filter result' : 'Wiener result', image: imageFromFloat(res, sp.w0, sp.h0, 0, 255) },
          ],
          stats: [
            { label: 'PSNR degraded -> restored', value: `${fmtDb(psnrFromMse(mseOf(deg)))} -> ${fmtDb(psnrFromMse(mseOf(res)))}` },
            { label: 'Wiener K', value: inv ? 'n/a (inverse)' : K.toExponential(1) },
          ],
          caption: inv
            ? 'Dividing by H undoes the blur exactly when there is no noise. With even a little noise, frequencies where H is near zero are amplified enormously and the result is garbage. Raise the noise to see it.'
            : 'The Wiener filter behaves like the inverse where H is strong and backs off where noise would be amplified. Too small a K leaves noise; too large leaves blur.',
          call: `cv.dft(g, G);   // G = DFT(degraded)\n// ${inv ? 'F_hat = G / H' : `F_hat = G * conj(H) / (|H|^2 + K),  K = ${K.toExponential(1)}`}\ncv.dft(F_hat, out, cv.DFT_INVERSE | cv.DFT_SCALE);`,
        };
      } finally {
        t.free();
      }
    },
  },
];
