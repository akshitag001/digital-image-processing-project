import { newImage, type RGBAImage } from './core';

export type RGB = [number, number, number];

/** A minimal raster canvas over an RGBA buffer, for plots and overlays that do not need OpenCV. */
export class Raster {
  img: RGBAImage;
  constructor(width: number, height: number, bg: RGB = [255, 255, 255]) {
    this.img = newImage(width, height);
    this.fill(bg);
  }
  fill(c: RGB) {
    const d = this.img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  set(x: number, y: number, c: RGB) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.img.width || y >= this.img.height) return;
    const o = (y * this.img.width + x) * 4;
    this.img.data[o] = c[0];
    this.img.data[o + 1] = c[1];
    this.img.data[o + 2] = c[2];
    this.img.data[o + 3] = 255;
  }
  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
  }
  ring(cx: number, cy: number, r: number, c: RGB) {
    const steps = Math.max(16, Math.round(r * 8));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      this.set(cx + r * Math.cos(a), cy + r * Math.sin(a), c);
    }
  }
}

const PLOT_COLORS: RGB[] = [[220, 50, 47], [38, 139, 79], [38, 90, 200], [90, 90, 90]];

/** Histogram bar plot. Each series is a 256-bin array. */
export function histogramImage(series: number[][], opts: { colors?: RGB[]; marker?: number; w?: number; h?: number } = {}): RGBAImage {
  const w = opts.w ?? 256 + 20;
  const h = opts.h ?? 160;
  const r = new Raster(w, h, [250, 250, 250]);
  const colors = opts.colors ?? PLOT_COLORS;
  const bins = series[0]?.length ?? 256;
  let max = 1;
  for (const s of series) for (const v of s) if (v > max) max = v;
  const plotW = w - 20;
  const base = h - 14;
  series.forEach((s, si) => {
    const c = colors[si % colors.length];
    for (let i = 0; i < bins; i++) {
      const x = 10 + Math.round((i / (bins - 1)) * (plotW - 1));
      const bh = Math.round((s[i] / max) * (base - 6));
      if (series.length === 1) r.line(x, base, x, base - bh, c);
      else r.set(x, base - bh, c);
    }
  });
  r.line(10, base, 10 + plotW, base, [60, 60, 60]);
  if (opts.marker !== undefined) {
    const x = 10 + Math.round((opts.marker / (bins - 1)) * (plotW - 1));
    r.line(x, 4, x, base, [220, 50, 47]);
  }
  return r.img;
}

/** Plot of a 256-entry lookup table s = T(r) with the identity as a faint diagonal. */
export function curveImage(lut: ArrayLike<number>, size = 200): RGBAImage {
  const r = new Raster(size, size, [250, 250, 250]);
  for (let i = 0; i < size; i += 2) r.set(i, size - 1 - i, [200, 200, 200]);
  r.line(0, size - 1, size - 1, size - 1, [60, 60, 60]);
  r.line(0, 0, 0, size - 1, [60, 60, 60]);
  let px = 0;
  let py = size - 1 - Math.round((lut[0] / 255) * (size - 1));
  for (let i = 1; i < 256; i++) {
    const x = Math.round((i / 255) * (size - 1));
    const y = size - 1 - Math.round((Math.max(0, Math.min(255, lut[i])) / 255) * (size - 1));
    r.line(px, py, x, y, [38, 90, 200]);
    px = x;
    py = y;
  }
  return r.img;
}
