/**
 * Contact sheet: every PNG under a directory, downscaled into one grid, so a batch of
 * captures can be sanity-checked in one look.
 *
 *   node project/compare/sheet.mjs compare/app compare/out/sheet-app.png [cols] [cellW]
 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const [dir, out, colsArg, cellArg] = process.argv.slice(2)
const cols = Number(colsArg ?? 6)
const cellW = Number(cellArg ?? 180)

const walk = (d, b = '') =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(path.join(d, e.name), path.join(b, e.name))
      : e.name.endsWith('.png') && !e.name.includes('.diff.') && !e.name.includes('.side.')
        ? [path.join(b, e.name)]
        : [],
  )

const files = walk(dir).filter((f) => !f.startsWith('_'))
const imgs = files.map((f) => PNG.sync.read(fs.readFileSync(path.join(dir, f))))
const ratio = imgs[0].height / imgs[0].width
const cellH = Math.round(cellW * ratio)
const rows = Math.ceil(files.length / cols)
const sheet = new PNG({ width: cols * (cellW + 4), height: rows * (cellH + 4) })
sheet.data.fill(60)

imgs.forEach((img, i) => {
  const ox = (i % cols) * (cellW + 4)
  const oy = Math.floor(i / cols) * (cellH + 4)
  for (let y = 0; y < cellH; y++)
    for (let x = 0; x < cellW; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x * img.width) / cellW))
      const sy = Math.min(img.height - 1, Math.floor((y * img.height) / cellH))
      sheet.data.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), ((oy + y) * sheet.width + ox + x) * 4)
    }
})
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, PNG.sync.write(sheet))
console.log(files.map((f, i) => `${i}: ${f}`).join('\n'))
