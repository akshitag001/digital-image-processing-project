// Copies the OpenCV.js (WASM) build from node_modules into public/ so it can be lazy-loaded
// with a <script> tag at runtime. public/opencv.js is git-ignored (13 MB); this runs automatically
// before dev/build via the pre* npm scripts.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const src = 'node_modules/@techstark/opencv-js/dist/opencv.js';
if (!existsSync(src)) {
  console.error('Run `npm install` first (missing ' + src + ')');
  process.exit(1);
}
mkdirSync('public', { recursive: true });
copyFileSync(src, 'public/opencv.js');
console.log('copied opencv.js -> public/opencv.js');
