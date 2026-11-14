import { bool, grayFrom, imageFromMat, matFromImage, newImage, num, rgbFrom, str, tracker, toU8, type CV, type Mat, type RGBAImage, type Tracker } from '../cv/core';
import { findMinutiae, zhangSuen } from '../cv/dsp';
import { histogramImage } from '../cv/draw';
import { hist256 } from './intensity';
import { oddSize, type Demo } from './types';

/** Binarize a gray Mat: Otsu or adaptive, optionally inverted so that "objects" are white. */
function binarize(cv: CV, t: Tracker, gray: Mat, method: string, invert: boolean, blur: number): { bin: Mat; call: string } {
  const src = t.mat();
  if (blur > 0) cv.GaussianBlur(gray, src, new cv.Size(0, 0), blur, blur, cv.BORDER_DEFAULT);
  else gray.copyTo(src);
  const bin = t.mat();
  const type = invert ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY;
  if (method === 'adaptive') {
    cv.adaptiveThreshold(src, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, type, 25, 4);
    return { bin, call: `cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY${invert ? '_INV' : ''}, 25, 4);` };
  }
  cv.threshold(src, bin, 0, 255, type | cv.THRESH_OTSU);
  return { bin, call: `cv.threshold(gray, bin, 0, 255, cv.THRESH_BINARY${invert ? '_INV' : ''} | cv.THRESH_OTSU);` };
}

/** Deterministic pseudo-random color for label ids. */
const labelColor = (i: number): [number, number, number] => {
  const h = (i * 137.508) % 360;
  const c = 0.75;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + 0.2) * 255), Math.round((g + 0.2) * 255), Math.round((b + 0.2) * 255)];
};

export const morphologyDemos: Demo[] = [
  {
    id: 'morphology',
    title: 'Morphological operations',
    group: 'Morphological processing',
    summary: 'Erosion, dilation, opening, closing, gradient, top-hat and black-hat.',
    termIds: ['erosion', 'dilation', 'opening', 'closing', 'structuring-element', 'top-hat', 'black-hat', 'morphological-gradient', 'boundary-extraction'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'op', label: 'Operation', options: [['erode', 'Erosion'], ['dilate', 'Dilation'], ['open', 'Opening'], ['close', 'Closing'], ['gradient', 'Gradient (dilate - erode)'], ['tophat', 'Top-hat'], ['blackhat', 'Black-hat']], default: 'open' },
      { type: 'select', key: 'shape', label: 'Structuring element', options: [['rect', 'Square'], ['ellipse', 'Ellipse'], ['cross', 'Cross']], default: 'ellipse' },
      { type: 'range', key: 'k', label: 'Element size', min: 3, max: 31, step: 2, default: 7 },
      { type: 'range', key: 'iter', label: 'Iterations', min: 1, max: 5, step: 1, default: 1 },
      { type: 'checkbox', key: 'bin', label: 'Binarize first (Otsu); off = gray-scale morphology', default: true },
      { type: 'checkbox', key: 'inv', label: 'Invert (dark objects become white)', default: false },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        let input: Mat;
        let pre = '';
        if (bool(p, 'bin')) {
          const b = binarize(cv, t, gray, 'otsu', bool(p, 'inv'), 0);
          input = b.bin;
          pre = b.call + '\n';
        } else if (bool(p, 'inv')) {
          input = t.mat();
          cv.bitwise_not(gray, input);
        } else input = gray;
        const k = oddSize(num(p, 'k'));
        const shape = { rect: cv.MORPH_RECT, ellipse: cv.MORPH_ELLIPSE, cross: cv.MORPH_CROSS }[str(p, 'shape')] as number;
        const se = t.add(cv.getStructuringElement(shape, new cv.Size(k, k)));
        const op = str(p, 'op');
        const code = { erode: cv.MORPH_ERODE, dilate: cv.MORPH_DILATE, open: cv.MORPH_OPEN, close: cv.MORPH_CLOSE, gradient: cv.MORPH_GRADIENT, tophat: cv.MORPH_TOPHAT, blackhat: cv.MORPH_BLACKHAT }[op] as number;
        const dst = t.mat();
        cv.morphologyEx(input, dst, code, se, new cv.Point(-1, -1), num(p, 'iter'), cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
        const captions: Record<string, string> = {
          erode: 'Objects shrink: a pixel survives only if the whole structuring element fits inside the object. Thin parts and small specks vanish.',
          dilate: 'Objects grow and gaps close: a pixel turns on if the element touches any object pixel.',
          open: 'Erosion then dilation: small specks and thin bridges disappear but the remaining objects keep their size.',
          close: 'Dilation then erosion: small holes and gaps fill in without growing the objects.',
          gradient: 'Dilation minus erosion leaves an outline of every object, as thick as the element.',
          tophat: 'Image minus its opening: only small bright details (smaller than the element) remain.',
          blackhat: 'Closing minus the image: only small dark details remain.',
        };
        return {
          outputs: [{ label: 'Input to the operation', image: imageFromMat(cv, input) }, { label: 'Result', image: imageFromMat(cv, dst) }],
          caption: captions[op],
          call: `${pre}const se = cv.getStructuringElement(cv.MORPH_${str(p, 'shape').toUpperCase()}, new cv.Size(${k}, ${k}));\ncv.morphologyEx(input, dst, cv.MORPH_${op.toUpperCase()}, se, new cv.Point(-1, -1), ${num(p, 'iter')});`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'thinning',
    title: 'Thinning (Zhang-Suen) and minutiae',
    group: 'Morphological processing',
    summary: 'Reduce shapes to one-pixel skeletons and find endings and bifurcations.',
    termIds: ['skeleton-thinning', 'minutiae', 'hit-or-miss'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'method', label: 'Binarization', options: [['otsu', 'Otsu'], ['adaptive', 'Adaptive (local)']], default: 'otsu' },
      { type: 'range', key: 'blur', label: 'Pre-blur sigma', min: 0, max: 3, step: 0.25, default: 0.75 },
      { type: 'checkbox', key: 'inv', label: 'Invert (dark ridges/strokes are the objects)', default: false },
      { type: 'checkbox', key: 'minutiae', label: 'Mark minutiae (crossing number)', default: true },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const { bin, call } = binarize(cv, t, gray, str(p, 'method'), bool(p, 'inv'), num(p, 'blur'));
        const w = bin.cols;
        const h = bin.rows;
        const b01 = new Uint8Array(w * h);
        const d = bin.data as Uint8Array;
        for (let i = 0; i < b01.length; i++) b01[i] = d[i] > 0 ? 1 : 0;
        const skel = zhangSuen(b01, w, h);
        const skelImg = newImage(w, h);
        const overlay = t.mat();
        rgb.copyTo(overlay);
        const od = overlay.data as Uint8Array;
        let count = 0;
        for (let i = 0; i < skel.length; i++) {
          const v = skel[i] ? 255 : 0;
          skelImg.data[i * 4] = v;
          skelImg.data[i * 4 + 1] = v;
          skelImg.data[i * 4 + 2] = v;
          skelImg.data[i * 4 + 3] = 255;
          if (skel[i]) {
            count++;
            od[i * 3] = 255;
            od[i * 3 + 1] = 40;
            od[i * 3 + 2] = 40;
          }
        }
        let ends = 0;
        let bifs = 0;
        if (bool(p, 'minutiae')) {
          for (const m of findMinutiae(skel, w, h, 6)) {
            const c = m.type === 'ending' ? new cv.Scalar(40, 220, 255) : new cv.Scalar(255, 230, 40);
            cv.circle(overlay, new cv.Point(m.x, m.y), 4, c, 1);
            if (m.type === 'ending') ends++;
            else bifs++;
          }
        }
        const fg = b01.reduce((a, b) => a + b, 0);
        return {
          outputs: [{ label: 'Binary image', image: imageFromMat(cv, bin) }, { label: 'Skeleton (Zhang-Suen)', image: skelImg }, { label: 'Overlay: red skeleton, cyan endings, yellow bifurcations', image: imageFromMat(cv, overlay) }],
          stats: [
            { label: 'Foreground pixels -> skeleton pixels', value: `${fg} -> ${count}` },
            { label: 'Endings / bifurcations', value: bool(p, 'minutiae') ? `${ends} / ${bifs}` : 'off' },
          ],
          caption: 'Thinning peels the border off every shape until a one-pixel line remains, keeping connectivity. On that line, a pixel with one neighbor is an ending and one with three is a bifurcation (crossing number 1 and 3). Noisy edges create spurious spurs.',
          call: `${call}\n// cv.ximgproc.thinning is not in the OpenCV.js build; this runs Zhang-Suen in TypeScript.\n// Python: cv2.ximgproc.thinning(bin, thinningType=cv2.ximgproc.THINNING_ZHANGSUEN)`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'distance',
    title: 'Distance transform (D4, D8, Euclidean)',
    group: 'Pixel relationships',
    summary: 'Distance from every foreground pixel to the nearest background pixel.',
    termIds: ['euclidean-distance', 'city-block-distance', 'chessboard-distance'],
    sample: 'coins',
    params: [{ type: 'select', key: 'metric', label: 'Distance', options: [['l2', 'Euclidean (D_e)'], ['l1', 'City-block (D4)'], ['c', 'Chessboard (D8)']], default: 'l2' }],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const { bin } = binarize(cv, t, gray, 'otsu', false, 1);
        const metric = str(p, 'metric');
        const code = { l2: cv.DIST_L2, l1: cv.DIST_L1, c: cv.DIST_C }[metric] as number;
        const dist = t.mat();
        cv.distanceTransform(bin, dist, code, metric === 'l2' ? 5 : 3);
        const mm = cv.minMaxLoc(dist);
        const n = toU8(cv, t, dist);
        const heat = t.mat();
        cv.applyColorMap(n, heat, cv.COLORMAP_TURBO);
        const rgb = t.mat();
        cv.cvtColor(heat, rgb, cv.COLOR_BGR2RGB);
        return {
          outputs: [{ label: 'Binary mask', image: imageFromMat(cv, bin) }, { label: 'Distance map (blue = near the edge, red = deep inside)', image: imageFromMat(cv, rgb) }],
          stats: [{ label: 'Largest distance (deepest pixel)', value: `${mm.maxVal.toFixed(1)} px` }],
          caption: metric === 'l2' ? 'Rings of equal distance are circles.' : metric === 'l1' ? 'City-block distance counts horizontal plus vertical steps, so equal-distance contours are diamonds.' : 'Chessboard distance counts diagonal steps as one, so equal-distance contours are squares.',
          call: `cv.distanceTransform(bin, dist, cv.DIST_${metric.toUpperCase()}, ${metric === 'l2' ? 5 : 3});`,
        };
      } finally {
        t.free();
      }
    },
  },
];

export const segmentationDemos: Demo[] = [
  {
    id: 'otsu',
    title: "Otsu's thresholding",
    group: 'Image segmentation',
    summary: 'Automatic global threshold that maximizes between-class variance.',
    termIds: ['otsu-thresholding', 'global-thresholding', 'histogram'],
    sample: 'coins',
    params: [{ type: 'range', key: 'blur', label: 'Pre-blur sigma', min: 0, max: 4, step: 0.25, default: 1 }, { type: 'checkbox', key: 'inv', label: 'Invert', default: false }],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const sm = t.mat();
        const sg = num(p, 'blur');
        if (sg > 0) cv.GaussianBlur(gray, sm, new cv.Size(0, 0), sg, sg, cv.BORDER_DEFAULT);
        else gray.copyTo(sm);
        const bin = t.mat();
        const T = cv.threshold(sm, bin, 0, 255, (bool(p, 'inv') ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY) | cv.THRESH_OTSU);
        const h = hist256(cv, t, sm);
        const n = h.reduce((a, b) => a + b, 0);
        let w0 = 0;
        let m0 = 0;
        let mt = 0;
        for (let i = 0; i < 256; i++) mt += (i * h[i]) / n;
        let m1 = 0;
        for (let i = 0; i <= T; i++) {
          w0 += h[i] / n;
          m0 += (i * h[i]) / n;
        }
        const w1 = 1 - w0;
        m1 = w1 > 0 ? (mt - m0) / w1 : 0;
        const mu0 = w0 > 0 ? m0 / w0 : 0;
        const between = w0 * w1 * (mu0 - m1) ** 2;
        return {
          outputs: [{ label: "Otsu's result", image: imageFromMat(cv, bin) }, { label: 'Histogram with threshold (red)', image: histogramImage([h], { marker: T }) }],
          stats: [
            { label: 'Threshold T', value: String(Math.round(T)) },
            { label: 'Class means (below / above)', value: `${mu0.toFixed(1)} / ${m1.toFixed(1)}` },
            { label: 'Between-class variance', value: between.toFixed(1) },
          ],
          caption: 'Otsu tries every T and keeps the one that separates the two groups of pixels best (largest between-class variance). It works when the histogram has two clear peaks.',
          call: `const T = cv.threshold(gray, dst, 0, 255, cv.THRESH_BINARY${bool(p, 'inv') ? '_INV' : ''} | cv.THRESH_OTSU);   // T = ${Math.round(T)}`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'adaptive-threshold',
    title: 'Adaptive thresholding',
    group: 'Image segmentation',
    summary: 'A threshold per pixel from its local neighborhood.',
    termIds: ['adaptive-thresholding', 'global-thresholding', 'otsu-thresholding'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'method', label: 'Local statistic', options: [['gaussian', 'Gaussian-weighted mean'], ['mean', 'Plain mean']], default: 'gaussian' },
      { type: 'range', key: 'block', label: 'Block size', min: 3, max: 101, step: 2, default: 31 },
      { type: 'range', key: 'C', label: 'Constant C (subtracted)', min: -10, max: 30, step: 1, default: 6 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const block = oddSize(num(p, 'block'));
        const C = num(p, 'C');
        const m = str(p, 'method');
        const out = t.mat();
        cv.adaptiveThreshold(gray, out, 255, m === 'gaussian' ? cv.ADAPTIVE_THRESH_GAUSSIAN_C : cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, block, C);
        const g = t.mat();
        cv.threshold(gray, g, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
        return {
          outputs: [{ label: 'Adaptive', image: imageFromMat(cv, out) }, { label: 'Global (Otsu) for comparison', image: imageFromMat(cv, g) }],
          caption: 'Each pixel is compared with the average of its own neighborhood (minus C), so a shadow or gradient does not wreck the result as it does for one global threshold. Make the block larger than the details you want to keep.',
          call: `cv.adaptiveThreshold(gray, dst, 255, cv.ADAPTIVE_THRESH_${m.toUpperCase()}_C, cv.THRESH_BINARY, ${block}, ${C});`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'watershed',
    title: 'Marker-controlled watershed',
    group: 'Image segmentation',
    summary: 'Split touching objects using the distance transform.',
    termIds: ['watershed-segmentation', 'euclidean-distance', 'connected-components'],
    sample: 'coins',
    params: [
      { type: 'range', key: 'fg', label: 'Sure-foreground threshold (fraction of max distance)', min: 0.1, max: 0.95, step: 0.05, default: 0.55 },
      { type: 'checkbox', key: 'inv', label: 'Objects are darker than the background', default: false },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const gray = t.mat();
        cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
        const { bin } = binarize(cv, t, gray, 'otsu', bool(p, 'inv'), 1);
        const k = t.add(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)));
        const opened = t.mat();
        cv.morphologyEx(bin, opened, cv.MORPH_OPEN, k, new cv.Point(-1, -1), 2);
        const sureBg = t.mat();
        cv.dilate(opened, sureBg, k, new cv.Point(-1, -1), 3);
        const dist = t.mat();
        cv.distanceTransform(opened, dist, cv.DIST_L2, 5);
        const mm = cv.minMaxLoc(dist);
        const fg32 = t.mat();
        cv.threshold(dist, fg32, num(p, 'fg') * mm.maxVal, 255, cv.THRESH_BINARY);
        const sureFg = t.mat();
        fg32.convertTo(sureFg, cv.CV_8U);
        const unknown = t.mat();
        cv.subtract(sureBg, sureFg, unknown);
        const markers = t.mat();
        const n = cv.connectedComponents(sureFg, markers, 8, cv.CV_32S);
        const md = markers.data32S as Int32Array;
        const ud = unknown.data as Uint8Array;
        for (let i = 0; i < md.length; i++) md[i] = ud[i] === 255 ? 0 : md[i] + 1;
        cv.watershed(rgb, markers);
        const w = rgb.cols;
        const h = rgb.rows;
        const seg = newImage(w, h);
        const over = newImage(w, h);
        const rd = rgb.data as Uint8Array;
        for (let i = 0; i < w * h; i++) {
          const lab = md[i];
          const o = i * 4;
          if (lab === -1) {
            seg.data.set([255, 40, 40, 255], o);
            over.data.set([255, 40, 40, 255], o);
          } else if (lab <= 1) {
            seg.data.set([20, 20, 28, 255], o);
            over.data.set([rd[i * 3], rd[i * 3 + 1], rd[i * 3 + 2], 255], o);
          } else {
            const c = labelColor(lab);
            seg.data.set([c[0], c[1], c[2], 255], o);
            over.data.set([rd[i * 3] * 0.5 + c[0] * 0.5, rd[i * 3 + 1] * 0.5 + c[1] * 0.5, rd[i * 3 + 2] * 0.5 + c[2] * 0.5, 255], o);
          }
        }
        return {
          outputs: [
            { label: 'Watershed regions (red = boundaries)', image: over },
            { label: 'Region labels', image: seg },
            { label: 'Distance transform', image: imageFromMat(cv, toU8(cv, t, dist)) },
            { label: 'Sure foreground (markers)', image: imageFromMat(cv, sureFg) },
          ],
          stats: [{ label: 'Objects found', value: String(n - 1) }],
          caption: 'Thresholding alone merges touching discs. The distance transform peaks at each disc center; thresholding it gives one marker per disc, and the watershed floods from those markers until the floods meet at the boundaries (red).',
          call: 'cv.distanceTransform(opened, dist, cv.DIST_L2, 5);\ncv.threshold(dist, sureFg, frac * maxVal, 255, cv.THRESH_BINARY);\ncv.connectedComponents(sureFg, markers);   // + 1, unknown = 0\ncv.watershed(rgb, markers);                 // boundaries become -1',
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'connected-components',
    title: 'Connected-component labeling',
    group: 'Image segmentation',
    summary: 'Label every blob; filter by area; 4- or 8-connectivity.',
    termIds: ['connected-components', 'connectivity', 'adjacency'],
    sample: 'coins',
    params: [
      { type: 'select', key: 'conn', label: 'Connectivity', options: [['4', '4-connected'], ['8', '8-connected']], default: '8' },
      { type: 'range', key: 'minArea', label: 'Ignore blobs smaller than (px)', min: 0, max: 2000, step: 10, default: 100 },
      { type: 'checkbox', key: 'inv', label: 'Invert', default: false },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const gray = grayFrom(cv, t, matFromImage(cv, t, src));
        const { bin } = binarize(cv, t, gray, 'otsu', bool(p, 'inv'), 1);
        const labels = t.mat();
        const stats = t.mat();
        const cents = t.mat();
        const conn = num(p, 'conn');
        const n = cv.connectedComponentsWithStats(bin, labels, stats, cents, conn, cv.CV_32S);
        const minA = num(p, 'minArea');
        const keep = new Int32Array(n);
        let count = 0;
        const sd = stats.data32S as Int32Array;
        for (let i = 1; i < n; i++) if (sd[i * 5 + cv.CC_STAT_AREA] >= minA) keep[i] = ++count;
        const w = bin.cols;
        const h = bin.rows;
        const img: RGBAImage = newImage(w, h);
        const ld = labels.data32S as Int32Array;
        for (let i = 0; i < w * h; i++) {
          const k = keep[ld[i]];
          const c: [number, number, number] = k ? labelColor(k) : [15, 15, 20];
          img.data[i * 4] = c[0];
          img.data[i * 4 + 1] = c[1];
          img.data[i * 4 + 2] = c[2];
          img.data[i * 4 + 3] = 255;
        }
        const boxes = t.mat();
        cv.cvtColor(bin, boxes, cv.COLOR_GRAY2RGBA);
        for (let i = 1; i < n; i++) {
          if (!keep[i]) continue;
          const x = sd[i * 5];
          const y = sd[i * 5 + 1];
          cv.rectangle(boxes, new cv.Point(x, y), new cv.Point(x + sd[i * 5 + 2], y + sd[i * 5 + 3]), new cv.Scalar(255, 60, 60, 255), 1);
        }
        return {
          outputs: [{ label: 'Labeled components', image: img }, { label: 'Bounding boxes', image: imageFromMat(cv, boxes) }],
          stats: [{ label: 'Components kept / found', value: `${count} / ${n - 1}` }],
          caption: 'Each connected group of white pixels gets its own label (color). Touching discs form a single component, which is why the count is low; the watershed demo splits them. Try 4- versus 8-connectivity on thin diagonal shapes.',
          call: `const n = cv.connectedComponentsWithStats(bin, labels, stats, centroids, ${conn}, cv.CV_32S);\n// stats row i: [x, y, width, height, area]`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'hough-lines',
    title: 'Hough line detection',
    group: 'Image segmentation',
    summary: 'Edge pixels vote for lines in (rho, theta) space.',
    termIds: ['hough-transform', 'line-detection', 'canny-edge-detector'],
    sample: 'scene',
    params: [
      { type: 'select', key: 'mode', label: 'Variant', options: [['standard', 'Standard (infinite lines)'], ['prob', 'Probabilistic (segments)']], default: 'prob' },
      { type: 'range', key: 'thr', label: 'Vote threshold', min: 20, max: 300, step: 5, default: 80 },
      { type: 'range', key: 'minLen', label: 'Min segment length (probabilistic)', min: 10, max: 200, step: 5, default: 50 },
      { type: 'range', key: 'gap', label: 'Max gap (probabilistic)', min: 1, max: 40, step: 1, default: 6 },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const gray = t.mat();
        cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
        const blur = t.mat();
        cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 1.4, 1.4);
        const edges = t.mat();
        cv.Canny(blur, edges, 60, 160);
        const lines = t.mat();
        const out = t.mat();
        rgb.copyTo(out);
        const red = new cv.Scalar(255, 40, 40);
        let found = 0;
        let call: string;
        if (str(p, 'mode') === 'standard') {
          cv.HoughLines(edges, lines, 1, Math.PI / 180, num(p, 'thr'), 0, 0, 0, Math.PI);
          const d = lines.data32F as Float32Array;
          found = Math.min(lines.rows, 40);
          for (let i = 0; i < found; i++) {
            const rho = d[2 * i];
            const th = d[2 * i + 1];
            const a = Math.cos(th);
            const b = Math.sin(th);
            const x0 = a * rho;
            const y0 = b * rho;
            cv.line(out, new cv.Point(Math.round(x0 - 1000 * b), Math.round(y0 + 1000 * a)), new cv.Point(Math.round(x0 + 1000 * b), Math.round(y0 - 1000 * a)), red, 1);
          }
          call = `cv.Canny(gray, edges, 60, 160);\ncv.HoughLines(edges, lines, 1, Math.PI / 180, ${num(p, 'thr')});   // rho, theta per line`;
        } else {
          cv.HoughLinesP(edges, lines, 1, Math.PI / 180, num(p, 'thr'), num(p, 'minLen'), num(p, 'gap'));
          const d = lines.data32S as Int32Array;
          found = lines.rows;
          for (let i = 0; i < found; i++) cv.line(out, new cv.Point(d[4 * i], d[4 * i + 1]), new cv.Point(d[4 * i + 2], d[4 * i + 3]), red, 2);
          call = `cv.Canny(gray, edges, 60, 160);\ncv.HoughLinesP(edges, lines, 1, Math.PI / 180, ${num(p, 'thr')}, ${num(p, 'minLen')}, ${num(p, 'gap')});   // x1, y1, x2, y2`;
        }
        return {
          outputs: [{ label: 'Detected lines (red)', image: imageFromMat(cv, out) }, { label: 'Canny edges used as votes', image: imageFromMat(cv, edges) }],
          stats: [{ label: 'Lines drawn', value: String(found) }],
          caption: 'Every edge pixel votes for all lines (rho, theta) that pass through it. Lines that collect many votes are real. Lower the threshold to find weaker lines (and false ones).',
          call,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'region-growing',
    title: 'Region growing (flood fill)',
    group: 'Image segmentation',
    summary: 'Grow a region from a seed over similar pixels.',
    termIds: ['region-growing', 'connectivity', 'hole-filling'],
    sample: 'scene',
    params: [
      { type: 'range', key: 'sx', label: 'Seed x (%)', min: 0, max: 100, step: 1, default: 70 },
      { type: 'range', key: 'sy', label: 'Seed y (%)', min: 0, max: 100, step: 1, default: 28 },
      { type: 'range', key: 'tol', label: 'Tolerance (per channel)', min: 1, max: 80, step: 1, default: 18 },
      { type: 'select', key: 'conn', label: 'Connectivity', options: [['4', '4'], ['8', '8']], default: '4' },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const rgb = rgbFrom(cv, t, matFromImage(cv, t, src));
        const w = rgb.cols;
        const h = rgb.rows;
        const x = Math.min(w - 1, Math.round((num(p, 'sx') / 100) * (w - 1)));
        const y = Math.min(h - 1, Math.round((num(p, 'sy') / 100) * (h - 1)));
        const tol = num(p, 'tol');
        const conn = num(p, 'conn');
        const mask = t.add(cv.Mat.zeros(h + 2, w + 2, cv.CV_8UC1));
        const flags = conn | (255 << 8) | cv.FLOODFILL_FIXED_RANGE | cv.FLOODFILL_MASK_ONLY;
        const work = t.mat();
        rgb.copyTo(work);
        cv.floodFill(work, mask, new cv.Point(x, y), new cv.Scalar(255, 0, 0), new cv.Rect(), new cv.Scalar(tol, tol, tol, 0), new cv.Scalar(tol, tol, tol, 0), flags);
        const md = mask.data as Uint8Array;
        const out = t.mat();
        rgb.copyTo(out);
        const od = out.data as Uint8Array;
        let area = 0;
        for (let j = 0; j < h; j++)
          for (let i = 0; i < w; i++)
            if (md[(j + 1) * (w + 2) + (i + 1)]) {
              area++;
              const o = (j * w + i) * 3;
              od[o] = od[o] * 0.35 + 255 * 0.65;
              od[o + 1] *= 0.35;
              od[o + 2] *= 0.35;
            }
        cv.circle(out, new cv.Point(x, y), 5, new cv.Scalar(255, 255, 0), 2);
        return {
          outputs: [{ label: 'Grown region (red), seed (yellow ring)', image: imageFromMat(cv, out) }],
          stats: [{ label: 'Region area', value: `${area} px (${((100 * area) / (w * h)).toFixed(1)}%)` }],
          caption: 'Starting from the seed, a neighbor joins the region if its color is within the tolerance of the seed color. Raise the tolerance and the region leaks into neighboring objects.',
          call: `cv.floodFill(img, mask, new cv.Point(${x}, ${y}), newVal, rect, new cv.Scalar(${tol}, ${tol}, ${tol}), new cv.Scalar(${tol}, ${tol}, ${tol}),\n             ${conn} | (255 << 8) | cv.FLOODFILL_FIXED_RANGE | cv.FLOODFILL_MASK_ONLY);`,
        };
      } finally {
        t.free();
      }
    },
  },
  {
    id: 'kmeans',
    title: 'K-means color segmentation',
    group: 'Image segmentation',
    summary: 'Cluster pixels by color into k groups.',
    termIds: ['k-means-segmentation', 'color-segmentation', 'lab-color'],
    sample: 'colors',
    params: [
      { type: 'range', key: 'k', label: 'Clusters k', min: 2, max: 10, step: 1, default: 5 },
      { type: 'select', key: 'space', label: 'Feature space', options: [['rgb', 'RGB'], ['lab', 'Lab']], default: 'lab' },
    ],
    run(cv, src, p) {
      const t = tracker(cv);
      try {
        const m0 = rgbFrom(cv, t, matFromImage(cv, t, src));
        const s = Math.min(1, 180 / Math.max(m0.cols, m0.rows));
        const rgb = t.mat();
        cv.resize(m0, rgb, new cv.Size(Math.round(m0.cols * s), Math.round(m0.rows * s)), 0, 0, cv.INTER_AREA);
        const feat = t.mat();
        if (str(p, 'space') === 'lab') cv.cvtColor(rgb, feat, cv.COLOR_RGB2Lab);
        else rgb.copyTo(feat);
        const n = feat.rows * feat.cols;
        const samples = t.mat(n, 3, cv.CV_32F);
        const sdat = samples.data32F as Float32Array;
        const fd = feat.data as Uint8Array;
        for (let i = 0; i < n * 3; i++) sdat[i] = fd[i];
        const k = num(p, 'k');
        const labels = t.mat();
        const centers = t.mat();
        const crit = new cv.TermCriteria(cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER, 12, 1.0);
        cv.kmeans(samples, k, labels, crit, 2, cv.KMEANS_PP_CENTERS, centers);
        const ld = labels.data32S as Int32Array;
        const rd = rgb.data as Uint8Array;
        const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
        for (let i = 0; i < n; i++) {
          const c = sums[ld[i]];
          c[0] += rd[i * 3];
          c[1] += rd[i * 3 + 1];
          c[2] += rd[i * 3 + 2];
          c[3]++;
        }
        const out = newImage(rgb.cols, rgb.rows);
        for (let i = 0; i < n; i++) {
          const c = sums[ld[i]];
          out.data[i * 4] = c[0] / c[3];
          out.data[i * 4 + 1] = c[1] / c[3];
          out.data[i * 4 + 2] = c[2] / c[3];
          out.data[i * 4 + 3] = 255;
        }
        const palette = newImage(k * 40, 40);
        for (let j = 0; j < 40; j++)
          for (let i = 0; i < k * 40; i++) {
            const c = sums[Math.floor(i / 40)];
            const o = (j * palette.width + i) * 4;
            palette.data[o] = c[0] / Math.max(1, c[3]);
            palette.data[o + 1] = c[1] / Math.max(1, c[3]);
            palette.data[o + 2] = c[2] / Math.max(1, c[3]);
            palette.data[o + 3] = 255;
          }
        return {
          outputs: [{ label: `Quantized to ${k} colors`, image: out }, { label: 'Cluster colors', image: palette }],
          caption: 'Every pixel is a point in color space. K-means repeatedly assigns points to the nearest cluster center and moves each center to the mean of its points. The result is the image repainted with k colors.',
          call: `const samples = /* N x 3 CV_32F matrix of ${str(p, 'space')} values */;\nconst crit = new cv.TermCriteria(cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER, 12, 1.0);\ncv.kmeans(samples, ${k}, labels, crit, 2, cv.KMEANS_PP_CENTERS, centers);`,
        };
      } finally {
        t.free();
      }
    },
  },
];
