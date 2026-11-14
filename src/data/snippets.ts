import type { Snippet } from './types';

const s = (py: string, js: string | null, note?: string): Snippet => ({ py, js, note });
const NOT_IN_JS = 'Not exposed in the OpenCV.js 5.0 build. The Playground demos implement it in TypeScript instead.';

/**
 * Copyable snippets, keyed by the names used in `Term.opencvFunctions`.
 * Python uses `cv2` (OpenCV-Python); JS uses OpenCV.js where `src`/`dst` are cv.Mat objects.
 * Remember: every cv.Mat created in JS must be freed with .delete().
 */
export const snippets: Record<string, Snippet> = {
  'cv.imread': s(
    `img = cv2.imread("photo.png")            # BGR, uint8\ngray = cv2.imread("photo.png", cv2.IMREAD_GRAYSCALE)`,
    `const src = cv.imread(canvasOrImgElement); // RGBA Mat\n// ...use src...\nsrc.delete();`,
  ),
  'cv.imshow': s(`cv2.imshow("window", img); cv2.waitKey(0)`, `cv.imshow(outputCanvas, dst); // draws a Mat on a <canvas>`),
  'cv.imencode': s(
    `ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])\nprint(len(buf), "bytes")`,
    null,
    'In the browser use canvas.toBlob(cb, "image/jpeg", 0.75) to get real JPEG bytes (the JPEG demo does this).',
  ),
  'cv.cvtColor': s(
    `gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\nhsv  = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)\nlab  = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)`,
    `const gray = new cv.Mat();\ncv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);\nconst rgb = new cv.Mat(); cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);\ncv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);`,
  ),
  'cv.split': s(`b, g, r = cv2.split(img)`, `const planes = new cv.MatVector();\ncv.split(rgb, planes);\nconst r = planes.get(0); // ...\nplanes.delete();`),
  'cv.merge': s(`img = cv2.merge([b, g, r])`, `const planes = new cv.MatVector();\nplanes.push_back(r); planes.push_back(g); planes.push_back(b);\ncv.merge(planes, dst);`),
  'cv.convertScaleAbs': s(
    `out = cv2.convertScaleAbs(img, alpha=1.5, beta=20)   # |alpha*img + beta| clipped to uint8`,
    `cv.convertScaleAbs(src, dst, 1.5, 20); // dst = saturate(|alpha*src + beta|)`,
  ),
  'cv.bitwise_not': s(`neg = cv2.bitwise_not(gray)          # 255 - gray`, `cv.bitwise_not(gray, dst);`),
  'cv.bitwise_and': s(
    `plane7 = cv2.bitwise_and(gray, 0b10000000)   # keep MSB\nmasked = cv2.bitwise_and(img, img, mask=mask)`,
    `cv.bitwise_and(src, mask, dst);`,
  ),
  'cv.LUT': s(
    `lut = np.array([255*(i/255)**0.5 for i in range(256)], dtype=np.uint8)\nout = cv2.LUT(gray, lut)`,
    `const lutData = new Uint8Array(256).map((_, i) => 255 * Math.pow(i / 255, 0.5));\nconst lut = cv.matFromArray(1, 256, cv.CV_8UC1, Array.from(lutData));\ncv.LUT(gray, lut, dst);`,
  ),
  'cv.pow': s(`out = cv2.pow(gray.astype(np.float32)/255, 0.5)`, `src.convertTo(f, cv.CV_32F, 1 / 255);\ncv.pow(f, 0.5, dst);`),
  'cv.log': s(`out = cv2.log(1 + gray.astype(np.float32))`, `src.convertTo(f, cv.CV_32F);\ncv.add(f, new cv.Mat(f.rows, f.cols, cv.CV_32F, new cv.Scalar(1)), f);\ncv.log(f, dst);`),
  'cv.exp': s(`out = cv2.exp(f)`, `cv.exp(f, dst);`),
  'cv.normalize': s(
    `out = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX)   # min-max contrast stretch`,
    `cv.normalize(src, dst, 0, 255, cv.NORM_MINMAX, cv.CV_8U);`,
  ),
  'cv.addWeighted': s(
    `sharp = cv2.addWeighted(img, 1.5, blur, -0.5, 0)   # unsharp mask`,
    `cv.addWeighted(src, 1.5, blur, -0.5, 0, dst);`,
  ),
  'cv.subtract': s(`diff = cv2.subtract(a, b)`, `cv.subtract(a, b, dst);`),
  'cv.absdiff': s(`diff = cv2.absdiff(frame, prev)`, `cv.absdiff(frame, prev, dst);`),
  'cv.mean': s(`m = cv2.mean(img)   # per-channel mean`, `const m = cv.mean(src); // [r, g, b, a]`),
  'cv.meanStdDev': s(`mean, std = cv2.meanStdDev(gray)`, `const mean = new cv.Mat(), std = new cv.Mat();\ncv.meanStdDev(gray, mean, std);\nconsole.log(mean.data64F[0], std.data64F[0]);`),
  'cv.calcHist': s(
    `hist = cv2.calcHist([gray], [0], None, [256], [0, 256])`,
    `const srcVec = new cv.MatVector(); srcVec.push_back(gray);\nconst hist = new cv.Mat();\ncv.calcHist(srcVec, [0], new cv.Mat(), hist, [256], [0, 255]);`,
  ),
  'cv.equalizeHist': s(`eq = cv2.equalizeHist(gray)`, `cv.equalizeHist(gray, dst);`),
  'cv.CLAHE': s(
    `clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))\nout = clahe.apply(gray)`,
    `const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8)); // note: not cv.createCLAHE\nclahe.apply(gray, dst);\nclahe.delete();`,
  ),
  'cv.threshold': s(
    `_, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)\nt, otsu   = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)`,
    `cv.threshold(gray, dst, 127, 255, cv.THRESH_BINARY);\nconst t = cv.threshold(gray, dst, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU); // returns T`,
  ),
  'cv.adaptiveThreshold': s(
    `out = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)`,
    `cv.adaptiveThreshold(gray, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);`,
  ),
  'cv.inRange': s(
    `mask = cv2.inRange(hsv, (35, 60, 60), (85, 255, 255))   # greens`,
    `const lo = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 60, 60, 0]);\nconst hi = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [85, 255, 255, 255]);\ncv.inRange(hsv, lo, hi, mask);`,
  ),
  'cv.applyColorMap': s(`heat = cv2.applyColorMap(gray, cv2.COLORMAP_TURBO)`, `cv.applyColorMap(gray, dst, cv.COLORMAP_JET);`),
  'cv.filter2D': s(
    `kernel = np.ones((5, 5), np.float32) / 25\nout = cv2.filter2D(img, -1, kernel)      # NOTE: correlation, not convolution`,
    `const k = cv.matFromArray(3, 3, cv.CV_32F, [0, -1, 0, -1, 5, -1, 0, -1, 0]);\ncv.filter2D(src, dst, cv.CV_8U, k);\nk.delete();`,
  ),
  'cv.sepFilter2D': s(`out = cv2.sepFilter2D(img, -1, kx, ky)`, `cv.sepFilter2D(src, dst, cv.CV_8U, kx, ky);`),
  'cv.blur': s(`out = cv2.blur(img, (5, 5))`, `cv.blur(src, dst, new cv.Size(5, 5));`),
  'cv.boxFilter': s(`out = cv2.boxFilter(img, -1, (5, 5))`, `cv.boxFilter(src, dst, -1, new cv.Size(5, 5));`),
  'cv.GaussianBlur': s(
    `out = cv2.GaussianBlur(img, (0, 0), sigmaX=2)   # kernel size derived from sigma`,
    `cv.GaussianBlur(src, dst, new cv.Size(0, 0), 2, 2, cv.BORDER_DEFAULT);`,
  ),
  'cv.medianBlur': s(`out = cv2.medianBlur(img, 5)`, `cv.medianBlur(src, dst, 5); // ksize must be odd`),
  'cv.bilateralFilter': s(
    `out = cv2.bilateralFilter(img, d=9, sigmaColor=75, sigmaSpace=75)`,
    `const rgb = new cv.Mat(); cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB); // needs 1 or 3 channels\ncv.bilateralFilter(rgb, dst, 9, 75, 75, cv.BORDER_DEFAULT);`,
  ),
  'cv.fastNlMeansDenoising': s(`out = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)`, null, NOT_IN_JS),
  'cv.Laplacian': s(
    `lap = cv2.Laplacian(gray, cv2.CV_16S, ksize=3)\nsharp = cv2.convertScaleAbs(gray.astype(np.int16) - lap)\nfocus = cv2.Laplacian(gray, cv2.CV_64F).var()   # blur measure`,
    `cv.Laplacian(gray, lap, cv.CV_16S, 3, 1, 0, cv.BORDER_DEFAULT);`,
  ),
  'cv.Sobel': s(
    `gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)\ngy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)\nmag = cv2.magnitude(gx, gy)`,
    `cv.Sobel(gray, gx, cv.CV_32F, 1, 0, 3);\ncv.Sobel(gray, gy, cv.CV_32F, 0, 1, 3);\ncv.magnitude(gx, gy, mag);`,
  ),
  'cv.Scharr': s(`gx = cv2.Scharr(gray, cv2.CV_32F, 1, 0)`, `cv.Scharr(gray, gx, cv.CV_32F, 1, 0);`),
  'cv.magnitude': s(`mag = cv2.magnitude(gx, gy)`, `cv.magnitude(gx, gy, mag);`),
  'cv.Canny': s(`edges = cv2.Canny(gray, 100, 200)   # low, high thresholds`, `cv.Canny(gray, edges, 100, 200, 3, false);`),
  'cv.dft': s(
    `f = np.float32(gray)\nF = cv2.dft(f, flags=cv2.DFT_COMPLEX_OUTPUT)\nF = np.fft.fftshift(F, axes=(0, 1))\nmag = cv2.magnitude(F[..., 0], F[..., 1])\nspec = np.log1p(mag)`,
    `const planes = new cv.MatVector();\nplanes.push_back(f32); planes.push_back(cv.Mat.zeros(f32.rows, f32.cols, cv.CV_32F));\ncv.merge(planes, complexI);\ncv.dft(complexI, complexI);            // inverse: cv.dft(c, c, cv.DFT_INVERSE | cv.DFT_SCALE)\ncv.split(complexI, planes);\ncv.magnitude(planes.get(0), planes.get(1), mag);`,
    'OpenCV.js has no cv.idft; use cv.dft with DFT_INVERSE.',
  ),
  'cv.getOptimalDFTSize': s(`m = cv2.getOptimalDFTSize(rows)`, `const m = cv.getOptimalDFTSize(src.rows);`),
  'cv.copyMakeBorder': s(
    `padded = cv2.copyMakeBorder(gray, 0, m - rows, 0, n - cols, cv2.BORDER_CONSTANT, value=0)`,
    `cv.copyMakeBorder(src, padded, 0, m - src.rows, 0, n - src.cols, cv.BORDER_CONSTANT, new cv.Scalar(0));`,
  ),
  'cv.mulSpectrums': s(`G = cv2.mulSpectrums(F, H, 0)`, null, NOT_IN_JS + ' Multiply the real/imag planes manually.'),
  'cv.dct': s(`C = cv2.dct(np.float32(block))     # 8x8 block DCT-II\nrec = cv2.idct(C)`, null, NOT_IN_JS),
  'cv.randn': s(
    `noise = np.random.normal(0, 25, gray.shape)\nnoisy = np.clip(gray + noise, 0, 255).astype(np.uint8)`,
    `const noise = new cv.Mat(src.rows, src.cols, cv.CV_32F);\ncv.randn(noise, new cv.Mat(1, 1, cv.CV_32F, new cv.Scalar(0)), new cv.Mat(1, 1, cv.CV_32F, new cv.Scalar(25)));`,
  ),
  'cv.PSNR': s(`psnr = cv2.PSNR(original, processed)   # dB`, null, NOT_IN_JS + ' It is 10*log10(255^2/MSE).'),
  'cv.getRotationMatrix2D': s(
    `M = cv2.getRotationMatrix2D((w/2, h/2), angle=30, scale=1.0)`,
    `const M = cv.getRotationMatrix2D(new cv.Point(src.cols / 2, src.rows / 2), 30, 1.0);`,
  ),
  'cv.warpAffine': s(
    `out = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR)`,
    `cv.warpAffine(src, dst, M, new cv.Size(src.cols, src.rows), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());`,
  ),
  'cv.getAffineTransform': s(
    `M = cv2.getAffineTransform(src_pts, dst_pts)   # 3 point pairs`,
    `const M = cv.getAffineTransform(srcTri, dstTri); // srcTri/dstTri: cv.matFromArray(3, 1, cv.CV_32FC2, [x0,y0,...])`,
  ),
  'cv.getPerspectiveTransform': s(
    `H = cv2.getPerspectiveTransform(src_pts, dst_pts)   # 4 point pairs`,
    `const H = cv.getPerspectiveTransform(srcPts, dstPts); // cv.matFromArray(4, 1, cv.CV_32FC2, [...])`,
  ),
  'cv.warpPerspective': s(
    `out = cv2.warpPerspective(img, H, (w, h))`,
    `cv.warpPerspective(src, dst, H, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());`,
  ),
  'cv.findHomography': s(
    `H, inliers = cv2.findHomography(pts1, pts2, cv2.RANSAC, 3.0)`,
    `const H = cv.findHomography(pts1, pts2, cv.RANSAC, 3.0);`,
  ),
  'cv.remap': s(`out = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR)`, `cv.remap(src, dst, mapX, mapY, cv.INTER_LINEAR);`),
  'cv.resize': s(
    `small = cv2.resize(img, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)   # anti-aliased shrink\nbig   = cv2.resize(img, (w*2, h*2), interpolation=cv2.INTER_CUBIC)`,
    `cv.resize(src, dst, new cv.Size(0, 0), 0.25, 0.25, cv.INTER_AREA);\ncv.resize(src, dst, new cv.Size(w * 2, h * 2), 0, 0, cv.INTER_CUBIC);`,
  ),
  'cv.getStructuringElement': s(
    `se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))   # MORPH_RECT, MORPH_CROSS`,
    `const se = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));`,
  ),
  'cv.erode': s(`out = cv2.erode(binary, se, iterations=1)`, `cv.erode(src, dst, se, new cv.Point(-1, -1), 1);`),
  'cv.dilate': s(`out = cv2.dilate(binary, se, iterations=1)`, `cv.dilate(src, dst, se, new cv.Point(-1, -1), 1);`),
  'cv.morphologyEx': s(
    `opened  = cv2.morphologyEx(img, cv2.MORPH_OPEN, se)\nclosed  = cv2.morphologyEx(img, cv2.MORPH_CLOSE, se)\ngrad    = cv2.morphologyEx(img, cv2.MORPH_GRADIENT, se)\ntophat  = cv2.morphologyEx(img, cv2.MORPH_TOPHAT, se)\nblackh  = cv2.morphologyEx(img, cv2.MORPH_BLACKHAT, se)`,
    `cv.morphologyEx(src, dst, cv.MORPH_OPEN, se); // MORPH_CLOSE, MORPH_GRADIENT, MORPH_TOPHAT, MORPH_BLACKHAT`,
  ),
  'cv.ximgproc.thinning': s(
    `skel = cv2.ximgproc.thinning(binary, thinningType=cv2.ximgproc.THINNING_ZHANGSUEN)   # needs opencv-contrib`,
    null,
    NOT_IN_JS + ' (ximgproc is a contrib module). The thinning demo implements Zhang-Suen in TypeScript.',
  ),
  'cv.floodFill': s(
    `mask = np.zeros((h + 2, w + 2), np.uint8)\ncv2.floodFill(img, mask, seedPoint=(x, y), newVal=(255, 0, 0), loDiff=(10,)*3, upDiff=(10,)*3)`,
    `const mask = new cv.Mat.zeros(src.rows + 2, src.cols + 2, cv.CV_8UC1);\ncv.floodFill(rgb, mask, new cv.Point(x, y), new cv.Scalar(255, 0, 0), new cv.Rect(), new cv.Scalar(10, 10, 10), new cv.Scalar(10, 10, 10), 4);`,
  ),
  'cv.distanceTransform': s(
    `dist = cv2.distanceTransform(binary, cv2.DIST_L2, 5)     # DIST_L1, DIST_C for city-block / chessboard`,
    `cv.distanceTransform(binary, dist, cv.DIST_L2, 5);`,
  ),
  'cv.HoughLines': s(
    `lines = cv2.HoughLines(edges, 1, np.pi/180, threshold=150)   # (rho, theta)`,
    `cv.HoughLines(edges, lines, 1, Math.PI / 180, 150, 0, 0, 0, Math.PI); // lines.data32F: rho, theta, ...`,
  ),
  'cv.HoughLinesP': s(
    `segs = cv2.HoughLinesP(edges, 1, np.pi/180, 80, minLineLength=40, maxLineGap=10)`,
    `cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 80, 40, 10); // lines.data32S: x1, y1, x2, y2, ...`,
  ),
  'cv.HoughCircles': s(
    `circles = cv2.HoughCircles(gray, cv2.HOUGH_GRADIENT, dp=1.2, minDist=30, param1=100, param2=40)`,
    `cv.HoughCircles(gray, circles, cv.HOUGH_GRADIENT, 1.2, 30, 100, 40, 0, 0);`,
  ),
  'cv.watershed': s(
    `markers = cv2.connectedComponents(sure_fg)[1] + 1\nmarkers[unknown == 255] = 0\nmarkers = cv2.watershed(img_bgr, markers)   # boundaries are -1`,
    `cv.watershed(rgb3, markers); // rgb3 must be 8UC3, markers 32SC1; boundaries become -1`,
  ),
  'cv.connectedComponents': s(`n, labels = cv2.connectedComponents(binary, connectivity=8)`, `const n = cv.connectedComponents(binary, labels, 8, cv.CV_32S);`),
  'cv.connectedComponentsWithStats': s(
    `n, labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)\nareas = stats[:, cv2.CC_STAT_AREA]`,
    `const n = cv.connectedComponentsWithStats(binary, labels, stats, centroids, 8, cv.CV_32S);\nconst area = stats.intAt(i, cv.CC_STAT_AREA);`,
  ),
  'cv.kmeans': s(
    `Z = img.reshape(-1, 3).astype(np.float32)\ncrit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)\n_, labels, centers = cv2.kmeans(Z, 4, None, crit, 5, cv2.KMEANS_PP_CENTERS)`,
    `const crit = new cv.TermCriteria(cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER, 10, 1.0);\ncv.kmeans(samples, 4, labels, crit, 3, cv.KMEANS_PP_CENTERS, centers);`,
  ),
  'cv.grabCut': s(
    `mask = np.zeros(img.shape[:2], np.uint8)\nbgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)\ncv2.grabCut(img, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)`,
    `cv.grabCut(rgb3, mask, rect, bgdModel, fgdModel, 5, cv.GC_INIT_WITH_RECT);`,
  ),
  'cv.findContours': s(
    `contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)`,
    `cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);`,
  ),
  'cv.approxPolyDP': s(
    `eps = 0.01 * cv2.arcLength(cnt, True)\npoly = cv2.approxPolyDP(cnt, eps, True)`,
    `cv.approxPolyDP(cnt, poly, 0.01 * cv.arcLength(cnt, true), true);`,
  ),
  'cv.arcLength': s(`perimeter = cv2.arcLength(cnt, True)`, `const perimeter = cv.arcLength(cnt, true);`),
  'cv.contourArea': s(`area = cv2.contourArea(cnt)`, `const area = cv.contourArea(cnt);`),
  'cv.boundingRect': s(`x, y, w, h = cv2.boundingRect(cnt)`, `const r = cv.boundingRect(cnt); // r.x, r.y, r.width, r.height`),
  'cv.moments': s(
    `M = cv2.moments(binary, binaryImage=True)\ncx, cy = M["m10"]/M["m00"], M["m01"]/M["m00"]`,
    `const M = cv.moments(binary, true);\nconst cx = M.m10 / M.m00, cy = M.m01 / M.m00;`,
  ),
  'cv.HuMoments': s(`hu = cv2.HuMoments(cv2.moments(cnt)).flatten()`, `const hu = new cv.Mat(); cv.HuMoments(cv.moments(cnt), hu);`),
  'cv.getGaborKernel': s(
    `k = cv2.getGaborKernel(ksize=(21, 21), sigma=4, theta=np.pi/4, lambd=10, gamma=0.5, psi=0)\nout = cv2.filter2D(gray, cv2.CV_32F, k)`,
    null,
    NOT_IN_JS + ' Build the kernel from the formula, then call cv.filter2D.',
  ),
  'cv.cornerHarris': s(
    `R = cv2.cornerHarris(np.float32(gray), blockSize=2, ksize=3, k=0.04)\ncorners = np.argwhere(R > 0.01 * R.max())`,
    `cv.cornerHarris(gray32, R, 2, 3, 0.04, cv.BORDER_DEFAULT);`,
  ),
  'cv.cornerMinEigenVal': s(`R = cv2.cornerMinEigenVal(gray, blockSize=3)`, `cv.cornerMinEigenVal(gray, R, 3, 3, cv.BORDER_DEFAULT);`),
  'cv.goodFeaturesToTrack': s(
    `pts = cv2.goodFeaturesToTrack(gray, maxCorners=200, qualityLevel=0.01, minDistance=8)`,
    null,
    NOT_IN_JS + ' Use cv.cornerMinEigenVal plus non-maximum suppression.',
  ),
  'cv.SIFT': s(`sift = cv2.SIFT_create()\nkps, desc = sift.detectAndCompute(gray, None)`, null, NOT_IN_JS),
  'cv.ORB': s(
    `orb = cv2.ORB_create(nfeatures=500)\nkps, desc = orb.detectAndCompute(gray, None)`,
    `const orb = new cv.ORB(500);\nconst kps = new cv.KeyPointVector(), desc = new cv.Mat();\norb.detectAndCompute(gray, new cv.Mat(), kps, desc);`,
  ),
  'cv.BFMatcher': s(
    `bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)\nmatches = sorted(bf.match(desc1, desc2), key=lambda m: m.distance)`,
    `const bf = new cv.BFMatcher(cv.NORM_HAMMING, true);\nconst matches = new cv.DMatchVector();\nbf.match(desc1, desc2, matches);`,
  ),
  'cv.matchTemplate': s(
    `res = cv2.matchTemplate(gray, templ, cv2.TM_CCOEFF_NORMED)\n_, maxv, _, maxloc = cv2.minMaxLoc(res)`,
    `cv.matchTemplate(gray, templ, res, cv.TM_CCOEFF_NORMED);\nconst { maxVal, maxLoc } = cv.minMaxLoc(res);`,
  ),
  'cv.minMaxLoc': s(`minv, maxv, minloc, maxloc = cv2.minMaxLoc(res)`, `const { minVal, maxVal, minLoc, maxLoc } = cv.minMaxLoc(res);`),
  'cv.pyrDown': s(`smaller = cv2.pyrDown(img)    # Gaussian blur + drop every 2nd row/col`, `cv.pyrDown(src, dst, new cv.Size(0, 0), cv.BORDER_DEFAULT);`),
  'cv.pyrUp': s(`bigger = cv2.pyrUp(img)`, `cv.pyrUp(src, dst, new cv.Size(0, 0), cv.BORDER_DEFAULT);`),
  'cv.calcOpticalFlowPyrLK': s(
    `p1, st, err = cv2.calcOpticalFlowPyrLK(prev_gray, gray, p0, None, winSize=(21, 21), maxLevel=3)\ngood_new = p1[st == 1]`,
    `cv.calcOpticalFlowPyrLK(prevGray, gray, p0, p1, status, err, new cv.Size(21, 21), 3);`,
  ),
  'cv.BackgroundSubtractorMOG2': s(
    `bs = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=16)\nfg = bs.apply(frame)`,
    `const bs = new cv.BackgroundSubtractorMOG2(500, 16, true);\nbs.apply(frame, fgMask);`,
  ),
  'cv.findTransformECC': s(
    `warp = np.eye(2, 3, dtype=np.float32)\ncrit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-6)\ncc, warp = cv2.findTransformECC(ref, mov, warp, cv2.MOTION_AFFINE, crit, None, 5)\naligned = cv2.warpAffine(mov, warp, (w, h), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)`,
    `const warp = cv.Mat.eye(2, 3, cv.CV_32F);\nconst crit = new cv.TermCriteria(cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 100, 1e-6);\ncv.findTransformECC(ref, mov, warp, cv.MOTION_AFFINE, crit, new cv.Mat(), 5);`,
  ),
};

export const hasSnippet = (fn: string): boolean => fn in snippets;
