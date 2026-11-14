/* Procedurally generated sample images. Nothing here is a photograph of a real person: the "fingerprint"
 * is a mathematical ridge pattern, so the project never needs (or stores) real biometrics. */
import { mulberry32, gaussianNoise } from '../cv/dsp';
import type { RGBAImage } from '../cv/core';

export interface SampleDef {
  id: string;
  label: string;
  description: string;
  make: () => RGBAImage;
}

const SIZE = 360;

function blank(w: number, h: number, bg: [number, number, number]): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

const put = (img: RGBAImage, x: number, y: number, c: [number, number, number]) => {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const o = (y * img.width + x) * 4;
  img.data[o] = c[0];
  img.data[o + 1] = c[1];
  img.data[o + 2] = c[2];
};

function fillRect(img: RGBAImage, x: number, y: number, w: number, h: number, c: [number, number, number]) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(img, i, j, c);
}
function fillDisc(img: RGBAImage, cx: number, cy: number, r: number, c: [number, number, number], shade = 0) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= r * r) {
        const k = 1 - shade * (Math.sqrt(d2) / r) ** 2;
        put(img, x, y, [c[0] * k, c[1] * k, c[2] * k]);
      }
    }
}
function strokeLine(img: RGBAImage, x0: number, y0: number, x1: number, y1: number, thick: number, c: [number, number, number]) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fillDisc(img, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick / 2, c);
  }
}

function addNoise(img: RGBAImage, sigma: number, seed: number) {
  const rand = mulberry32(seed);
  for (let i = 0; i < img.width * img.height; i++) {
    const n = gaussianNoise(rand) * sigma;
    for (let c = 0; c < 3; c++) img.data[i * 4 + c] = Math.max(0, Math.min(255, img.data[i * 4 + c] + n));
  }
}

/** Mixed scene: gradient, shapes, lines, text-like strokes, texture. Good for filtering, edges, Hough, corners. */
export function sceneImage(): RGBAImage {
  const img = blank(SIZE, SIZE, [0, 0, 0]);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const v = 70 + (x / SIZE) * 90 + (y / SIZE) * 40;
      put(img, x, y, [v, v * 0.95 + 10, v * 0.85 + 25]);
    }
  fillRect(img, 30, 40, 120, 90, [200, 60, 50]);
  fillRect(img, 45, 55, 90, 60, [235, 200, 70]);
  fillDisc(img, 250, 100, 55, [50, 120, 200], 0.35);
  fillDisc(img, 250, 100, 22, [240, 240, 245], 0.2);
  // triangle
  for (let y = 190; y < 300; y++) {
    const half = ((y - 190) / 110) * 60;
    for (let x = Math.round(110 - half); x <= Math.round(110 + half); x++) put(img, x, y, [60, 160, 90]);
  }
  fillRect(img, 200, 200, 130, 90, [40, 40, 60]);
  // lines (for Hough) and a grid of corners
  strokeLine(img, 20, 330, 340, 310, 3, [250, 250, 250]);
  strokeLine(img, 20, 345, 340, 345, 3, [20, 20, 20]);
  strokeLine(img, 180, 160, 340, 20, 2.5, [30, 30, 30]);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) fillRect(img, 215 + i * 28, 213 + j * 24, 14, 12, (i + j) % 2 ? [230, 230, 230] : [90, 90, 120]);
  // letter-like strokes
  const L = [[40, 150, 40, 185], [40, 185, 62, 185], [75, 150, 75, 185], [75, 150, 95, 150], [75, 167, 92, 167]];
  for (const [a, b, c, d] of L) strokeLine(img, a, b, c, d, 4, [255, 255, 255]);
  addNoise(img, 3, 7);
  return img;
}

/** Same scene squeezed into a narrow dark band, for histogram work. */
export function lowContrastImage(): RGBAImage {
  const img = sceneImage();
  for (let i = 0; i < img.width * img.height; i++)
    for (let c = 0; c < 3; c++) img.data[i * 4 + c] = 60 + img.data[i * 4 + c] * 0.28;
  return img;
}

/** Bright, slightly shaded discs that touch each other: the classic watershed input. */
export function coinsImage(): RGBAImage {
  const img = blank(SIZE, SIZE, [25, 28, 34]);
  const rand = mulberry32(11);
  const centers: Array<[number, number, number]> = [
    [80, 85, 42], [150, 80, 40], [225, 90, 44], [300, 80, 38], [100, 165, 40], [175, 170, 46], [255, 175, 40],
    [70, 255, 44], [145, 250, 40], [220, 262, 46], [295, 255, 40],
  ];
  for (const [cx, cy, r] of centers) fillDisc(img, cx, cy, r, [205 + rand() * 25, 190 + rand() * 25, 120 + rand() * 30], 0.35);
  addNoise(img, 4, 3);
  return img;
}

/** Colored shapes on a neutral background for HSV segmentation and k-means. */
export function colorsImage(): RGBAImage {
  const img = blank(SIZE, SIZE, [215, 212, 205]);
  const items: Array<[number, number, number, [number, number, number]]> = [
    [80, 80, 52, [220, 40, 40]], [190, 70, 45, [40, 180, 70]], [285, 90, 50, [40, 90, 220]], [90, 200, 48, [235, 205, 40]],
    [200, 190, 55, [150, 60, 190]], [290, 250, 42, [240, 130, 30]], [110, 300, 36, [40, 200, 200]], [210, 300, 40, [220, 40, 40]],
  ];
  for (const [x, y, r, c] of items) fillDisc(img, x, y, r, c, 0.3);
  addNoise(img, 3, 5);
  return img;
}

/** Zone plate f = 0.5 + 0.5 cos(k r^2): instantaneous frequency grows with radius, so it aliases visibly. */
export function zonePlateImage(): RGBAImage {
  const img = blank(SIZE, SIZE, [0, 0, 0]);
  const c = SIZE / 2;
  const k = Math.PI / (SIZE * 0.5); // max frequency near the edge ~ Nyquist
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const r2 = (x - c) ** 2 + (y - c) ** 2;
      const v = 127.5 + 127.5 * Math.cos(k * r2 * 0.5);
      put(img, x, y, [v, v, v]);
    }
  return img;
}

/**
 * Synthetic fingerprint-like ridge pattern (NOT a real print). Concentric elliptical ridges plus pairs of
 * phase dislocations (which create ridge endings and bifurcations), uneven lighting and noise.
 */
export function fingerprintImage(period = 9, seed = 21): RGBAImage {
  const w = SIZE;
  const h = SIZE;
  const img = blank(w, h, [0, 0, 0]);
  const rand = mulberry32(seed);
  const cx = w * 0.5;
  const cy = h * 0.52;
  const dislocations: Array<[number, number, number]> = [];
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const r = 25 + rand() * 90;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r * 1.2;
    dislocations.push([px, py, 1], [px + 10 + rand() * 14, py + (rand() - 0.5) * 16, -1]);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / 0.82;
      const dy = (y - cy) / 1.1;
      let phase = (2 * Math.PI * Math.sqrt(dx * dx + dy * dy)) / period;
      phase += 0.6 * Math.sin((x + y) / 23) + 0.5 * Math.sin(y / 17 - x / 41);
      for (const [px, py, s] of dislocations) phase += s * Math.atan2(y - py, x - px);
      let v = 0.5 + 0.5 * Math.cos(phase);
      // fingertip mask: soft ellipse
      const e = ((x - cx) / (w * 0.42)) ** 2 + ((y - cy) / (h * 0.46)) ** 2;
      const fade = Math.max(0, Math.min(1, (1.0 - e) * 6));
      const light = 0.78 + 0.22 * Math.cos(((x - w * 0.3) / w) * 2.2) * Math.cos(((y - h * 0.2) / h) * 1.6);
      v = v * 0.85 + 0.075; // ridge contrast
      const g = (v * light * fade + 0.62 * (1 - fade)) * 255;
      put(img, x, y, [g * 0.98 + 8, g * 0.86 + 6, g * 0.78 + 4]);
    }
  }
  addNoise(img, 5, seed + 1);
  return img;
}

export const samples: SampleDef[] = [
  { id: 'scene', label: 'Test scene', description: 'Shapes, lines, letters and gradient: edges, filters, corners.', make: sceneImage },
  { id: 'lowcontrast', label: 'Low contrast', description: 'A dull, dark version of the scene for histogram work.', make: lowContrastImage },
  { id: 'coins', label: 'Touching discs', description: 'Bright discs that touch: connected components and watershed.', make: coinsImage },
  { id: 'colors', label: 'Colored shapes', description: 'Saturated colors on gray: HSV segmentation and k-means.', make: colorsImage },
  { id: 'zoneplate', label: 'Zone plate', description: 'Chirp pattern that makes aliasing obvious.', make: zonePlateImage },
  { id: 'fingerprint', label: 'Synthetic ridges', description: 'A mathematical ridge pattern (not a real fingerprint).', make: () => fingerprintImage() },
];

export const sampleById = (id: string): SampleDef => samples.find((s) => s.id === id) ?? samples[0];
