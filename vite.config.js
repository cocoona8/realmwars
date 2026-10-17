import { defineConfig } from 'vite'
import { realmLobby } from './server/lobby.js'

export default defineConfig({
  base: './',
  plugins: [realmLobby()],
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
})
