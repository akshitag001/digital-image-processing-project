import { grayFrom, imageFromFloat, imageFromMat, matFromImage, mse8, newImage, num, psnrFromMse, fmtDb, rgbFrom, ssimMat, str, tracker, toU8, type RGBAImage } from '../cv/core';
import { dct8, gaussianNoise, idct8, mulberry32, scaledQuantTable, ZIGZAG } from '../cv/dsp';
import { Raster } from '../cv/draw';
import type { Demo } from './types';

const mseRGB = (a: RGBAImage, b: RGBAImage): number => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const d = a.data[i + c] - b.data[i + c];
      s += d * d;
      n++;
    }
  return s / n;
};

/** Block-DCT quantisation round trip on one gray channel. Returns decoded gray, estimated bits and coefficient stats. */
function dctRoundTrip(gray: Uint8Array | Uint8ClampedArray, w: number, h: number, q: number[] | null, keep: number) {
  const out = new Uint8ClampedArray(w * h);
  const bw = Math.floor(w / 8);
  const bh = Math.floor(h / 8);
  const symbols: Map<number, number>[] = Array.from({ length: 64 }, () => new Map());
  const energy = new Float64Array(64);
  const block = new Float64Array(64);
  out.set(gray);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block[y * 8 + x] = gray[(by * 8 + y) * w + bx * 8 + x] - 128;
      const c = dct8(block);
      for (let k = 0; k < 64; k++) {
        const pos = ZIGZAG[k];
        energy[pos] += Math.abs(c[pos]);
        if (k >= keep) c[pos] = 0;
        else if (q) {
          const v = Math.round(c[pos] / q[pos]);
          symbols[k].set(v, (symbols[k].get(v) ?? 0) + 1);
          c[pos] = v * q[pos];
        }
      }
      const r = idct8(c);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[(by * 8 + y) * w + bx * 8 + x] = r[y * 8 + x] + 128;
    }
  // zeroth-order entropy of the quantised coefficients per zigzag position (a lower bound for the coded size)
  let bits = 0;
  const nBlocks = bw * bh;
  for (let k = 0; k < 64; k++) {
    for (const cnt of symbols[k].values()) bits -= cnt * Math.log2(cnt / nBlocks);
  }
  return { out, bits, energy: Array.from(energy, (e) => e / Math.max(1, nBlocks)) };
}

export const compressionDemos: Demo[] = [
  {
    id: 'jpeg-quality',
    title: 'JPEG quality vs. file size and PSNR',
    group: 'Image compression',
    summary: 'Re-encode as JPEG at a chosen quality and measure the damage.',
    termIds: ['jpeg-compression', 'psnr', 'compression-ratio', 'lossy-compression', 'ssim'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'quality', label: 'JPEG quality', min: 1, max: 100, step: 1, default: 25 },
      { type: 'range', key: 'amp', label: 'Difference amplification', min: 1, max: 30, step: 1, default: 8 },
    ],
    async run(cv, src, p) {
      const q = num(p, 'quality');
      const amp = num(p, 'amp');
      const w = src.width;
      const h = src.height;
      let decoded: RGBAImage;
      let bytes: number;
      let source = 'browser JPEG encoder (canvas.toBlob)';
      if (typeof document !== 'undefined' && typeof createImageBitmap !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(src.data), w, h), 0, 0);
        const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', q / 100));
        if (!blob) throw new Error('This browser could not encode JPEG.');
        bytes = blob.size;
        const bmp = await createImageBitmap(blob);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(bmp, 0, 0);
        const id = ctx.getImageData(0, 0, w, h);
        decoded = { width: w, height: h, data: id.data };
      } else {
        // Fallback (tests / no canvas): luma-only DCT + quantization simulation with the standard tables.
        const t = tracker(cv);
        try {
          const gray = grayFrom(cv, t, matFromImage(cv, t, src));
          const r = dctRoundTrip(gray.data, w, h, scaledQuantTable(q), 64);
          bytes = Math.ceil(r.bits / 8);
          const img = newImage(w, h);
          for (let i = 0; i < w * h; i++) img.data.fill(r.out[i], i * 4, i * 4 + 3), (img.data[i * 4 + 3] = 255);
          decoded = img;
          source = 'simulated luma-only JPEG (entropy estimate)';
        } finally {
          t.free();
        }
      }
      const t = tracker(cv);
      try {
        const a = matFromImage(cv, t, src);
        const b = matFromImage(cv, t, decoded);
        const ga = grayFrom(cv, t, a);
        const gb = grayFrom(cv, t, b);
        const diff = newImage(w, h);
        for (let i = 0; i < w * h; i++)
          for (let c = 0; c < 3; c++) diff.data[i * 4 + c] = Math.min(255, Math.abs(src.data[i * 4 + c] - decoded.data[i * 4 + c]) * amp);
        for (let i = 3; i < diff.data.length; i += 4) diff.data[i] = 255;
        const raw = w * h * 3;
        const mse = mseRGB(src, decoded);
        return {
          outputs: [{ label: `Decoded JPEG, quality ${q}`, image: decoded }, { label: `Difference x${amp}`, image: diff }],
          stats: [
            { label: 'File size', value: `${(bytes / 1024).toFixed(1)} KB (raw RGB ${(raw / 1024).toFixed(0)} KB)` },
            { label: 'Compression ratio', value: `${(raw / bytes).toFixed(1)} : 1` },
            { label: 'PSNR (RGB)', value: fmtDb(psnrFromMse(mse)) },
            { label: 'SSIM (gray)', value: ssimMat(cv, t, ga, gb).toFixed(3) },
            { label: 'Encoder', value: source },
          ],
          caption: 'Lower quality means larger quantization steps in each 8 x 8 DCT block: files shrink, PSNR falls, and the difference image shows blocking and ringing, mostly at edges and fine texture. That fine texture is exactly what fingerprint ridges are made of.',
          call: `canvas.toBlob(cb, "image/jpeg", ${(q / 100).toFixed(2)});   // OpenCV.js has no cv.imencode\n// Python: ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, ${q}])\ncv.absdiff(original, decoded, diff);`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'dct-blocks',
    title: 'Block DCT: keep only the first coefficients',
    group: 'Image compression',
    summary: 'Energy compaction: reconstruct from a few low-frequency 8 x 8 DCT coefficients.',
    termIds: ['dct', 'transform-coding', 'jpeg-compression'],
    sample: 'scene',
    params: [{ type: 'range', key: 'keep', label: 'Coefficients kept per block (zigzag order)', min: 1, max: 64, step: 1, default: 10 }],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const w = gray.cols - (gray.cols % 8);
        const h = gray.rows - (gray.rows % 8);
        const crop = t.mat();
        gray.roi(new cv.Rect(0, 0, w, h)).copyTo(crop);
        const keep = num(p, 'keep');
        const r = dctRoundTrip(crop.data, w, h, null, keep);
        const rec = newImage(w, h);
        for (let i = 0; i < w * h; i++) rec.data.fill(r.out[i], i * 4, i * 4 + 3), (rec.data[i * 4 + 3] = 255);
        const mse = mse8(r.out, crop.data);
        const logE = r.energy.map((e) => Math.log1p(e));
        const mx = Math.max(...logE);
        const map = new Raster(8 * 22, 8 * 22);
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            const k = ZIGZAG.indexOf(y * 8 + x);
            const v = Math.round((logE[y * 8 + x] / mx) * 255);
            map.rect(x * 22, y * 22, 21, 21, k < keep ? [v, v, 255 - Math.round(v * 0.3)] : [v * 0.5, v * 0.5, v * 0.5]);
          }
        return {
          outputs: [{ label: `Reconstruction from ${keep}/64 coefficients`, image: rec }, { label: 'Average |coefficient| per frequency (bright = big; blue = kept)', image: map.img }],
          stats: [{ label: 'PSNR', value: fmtDb(psnrFromMse(mse)) }, { label: 'Coefficients kept', value: `${((100 * keep) / 64).toFixed(0)}%` }],
          caption: 'Most of the energy sits in the top-left (low-frequency) coefficients, so dropping the rest changes the picture little. This energy compaction is what JPEG exploits. Keep very few and 8 x 8 blocks become visible.',
          call: '// per 8x8 block:  C = cv.dct(block - 128);  zero all but the first N in zigzag order;  block = cv.idct(C) + 128\n// (cv.dct is not in the OpenCV.js build; this demo uses a TypeScript DCT.)',
        };
      } finally {
        t.free();
      }
    },
  },
];

// ---------------------------- Features ----------------------------

export const featureDemos: Demo[] = [
  {
    id: 'harris',
    title: 'Corner detection (Harris and Shi-Tomasi)',
    group: 'Feature extraction',
    summary: 'Find points where intensity changes in every direction.',
    termIds: ['harris-corner', 'shi-tomasi-corner'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'method', label: 'Detector', options: [['harris', 'Harris'], ['shi', 'Shi-Tomasi (min eigenvalue)']], default: 'harris' },
      { type: 'range', key: 'block', label: 'Block size', min: 2, max: 9, step: 1, default: 3 },
      { type: 'range', key: 'k', label: 'Harris k', min: 0.02, max: 0.12, step: 0.01, default: 0.04 },
      { type: 'range', key: 'thr', label: 'Threshold (% of strongest)', min: 1, max: 60, step: 1, default: 10 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const gray = t.mat();
        cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
        const g32 = t.mat();
        gray.convertTo(g32, cv.CV_32F, 1 / 255);
        const R = t.mat();
        const block = num(p, 'block');
        const harris = str(p, 'method') === 'harris';
        if (harris) cv.cornerHarris(g32, R, block, 3, num(p, 'k'), cv.BORDER_DEFAULT);
        else cv.cornerMinEigenVal(g32, R, block, 3, cv.BORDER_DEFAULT);
        const mm = cv.minMaxLoc(R);
        const th = (num(p, 'thr') / 100) * mm.maxVal;
        const dil = t.mat();
        cv.dilate(R, dil, t.add(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9))));
        const rd = R.data32F as Float32Array;
        const dd = dil.data32F as Float32Array;
        const out = t.mat();
        rgb.copyTo(out);
        let n = 0;
        for (let y = 0; y < R.rows; y++)
          for (let x = 0; x < R.cols; x++) {
            const i = y * R.cols + x;
            if (rd[i] > th && rd[i] === dd[i] && n < 400) {
              cv.circle(out, new cv.Point(x, y), 5, new cv.Scalar(255, 30, 30), 2);
              n++;
            }
          }
        const resp = t.mat();
        const pos = t.mat();
        cv.threshold(R, pos, 0, 0, cv.THRESH_TOZERO);
        cv.GaussianBlur(pos, resp, new cv.Size(0, 0), 1);
        return {
          outputs: [{ label: `Corners found: ${n}`, image: imageFromMat(cv, out) }, { label: 'Corner response R', image: imageFromMat(cv, toU8(cv, t, resp)) }],
          stats: [{ label: 'Corners', value: String(n) }],
          caption: 'Corners respond strongly in both directions; edges respond in only one, and flat areas in none. The red circles are local maxima of the response above the threshold. Lower the threshold to accept weaker corners.',
          call: harris
            ? `cv.cornerHarris(gray32, R, ${block}, 3, ${num(p, 'k')}, cv.BORDER_DEFAULT);\n// threshold at ${num(p, 'thr')}% of max(R), keep local maxima`
            : `cv.cornerMinEigenVal(gray32, R, ${block}, 3, cv.BORDER_DEFAULT);   // Shi-Tomasi score\n// cv.goodFeaturesToTrack is not in the OpenCV.js build, so local maxima are picked in TypeScript`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'orb',
    title: 'ORB keypoints and matching',
    group: 'Feature extraction',
    summary: 'Detect keypoints, describe them with 256 bits and match a rotated copy.',
    termIds: ['orb-features', 'feature-matching', 'feature-descriptor'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'n', label: 'Max features', min: 50, max: 800, step: 25, default: 300 },
      { type: 'range', key: 'angle', label: 'Rotate second image (degrees)', min: -90, max: 90, step: 1, default: 25 },
      { type: 'range', key: 'scale', label: 'Scale second image', min: 0.6, max: 1.3, step: 0.05, default: 0.9 },
      { type: 'range', key: 'show', label: 'Matches drawn', min: 5, max: 100, step: 5, default: 30 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const gray = t.mat();
        cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
        const M = t.add(cv.getRotationMatrix2D(new cv.Point(gray.cols / 2, gray.rows / 2), num(p, 'angle'), num(p, 'scale')));
        const gray2 = t.mat();
        cv.warpAffine(gray, gray2, M, new cv.Size(gray.cols, gray.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
        const rgb2 = t.mat();
        cv.warpAffine(rgb, rgb2, M, new cv.Size(gray.cols, gray.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
        const orb = t.add(new cv.ORB(num(p, 'n')));
        const k1 = t.add(new cv.KeyPointVector());
        const k2 = t.add(new cv.KeyPointVector());
        const d1 = t.mat();
        const d2 = t.mat();
        orb.detectAndCompute(gray, t.mat(), k1, d1);
        orb.detectAndCompute(gray2, t.mat(), k2, d2);
        const bf = t.add(new cv.BFMatcher(cv.NORM_HAMMING, true));
        const matches = t.add(new cv.DMatchVector());
        if (d1.rows > 0 && d2.rows > 0) bf.match(d1, d2, matches);
        const list: Array<{ q: number; tr: number; d: number }> = [];
        for (let i = 0; i < matches.size(); i++) {
          const m = matches.get(i);
          list.push({ q: m.queryIdx, tr: m.trainIdx, d: m.distance });
        }
        list.sort((a, b) => a.d - b.d);
        const shown = list.slice(0, num(p, 'show'));
        const a = imageFromMat(cv, rgb);
        const b = imageFromMat(cv, rgb2);
        const W = a.width + b.width;
        const side = new Raster(W, a.height);
        side.img.data.set(new Uint8ClampedArray(W * a.height * 4).fill(255));
        for (let y = 0; y < a.height; y++) {
          side.img.data.set(a.data.subarray(y * a.width * 4, (y + 1) * a.width * 4), y * W * 4);
          side.img.data.set(b.data.subarray(y * b.width * 4, (y + 1) * b.width * 4), (y * W + a.width) * 4);
        }
        const kp = (v: { get: (i: number) => { pt: { x: number; y: number } } }, i: number) => v.get(i).pt;
        for (const m of shown) {
          const pa = kp(k1, m.q);
          const pb = kp(k2, m.tr);
          side.line(pa.x, pa.y, pb.x + a.width, pb.y, [255, 60, 60]);
          side.ring(pa.x, pa.y, 3, [40, 220, 255]);
          side.ring(pb.x + a.width, pb.y, 3, [40, 220, 255]);
        }
        const meanD = shown.length ? shown.reduce((s, m) => s + m.d, 0) / shown.length : 0;
        return {
          outputs: [{ label: 'Matches between the image and a rotated/scaled copy', image: side.img }],
          stats: [
            { label: 'Keypoints (image / copy)', value: `${k1.size()} / ${k2.size()}` },
            { label: 'Cross-checked matches', value: String(list.length) },
            { label: 'Mean Hamming distance (best shown)', value: meanD.toFixed(1) },
          ],
          caption: 'ORB finds corner keypoints, gives each an orientation and a 256-bit binary descriptor. Because the descriptor is rotated to the keypoint orientation, the same corner is recognised in the rotated copy. Matching is the Hamming distance (count of differing bits).',
          call: `const orb = new cv.ORB(${num(p, 'n')});\norb.detectAndCompute(gray, new cv.Mat(), kp1, desc1);\norb.detectAndCompute(gray2, new cv.Mat(), kp2, desc2);\nconst bf = new cv.BFMatcher(cv.NORM_HAMMING, true);   // crossCheck\nbf.match(desc1, desc2, matches);`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'template-match',
    title: 'Template matching',
    group: 'Feature extraction',
    summary: 'Slide a patch over a noisy image and find the best normalized correlation.',
    termIds: ['template-matching', 'correlation'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'x', label: 'Template x (%)', min: 5, max: 85, step: 1, default: 62 },
      { type: 'range', key: 'y', label: 'Template y (%)', min: 5, max: 85, step: 1, default: 15 },
      { type: 'range', key: 'size', label: 'Template size (px)', min: 16, max: 100, step: 2, default: 48 },
      { type: 'range', key: 'noise', label: 'Noise sigma added to the search image', min: 0, max: 60, step: 1, default: 25 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const gray = t.mat();
        cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
        const s = Math.min(num(p, 'size'), gray.cols - 2, gray.rows - 2);
        const x0 = Math.min(gray.cols - s, Math.round((num(p, 'x') / 100) * gray.cols));
        const y0 = Math.min(gray.rows - s, Math.round((num(p, 'y') / 100) * gray.rows));
        const templ = t.mat();
        gray.roi(new cv.Rect(x0, y0, s, s)).copyTo(templ);
        const noisy = t.mat();
        gray.copyTo(noisy);
        const rand = mulberry32(3);
        const d = noisy.data as Uint8Array;
        const sg = num(p, 'noise');
        for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, d[i] + gaussianNoise(rand) * sg));
        const res = t.mat();
        cv.matchTemplate(noisy, templ, res, cv.TM_CCOEFF_NORMED);
        const mm = cv.minMaxLoc(res);
        const out = t.mat();
        cv.cvtColor(noisy, out, cv.COLOR_GRAY2RGB);
        cv.rectangle(out, new cv.Point(mm.maxLoc.x, mm.maxLoc.y), new cv.Point(mm.maxLoc.x + s, mm.maxLoc.y + s), new cv.Scalar(255, 40, 40), 2);
        const resImg = imageFromFloat(res.data32F as Float32Array, res.cols, res.rows, -0.2, 1);
        return {
          outputs: [{ label: 'Best match (red box) in the noisy image', image: imageFromMat(cv, out) }, { label: 'Template', image: imageFromMat(cv, templ) }, { label: 'Correlation map (bright = good match)', image: resImg }],
          stats: [
            { label: 'Best score (TM_CCOEFF_NORMED)', value: mm.maxVal.toFixed(3) },
            { label: 'Found at / true position', value: `(${mm.maxLoc.x}, ${mm.maxLoc.y}) / (${x0}, ${y0})` },
          ],
          caption: 'The template is slid across the image and compared at every position with normalized correlation (1 = perfect). The peak of the map is the match. More noise lowers the peak but a distinctive template still wins.',
          call: 'cv.matchTemplate(noisy, templ, result, cv.TM_CCOEFF_NORMED);\nconst { maxVal, maxLoc } = cv.minMaxLoc(result);',
        };
      } finally {
        t.free();
      }
    },
  },
];
