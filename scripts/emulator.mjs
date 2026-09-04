/**
 * The Android emulator, and the plumbing it needs to see a local stack.
 *
 * `scripts/dev.mjs` starts the services; this starts the thing that talks to them.
 * They are separate because the emulator has its own failure modes and its own
 * lifetime — it survives a dev-server restart, and a dev server survives it.
 *
 *   pnpm emu              boot the AVD, wire the tunnels, launch the app
 *   pnpm emu reload       force-stop and relaunch (needed after root-layout changes)
 *   pnpm emu shot [name]  screenshot into .scratch/shots/
 *   pnpm emu logs         follow the app's JS console
 *   pnpm emu tunnels      re-wire adb reverse and nothing else
 *
 *   --avd=<name>          pick an AVD (default: the first one installed)
 *   --cold                boot without the saved snapshot
 *
 * The tunnels are the part that is easy to forget and hard to diagnose. An emulator's
 * 127.0.0.1 is the emulator, not the host, so a Supabase running on the host is
 * invisible from inside it and every request fails as a network error rather than as
 * anything that names the cause. `adb reverse` maps the two ports back to the host.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const command = args.find((a) => !a.startsWith('--')) ?? 'up'
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const paint = (text) => `\x1b[36m${text}\x1b[0m`
const say = (line) => console.log(`${paint('emu'.padEnd(8))} ${line}`)
const die = (line) => {
  console.error(`${paint('emu'.padEnd(8))} ${line}`)
  process.exit(1)
}

/* Ports: Metro, and the Supabase API gateway. */
const TUNNELS = [8081, 54321]

const sdk =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')

const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name)
const adbPath = path.join(sdk, 'platform-tools', exe('adb'))
const emulatorPath = path.join(sdk, 'emulator', exe('emulator'))

if (!existsSync(adbPath)) {
  die(`no adb at ${adbPath}. Set ANDROID_HOME to your SDK root.`)
}

const adb = (...a) => spawnSync(adbPath, a, { encoding: 'utf8' })
const adbOut = (...a) => (adb(...a).stdout ?? '').trim()

/** The app id, read from the manifest rather than repeated here. */
function appId() {
  const raw = JSON.parse(readFileSync(path.join(repoRoot, 'apps/mobile/app.json'), 'utf8'))
  const id = raw?.expo?.android?.package
  if (!id) die('no expo.android.package in apps/mobile/app.json')
  return id
}

const deviceOnline = () =>
  adbOut('devices')
    .split('\n')
    .slice(1)
    .some((line) => line.trim().endsWith('\tdevice'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function bootEmulator() {
  if (deviceOnline()) {
    say('a device is already attached')
    return
  }
  if (!existsSync(emulatorPath)) die(`no emulator binary at ${emulatorPath}`)

  const avds = spawnSync(emulatorPath, ['-list-avds'], { encoding: 'utf8' })
    .stdout.split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (avds.length === 0) die('no AVDs installed. Create one in Android Studio first.')

  const avd = flag('avd') ?? avds[0]
  if (!avds.includes(avd)) die(`no such AVD "${avd}". Installed: ${avds.join(', ')}`)

  say(`booting ${avd}`)
  const emulatorArgs = ['-avd', avd, '-no-boot-anim']
  if (args.includes('--cold')) emulatorArgs.push('-no-snapshot-load')
  /*
   * Detached and unref'd: the emulator outlives this script, which is the point.
   * Its own window is where it belongs, not stapled to a terminal that has to stay
   * open for the app to keep running.
   */
  spawn(emulatorPath, emulatorArgs, { detached: true, stdio: 'ignore' }).unref()

  say('waiting for boot')
  for (let i = 0; i < 120; i += 1) {
    if (deviceOnline() && adbOut('shell', 'getprop', 'sys.boot_completed') === '1') {
      say('booted')
      return
    }
    await sleep(2000)
  }
  die('emulator did not finish booting in four minutes')
}

function wireTunnels() {
  for (const port of TUNNELS) adb('reverse', `tcp:${port}`, `tcp:${port}`)
  say(`tunnels: ${TUNNELS.join(', ')} → host`)
}

/**
 * A freshly booted emulator has its screen off, and a screenshot of a sleeping device
 * is a black rectangle rather than an error — which is a slow thing to work out.
 */
function wake() {
  if (adbOut('shell', 'dumpsys', 'power').includes('mWakefulness=Asleep')) {
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
  }
  /* Dismisses the default swipe-up lock screen; harmless when there is none. */
  adb('shell', 'wm', 'dismiss-keyguard')
}

/**
 * Metro is not this script's job to start, but its absence is worth naming.
 *
 * Without it the app opens on a red screen telling you to run `adb reverse tcp:8081`,
 * which is the one thing that is already done — so the message sends you looking in
 * exactly the wrong place.
 */
function warnIfNoMetro() {
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      `const s=require('net').connect(8081,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),1500)`,
    ],
    { stdio: 'ignore' },
  )
  if (probe.status !== 0) {
    say('nothing is listening on 8081 — start Metro with `pnpm dev`, or the app will')
    say('open on a red screen telling you to do the one thing already done.')
  }
}

function launch() {
  const id = appId()
  const installed = adbOut('shell', 'pm', 'list', 'packages', id).includes(id)
  if (!installed) {
    die(`${id} is not installed. Run \`pnpm --filter @abide/mobile android\` once to build it.`)
  }
  adb('shell', 'monkey', '-p', id, '-c', 'android.intent.category.LAUNCHER', '1')
  say(`launched ${id}`)
}

function shot(name) {
  wake()
  const dir = path.join(repoRoot, '.scratch', 'shots')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19)
  const file = path.join(dir, `${name ?? 'shot'}-${stamp}.png`)
  adb('shell', 'screencap', '-p', '/sdcard/_shot.png')
  const pulled = adb('pull', '/sdcard/_shot.png', file)
  adb('shell', 'rm', '/sdcard/_shot.png')
  if (pulled.status !== 0) die(pulled.stderr?.trim() || 'screencap failed')
  say(path.relative(repoRoot, file))
}

switch (command) {
  case 'up': {
    await bootEmulator()
    wake()
    wireTunnels()
    warnIfNoMetro()
    launch()
    say('ready. `pnpm emu shot` to capture, `pnpm emu reload` after layout changes.')
    break
  }
  case 'tunnels':
    wireTunnels()
    break
  case 'reload': {
    const id = appId()
    adb('shell', 'am', 'force-stop', id)
    wake()
    /*
     * Fast refresh does not remount providers, so a change to the root layout or to
     * anything above the navigator only takes effect on a cold start of the process.
     */
    wireTunnels()
    warnIfNoMetro()
    launch()
    break
  }
  case 'shot':
    shot(args.find((a) => !a.startsWith('--') && a !== 'shot'))
    break
  case 'logs':
    spawn(adbPath, ['logcat', '-s', 'ReactNativeJS:V', 'ReactNative:V'], { stdio: 'inherit' })
    break
  default:
    die(`unknown command "${command}". One of: up, reload, shot, logs, tunnels.`)
}
