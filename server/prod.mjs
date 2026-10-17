import { createReadStream, existsSync, statSync } from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { attachLobby } from './lobby.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = Number(process.env.PORT || 8080)
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)))
  if (!file.startsWith(root)) {
    res.writeHead(403)
    res.end()
    return
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(root, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

attachLobby(server)
server.listen(port, '0.0.0.0', () => {
  console.log(`Realm Wars listening on ${port}`)
})
