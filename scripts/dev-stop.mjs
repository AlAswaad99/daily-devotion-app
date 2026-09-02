/**
 * Stop what `pnpm dev` started.
 *
 * Ctrl+C usually does this, but not always: a terminal closed without it, a crashed
 * parent, or a run started from another window all leave servers holding ports 3000
 * and 8081. The symptom is a *later* `pnpm dev` failing — Next with `EADDRINUSE` and
 * Expo, more confusingly, by silently declining to start because it wanted to ask an
 * interactive question about using a different port.
 *
 *   node scripts/dev-stop.mjs          the dev servers
 *   node scripts/dev-stop.mjs --all    those, and the Supabase containers
 *
 * Supabase is left alone by default. It holds your data and is slow to come back, so
 * stopping it should be something you ask for rather than something you get.
 */
import { spawnSync } from 'node:child_process'
import { Socket } from 'node:net'

const isWindows = process.platform === 'win32'
const all = process.argv.includes('--all')

const say = (line) => console.log(`\x1b[90mdev-stop\x1b[0m  ${line}`)

const PORTS = [
  { port: 3000, what: 'admin dashboard' },
  { port: 8081, what: 'Expo bundler' },
]

function listening(port) {
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

/** The pids listening on a port, however this platform likes to be asked. */
function pidsOn(port) {
  if (isWindows) {
    const result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
          'Select-Object -ExpandProperty OwningProcess -Unique',
      ],
      { encoding: 'utf8' },
    )
    return (result.stdout ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\d+$/.test(line))
  }

  const result = spawnSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' })
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function kill(pid) {
  if (isWindows) {
    // /t because these are process trees — pnpm spawns next, next spawns workers —
    // and killing only the parent leaves the child still holding the port.
    spawnSync('taskkill', ['/pid', pid, '/t', '/f'], { stdio: 'ignore' })
  } else {
    spawnSync('kill', ['-TERM', pid], { stdio: 'ignore' })
  }
}

let stopped = 0

for (const { port, what } of PORTS) {
  if (!(await listening(port))) {
    say(`${port} — nothing running (${what})`)
    continue
  }

  const pids = pidsOn(port)
  if (pids.length === 0) {
    say(`${port} — in use by something this script cannot identify (${what})`)
    continue
  }

  for (const pid of pids) kill(pid)
  say(`${port} — stopped ${what} (pid ${pids.join(', ')})`)
  stopped += pids.length
}

/*
 * The functions runtime does not listen on a port of its own — it is served through
 * the Supabase gateway — so it has to be found by what it is running.
 */
if (isWindows) {
  const found = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*functions serve*' } | " +
        'Select-Object -ExpandProperty ProcessId',
    ],
    { encoding: 'utf8' },
  )
  const pids = (found.stdout ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+$/.test(l))
  for (const pid of pids) kill(pid)
  if (pids.length > 0) {
    say(`stopped the Edge Functions runtime (pid ${pids.join(', ')})`)
    stopped += pids.length
  }
} else {
  const result = spawnSync('pkill', ['-f', 'functions serve'], { stdio: 'ignore' })
  if (result.status === 0) {
    say('stopped the Edge Functions runtime')
    stopped += 1
  }
}

if (all) {
  say('stopping the Supabase containers…')
  spawnSync('npx supabase stop', { shell: true, stdio: 'inherit' })
} else if (stopped > 0) {
  say('Supabase is still running — `pnpm dev:stop --all` stops that too')
}

if (stopped === 0 && !all) say('nothing to stop')
