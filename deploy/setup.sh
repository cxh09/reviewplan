#!/usr/bin/env bash
# reviewplan 一键部署脚本：装 Node → 部署应用 → 注册 systemd → 放行端口
# 用法：root 或 sudo 执行  bash setup.sh
set -euo pipefail

APP_DIR=/opt/reviewplan
PORT=3000
NODE_VERSION=v24.10.0
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

log() { echo -e "\033[32m[setup]\033[0m $*"; }
die() { echo -e "\033[31m[setup] $*\033[0m" >&2; exit 1; }

# ---------- 0. 前置检查 ----------
[ "$(id -u)" -eq 0 ] || die "请用 root 或 sudo 运行"

# ---------- 1. Node >= 22.13 ----------
need_node=1
if command -v node >/dev/null 2>&1; then
  ver=$(node -v | sed 's/^v//')
  major=${ver%%.*}; rest=${ver#*.}; minor=${rest%%.*}
  if [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 13 ]; }; then
    need_node=0
    log "已有 Node $(node -v)，满足要求"
  fi
fi

if [ "$need_node" -eq 1 ]; then
  arch=$(uname -m)
  case "$arch" in
    x86_64)  node_arch=linux-x64 ;;
    aarch64) node_arch=linux-arm64 ;;
    *) die "不支持的架构：$arch，请手动安装 Node >= 22.13" ;;
  esac
  pkg="node-${NODE_VERSION}-${node_arch}"
  log "安装 Node ${NODE_VERSION}（${node_arch}）…"
  curl -fL --retry 3 -o "/tmp/${pkg}.tar.gz" \
    "https://npmmirror.com/mirrors/node/${NODE_VERSION}/${pkg}.tar.gz" \
    || curl -fL --retry 3 -o "/tmp/${pkg}.tar.gz" \
    "https://nodejs.org/dist/${NODE_VERSION}/${pkg}.tar.gz" \
    || die "Node 下载失败，请按 DEPLOY.md 手动安装"
  rm -rf "/opt/${pkg}"
  tar -xzf "/tmp/${pkg}.tar.gz" -C /opt
  ln -sf "/opt/${pkg}/bin/node" /usr/local/bin/node
  ln -sf "/opt/${pkg}/bin/npm"  /usr/local/bin/npm
  ln -sf "/opt/${pkg}/bin/npx"  /usr/local/bin/npx
  log "Node 安装完成：$(node -v)"
fi

# ---------- 2. 部署应用 ----------
log "部署到 ${APP_DIR} …"
mkdir -p "$APP_DIR/server"
cp -r "$SRC_DIR/dist" "$APP_DIR/"
cp -r "$SRC_DIR/server/." "$APP_DIR/server/"

cd "$APP_DIR/server"
log "安装生产依赖（express + cors）…"
npm install --omit=dev --registry=https://registry.npmmirror.com 2>/dev/null \
  || npm install --omit=dev

# ---------- 3. systemd ----------
log "注册 systemd 服务 reviewplan（端口 ${PORT}）…"
cat > /etc/systemd/system/reviewplan.service <<EOF
[Unit]
Description=reviewplan sync server
After=network.target

[Service]
WorkingDirectory=${APP_DIR}/server
ExecStart=/usr/local/bin/node --no-warnings src/index.js
Restart=always
Environment=PORT=${PORT}
Environment=DB_PATH=${APP_DIR}/server/data/reviewplan.db

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now reviewplan
sleep 1
systemctl --quiet is-active reviewplan || { journalctl -u reviewplan -n 20 --no-pager; die "服务启动失败，见上方日志"; }

# ---------- 4. 防火墙（尽力而为） ----------
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --add-port=${PORT}/tcp --permanent >/dev/null && firewall-cmd --reload >/dev/null
  log "firewalld 已放行 ${PORT}/tcp"
elif command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow ${PORT}/tcp >/dev/null
  log "ufw 已放行 ${PORT}/tcp"
else
  log "未检测到活动防火墙，跳过（云主机请注意在安全组放行 ${PORT}）"
fi

# ---------- 5. 自检 ----------
health=$(curl -sf "http://localhost:${PORT}/api/health" || true)
[ -n "$health" ] || die "健康检查失败，请执行 journalctl -u reviewplan -n 50 查看日志"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/")

ip=$(hostname -I 2>/dev/null | awk '{print $1}')
log "部署成功 ✔"
echo "  API:    $health"
echo "  页面:   http://${ip:-服务器IP}:${PORT}/  （HTTP ${code}）"
echo "  管理:   systemctl status|restart reviewplan   日志: journalctl -u reviewplan -f"
echo "  数据:   ${APP_DIR}/server/data/reviewplan.db（备份拷这一个文件）"
