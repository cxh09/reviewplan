# reviewplan 服务器部署说明（给部署执行方）

本包是一个「前后端一体」的自托管应用：Node 服务（Express + 内置 SQLite）同时提供数据同步 API 和前端静态页面。**无数据库服务、无外部依赖**，只要 Node ≥ 22.13（推荐 Node 24 LTS）即可运行。

## 包内容

```
reviewplan-deploy/
├── dist/            # 前端编译产物（已 build 好，直接托管，无需再编译）
├── server/          # 后端源码
│   ├── src/         # index.js / app.js / config.js / db.js
│   ├── package.json
│   └── package-lock.json
├── setup.sh         # 一键安装脚本（推荐先跑这个）
└── DEPLOY.md        # 本说明
```

## 最快路径：一键脚本

以 root（或 sudo）在解压目录执行：

```bash
tar -xzf reviewplan-deploy.tar.gz -C /opt && cd /opt/reviewplan-deploy
bash setup.sh
```

脚本会依次完成：检测/安装 Node 24（官方二进制，国内镜像优先）→ 安装生产依赖 → 部署到 /opt/reviewplan → 注册 systemd 服务 `reviewplan` 并开机自启 → 尝试放行防火墙端口。

跑完后验证：

```bash
systemctl status reviewplan --no-pager
curl -s http://localhost:3000/api/health      # 期望返回 {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/   # 期望 200
```

## 手动部署（脚本不适用时）

1. **安装 Node 24**（已装 ≥22.13 可跳过）：

   ```bash
   cd /opt
   # 国内服务器用 npmmirror；海外用 nodejs.org 同名路径
   curl -LO https://npmmirror.com/mirrors/node/v24.10.0/node-v24.10.0-linux-x64.tar.gz
   tar -xzf node-v24.10.0-linux-x64.tar.gz
   ln -sf /opt/node-v24.10.0-linux-x64/bin/node /usr/local/bin/node
   ln -sf /opt/node-v24.10.0-linux-x64/bin/npm  /usr/local/bin/npm
   node -v
   ```

   ARM 服务器把 `linux-x64` 换成 `linux-arm64`。

2. **部署应用**：

   ```bash
   mkdir -p /opt/reviewplan
   cp -r dist server /opt/reviewplan/
   cd /opt/reviewplan/server
   npm install --omit=dev
   node src/index.js        # 前台试跑，看到「已启动」后 Ctrl+C
   ```

3. **注册 systemd**：

   ```bash
   cat > /etc/systemd/system/reviewplan.service <<'EOF'
   [Unit]
   Description=reviewplan sync server
   After=network.target

   [Service]
   WorkingDirectory=/opt/reviewplan/server
   ExecStart=/usr/local/bin/node --no-warnings src/index.js
   Restart=always
   Environment=PORT=3000
   Environment=DB_PATH=/opt/reviewplan/server/data/reviewplan.db

   [Install]
   WantedBy=multi-user.target
   EOF

   systemctl daemon-reload
   systemctl enable --now reviewplan
   ```

4. **放行端口 3000**：云主机需在控制台安全组放行 TCP 3000；本机防火墙按发行版执行
   `firewall-cmd --add-port=3000/tcp --permanent && firewall-cmd --reload`（CentOS/RHEL）
   或 `ufw allow 3000/tcp`（Ubuntu）。

## 环境变量（都可选，写进 service 的 Environment= 即可）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 3000 | 监听端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `ACCESS_TOKEN` | 内置默认令牌 | Bearer 令牌；设 `none` 关闭校验。**公网建议换掉**（随机长字符串） |
| `DB_PATH` | server/data/reviewplan.db | SQLite 文件位置，备份只需拷这一个文件 |
| `SERVE_STATIC` | 开启 | 设 `0` 关闭前端托管（改用 nginx 时） |
| `DIST_DIR` | ../dist | dist 不在默认位置时指定 |
| `CORS_ORIGIN` | * | 逗号分隔的允许来源 |

## 客户端接入（部署完成后告知用户）

- 浏览器访问 `http://<服务器IP>:3000`：前端默认就连接**与页面同源的地址**并预填内置令牌，打开即是「在线」可编辑状态，无需任何配置。
- 只有网页和 API 不在同一台机器时，才需要在「设置 → 服务端同步」手动填写服务端地址。
- 手机端（Flutter App）在设置里填 `http://<服务器IP>:3000` 与令牌。默认令牌为 `server/src/config.js` 里的 `DEFAULT_ACCESS_TOKEN`（那串 Xble 开头的 64 位字符串）。
- 若改了 `ACCESS_TOKEN`，网页端和手机端的令牌都要同步更新（网页端默认预填的是内置令牌）。

## 后续更新版本

重新拿到新的 `dist/` 和 `server/src/` 覆盖到 `/opt/reviewplan/`（**不要覆盖 `server/data/`**），然后：

```bash
cd /opt/reviewplan/server && npm install --omit=dev
systemctl restart reviewplan
```

## 常见问题

- 启动报 `node:sqlite` 找不到 → Node 版本低于 22.13，升级 Node。
- 启动时打印 `ExperimentalWarning: SQLite ...` → 正常现象，已用 `--no-warnings` 屏蔽，手动跑可忽略。
- 页面打开但无法编辑、提示只读 → 未连上服务端：检查同步地址/令牌，`curl /api/health` 确认服务活着。
- 409 CONFLICT 提示 → 多端并发写入的乐观锁正常表现，客户端会自动拉最新数据重试。
