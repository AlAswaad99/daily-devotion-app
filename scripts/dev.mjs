/**
 * Everything, running at once.
 *
 * Four things have to be up before the app does anything interesting: the Supabase
 * stack, the Edge Functions runtime (without it, notifications queue and never
 * deliver — which looks exactly like a broken Send button), the admin dashboard, and
 * Expo. Starting them by hand in four terminals is easy to get half-right.
 *
 *   node scripts/dev.mjs               everything
 *   node scripts/dev.mjs --no-mobile   without Expo
 *   node scripts/dev.mjs --only=admin  one of: db, functions, admin, mobile
 *
 * Ctrl+C stops the long-running processes, and `pnpm dev:stop` clears up anything a
 * previous run left behind. The Supabase containers are deliberately left up — they
 * hold your data and take a while to come back.
 */
import { spawn, spawnSync } from 'node:child_process'
import { Socket } from 'node:net'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'

const args = process.argv.slice(2)
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1]
const want = (name) => (only ? only === name : !args.includes(`--no-${name}`))

/* Prefixes, so four streams in one terminal stay readable. */
const COLOURS = { db: 36, functions: 35, admin: 33, mobile: 32, dev: 90 }
const paint = (name, text) => `\x1b[${COLOURS[name] ?? 0}m${text}\x1b[0m`
const say = (name, line) => console.log(`${paint(name, name.padEnd(9))} ${line}`)

const children = []

function run(name, command, options = {}) {
  /*
   * One command string, not a command plus an args array. `pnpm` and `npx` on
   * Windows are shell shims and need `shell: true` to resolve at all, and that
   * combination with an args array is what Node warns about in DEP0190.
   */
  const child = spawn(command, {
    cwd: repoRoot,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1', ...options.env },
  })

  const emit = (buffer) => {
    for (const line of buffer.toString().split('\n')) {
      if (line.trim()) say(name, line.trimEnd())
    }
  }

  child.stdout.on('data', emit)
  child.stderr.on('data', emit)
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) say(name, paint('dev', `exited with code ${code}`))
  })

  children.push(child)
  return child
}

// ------------------------------------------------------------------ the database
function startSupabase() {
  say('db', 'starting the Supabase stack…')
  const result = spawnSync('npx supabase start', {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
  })

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

  if (result.status === 0 || /already running/i.test(output)) {
    say('db', 'ready on http://127.0.0.1:54321')
    return true
  }

  /*
   * The failure this machine actually hits. After a reboot Windows can reserve the
   * dynamic port range Supabase uses, and the error message says nothing about why.
   */
  if (/ports are not available|forbidden by its access permissions/i.test(output)) {
    say('db', paint('dev', 'Supabase could not bind its ports.'))
    say('db', paint('dev', 'Windows reserves ranges after a reboot. In an admin terminal:'))
    say('db', paint('dev', '    net stop winnat && net start winnat'))
    say('db', paint('dev', 'To stop it recurring:'))
    say(
      'db',
      paint(
        'dev',
        '    netsh int ipv4 add excludedportrange protocol=tcp startport=54320 numberofports=8 store=persistent',
      ),
    )
    return false
  }

  say('db', output.trim().split('\n').slice(-5).join(' | '))
  return false
}

// ----------------------------------------------------------------- the functions
/**
 * The functions runtime reads the Firebase credential from `supabase/functions/.env`,
 * which is gitignored. It is derived from `secrets/` rather than kept in step by hand.
 */
function ensureFunctionsEnv() {
  const envPath = path.join(repoRoot, 'supabase', 'functions', '.env')
  const secretPath = path.join(repoRoot, 'secrets', 'firebase-service-account.json')

  if (existsSync(envPath)) return true

  if (!existsSync(secretPath)) {
    say('functions', 'no secrets/firebase-service-account.json — notifications will not send')
    say('functions', 'Firebase console → Project settings → Service accounts → Generate key')
    return false
  }

  writeFileSync(
    envPath,
    `FIREBASE_SERVICE_ACCOUNT=${JSON.stringify(readFileSync(secretPath, 'utf8'))}\n`,
  )
  say('functions', 'wrote supabase/functions/.env from secrets/ (gitignored)')
  return true
}

// ------------------------------------------------------------------------ ports
/**
 * Whether anything is already listening.
 *
 * Without this, a stale server from an earlier run surfaces as `EADDRINUSE` from
 * Next and, worse, as Expo silently declining to start because it wanted to ask an
 * interactive question about using another port. Both read as "the script is broken".
 */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = new Socket()
    socket.setTimeout(400)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    const no = () => {
      socket.destroy()
      resolve(false)
    }
    socket.once('timeout', no)
    socket.once('error', no)
    socket.connect(port, '127.0.0.1')
  })
}

const NEEDED = [
  { port: 3000, name: 'admin', what: 'the admin dashboard' },
  { port: 8081, name: 'mobile', what: 'the Expo bundler' },
]

const busy = []
for (const entry of NEEDED) {
  if (want(entry.name) && (await portInUse(entry.port))) busy.push(entry)
}

if (busy.length > 0) {
  for (const entry of busy) {
    say('dev', `port ${entry.port} is already serving ${entry.what}`)
  }
  say('dev', 'Another `pnpm dev` is probably still running. Stop it with:')
  say('dev', '    pnpm dev:stop')
  process.exit(1)
}

// ------------------------------------------------------------------------- go
if (want('db') && !startSupabase()) {
  process.exit(1)
}

if (want('functions') && ensureFunctionsEnv()) {
  run('functions', 'npx supabase functions serve --env-file supabase/functions/.env')
}

if (want('admin')) {
  run('admin', 'pnpm --filter @abide/admin dev')
}

if (want('mobile')) {
  run('mobile', 'pnpm --filter @abide/mobile start')
}

console.log()
say('dev', 'admin      http://localhost:3000')
say('dev', 'studio     http://127.0.0.1:54323')
say('dev', 'inbucket   http://127.0.0.1:54324   (the emails nobody receives)')
say('dev', 'sign in    dev@abide.local / abide12345')
console.log()

let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  say('dev', 'stopping… (Supabase containers are left running)')
  for (const child of children) {
    // On Windows a detached tree needs taskkill; SIGINT leaves orphans behind.
    // No shell: taskkill is a real executable, and shell plus an args array is what
    // DEP0190 warns about.
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'])
    else child.kill('SIGINT')
  }
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
