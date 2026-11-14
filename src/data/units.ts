import type { Unit } from './types';
import { allTerms } from './terms';

const allUnits: Unit[] = [
  { id: 'u1', number: 1, title: 'Fundamentals of Digital Images', blurb: 'What an image is, how it is sampled and quantized, and the steps of a DIP system.' },
  { id: 'u2', number: 2, title: 'Pixel Relationships', blurb: 'Neighborhoods, adjacency, connectivity, regions, boundaries and distance measures.' },
  { id: 'u3', number: 3, title: 'Intensity Transformations', blurb: 'Point operations that map each input gray level to a new one.' },
  { id: 'u4', number: 4, title: 'Histogram Processing', blurb: 'Using the gray-level distribution to enhance contrast.' },
  { id: 'u5', number: 5, title: 'Spatial Filtering', blurb: 'Neighborhood operations: smoothing, sharpening and gradients.' },
  { id: 'u6', number: 6, title: 'Frequency Domain Processing', blurb: 'Fourier analysis and filtering in the frequency domain.' },
  { id: 'u7', number: 7, title: 'Image Restoration', blurb: 'Modeling degradation and noise, and undoing them.' },
  { id: 'u8', number: 8, title: 'Color Image Processing', blurb: 'Color models, transforms and color-based segmentation.' },
  { id: 'u9', number: 9, title: 'Geometric Transformations', blurb: 'Moving, rotating, scaling and warping pixel coordinates.' },
  { id: 'u10', number: 10, title: 'Morphological Processing', blurb: 'Shape-based operations with structuring elements.' },
  { id: 'u11', number: 11, title: 'Image Segmentation', blurb: 'Splitting an image into meaningful regions.' },
  { id: 'u12', number: 12, title: 'Image Compression', blurb: 'Removing redundancy, coding schemes and quality metrics.' },
  { id: 'u13', number: 13, title: 'Wavelets and Multiresolution', blurb: 'Pyramids, wavelets and subband coding.' },
  { id: 'u14', number: 14, title: 'Representation and Description', blurb: 'Describing boundaries, regions, shape and texture.' },
  { id: 'u15', number: 15, title: 'Feature Extraction and Recognition', blurb: 'Corners, keypoints, matching and classification.' },
  { id: 'u16', number: 16, title: 'Video and Motion', blurb: 'Temporal analysis: differencing, flow, stabilization and fusion.' },
  { id: 'u17', number: 17, title: 'Applications', blurb: 'Biometrics, medical, remote sensing, OCR and ethics.' },
];


/** Units that still contain at least one GATTACA term. */
export const units: Unit[] = allUnits.filter((u) => allTerms.some((t) => t.unit === u.id && termIdsHas(t.id)));
import { GATTACA_TERM_IDS } from './gattaca';
function termIdsHas(id: string) { return GATTACA_TERM_IDS.has(id); }
export const unitById = (id: string): Unit | undefined => allUnits.find((u) => u.id === id);
