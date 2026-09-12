# 复习清单（reviewplan）

一个面向高考复习的日程规划网站：**倒计时 + 待办清单 + 拖拽排班**。

界面基于 **TDesign Vue Next**，数据保存在浏览器 localStorage 中，无需后端即可使用。

## 功能

| 页面         | 说明                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **首页**     | 高考倒计时（大字天数 + 目标日期）、整体统计，以及未来 7 天的排版计划总览                                                                                                                                            |
| **日程表**   | 连续日历：纵向是可以一直往下滚的日期列表（滚到上下边缘会自动继续加载，默认定位到今天），横向是 06:00 ~ 23:00 的各个时间段，当前时刻有一条红色竖线标出。待办清单收在右下角，点击展开。计划块的宽度＝时间跨度，拖动卡片左右边缘可直接拉伸调整时长 |
| **日程广场** | 自己维护的系列合集：新建合集 → 往里添加日程 → 单条或整组一键加入待办清单，支持搜索与内置模板载入                                                                                                                    |
| **设置**     | 高考日期、深浅色主题、数据导出 / 导入 / 清空                                                                                                                                                                        |

## 技术栈

| 分类      | 选型                                      |
| --------- | ----------------------------------------- |
| 核心框架  | Vue 3（组合式 API + `<script setup>`）    |
| 构建工具  | Vite                                      |
| 路由      | Vue Router（history 模式 + 路由懒加载）   |
| 状态管理  | Pinia（组合式写法 + localStorage 持久化） |
| UI 组件库 | TDesign Vue Next                          |
| 图标      | tdesign-icons-vue-next                    |

## 快速开始

```bash
npm install      # 安装依赖
npm run dev      # 开发服务 http://localhost:5173
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
npm run lint     # ESLint 检查
npm run format   # Prettier 格式化
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
│   ├── plan.js           # 待办清单 / 排版计划 / 设置（核心 store）
│   └── plaza.js          # 日程广场：系列合集与合集内日程（localStorage 持久化）
├── styles/main.css
├── utils/
│   ├── date.js           # 日期计算（含高考倒计时）
│   └── id.js             # 随机 id
├── views/
│   ├── HomeView.vue      # 首页
│   ├── ScheduleView.vue  # 日程表（拖拽排班）
│   ├── PlazaView.vue     # 日程广场
│   ├── SettingsView.vue  # 设置
│   └── NotFoundView.vue  # 404
├── App.vue
└── main.js
```

## 数据模型

```js
// 待办清单：还没有安排具体时间的任务
todo = { id, title, category, duration, level, desc, source, createdAt }

// 排版计划：已安排到某天某个时段的复习任务
plan = {
  id,
  todoId,
  title,
  category,
  duration,
  level,
  desc,
  source,
  date,
  startHour,
  note,
  done,
  createdAt,
}

// 系列合集：用户自己在日程广场维护的日程分组
collection = { id, name, desc, category, color, builtin, createdAt, updatedAt, items: [item] }

// 合集里的日程：未加入待办前的「素材」
item = { id, title, category, level, duration, desc }
```

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

## 持久化

`stores/plan.js` 与 `stores/app.js` 通过 `watch` + `localStorage` 自动保存：

- `reviewplan:data:v1` — 待办清单、排版计划、高考日期
- `reviewplan:plaza:v1` — 日程广场的系列合集与日程
- `reviewplan:theme` — 主题模式

在「设置 → 数据管理」中可以导出 JSON 备份、导入恢复或一键清空；导出文件里同时包含待办 / 计划与系列合集。

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
