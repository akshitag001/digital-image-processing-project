import type { CV, Params, RGBAImage } from '../cv/core';

export type ParamDef =
  | { type: 'range'; key: string; label: string; min: number; max: number; step: number; default: number; hint?: string }
  | { type: 'select'; key: string; label: string; options: Array<[value: string, label: string]>; default: string; hint?: string }
  | { type: 'checkbox'; key: string; label: string; default: boolean; hint?: string };

export interface DemoOutput {
  label: string;
  image: RGBAImage;
}

export interface DemoResult {
  outputs: DemoOutput[];
  stats?: Array<{ label: string; value: string }>;
  /** "What you are seeing": one or two plain-English sentences. */
  caption: string;
  /** The exact OpenCV call(s) that were run, with the current parameter values filled in. */
  call: string;
}

export interface Demo {
  id: string;
  title: string;
  group: string;
  summary: string;
  /** Glossary terms this demo illustrates (the first one is the "main" term). */
  termIds: string[];
  /** Id of the sample image that suits this demo best. */
  sample: string;
  params: ParamDef[];
  run: (cv: CV, src: RGBAImage, p: Params) => DemoResult | Promise<DemoResult>;
}

export const defaultParams = (d: Demo): Params => Object.fromEntries(d.params.map((p) => [p.key, p.default]));

export const oddSize = (v: number): number => 2 * Math.floor(v / 2) + 1;
