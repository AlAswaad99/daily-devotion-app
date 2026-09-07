/**
 * Pixel audit: reference prep + masked diff.
 *
 * The reference PNGs are the whole design frame — a 392×846 phone with a 13px bezel
 * and a 128×30 notch — scaled to 250×540, sometimes cropped tighter. The app has no
 * bezel, so the two cannot be diffed as-is. This finds the notch (the one feature that
 * is pure black in every frame, light or dark), derives the scale and the inner
 * 366×820 screen rect from it, and crops the reference to that.
 *
 * Both sides are then masked where they can never agree: the status-bar strip
 * (design draws a mock iOS bar; Android draws its own) and the gesture pill at the
 * bottom. Everything else is compared with pixelmatch at the reference's own size.
 *
 *   node project/compare/audit.mjs prep            crop refs → compare/ref/
 *   node project/compare/audit.mjs diff            compare/app/ vs compare/ref/ → compare/out/
 *   node project/compare/audit.mjs diff <rel.png>  one file
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const here = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(here, '..', 'screenshots')
const REF = path.join(here, 'ref')
const APP = path.join(here, 'app')
const OUT = path.join(here, 'out')

/** Design geometry, in CSS px. */
const FRAME_W = 392
const BEZEL = 13
const SCREEN_W = FRAME_W - 2 * BEZEL // 366
const SCREEN_H = 846 - 2 * BEZEL // 820
const NOTCH_W = 128
const SAFE_TOP = 44
/** Android's gesture pill sits inside the bottom of the frame; the design has none. */
const MASK_BOTTOM = 16

const walk = (d, b = '') =>
  fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(path.join(d, e.name), path.join(b, e.name))
          : e.name.endsWith('.png')
            ? [path.join(b, e.name)]
            : [],
      )
    : []

const read = (f) => PNG.sync.read(fs.readFileSync(f))
const write = (f, png) => {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, PNG.sync.write(png))
}

/**
 * The notch: the widest contiguous run of pure-black pixels in the top rows, within the
 * middle third of the image. Bezel and page background are never pure black; the
 * darkest screen is olive (#070c03).
 */
function findNotch(png) {
  const { width: w, height: h, data: d } = png
  const isBlack = (x, y) => {
    const i = (y * w + x) * 4
    return d[i] <= 2 && d[i + 1] <= 2 && d[i + 2] <= 2 && d[i + 3] > 200
  }
  const x0 = Math.floor(w / 3)
  const x1 = Math.floor((2 * w) / 3)
  let top = -1
  let bottom = -1
  let bestRun = 0
  let bestStart = 0
  for (let y = 0; y < Math.min(60, h); y++) {
    let run = 0
    let start = 0
    let rowBest = 0
    let rowStart = 0
    for (let x = x0; x <= x1; x++) {
      if (isBlack(x, y)) {
        if (run === 0) start = x
        run++
        if (run > rowBest) {
          rowBest = run
          rowStart = start
        }
      } else run = 0
    }
    // The notch is at least a third of the middle third wide; corners and text are not.
    if (rowBest >= (x1 - x0) * 0.4) {
      if (top < 0) top = y
      bottom = y
      if (rowBest > bestRun) {
        bestRun = rowBest
        bestStart = rowStart
      }
    }
  }
  if (top < 0) return null
  // Extend the run to its true edges (it may start left of the middle third).
  let left = bestStart
  let right = bestStart + bestRun - 1
  const yMid = Math.floor((top + bottom) / 2)
  while (left > 0 && isBlack(left - 1, yMid)) left--
  while (right < w - 1 && isBlack(right + 1, yMid)) right++
  return { left, right, top, bottom, width: right - left + 1 }
}

/** Nearest-neighbour resize; the references are too small for anything cleverer to matter. */
function resize(img, w, h) {
  if (img.width === w && img.height === h) return img
  const o = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / w))
      const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / h))
      o.data.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * w + x) * 4)
    }
  return o
}

function crop(img, x, y, w, h) {
  const o = new PNG({ width: w, height: h })
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const sx = Math.max(0, Math.min(img.width - 1, x + xx))
      const sy = Math.max(0, Math.min(img.height - 1, y + yy))
      o.data.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (yy * w + xx) * 4)
    }
  return o
}

function prep() {
  const meta = {}
  for (const rel of walk(SHOTS)) {
    const png = read(path.join(SHOTS, rel))
    const notch = findNotch(png)
    if (!notch) {
      console.warn('no notch found:', rel)
      continue
    }
    const scale = notch.width / NOTCH_W
    const cx = (notch.left + notch.right + 1) / 2
    const x = Math.round(cx - (SCREEN_W * scale) / 2)
    /*
     * The notch is drawn on the *outer* frame at `top:0`, and the frame carries 13px of
     * padding before the screen begins — so the screen starts one bezel below the notch,
     * not level with it. Cropping from the notch put every reference 13px out and made
     * the whole design look as though it sat lower than the app.
     */
    const y = Math.round(notch.top + BEZEL * scale)
    const w = Math.round(SCREEN_W * scale)
    const h = Math.round(SCREEN_H * scale)
    write(path.join(REF, rel), crop(png, x, y, w, h))
    meta[rel.replace(/\\/g, '/')] = { scale: +scale.toFixed(4), x, y, w, h }
  }
  fs.mkdirSync(REF, { recursive: true })
  fs.writeFileSync(path.join(REF, 'meta.json'), JSON.stringify(meta, null, 2))
  console.log(Object.keys(meta).length, 'references cropped →', REF)
}

/** Paint the strips neither side can be held to, so they neither match nor mismatch. */
function mask(png, scale) {
  const top = Math.round(SAFE_TOP * scale)
  const bottom = Math.round(MASK_BOTTOM * scale)
  const { width: w, height: h, data: d } = png
  const fill = (y) => {
    for (let x = 0; x < w; x++) d.set([255, 0, 255, 255], (y * w + x) * 4)
  }
  for (let y = 0; y < top; y++) fill(y)
  for (let y = h - bottom; y < h; y++) fill(y)
  return png
}

function diff(only) {
  const meta = JSON.parse(fs.readFileSync(path.join(REF, 'meta.json'), 'utf8'))
  const report = []
  for (const rel of walk(REF)) {
    const key = rel.replace(/\\/g, '/')
    if (only && key !== only) continue
    const appFile = path.join(APP, rel)
    if (!fs.existsSync(appFile)) {
      report.push({ file: key, status: 'missing-app-capture' })
      continue
    }
    const { scale } = meta[key]
    const ref = mask(read(path.join(REF, rel)), scale)
    const app = mask(resize(read(appFile), ref.width, ref.height), scale)
    const out = new PNG({ width: ref.width, height: ref.height })
    const n = pixelmatch(ref.data, app.data, out.data, ref.width, ref.height, { threshold: 0.1 })
    const masked = ref.width * (Math.round(SAFE_TOP * scale) + Math.round(MASK_BOTTOM * scale))
    const pct = +((100 * n) / (ref.width * ref.height - masked)).toFixed(2)
    write(path.join(OUT, rel.replace(/\.png$/, '.diff.png')), out)
    // Side-by-side: ref | app | diff, for the manual pass.
    const side = new PNG({ width: ref.width * 3 + 8, height: ref.height })
    side.data.fill(255)
    for (const [i, img] of [ref, app, out].entries())
      for (let y = 0; y < ref.height; y++)
        side.data.set(
          img.data.subarray(y * ref.width * 4, (y + 1) * ref.width * 4),
          (y * side.width + i * (ref.width + 4)) * 4,
        )
    write(path.join(OUT, rel.replace(/\.png$/, '.side.png')), side)
    report.push({ file: key, mismatchPct: pct })
  }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.table(report)
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'prep') prep()
else if (cmd === 'diff') diff(arg)
else console.log('usage: audit.mjs prep | diff [file]')
