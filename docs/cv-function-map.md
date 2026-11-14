# Step 0: which OpenCV functions GATTACA uses, and which DIP topic each belongs to

Source: static scan of `gattaca-main/gattaca/**`, `study/**` and `service/**` in the original project (read-only).
Call-site counts are from the Python code.

| cv2 function (call-sites) | Where in GATTACA | DIP topic | Glossary unit |
|---|---|---|---|
| `cvtColor` (19) | grayscale conversion, colour analysis | Colour models, image types | 8, 1 |
| `createCLAHE` (1) | `pipeline/enhance.py` illumination normalisation | Histogram equalisation (CLAHE) | 4 |
| `GaussianBlur` (39) | local mean/contrast normalisation, tensor smoothing, degradation ladders | Spatial smoothing | 5 |
| `bilateralFilter` (1), `fastNlMeansDenoising` (1) | `enhance.py` denoise step | Edge-preserving smoothing, non-local means | 5, 7 |
| `medianBlur` (1) | period-field clean-up | Order-statistic filters | 5, 7 |
| `Sobel` (2) | structure-tensor orientation field | Gradients / edge detection | 5, 11 |
| `Laplacian` (2) | focus / sharpness measure | Laplacian, sharpness | 5 |
| `filter2D` (4) | Gabor bank application | Correlation / convolution | 5 |
| `getGaborKernel` (2) | `enhance.py` ridge enhancement | Orientation filtering, Gabor texture | 14, 6 |
| `threshold` + `THRESH_OTSU` (4) | binarising enhanced ridges | Global thresholding, Otsu | 11 |
| `getStructuringElement`, `morphologyEx`, `erode`, `dilate` | finger mask (FingerSafe-style ROI), ridge-mask clean-up | Morphology | 10 |
| `ximgproc.thinning` (Zhang-Suen) | `extract.py` skeletonisation before minutiae | Thinning / skeleton | 10 |
| `connectedComponents(WithStats)` (3) | removing small blobs | Connected-component labelling | 11 |
| `findContours`, `contourArea`, `drawContours`, `convexHull`, `convexityDefects`, `fitLine` | `roi.py`, `detect.py` largest-contour finger crop | Boundary / shape description | 14 |
| `distanceTransform` (3) | mask margins, fingertip localisation | Distance measures | 2 |
| `resize` (16), `INTER_AREA/LINEAR/CUBIC/NEAREST` | canonical-scale resampling, PPRP degradation ladder | Sampling, interpolation, aliasing | 1, 9 |
| `warpPerspective`, `getPerspectiveTransform`, `perspectiveTransform` | `rectify.py` frontal view | Geometric transforms, homography | 9 |
| `warpAffine`, `getRotationMatrix2D`, `invertAffineTransform`, `estimateAffinePartial2D` | alignment, augmentation | Affine transforms, registration | 9 |
| `remap` (8), `createThinPlateSplineShapeTransformer` | `deform.py` elastic (TPS) deformation correction | Non-rigid warping | 9 |
| `findTransformECC` (2) | `video/align.py` frame registration | Image registration, stabilisation (ECC) | 16 |
| `calcOpticalFlowPyrLK` (2), `goodFeaturesToTrack` | `video/track.py` finger tracking | Motion analysis, optical flow | 16 |
| `ORB_create`, `BFMatcher`, `RANSAC` | feature matching for alignment | ORB, feature matching | 15 |
| `imencode` + `IMWRITE_JPEG_QUALITY` | JPEG axis of the degradation study | JPEG compression | 12 |
| `dnn.readNetFromONNX`, `dnn.NMSBoxes` | `detect.py` hand/finger detector | Pattern classification (learned) | 15 |
| `applyColorMap` (`COLORMAP_TURBO`) | recoverability heat map | Pseudo-colouring | 8 |
| `normalize`, `bitwise_and`, `merge`, `copyMakeBorder` | utilities | Contrast stretching, masking | 3 |
| `putText`, `circle`, `line`, `rectangle`, `arrowedLine` | evidence overlays | visualisation only | n/a |

## Availability in OpenCV.js 5.0 (the WASM build DIP Explorer uses)

Checked at runtime in Node with `@techstark/opencv-js@5.0.0-release.1`.

Missing from that build, so implemented in TypeScript inside the demos: `getGaborKernel`, `goodFeaturesToTrack`,
`dct`/`idct`, `idft` (use `dft` with `DFT_INVERSE`), `fastNlMeansDenoising`, `ximgproc.thinning`, `imencode`
(JPEG goes through the browser canvas), `SIFT`, `phaseCorrelate`. CLAHE is `new cv.CLAHE(clip, tileSize)`
rather than `createCLAHE`. The glossary notes these differences where they matter.
