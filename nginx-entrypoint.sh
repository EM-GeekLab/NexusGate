#!/bin/bash

cat <<EOF | tee /etc/nginx/conf.d/default.conf
server {
  listen 80;
  
  server_name ${SERVER_NAME:-'localhost'};

  proxy_connect_timeout 180s;
  proxy_send_timeout 180s;
  proxy_read_timeout 180s;
  send_timeout 180s;

  location /v1/ {
    proxy_pass ${BACKEND_URL:-'http://backend:3000/'};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location /api/ {
    proxy_pass ${BACKEND_URL:-'http://backend:3000/'};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location / {
    root /var/www/html;
    try_files \$uri \$uri/ /index.html;
  }
}
EOF

echo "Starting Nginx"
exec "nginx" "-g" "daemon off;"