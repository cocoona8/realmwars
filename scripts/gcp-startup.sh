#!/bin/bash
set -eux
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
cd /opt/realm-wars
npm ci --omit=dev || npm install
npx tsc --noEmit || true
node node_modules/vite/bin/vite.js build
cat >/etc/systemd/system/realm-wars.service <<'UNIT'
[Unit]
Description=Realm Wars
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/realm-wars
Environment=PORT=8080
ExecStart=/usr/bin/node server/prod.mjs
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now realm-wars
