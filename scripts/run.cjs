const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const cursorNode = '/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node'

function major(version) {
  return parseInt(String(version).split('.')[0], 10)
}

function pickNode() {
  if (major(process.versions.node) >= 18) return process.execPath
  if (fs.existsSync(cursorNode)) return cursorNode
  console.error('Realm Wars needs Node.js 18 or newer. This machine has Node ' + process.version + '.')
  console.error('Install it from https://nodejs.org and run npm run dev again.')
  process.exit(1)
}

const node = pickNode()
const mode = process.argv[2]
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')

function run(args) {
  const result = spawnSync(node, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}

if (mode === 'build') {
  run([tsc, '--noEmit'])
  run([vite, 'build'])
} else if (mode === 'preview') {
  run([vite, 'preview'])
} else {
  run([vite])
}
