/**
 * Timed animation frames from the emulator.
 *
 * Audit mode's `play=1` makes the Mascot hold still for 800ms after mount and then
 * flash a 16×16 black marker for one frame as the animation starts. This records the
 * screen while a deep link opens the screen, finds the marker frame, and writes the
 * frames at the requested offsets to compare/app/animations/<name>-t<ms>ms.png.
 *
 *   node project/compare/motion.mjs <name> "<abide://audit?...&play=1&to=/>" 0,192,576
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
const [name, link, offsetsArg] = process.argv.slice(2)
const offsets = offsetsArg.split(',').map(Number)
const seconds = Math.min(10, Math.ceil((800 + Math.max(...offsets) + 2500) / 1000) + 1)
const work = path.join(here, 'out', '_motion', name)
fs.rmSync(work, { recursive: true, force: true })
fs.mkdirSync(work, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* Start recording, then open the screen; the marker lands a little under a second in. */
const rec = spawn(adb, ['shell', 'screenrecord', '--time-limit', String(seconds), '--bit-rate', '12000000', '--size', '912x2048', '/sdcard/_motion.mp4'])
await sleep(700)
execFileSync(adb, ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'${link}'`], { stdio: 'ignore' })
await new Promise((r) => rec.on('close', r))
execFileSync(adb, ['pull', '/sdcard/_motion.mp4', path.join(work, 'rec.mp4')], { stdio: 'ignore' })

/* Every frame, at the recording's own rate, small enough to scan quickly. */
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(work, 'rec.mp4'), '-vsync', '0', '-vf', 'scale=229:-1', path.join(work, 'f%04d.png')])
const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', path.join(work, 'rec.mp4')]).toString().trim().split('\n').map(Number)
const frames = fs.readdirSync(work).filter((f) => /^f\d+\.png$/.test(f)).sort()

/* The marker: a run of pure-black pixels at least 3 wide and 3 tall (16dp at ¼ scale). */
const hasMarker = (file) => {
  const p = PNG.sync.read(fs.readFileSync(path.join(work, file)))
  const black = (x, y) => { const i = (y * p.width + x) * 4; return p.data[i] < 8 && p.data[i + 1] < 8 && p.data[i + 2] < 8 }
  for (let y = 0; y < p.height - 3; y += 1)
    for (let x = 0; x < p.width - 3; x += 1) {
      let ok = true
      for (let dy = 0; dy < 3 && ok; dy++) for (let dx = 0; dx < 3 && ok; dx++) if (!black(x + dx, y + dy)) ok = false
      if (ok) return true
    }
  return false
}
/* Ignore the first second: the previous screen may be dark. */
let markerIdx = -1
for (let i = 0; i < frames.length; i++) {
  if (probe[i] < 0.9) continue
  if (hasMarker(frames[i])) { markerIdx = i; break }
}
if (markerIdx < 0) { console.error('no marker found'); process.exit(1) }
const t0 = probe[markerIdx]
console.log('marker at frame', markerIdx, 't0', t0.toFixed(3), 'fps ~', (frames.length / probe[probe.length - 1]).toFixed(1))

/* Full-resolution frames at the requested offsets, from the same recording. */
const outDir = path.join(here, 'app', 'animations')
fs.mkdirSync(outDir, { recursive: true })
for (const ms of offsets) {
  const t = t0 + ms / 1000
  let best = 0
  for (let i = 0; i < probe.length; i++) if (Math.abs(probe[i] - t) < Math.abs(probe[best] - t)) best = i
  const out = path.join(outDir, `${name}-t${String(ms).padStart(4, '0')}ms.png`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(probe[best]), '-i', path.join(work, 'rec.mp4'), '-frames:v', '1', out])
  console.log(`t+${ms}ms → frame ${best} (${probe[best].toFixed(3)}s) → ${path.relative(process.cwd(), out)}`)
}
