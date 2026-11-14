import { grayFrom, imageFromFloat, imageFromMat, matFromImage, newImage, num, psnrFromMse, fmtDb, rgbFrom, bool, tracker, type Mat } from '../cv/core';
import { gaussianNoise, haarLevel, ihaarLevel, mulberry32 } from '../cv/dsp';
import { Raster } from '../cv/draw';
import type { Demo } from './types';

export const multiresDemos: Demo[] = [
  {
    id: 'pyramid',
    title: 'Gaussian and Laplacian pyramids',
    group: 'Wavelets and multiresolution',
    summary: 'Blur-and-downsample levels, and the detail lost at each step.',
    termIds: ['gaussian-pyramid', 'laplacian-pyramid', 'multiresolution-analysis'],
    sample: 'scene',
    params: [{ type: 'range', key: 'level', label: 'Level', min: 1, max: 4, step: 1, default: 2 }],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const level = num(p, 'level');
        const gauss: Mat[] = [rgb];
        for (let i = 0; i < level + 1; i++) {
          const d = t.mat();
          cv.pyrDown(gauss[i], d, new cv.Size(0, 0), cv.BORDER_DEFAULT);
          gauss.push(d);
        }
        const g = gauss[level];
        const up = t.mat();
        cv.pyrUp(gauss[level + 1], up, new cv.Size(g.cols, g.rows), cv.BORDER_DEFAULT);
        const g32 = t.mat();
        const u32 = t.mat();
        g.convertTo(g32, cv.CV_32F);
        up.convertTo(u32, cv.CV_32F);
        const lap = t.mat();
        cv.subtract(g32, u32, lap);
        const vis = t.mat();
        lap.convertTo(vis, cv.CV_8U, 2, 128);
        return {
          outputs: [{ label: `Gaussian level ${level}: ${g.cols} x ${g.rows}`, image: imageFromMat(cv, g) }, { label: `Laplacian level ${level} (gray = 0, x2 contrast)`, image: imageFromMat(cv, vis) }],
          stats: [{ label: 'Gaussian level sizes', value: gauss.slice(0, level + 2).map((m) => `${m.cols}x${m.rows}`).join(' > ') }],
          caption: 'Each Gaussian level is blurred then halved in both directions. The Laplacian level is what blurring and downsampling threw away: edges and fine detail (band-pass). Adding the levels back reconstructs the original exactly.',
          call: `cv.pyrDown(level0, level1);   // Gaussian blur + drop every 2nd row/col\ncv.pyrUp(level${level + 1}, up);\ncv.subtract(level${level}, up, laplacian${level});`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'haar',
    title: 'Haar wavelet decomposition',
    group: 'Wavelets and multiresolution',
    summary: 'Average and difference of pixel pairs; threshold the details and reconstruct.',
    termIds: ['haar-wavelet', 'wavelet-transform', 'subband-coding'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'levels', label: 'Decomposition levels', min: 1, max: 4, step: 1, default: 2 },
      { type: 'range', key: 'thr', label: 'Zero detail coefficients below', min: 0, max: 60, step: 1, default: 10 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const levels = num(p, 'levels');
        const unit = 2 ** levels;
        const w = gray.cols - (gray.cols % unit);
        const h = gray.rows - (gray.rows % unit);
        const a = new Float32Array(w * h);
        const g = gray.data as Uint8Array;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = g[y * gray.cols + x];
        const orig = Float32Array.from(a);
        let cw = w;
        let ch = h;
        for (let l = 0; l < levels; l++) {
          haarLevel(a, w, cw, ch);
          cw /= 2;
          ch /= 2;
        }
        const thr = num(p, 'thr');
        const mosaic = new Float32Array(w * h);
        const b = Float32Array.from(a);
        let kept = 0;
        let total = 0;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const inLL = x < w / unit && y < h / unit;
            const v = a[y * w + x];
            if (inLL) mosaic[y * w + x] = v / unit;
            else {
              mosaic[y * w + x] = Math.min(255, Math.abs(v) * 4);
              total++;
              if (Math.abs(v) < thr) b[y * w + x] = 0;
              else kept++;
            }
          }
        cw = w / unit;
        ch = h / unit;
        for (let l = 0; l < levels; l++) {
          cw *= 2;
          ch *= 2;
          ihaarLevel(b, w, cw, ch);
        }
        let mse = 0;
        for (let i = 0; i < w * h; i++) {
          const d = Math.max(0, Math.min(255, b[i])) - orig[i];
          mse += d * d;
        }
        mse /= w * h;
        return {
          outputs: [
            { label: 'Coefficients: approximation (top-left) and details (x4 contrast)', image: imageFromFloat(mosaic, w, h, 0, 255) },
            { label: 'Reconstruction after thresholding the details', image: imageFromFloat(b.map((v) => Math.max(0, Math.min(255, v))), w, h, 0, 255) },
          ],
          stats: [
            { label: 'Detail coefficients kept', value: `${kept} of ${total} (${((100 * kept) / Math.max(1, total)).toFixed(1)}%)` },
            { label: 'PSNR of reconstruction', value: fmtDb(psnrFromMse(mse)) },
          ],
          caption: 'Each level replaces pixel pairs by their average (low-pass, kept at the top-left) and difference (high-pass: horizontal, vertical and diagonal detail). Most detail coefficients are near zero, so many can be dropped with little visible loss: the idea behind wavelet compression and denoising.',
          call: '// per level, rows then columns:  low = (a + b) / sqrt(2),  high = (a - b) / sqrt(2)\n// (OpenCV core has no wavelet transform; this demo uses a TypeScript Haar implementation.)\n// Python: pywt.wavedec2(img, "haar", level=2)',
        };
      } finally {
        t.free();
      }
    },
  },
];

export const motionDemos: Demo[] = [
  {
    id: 'optical-flow',
    title: 'Optical flow (Lucas-Kanade) and ECC alignment',
    group: 'Video and motion',
    summary: 'Track corners between two synthetic frames and recover the motion.',
    termIds: ['optical-flow', 'image-stabilization-ecc', 'image-registration', 'shi-tomasi-corner'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'dx', label: 'True shift x (px)', min: -20, max: 20, step: 0.5, default: 6 },
      { type: 'range', key: 'dy', label: 'True shift y (px)', min: -20, max: 20, step: 0.5, default: -3 },
      { type: 'range', key: 'rot', label: 'True rotation (degrees)', min: -5, max: 5, step: 0.25, default: 0 },
      { type: 'range', key: 'pts', label: 'Points to track', min: 10, max: 150, step: 5, default: 60 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const g1 = t.mat();
        cv.cvtColor(rgb, g1, cv.COLOR_RGB2GRAY);
        const dx = num(p, 'dx');
        const dy = num(p, 'dy');
        const M = t.add(cv.getRotationMatrix2D(new cv.Point(g1.cols / 2, g1.rows / 2), num(p, 'rot'), 1));
        const md = M.data64F as Float64Array;
        md[2] += dx;
        md[5] += dy;
        const g2 = t.mat();
        cv.warpAffine(g1, g2, M, new cv.Size(g1.cols, g1.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
        // choose well-trackable corners (Shi-Tomasi score + non-maximum suppression)
        const g32 = t.mat();
        g1.convertTo(g32, cv.CV_32F, 1 / 255);
        const R = t.mat();
        cv.cornerMinEigenVal(g32, R, 5, 3, cv.BORDER_DEFAULT);
        const dil = t.mat();
        cv.dilate(R, dil, t.add(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15))));
        const rd = R.data32F as Float32Array;
        const dd = dil.data32F as Float32Array;
        const cand: Array<[number, number, number]> = [];
        const margin = 30;
        for (let y = margin; y < R.rows - margin; y++) for (let x = margin; x < R.cols - margin; x++) {
          const i = y * R.cols + x;
          if (rd[i] > 0 && rd[i] === dd[i]) cand.push([rd[i], x, y]);
        }
        cand.sort((a, b) => b[0] - a[0]);
        const pick = cand.slice(0, num(p, 'pts'));
        const out = t.mat();
        cv.cvtColor(g2, out, cv.COLOR_GRAY2RGB);
        let tracked = 0;
        let mx = 0;
        let my = 0;
        if (pick.length) {
          const p0 = t.add(cv.matFromArray(pick.length, 1, cv.CV_32FC2, pick.flatMap(([, x, y]) => [x, y])));
          const p1 = t.mat();
          const status = t.mat();
          const err = t.mat();
          const crit = new cv.TermCriteria(cv.TermCriteria_EPS | cv.TermCriteria_COUNT, 20, 0.03);
          cv.calcOpticalFlowPyrLK(g1, g2, p0, p1, status, err, new cv.Size(21, 21), 3, crit);
          const a = p0.data32F as Float32Array;
          const b = p1.data32F as Float32Array;
          const s = status.data as Uint8Array;
          for (let i = 0; i < pick.length; i++) {
            if (!s[i]) continue;
            tracked++;
            mx += b[2 * i] - a[2 * i];
            my += b[2 * i + 1] - a[2 * i + 1];
            cv.line(out, new cv.Point(a[2 * i], a[2 * i + 1]), new cv.Point(b[2 * i], b[2 * i + 1]), new cv.Scalar(255, 40, 40), 2);
            cv.circle(out, new cv.Point(b[2 * i], b[2 * i + 1]), 3, new cv.Scalar(40, 255, 120), -1);
          }
          if (tracked) {
            mx /= tracked;
            my /= tracked;
          }
        }
        let ecc = 'not available in this build';
        try {
          const warp = cv.Mat.eye(2, 3, cv.CV_32F);
          const crit = new cv.TermCriteria(cv.TermCriteria_EPS | cv.TermCriteria_COUNT, 60, 1e-5);
          const gs1 = t.mat();
          const gs2 = t.mat();
          cv.GaussianBlur(g1, gs1, new cv.Size(5, 5), 1.2);
          cv.GaussianBlur(g2, gs2, new cv.Size(5, 5), 1.2);
          cv.findTransformECC(gs1, gs2, warp, cv.MOTION_AFFINE, crit, new cv.Mat(), 5);
          const w = warp.data32F as Float32Array;
          ecc = `tx = ${w[2].toFixed(2)}, ty = ${w[5].toFixed(2)}`;
          warp.delete();
        } catch {
          /* ECC is optional; ignore failures */
        }
        return {
          outputs: [{ label: 'Frame 2 with tracks (red = motion, green = end point)', image: imageFromMat(cv, out) }],
          stats: [
            { label: 'Points tracked', value: `${tracked} of ${pick.length}` },
            { label: 'Mean LK motion (px)', value: `(${mx.toFixed(2)}, ${my.toFixed(2)})` },
            { label: 'True shift (px)', value: `(${dx}, ${dy})` },
            { label: 'ECC affine estimate', value: ecc },
          ],
          caption: 'Frame 2 is frame 1 moved by a known shift. Lucas-Kanade follows each corner by matching the small window around it, using an image pyramid for larger motion. ECC aligns the whole frame at once. Both should recover the true motion; this is how GATTACA aligns video frames before fusing them.',
          call: `cv.calcOpticalFlowPyrLK(prevGray, nextGray, p0, p1, status, err, new cv.Size(21, 21), 3, criteria);\ncv.findTransformECC(prevGray, nextGray, warp, cv.MOTION_AFFINE, criteria, new cv.Mat(), 5);`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'frame-diff',
    title: 'Frame differencing',
    group: 'Video and motion',
    summary: 'Detect a moving disc by subtracting consecutive frames.',
    termIds: ['frame-differencing', 'background-subtraction'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'speed', label: 'Object motion per frame (px)', min: 2, max: 60, step: 1, default: 20 },
      { type: 'range', key: 'thr', label: 'Difference threshold T', min: 2, max: 120, step: 1, default: 30 },
      { type: 'range', key: 'noise', label: 'Camera noise sigma', min: 0, max: 25, step: 1, default: 6 },
      { type: 'checkbox', key: 'blur', label: 'Smooth frames first (Gaussian)', default: true },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const base = grayFrom(cv, t, matFromImage(cv, t, src));
        const speed = num(p, 'speed');
        const r = Math.max(14, Math.round(base.cols / 12));
        const y = Math.round(base.rows * 0.6);
        const x1 = Math.round(base.cols * 0.25);
        const make = (cx: number, seed: number) => {
          const f = t.mat();
          base.copyTo(f);
          cv.circle(f, new cv.Point(cx, y), r, new cv.Scalar(255), -1);
          cv.circle(f, new cv.Point(cx, y), Math.round(r * 0.45), new cv.Scalar(60), -1);
          const rand = mulberry32(seed);
          const d = f.data as Uint8Array;
          const sg = num(p, 'noise');
          for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, d[i] + gaussianNoise(rand) * sg));
          return f;
        };
        const f1 = make(x1, 1);
        const f2 = make(x1 + speed, 2);
        let a = f1;
        let b = f2;
        if (bool(p, 'blur')) {
          a = t.mat();
          b = t.mat();
          cv.GaussianBlur(f1, a, new cv.Size(5, 5), 1.5);
          cv.GaussianBlur(f2, b, new cv.Size(5, 5), 1.5);
        }
        const diff = t.mat();
        cv.absdiff(a, b, diff);
        const mask = t.mat();
        cv.threshold(diff, mask, num(p, 'thr'), 255, cv.THRESH_BINARY);
        const k = t.add(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)));
        const clean = t.mat();
        cv.morphologyEx(mask, clean, cv.MORPH_OPEN, k);
        const px = cv.countNonZero(clean);
        return {
          outputs: [
            { label: 'Frame t-1', image: imageFromMat(cv, f1) },
            { label: 'Frame t', image: imageFromMat(cv, f2) },
            { label: '|frame t - frame t-1|', image: imageFromMat(cv, diff) },
            { label: 'Thresholded and cleaned (white = moving)', image: imageFromMat(cv, clean) },
          ],
          stats: [{ label: 'Pixels flagged as moving', value: String(px) }],
          caption: 'Only the pixels that changed between the frames light up: the leading and trailing edges of the disc. Camera noise also creates differences, so smooth first, raise T and clean the mask with an opening. The disc interior (uniform) mostly cancels out.',
          call: `cv.absdiff(frame, prevFrame, diff);\ncv.threshold(diff, mask, ${num(p, 'thr')}, 255, cv.THRESH_BINARY);\ncv.morphologyEx(mask, clean, cv.MORPH_OPEN, kernel);`,
        };
      } finally {
        t.free();
      }
    },
  },
];

export { newImage, Raster };
