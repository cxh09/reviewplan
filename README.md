# 复习清单（reviewplan）

一个面向高考复习的日程规划网站：**倒计时 + 待办清单 + 拖拽排班**。

界面基于 **TDesign Vue Next**。数据由自带的 **Node + Express + SQLite 服务端**（`server/`）统一保存，网页端采用**全在线模式**：以云端为唯一数据源，改什么都会立刻上传，连不上服务端时只读并自动重试。详见 [服务端同步](#服务端同步) 与 [全在线模式](#全在线模式)。

## 功能

| 页面         | 说明                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **首页**     | 高考倒计时（大字天数 + 目标日期）、整体统计，以及未来 7 天的排版计划总览                                                                                                                                            |
| **日程表**   | 连续日历：纵向是可以一直往下滚的日期列表（滚到上下边缘会自动继续加载，默认定位到今天），横向是 06:00 ~ 23:00 的各个时间段，当前时刻有一条红色竖线标出。待办清单收在右下角，点击展开。计划块的宽度＝时间跨度，拖动卡片左右边缘可直接拉伸调整时长 |
| **日程广场** | 自己维护的系列合集：新建合集 → 往里添加日程 → 单条或整组一键加入待办清单，支持关键词搜索                                                                                                                            |
| **设置**     | 高考日期、深浅色主题、服务端同步配置（地址 / 令牌 / 连接状态 / 从云端刷新）、数据导出 / 导入 / 清空（均作用于云端）                                                                                                    |

## 技术栈

| 分类      | 选型                                      |
| --------- | ----------------------------------------- |
| 核心框架  | Vue 3（组合式 API + `<script setup>`）    |
| 构建工具  | Vite                                      |
| 路由      | Vue Router（history 模式 + 路由懒加载）   |
| 状态管理  | Pinia（组合式写法 + localStorage 持久化） |
| UI 组件库 | TDesign Vue Next                          |
| 图标      | tdesign-icons-vue-next                    |
| 服务端    | Node.js + Express + SQLite（`node:sqlite`） |

## 快速开始

```bash
npm install            # 安装前端依赖
npm run dev            # 开发服务 http://localhost:5173
npm run build          # 构建到 dist/
npm run preview        # 预览构建产物
npm run lint           # ESLint 检查
npm run format         # Prettier 格式化

npm run server:install # 首次：安装服务端依赖（server/ 独立依赖）
npm run server         # 启动数据同步服务端 http://localhost:3000
npm run server:dev     # 服务端开发模式，改动自动重启
```

## 目录结构

```
src/
├── components/
│   ├── CollectionDialog.vue    # 系列合集的「新建 / 编辑」弹窗
│   └── PlazaItemDialog.vue     # 合集内日程的「添加 / 编辑」弹窗
├── data/
│   └── plaza.js          # 科目 / 难度 / 主题色配置、内置系列合集模板
├── layouts/
│   └── BasicLayout.vue   # 顶部 Tab 导航 + 倒计时徽标 + 主题切换
├── router/
│   └── index.js          # 4 个 Tab 路由 + 404
├── stores/
│   ├── app.js            # 主题（localStorage 持久化）
│   ├── plan.js           # 待办清单 / 排版计划 / 高考日期（写操作带只读保护）
│   ├── plaza.js          # 日程广场：系列合集与合集内日程（写操作带只读保护）
│   └── sync.js           # 云端数据源：连接 / 拉取 / 改动即同步 / 冲突处理
├── styles/main.css
├── utils/
│   ├── api.js            # 服务端请求封装（地址归一化、超时、错误）
│   ├── connection.js     # 全局连接状态与只读判定
│   ├── date.js           # 日期计算（含高考倒计时）
│   ├── id.js             # 随机 id
│   ├── merge.js          # 快照按条目合并（last-write-wins）
│   ├── tombstone.js      # 删除标记：避免被删除的条目被另一端复活
│   └── url.js            # 链接归一化（只放行 http / https）
├── views/
│   ├── HomeView.vue      # 首页
│   ├── ScheduleView.vue  # 日程表（拖拽排班）
│   ├── PlazaView.vue     # 日程广场
│   ├── SettingsView.vue  # 设置
│   └── NotFoundView.vue  # 404
├── App.vue
└── main.js

server/                  # 数据同步服务端（独立子项目）
├── src/
│   ├── app.js           # Express 应用：CORS、令牌校验、数据接口、静态托管
│   ├── config.js        # 端口 / 数据库路径 / 令牌等配置（环境变量可覆盖）
│   ├── db.js            # SQLite 打开与快照读写（rev 乐观锁）
│   └── index.js         # 服务端入口
├── data/                # SQLite 文件目录（自动创建，已 gitignore）
└── package.json
```

## 数据模型

```js
// 待办清单：还没有安排具体时间的任务
todo = { id, title, category, duration, level, desc, link, source, createdAt, updatedAt }

// 排版计划：已安排到某天某个时段的复习任务
plan = {
  id,
  todoId,
  title,
  category,
  duration,
  originDuration,
  level,
  desc,
  link,
  source,
  date,
  startHour,
  note,
  done,
  createdAt,
  updatedAt,
}

// 系列合集：用户自己在日程广场维护的日程分组
collection = { id, name, desc, category, color, createdAt, updatedAt, items: [item] }

// 合集里的日程：未加入待办前的「素材」
item = { id, title, category, level, duration, desc, link, updatedAt }

// 随快照一起同步的整份数据（服务端存的就是它）：
// 前几项之外，还有高考日期自身的修改时间与删除标记
snapshot = {
  gaokaoDate,
  gaokaoDateUpdatedAt,
  todos: [todo],
  plans: [plan],
  collections: [collection],
  deleted: [{ id, at }],
}
```

> `updatedAt` 是条目最后一次修改时间，`deleted` 是删除标记，两者都只服务于多端合并，历史数据没有 `updatedAt` 时按 0 处理。

## 日程广场

- **合集**：新建 / 编辑 / 删除，可设置名称、主攻科目、主题色与简介；首次进入会自动载入 8 个内置系列合集（可按自己情况随意改删，随时用「载入内置模板」补回）。
- **日程**：在每个合集里添加 / 编辑 / 删除日程，设置标题、科目、难度、预计时长与描述。
- **加入待办**：单条加入，或「一键加入待办」把整个合集里还没加入的日程批量送进待办清单，再去日程表拖到时间线上排班。
- **搜索**：关键词会同时匹配合集名称 / 简介与日程标题 / 描述，命中结果按合集分组展示。

- **待办 → 计划**：在日程表把待办卡片拖到日历上的任意单元格（= 某个日期的某个时间段）。
- **计划 → 待办**：把计划卡片拖回右下角的待办面板，或点卡片上的「退回」图标。
- **调整时间**：直接把计划卡片拖到另一个单元格。
- **调整时间跨度**：计划块横向铺在时间轴上，宽度就是时长。拖右边缘改时长（15 分钟吸附），拖左边缘改开始时间且结束时间不变（整点吸附）。
- 同一天里时间重叠的计划会自动分成多层上下排列，互不遮挡。
- 日历纵向是连续日期，滚到顶部 / 底部会自动往前 / 往后继续加载（单次 14 天，日期上限 400 天）；列表是虚拟滚动，只渲染可视区内的日期行，滚得再远 DOM 也不会膨胀。打开时默认滚动到今天那一行。
- 在「添加日程」里选了当前未渲染的日期时，会自动补齐并滚动到那一天。

## 服务端同步

服务端代码在 `server/`，基于 **Node.js + Express + SQLite**（用 Node 内置的 `node:sqlite`，不需要编译原生依赖），用来让**自己一个人的多端设备（电脑 / 手机）共用同一份数据**：待办清单、排版计划、高考日期、日程广场合集会作为一份快照整体上传 / 下载。数据落在 `server/data/reviewplan.db`。

```bash
npm run server:install   # 首次：安装服务端依赖（server/ 有自己的 package.json）
npm run server           # 启动服务端，默认 http://localhost:3000
npm run server:dev       # 开发模式，改动自动重启
```

环境变量（可选，均有默认值）：

| 变量           | 默认值                      | 说明                                        |
| -------------- | --------------------------- | ------------------------------------------- |
| `PORT`         | `3000`                      | 监听端口                                    |
| `HOST`         | `0.0.0.0`                   | 监听地址，局域网多端同步时保持默认即可      |
| `DB_PATH`      | `server/data/reviewplan.db` | SQLite 文件位置                             |
| `ACCESS_TOKEN` | 硬编码默认令牌              | 数据接口都要带 `Authorization: Bearer`；设为 `none` / `off` / `-` 可关闭校验 |
| `CORS_ORIGIN`  | `*`                         | 允许的跨域来源，逗号分隔                    |
| `SERVE_STATIC` | `1`                         | 置为 `0` 时不托管前端 `dist/`               |

接口：

| 方法   | 路径          | 说明                                               |
| ------ | ------------- | -------------------------------------------------- |
| `GET`  | `/api/health` | 健康检查，返回服务端版本与是否开启令牌校验         |
| `GET`  | `/api/data`   | 拉取整份快照，返回 `rev`（版本号）与 `updatedAt`   |
| `PUT`  | `/api/data`   | 上传整份快照，带 `rev` 做乐观锁冲突检测（校验与写入在同一个事务里）；`rev: null` 表示强制覆盖（导入 / 清空用） |

服务端的访问令牌已硬编码在 `server/src/config.js` 的 `DEFAULT_ACCESS_TOKEN`（只认这一个值）；网页端**不预置**令牌，需要手动填写同一个令牌并保存，否则数据接口会返回 401。想换成自己的令牌，改 `server/src/config.js` 里的 `DEFAULT_ACCESS_TOKEN` 即可。

## 全在线模式

网页端以**云端为唯一数据源**，不再支持「纯本地使用」：

1. 打开页面先用浏览器缓存渲染，避免白屏；
2. 立刻连接服务端：拉云端数据；如果本地缓存属于**同一个服务端**且里面还有没推上去的改动，就按条目合并而不是直接覆盖；
3. **连上之前一律只读**——顶部会显示状态条（连接中 / 连接失败 / 未配置），连不上时每 3 秒自动重试并保持只读；
4. 连接成功后，**任何改动都会立即上传**（300ms 内连续改动会合并，拖拽不会打满请求）；
5. 页面关闭 / 切到后台前，会把还没发出去的改动补发一次。

### 多端同时改动怎么合

每个待办 / 计划 / 合集 / 合集里的日程都带一个 `updatedAt`，删除动作会额外记一条删除标记（`id + at`）。上传时服务端用 `rev` 做乐观锁，一旦发现版本被别人抢先，**不再丢弃本地的改动**，而是：

1. 拉取云端最新快照；
2. 按条目做 last-write-wins 合并——同一条谁的时间戳新谁生效，时间戳相同时以云端为准；
3. 删除标记保证「一端删掉的条目」不会被另一端残留的副本复活；
4. 用云端最新的 `rev` 把合并结果推回去，所以两端各改各的都不会互相覆盖（提示「已自动合并双方的改动」）。

只有在连续冲突、实在合不上时，才退回「以云端为准」并给出提示。删除标记只保留 30 天，过期后不再随快照上传。

未配置服务端地址时顶部提示「尚未配置服务端地址，当前为只读模式」，点提示条上的「去设置」跳转到设置页。

**配置步骤**：在「设置 → 服务端同步」里填写服务端地址（如 `http://192.168.1.10:3000`）与访问令牌并保存 → 点「测试连接」确认 → 状态变为「已连接」后即可正常使用。「从云端刷新」可以手动丢弃本地缓存、重新拉取云端数据。

服务端也能顺带托管页面：`npm run build` 之后再 `npm run server`，直接访问 `http://localhost:3000` 即可（history 路由回退已处理好）。

## 持久化

**云端（权威）**：待办清单、排版计划、高考日期、日程广场合集都以一份快照存在服务端的 `server/data/reviewplan.db` 里，用自增的 `rev` 做乐观锁。

**浏览器（缓存 + 本地配置）**：`stores/plan.js` / `stores/plaza.js` 仍通过 `watch` + `localStorage` 落一份副本，只用于首屏快速渲染，每次连接成功后都会被云端数据覆盖：

- `reviewplan:data:v1` — 待办清单、排版计划、高考日期与它的修改时间的缓存
- `reviewplan:plaza:v1` — 日程广场合集的缓存
- `reviewplan:tombstones:v1` — 删除标记（不持久化的话，「删除后推送失败 → 刷新页面」会丢掉删除记录）
- `reviewplan:theme` — 主题模式
- `reviewplan:server:v1` — 服务端地址、访问令牌、最后同步时间、已同步的数据版本号与上次同步用的服务端地址

在「设置 → 数据管理」中：**导出** 取当前（即云端）数据存成 JSON；**导入** 会把文件内容直接覆盖写入云端；**清空** 会同时清掉云端数据。导入 / 清空不做冲突检测，属于强制覆盖。

## 约定说明

- **路径别名**：`@` 指向 `src`，例如 `import { usePlanStore } from '@/stores/plan'`。
- **组件注册**：TDesign 按需引入（`unplugin-vue-components` + `TDesignResolver`），模板里用到哪个组件就自动引入哪个，组件样式随组件一起注入，未用到的组件不会进入产物；模板中直接用 `t-` 前缀标签，无需手动注册。
- **暗色主题**：切换 `document.documentElement` 的 `theme-mode` 属性，TDesign 的 CSS 变量会整体跟随。
- **新增页面**：在 `src/views` 下创建组件，并在 `src/router/index.js` 的 `children` 中注册，同时在 `BasicLayout.vue` 的 `menus` 里加上标签。

## 部署

路由使用的是 history 模式。把 `dist/` 直接放到静态服务器上时，访问 `/schedule` 这类子路径再刷新会 404，需要把未匹配到的请求回退到 `index.html`。

- **Nginx**

  ```nginx
  location / {
    try_files $uri $uri/ /index.html;
  }
  ```

- **Vercel / Netlify**：在项目配置里开启「SPA fallback / rewrite all to index.html」。
- 部署在子路径下时，先在 `vite.config.js` 里设置 `base`，例如 `base: '/reviewplan/'`。

## 参考

- TDesign 组件文档：https://tdesign.tencent.com/vue-next/overview
- TDesign 图标列表：https://tdesign.tencent.com/vue-next/components/icon
