#!/usr/bin/env node
// Boots the Flask backend. Creates backend/.venv and installs dependencies on first run.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(here, '..', 'backend')

const isWindows = process.platform === 'win32'
const venvPython = isWindows
  ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
  : path.join(backendDir, '.venv', 'bin', 'python')

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', ...opts })
}

// First run: create the virtualenv and install requirements.
if (!existsSync(venvPython)) {
  console.log('\n[backend] Creating Python virtualenv (first run)…')
  const basePython = process.env.PYTHON || (isWindows ? 'python' : 'python3')
  const created = run(basePython, ['-m', 'venv', path.join(backendDir, '.venv')])
  if (created.status !== 0) {
    console.error('\n[backend] Failed to create a virtualenv.')
    console.error(
      '[backend] On macOS the system Python may be missing ensurepip — install Python from python.org or Homebrew,\n' +
        '[backend] or run:  pip3 install --user -r backend/requirements.txt   then   python3 backend/wsgi.py',
    )
    process.exit(1)
  }
  console.log('[backend] Installing Python dependencies…')
  run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: backendDir })
}

const python = existsSync(venvPython) ? venvPython : isWindows ? 'python' : 'python3'

console.log('[backend] Starting Flask on http://localhost:5001 …')
const child = spawn(python, ['wsgi.py'], { cwd: backendDir, stdio: 'inherit' })

child.on('error', (err) => {
  console.error('[backend] Failed to start:', err.message)
  process.exit(1)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('exit', (code) => process.exit(code ?? 0))
