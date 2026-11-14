import { termById } from '../data/terms';
import { intensityDemos, histogramDemos } from './intensity';
import { filteringDemos } from './filtering';
import { frequencyDemos, restorationDemos } from './frequency';
import { colorDemos, geometryDemos } from './color-geometry';
import { morphologyDemos, segmentationDemos } from './morph-seg';
import { compressionDemos, featureDemos } from './compression-features';
import { multiresDemos, motionDemos } from './multires-motion';
import { samplingDemos, textureDemos } from './sampling-texture';
import type { Demo } from './types';

/** Every Playground demo. A term links to one through `demoId`. */
const courseDemos: Demo[] = [
  ...samplingDemos.filter((d) => d.group === 'Fundamentals'),
  ...intensityDemos,
  ...samplingDemos.filter((d) => d.group === 'Intensity transformations'),
  ...histogramDemos,
  ...filteringDemos,
  ...frequencyDemos,
  ...restorationDemos,
  ...colorDemos,
  ...geometryDemos,
  ...morphologyDemos,
  ...segmentationDemos,
  ...compressionDemos,
  ...multiresDemos,
  ...textureDemos,
  ...featureDemos,
  ...motionDemos,
];

/** Only demos that illustrate a term GATTACA uses. */
export const demos: Demo[] = courseDemos
  .filter((d) => d.termIds.some((id) => termById.has(id)))
  .map((d) => ({ ...d, termIds: d.termIds.filter((id) => termById.has(id)) }));

export const demoById = (id: string): Demo | undefined => demos.find((d) => d.id === id);

/** Groups in syllabus order, each with its demos. */
export const demoGroups: Array<{ name: string; demos: Demo[] }> = (() => {
  const order: string[] = [];
  for (const d of demos) if (!order.includes(d.group)) order.push(d.group);
  return order.map((name) => ({ name, demos: demos.filter((d) => d.group === name) }));
})();

export { defaultParams } from './types';
