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

## 公网部署（网页端 + API 都由家里机器 frp 出去）

目标形态：家里机器跑本应用（Node 3000，同时托管前端 dist 和 API），两个域名都经 VPS 上的 frp 隧道回源：`https://reviewplan.cxhhh.cn`（网页）、`https://api.cxhhh.cn`（API）。

链路：家里（node :3000 + frpc）→ VPS（frps vhost :8080 ← nginx :443 TLS 终结）。两个域名的 DNS A/CNAME 都指向 VPS IP。

### 1. 家里机器（Windows 也行）

- 仓库根目录 `npm run build` 出 `dist/`（构建时自动读 `.env.production`，API 默认地址 `https://api.cxhhh.cn` 已 baked-in）；
- 后端在 `server/` 目录跑 `node src/index.js`（默认就带静态托管，dist 在仓库根目录能被默认路径找到）；环境变量设 `CORS_ORIGIN=https://reviewplan.cxhhh.cn`（跨域限制到网页域名）；
- frpc 两个 http 代理都指向本地 3000：

  ```toml
  # frpc.toml
  serverAddr = "VPS公网IP"
  serverPort = 7000
  auth.token = "强随机串，与 frps 一致"

  [[proxies]]
  name = "reviewplan-web"
  type = "http"
  localPort = 3000
  customDomains = ["reviewplan.cxhhh.cn"]

  [[proxies]]
  name = "reviewplan-api"
  type = "http"
  localPort = 3000
  customDomains = ["api.cxhhh.cn"]
  ```

### 2. VPS：frps + nginx

  ```toml
  # frps.toml
  bindPort = 7000
  auth.token = "同上"
  vhostHTTPPort = 8080   # 只监听/放行 127.0.0.1，不对公网开放
  ```

nginx 用下载证书里的 pem/crt + key（每个域名一套，或泛域名证书），两个 server 块同构：

  ```nginx
  server {
      listen 443 ssl;
      http2 on;
      server_name reviewplan.cxhhh.cn;   # api.cxhhh.cn 复制一份改 server_name/证书
      ssl_certificate     /etc/nginx/ssl/reviewplan.cxhhh.cn.pem;
      ssl_certificate_key /etc/nginx/ssl/reviewplan.cxhhh.cn.key;

      location / {
          proxy_pass http://127.0.0.1:8080;
          proxy_http_version 1.1;
          proxy_set_header Host $host;    # 必须：frps 靠 Host 分发到对应隧道
          client_max_body_size 30m;       # 必须：附件上传 body 上限 25MB，默认 1m 会 413
          proxy_read_timeout 120s;
          proxy_send_timeout 120s;
      }
  }
  # 可选：:80 对两个域名做 301 跳 https
  ```

### 3. 验证

```bash
curl -s https://api.cxhhh.cn/api/health          # 期望 {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' https://reviewplan.cxhhh.cn/            # 期望 200
curl -s -o /dev/null -w '%{http_code}\n' https://reviewplan.cxhhh.cn/share/不存在  # 期望 200（SPA 回退，页面内提示链接无效）
```

浏览器打开 `https://reviewplan.cxhhh.cn`：新设备直接显示「已连接云端」（默认地址已指向 api 域名）；存过旧地址的老设备去「设置 → 服务端同步」改成 `https://api.cxhhh.cn`。手机端同样填 `https://api.cxhhh.cn` + 令牌。

注意：
- 家里机器关机/断网 = 全站下线，建议设开机自启（frpc 用计划任务/服务，node 用 pm2 或 NSSM）；
- 国内 VPS 的 80/443 要求域名已备案，未备案选境外节点；
- 公网 + 跨域都开了，强烈建议换掉 `ACCESS_TOKEN` 内置默认值（网页/手机端同步更新）。

## 旧方案：EdgeOne 托管前端 + 内网穿透后端（已弃用，保留备查）

目标形态：前端静态站托管在 EdgeOne（`https://reviewplan.cxhhh.cn`），后端在原机器上跑 3000 端口、经内网穿透暴露为 `https://api.cxhhh.cn`。

### 1. 前端：构建并托管到 EdgeOne

仓库根目录执行 `npm run build`，构建时会自动加载 `.env.production` 里的
`VITE_API_BASE_URL=https://api.cxhhh.cn`，前端默认就打这个 API 地址（无需用户再手动填）。
把 `dist/` 上传到 EdgeOne 静态托管（EdgeOne Pages / 源站为 COS 均可），**必须开启 SPA 回退**：
所有未命中的路径（`/home`、`/schedule`、`/share/xxxx` 等）都返回 `index.html`，否则分享链接直接打开会 404。
换 API 域名时改 `.env.production` 后重新构建上传。

### 2. 后端：本地服务 + 内网穿透

后端按上文任意方式跑在 3000 端口即可，然后用 frp / cpolar / 贝锐等穿透工具把
`https://api.cxhhh.cn` 映射到 `http://localhost:3000`。选择穿透方案时注意：

- 必须支持 **HTTPS 自定义域名**（前端是 https 页面，浏览器会拦截混合内容，http 的 API 调不通）；
- 必须能过 **大请求体**：附件上传接口单文件最大 15MB、body 上限 25MB，很多免费穿透档位会限制 body 大小，需确认放开；
- 穿透工具要透传 `Authorization` 请求头并响应 CORS 预检（OPTIONS），常规 HTTP 穿透都满足。

后端环境变量建议（写进 systemd 的 `Environment=` 后 `systemctl restart reviewplan`）：

| 变量 | 建议值 | 说明 |
|---|---|---|
| `SERVE_STATIC` | `0` | 前端已交给 EdgeOne，关掉后端静态托管，避免两份页面不一致 |
| `CORS_ORIGIN` | `https://reviewplan.cxhhh.cn` | 限定只允许前端域名跨域调用（默认 `*` 也能用，收紧更安全） |
| `ACCESS_TOKEN` | 保持默认或换强令牌 | 公网暴露，令牌就是唯一的门，建议换掉内置值并同步更新两端配置 |

穿透域名对自带 `.name` sidecar 的附件直链（`/uploads/xxx`）、分享接口（`/api/share/xxx`，免令牌）都是普通 HTTP 请求，无需额外配置。

### 3. 验证

```bash
curl -s https://api.cxhhh.cn/api/health          # 期望 {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' https://reviewplan.cxhhh.cn/share/不存在code   # 期望 200（SPA 回退生效，页面内提示链接无效）
```

浏览器打开 `https://reviewplan.cxhhh.cn`：未改过设置的新设备应直接显示「已连接云端」（默认地址已指向 api 域名）；老设备浏览器里存过旧服务端地址的，去「设置 → 服务端同步」把地址改成 `https://api.cxhhh.cn`。
手机端（Flutter App）在设置里填 `https://api.cxhhh.cn` 与令牌即可，App 内部会把 `/uploads/` 相对路径拼到所填地址上，无需改端。

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
