/** The DIP terms the GATTACA project actually uses (pipeline, video path, study, evidence map). */
export const GATTACA_TERM_IDS = new Set<string>([
  'image','pixel','resolution','grayscale-image','rgb-image','binary-image','sampling','spatial-resolution','aliasing','nyquist-criterion','pprp','steps-of-dip',
  'histogram','histogram-equalization','clahe','contrast-stretching',
  'gaussian-smoothing','bilateral-filter','median-filter','non-local-means','gaussian-noise','kernel','convolution','correlation','image-gradient','sobel-operator','laplacian',
  'fourier-transform','dft','fft','fourier-spectrum-phase','band-pass-filter','gabor-filter',
  'blur-psf','degradation-model','hsv-hsi','pseudo-coloring',
  'scaling','bilinear-interpolation','bicubic-interpolation','nearest-neighbor-interpolation','affine-transformation','perspective-transformation','image-registration',
  'structuring-element','erosion','dilation','opening','closing','skeleton-thinning','hit-or-miss',
  'neighborhood-8','euclidean-distance','connectivity','connected-components','boundary',
  'thresholding','otsu-thresholding','adaptive-thresholding','edge-detection',
  'jpeg-compression','lossy-compression','dct','psnr',
  'shi-tomasi-corner','orb-features','feature-matching','pattern-classification',
  'optical-flow','image-stabilization-ecc','multi-frame-fusion',
  'biometrics','ridge-analysis','minutiae','privacy-ethics',
]);
