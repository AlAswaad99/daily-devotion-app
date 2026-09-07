import fs from 'node:fs'; import path from 'node:path'; import { PNG } from 'pngjs'; import pixelmatch from 'pixelmatch';
const [refDir, appDir, outDir] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const walk = (d, b = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name), path.join(b, e.name)) : e.name.endsWith('.png') ? [path.join(b, e.name)] : []);
const read = f => PNG.sync.read(fs.readFileSync(f));
const fit = (img, w, h) => { if (img.width === w && img.height === h) return img; const o = new PNG({ width: w, height: h }); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.floor(x * img.width / w), sy = Math.floor(y * img.height / h); const si = (sy * img.width + sx) * 4, di = (y * w + x) * 4; o.data.set(img.data.subarray(si, si + 4), di); } return o; };
const report = [];
for (const rel of walk(refDir)) { const a = path.join(appDir, rel); if (!fs.existsSync(a)) { report.push({ file: rel, status: 'missing-app-capture' }); continue; }
  const ref = read(path.join(refDir, rel)); const app = fit(read(a), ref.width, ref.height); const diff = new PNG({ width: ref.width, height: ref.height });
  const n = pixelmatch(ref.data, app.data, diff.data, ref.width, ref.height, { threshold: 0.1 });
  const out = path.join(outDir, rel.replace(/\.png$/, '.diff.png')); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, PNG.sync.write(diff));
  report.push({ file: rel, mismatchPct: +(100 * n / (ref.width * ref.height)).toFixed(2) }); }
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2)); console.table(report);
