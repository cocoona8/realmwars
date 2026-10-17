#!/bin/bash
set -eux
export DEBIAN_FRONTEND=noninteractive
mkdir -p /opt/realm-wars
curl -fsSL -o /tmp/rw.tgz https://files.catbox.moe/acri9j.tgz
tar -xzf /tmp/rw.tgz -C /opt/realm-wars
cd /opt/realm-wars
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y nginx
npm install
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
systemctl restart realm-wars
cat >/etc/nginx/sites-available/realmwars <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name realmwars.xyz www.realmwars.xyz _;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGINX
rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/realmwars /etc/nginx/sites-enabled/realmwars
nginx -t
systemctl reload nginx
systemctl --no-pager --full status realm-wars || true
curl -sS -o /dev/null -w "local:%{http_code}\n" http://127.0.0.1:8080/
