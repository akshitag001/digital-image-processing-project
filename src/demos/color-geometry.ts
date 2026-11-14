import { imageFromMat, matFromImage, num, rgbFrom, str, bool, tracker, type Mat } from '../cv/core';
import type { Demo } from './types';

export const colorDemos: Demo[] = [
  {
    id: 'color-channels',
    title: 'Color-space channel splitter',
    group: 'Color image processing',
    summary: 'Look at the three channels of RGB, HSV, Lab or YCrCb.',
    termIds: ['rgb-color-model', 'hsv-hsi', 'lab-color', 'ycbcr', 'grayscale-image'],
    sample: 'colors',
    params: [{ type: 'select', key: 'space', label: 'Color space', options: [['rgb', 'RGB'], ['hsv', 'HSV'], ['lab', 'CIE Lab'], ['ycrcb', 'YCrCb']], default: 'hsv' }],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const space = str(p, 'space');
        const conv = t.mat();
        const code = { rgb: null, hsv: cv.COLOR_RGB2HSV, lab: cv.COLOR_RGB2Lab, ycrcb: cv.COLOR_RGB2YCrCb }[space] as number | null;
        const names = { rgb: ['R', 'G', 'B'], hsv: ['H (hue)', 'S (saturation)', 'V (value)'], lab: ['L* (lightness)', 'a* (green-red)', 'b* (blue-yellow)'], ycrcb: ['Y (luma)', 'Cr (red diff)', 'Cb (blue diff)'] }[space]!;
        if (code === null) rgb.copyTo(conv);
        else cv.cvtColor(rgb, conv, code);
        const planes = t.add(new cv.MatVector());
        cv.split(conv, planes);
        const outputs = names.map((label, i) => {
          const pl = planes.get(i);
          let view = pl;
          if (space === 'hsv' && i === 0) {
            view = new cv.Mat();
            cv.convertScaleAbs(pl, view, 255 / 179, 0);
            pl.delete();
          }
          const img = imageFromMat(cv, view);
          view.delete();
          return { label, image: img };
        });
        return {
          outputs,
          caption: space === 'hsv'
            ? 'In HSV the object colors separate cleanly in the Hue channel while V holds brightness. This is why HSV ranges are used for color segmentation. (8-bit hue runs 0-179 in OpenCV; shown stretched to 0-255.)'
            : space === 'lab'
              ? 'L* holds lightness and is close to a grayscale version. a* and b* hold only color, so color differences can be measured separately from brightness.'
              : space === 'ycrcb'
                ? 'Y is the luma (the gray image). Cr and Cb hold color differences, which is why JPEG can subsample them with little visible loss.'
                : 'In RGB each channel mixes color and brightness, so a red object is bright in R and dark in G and B.',
          call: code === null ? 'cv.split(rgb, planes);   // R, G, B' : `cv.cvtColor(rgb, conv, cv.${space === 'hsv' ? 'COLOR_RGB2HSV' : space === 'lab' ? 'COLOR_RGB2Lab' : 'COLOR_RGB2YCrCb'});\ncv.split(conv, planes);`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'color-seg',
    title: 'Color segmentation in HSV',
    group: 'Color image processing',
    summary: 'Select pixels by hue, saturation and value ranges.',
    termIds: ['color-segmentation', 'hsv-hsi', 'color-slicing'],
    sample: 'colors',
    params: [
      { type: 'range', key: 'h1', label: 'Hue min (0-179)', min: 0, max: 179, step: 1, default: 40 },
      { type: 'range', key: 'h2', label: 'Hue max (0-179)', min: 0, max: 179, step: 1, default: 85 },
      { type: 'range', key: 's', label: 'Saturation min', min: 0, max: 255, step: 1, default: 80 },
      { type: 'range', key: 'v', label: 'Value min', min: 0, max: 255, step: 1, default: 50 },
      { type: 'checkbox', key: 'clean', label: 'Clean the mask (morphological opening)', default: true },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const hsv = t.mat();
        cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
        const h1 = num(p, 'h1');
        const h2 = num(p, 'h2');
        const s = num(p, 's');
        const v = num(p, 'v');
        const range = (lo: number[], hi: number[]) => {
          const L = t.add(new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(...lo, 0)));
          const H = t.add(new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(...hi, 255)));
          const m = t.mat();
          cv.inRange(hsv, L, H, m);
          return m;
        };
        let mask: Mat;
        if (h1 <= h2) mask = range([h1, s, v], [h2, 255, 255]);
        else {
          // hue wraps around (e.g. reds)
          const a = range([h1, s, v], [179, 255, 255]);
          const b = range([0, s, v], [h2, 255, 255]);
          mask = t.mat();
          cv.bitwise_or(a, b, mask);
        }
        if (bool(p, 'clean')) {
          const k = t.add(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5)));
          cv.morphologyEx(mask, mask, cv.MORPH_OPEN, k);
        }
        const out = t.mat();
        cv.bitwise_and(rgb, rgb, out, mask);
        const frac = (100 * cv.countNonZero(mask)) / (mask.rows * mask.cols);
        return {
          outputs: [{ label: 'Mask', image: imageFromMat(cv, mask) }, { label: 'Extracted pixels', image: imageFromMat(cv, out) }],
          stats: [{ label: 'Selected area', value: `${frac.toFixed(1)}% of the image` }],
          caption: 'Pixels whose hue, saturation and value fall inside the box are kept. Hue is the color itself, so lighting changes affect the result much less than in RGB. For red set Hue min above Hue max (it wraps).',
          call: `cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);\ncv.inRange(hsv, [${h1}, ${s}, ${v}], [${h2}, 255, 255], mask);   // hue wraps if min > max\ncv.bitwise_and(rgb, rgb, out, mask);`,
        };
      } finally {
        t.free();
      }
    },
  },
];

export const geometryDemos: Demo[] = [
  {
    id: 'rotate',
    title: 'Rotation',
    group: 'Geometric transformations',
    summary: 'Rotate about the center with a chosen interpolation.',
    termIds: ['rotation', 'affine-transformation', 'bilinear-interpolation'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'angle', label: 'Angle (degrees)', min: -180, max: 180, step: 1, default: 30 },
      { type: 'range', key: 'scale', label: 'Scale', min: 0.3, max: 2, step: 0.05, default: 1 },
      { type: 'select', key: 'interp', label: 'Interpolation', options: [['nearest', 'Nearest'], ['linear', 'Bilinear'], ['cubic', 'Bicubic']], default: 'linear' },
      { type: 'checkbox', key: 'expand', label: 'Enlarge canvas so nothing is cut off', default: true },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const m = matFromImage(cv, t, src);
        const angle = num(p, 'angle');
        const sc = num(p, 'scale');
        const flags = { nearest: cv.INTER_NEAREST, linear: cv.INTER_LINEAR, cubic: cv.INTER_CUBIC }[str(p, 'interp')] as number;
        const cx = m.cols / 2;
        const cy = m.rows / 2;
        const M = t.add(cv.getRotationMatrix2D(new cv.Point(cx, cy), angle, sc));
        let nw = m.cols;
        let nh = m.rows;
        if (bool(p, 'expand')) {
          const c = Math.abs(Math.cos((angle * Math.PI) / 180));
          const s = Math.abs(Math.sin((angle * Math.PI) / 180));
          nw = Math.max(1, Math.round((m.cols * c + m.rows * s) * sc));
          nh = Math.max(1, Math.round((m.cols * s + m.rows * c) * sc));
          const d = M.data64F as Float64Array;
          d[2] += nw / 2 - cx;
          d[5] += nh / 2 - cy;
        }
        const dst = t.mat();
        cv.warpAffine(m, dst, M, new cv.Size(nw, nh), flags, cv.BORDER_CONSTANT, new cv.Scalar(20, 20, 20, 255));
        const d = M.data64F as Float64Array;
        return {
          outputs: [{ label: 'Rotated', image: imageFromMat(cv, dst) }],
          stats: [{ label: 'Matrix [a b tx; c d ty]', value: `[${d[0].toFixed(3)} ${d[1].toFixed(3)} ${d[2].toFixed(1)}; ${d[3].toFixed(3)} ${d[4].toFixed(3)} ${d[5].toFixed(1)}]` }],
          caption: 'Each output pixel is traced back (inverse mapping) to a position in the source and interpolated there. Nearest gives jagged edges; bilinear and bicubic are smoother.',
          call: `const M = cv.getRotationMatrix2D(new cv.Point(${(cx).toFixed(0)}, ${cy.toFixed(0)}), ${angle}, ${sc});\ncv.warpAffine(src, dst, M, new cv.Size(${nw}, ${nh}), cv.INTER_${str(p, 'interp').toUpperCase()});`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'scale',
    title: 'Scaling and interpolation',
    group: 'Geometric transformations',
    summary: 'Enlarge or shrink with nearest, bilinear, bicubic or area interpolation.',
    termIds: ['scaling', 'nearest-neighbor-interpolation', 'bilinear-interpolation', 'bicubic-interpolation', 'aliasing'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'f', label: 'Scale factor', min: 0.1, max: 4, step: 0.05, default: 0.25 },
      { type: 'select', key: 'interp', label: 'Interpolation', options: [['nearest', 'Nearest'], ['linear', 'Bilinear'], ['cubic', 'Bicubic'], ['area', 'Area (anti-aliased)']], default: 'nearest' },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const m = matFromImage(cv, t, src);
        const f = num(p, 'f');
        const name = str(p, 'interp');
        const flag = { nearest: cv.INTER_NEAREST, linear: cv.INTER_LINEAR, cubic: cv.INTER_CUBIC, area: cv.INTER_AREA }[name] as number;
        const w = Math.max(1, Math.round(m.cols * f));
        const h = Math.max(1, Math.round(m.rows * f));
        const dst = t.mat();
        cv.resize(m, dst, new cv.Size(w, h), 0, 0, flag);
        return {
          outputs: [{ label: `Resized to ${w} x ${h} (shown without smoothing)`, image: imageFromMat(cv, dst) }],
          stats: [{ label: 'New size', value: `${w} x ${h} px` }],
          caption: f < 1
            ? 'Shrinking with nearest or bilinear skips pixels and aliases thin lines. Area interpolation averages each block first, so it keeps them.'
            : 'Enlarging has to invent new pixels. Nearest copies (blocky), bilinear averages 4 neighbors, bicubic fits a curve through 16.',
          call: `cv.resize(src, dst, new cv.Size(${w}, ${h}), 0, 0, cv.INTER_${name.toUpperCase()});`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'affine',
    title: 'Affine transform (translate, rotate, scale, shear)',
    group: 'Geometric transformations',
    summary: 'A 2 x 3 matrix with six parameters.',
    termIds: ['affine-transformation', 'translation', 'shear', 'rotation', 'scaling'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'tx', label: 'Translate x (px)', min: -120, max: 120, step: 1, default: 20 },
      { type: 'range', key: 'ty', label: 'Translate y (px)', min: -120, max: 120, step: 1, default: 0 },
      { type: 'range', key: 'rot', label: 'Rotate (degrees)', min: -45, max: 45, step: 1, default: 0 },
      { type: 'range', key: 'sx', label: 'Scale x', min: 0.4, max: 1.6, step: 0.05, default: 1 },
      { type: 'range', key: 'sy', label: 'Scale y', min: 0.4, max: 1.6, step: 0.05, default: 1 },
      { type: 'range', key: 'shear', label: 'Shear (x += shear * y)', min: -0.6, max: 0.6, step: 0.02, default: 0.25 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const m = matFromImage(cv, t, src);
        const th = (num(p, 'rot') * Math.PI) / 180;
        const c = Math.cos(th);
        const s = Math.sin(th);
        const sx = num(p, 'sx');
        const sy = num(p, 'sy');
        const sh = num(p, 'shear');
        // A = R * Shear * Scale, applied about the image centre
        const a11 = c * sx;
        const a12 = c * sh * sy - s * sy;
        const a21 = s * sx;
        const a22 = s * sh * sy + c * sy;
        const cx = m.cols / 2;
        const cy = m.rows / 2;
        const tx = num(p, 'tx') + cx - (a11 * cx + a12 * cy);
        const ty = num(p, 'ty') + cy - (a21 * cx + a22 * cy);
        const M = t.add(cv.matFromArray(2, 3, cv.CV_64F, [a11, a12, tx, a21, a22, ty]));
        const dst = t.mat();
        cv.warpAffine(m, dst, M, new cv.Size(m.cols, m.rows), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(20, 20, 20, 255));
        return {
          outputs: [{ label: 'Affine result', image: imageFromMat(cv, dst) }],
          stats: [{ label: 'Matrix', value: `[${a11.toFixed(2)} ${a12.toFixed(2)} ${tx.toFixed(0)}; ${a21.toFixed(2)} ${a22.toFixed(2)} ${ty.toFixed(0)}]` }],
          caption: 'Straight lines stay straight and parallel lines stay parallel, but angles and lengths change. Six numbers describe everything you see.',
          call: `const M = cv.matFromArray(2, 3, cv.CV_64F, [${a11.toFixed(3)}, ${a12.toFixed(3)}, ${tx.toFixed(1)}, ${a21.toFixed(3)}, ${a22.toFixed(3)}, ${ty.toFixed(1)}]);\ncv.warpAffine(src, dst, M, new cv.Size(${m.cols}, ${m.rows}), cv.INTER_LINEAR);`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'perspective',
    title: 'Perspective warp (homography)',
    group: 'Geometric transformations',
    summary: 'Map four corners to four new points; 8 parameters.',
    termIds: ['perspective-transformation', 'affine-transformation', 'image-registration'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'top', label: 'Top edge inset (%)', min: 0, max: 40, step: 1, default: 18 },
      { type: 'range', key: 'bottom', label: 'Bottom edge inset (%)', min: 0, max: 40, step: 1, default: 0 },
      { type: 'range', key: 'skew', label: 'Vertical skew (%)', min: -25, max: 25, step: 1, default: 8 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const m = matFromImage(cv, t, src);
        const w = m.cols;
        const h = m.rows;
        const top = (num(p, 'top') / 100) * w;
        const bot = (num(p, 'bottom') / 100) * w;
        const sk = (num(p, 'skew') / 100) * h;
        const from = [0, 0, w, 0, w, h, 0, h];
        const up = Math.max(0, sk);
        const dn = Math.max(0, -sk);
        const to = [top, up, w - top, dn, w - bot, h - dn, bot, h - up];
        const S = t.add(cv.matFromArray(4, 1, cv.CV_32FC2, from));
        const D = t.add(cv.matFromArray(4, 1, cv.CV_32FC2, to));
        const H = t.add(cv.getPerspectiveTransform(S, D));
        const dst = t.mat();
        cv.warpPerspective(m, dst, H, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(20, 20, 20, 255));
        const overlay = t.mat();
        m.copyTo(overlay);
        for (let i = 0; i < 4; i++) cv.line(overlay, new cv.Point(from[2 * i], from[2 * i + 1]), new cv.Point(from[(2 * i + 2) % 8], from[(2 * i + 3) % 8]), new cv.Scalar(255, 60, 40, 255), 3);
        const hd = H.data64F as Float64Array;
        return {
          outputs: [{ label: 'Warped', image: imageFromMat(cv, dst) }, { label: 'Source with the 4 corner points', image: imageFromMat(cv, overlay) }],
          stats: [{ label: 'Bottom row of H (h31 h32 h33)', value: `${hd[6].toExponential(2)}  ${hd[7].toExponential(2)}  ${hd[8].toFixed(2)}` }],
          caption: 'Four corners are pulled to four new places and everything in between follows. Unlike affine, parallel lines can converge (the non-zero h31, h32 divide the coordinates by depth).',
          call: `const H = cv.getPerspectiveTransform(srcPts, dstPts);   // 4 point pairs\ncv.warpPerspective(src, dst, H, new cv.Size(${w}, ${h}), cv.INTER_LINEAR);`,
        };
      } finally {
        t.free();
      }
    },
  },
];

