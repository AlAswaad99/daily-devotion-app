/**
 * Capture the emulator into compare/app/<rel>.png, and optionally drive the app
 * into audit mode first.
 *
 *   node project/compare/cap.mjs core/01-today-strong-streak.png
 *   node project/compare/cap.mjs core/01-today.png --link "abide://audit?insets=1&streak=27&to=/" --wait 2500
 *   node project/compare/cap.mjs --link "abide://audit?clear=1&to=/"      (no capture)
 *
 * The emulator must already be at 366×820dp (`wm density 400`, `wm size 915x2050`).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sdk =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')

const args = process.argv.slice(2)
const rel = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const link = opt('link')
if (link) {
  execFileSync(adb, ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'${link}'`], {
    stdio: 'ignore',
  })
  await sleep(Number(opt('wait') ?? 2000))
}

if (rel) {
  const out = path.join(here, 'app', rel)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const png = execFileSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 })
  fs.writeFileSync(out, png)
  console.log('captured', path.relative(process.cwd(), out), png.length, 'bytes')
}
