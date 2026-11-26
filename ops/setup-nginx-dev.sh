#!/usr/bin/env bash
set -euo pipefail

cat > /etc/nginx/sites-available/dev.atrail.in <<'EOF'
server {
    listen 80;
    server_name dev.atrail.in;

    location / {
        proxy_pass http://localhost:3102;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

cat > /etc/nginx/sites-available/api-dev.atrail.in <<'EOF'
server {
    listen 80;
    server_name api-dev.atrail.in;

    location / {
        proxy_pass http://localhost:4100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/dev.atrail.in /etc/nginx/sites-enabled/dev.atrail.in
ln -sf /etc/nginx/sites-available/api-dev.atrail.in /etc/nginx/sites-enabled/api-dev.atrail.in

nginx -t
systemctl reload nginx
echo "Done: dev.atrail.in and api-dev.atrail.in are now proxying (HTTP only, no SSL yet)."
