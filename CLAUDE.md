# 信息源过滤器 Chrome Extension

## 项目概述
Chrome Extension (Manifest V3)，在 bilibili.com / YouTube 首页拦截推荐内容，强制用户设定学习目标后跳转搜索结果页。纯本地存储，无后端。

## 文件结构
- `manifest.json` — Extension 配置（MV3, permissions, content_scripts）
- `content.js` — 核心内容脚本：首页拦截、直接 DOM 覆盖层注入、内容隐藏、访问追踪、SPA 导航时长保存
- `storage.js` — chrome.storage.local 封装（目标/访问/跳过记录）；同时被 content script 和 service worker 加载
- `background.js` — Service worker：**唯一的存储写入者**，用 Promise 队列串行执行所有 mutation
- `popup.html/js` — 扩展弹出窗口
- `report.html/js` — 每日报告页
- `styles/content.css` — 页面内容隐藏规则（按 info-filter-homepage/search class 区分）

## 硬性规则

### 内容隐藏架构
- **页面类型检测**（互斥三函数，基于 URL 路径）：
  - `isHomepage()`：bilibili `/` 或 `/index.html`；YouTube `/`
  - `isVideoPage()`：bilibili `/video/...`；YouTube `/watch`
  - `isSearchPage()`：`search.bilibili.com` 子域名
- **首页**（bilibili.com /）：IIFE 顶部**仅在首页路径**注入 `#app > * { display:none }`，同时创建白色 cover div
- **搜索页**（search.bilibili.com）：隐藏侧边栏推荐，保留搜索结果
- **视频页**（/video/...、/watch）：**不做任何隐藏**——用户主动导航到这里是为了观看内容
- CSS 规则通过 `info-filter-homepage` / `info-filter-search` class 区分页面类型，**不要**写无前缀的全局隐藏规则
- content.js 在 `document_start` 运行，任何隐藏逻辑必须在此阶段注入

### 存储写入路径
- `chrome.storage.local` 对单个日期 key 做读-改-写**不是原子操作**。两个标签页同时写会丢记录。
- 所有 mutation（`addGoal` / `addVisited` / `addEscape` / `updateVisitedDuration`）必须经 service worker：
  storage.js 检测到 `window` 存在（content script / popup / report）就发 `INFO_FILTER_MUTATE` 消息，
  worker 侧（`self`，无 `window`）才执行真正的读-改-写，由 background.js 的 Promise 队列串行化。
- 只读方法（`getTodayData` / `getAllData` / `cleanup`）就地执行，不走消息。
- background.js 用 `importScripts('storage.js')` 复用同一份逻辑——**不要**在 worker 里重复实现存储操作。
- 消息来源校验用 `ALLOWED_HOSTS` 精确匹配 hostname，**不要**用 `includes()` 或宽松正则（`evilbilibili.com` 会绕过）。

### 破戒（本次跳过）按钮
- 每页最多一个悬浮按钮，仅当页面上确实存在 `.info-filter-hidden` 元素时注入。
- 点击后置 `escapedThisPage = true`，`hideContent()` 据此早退——否则 MutationObserver 会立刻重新隐藏。
- 跳过是「本次」的：`onNavigated()` 调 `resetEscapeState()` 复位并移除按钮。
- 首页弹窗**不提供绕过入口**，这是产品核心；首页也因此天然不出现该按钮。

### 跨页面跳转
- 用户在覆盖层输入目标后，content.js 直接 `window.location.href` 跳转搜索页
  - **关键**：跳转前不移除 nuclear hide / cover / overlay，保持遮挡直到导航开始，避免首页内容暴露
- **SPA 导航**：bilibili 用 pushState/replaceState 做 SPA 路由，content script 不会重新执行。拦截 pushState/replaceState + popstate/hashchange，调用 `onUrlChange()` 处理隐藏规则切换，同时保存当前页停留时长
- `INFO_FILTER_GOAL_SET` postMessage 监听保留（兼容场景），收到后移除残留隐藏

### 禁止事项
- 不要把 bilibili 的视频卡片选择器（`.bili-video-card` 等）写成全局隐藏规则——搜索结果和视频页都用这些 class
- 不要在搜索页应用首页级隐藏（`info-filter-homepage` class）——会导致搜索结果空白（`.main-container { display:none }` 隐藏搜索结果容器）
- 不要在视频页隐藏任何内容——`isVideoPage()` 为 true 时，MutationObserver 跳过、CSS 不生效
- 不要改 `run_at` 为 `document_idle`——会失去零延迟隐藏能力
- 不要在发起导航前移除 nuclear hide / cover / overlay——会导致首页内容短暂暴露
- 不要隐藏 YouTube 评论——用户希望看到视频讨论内容

### 验证清单
改完内容隐藏相关代码后，必须验证：
1. 打开 bilibili.com → 不闪首页，直接显示输入弹窗
2. 输入目标点击开始学习 → 跳转搜索页不闪首页，结果正常显示
3. 搜索结果页侧边栏推荐被隐藏
4. 搜索结果页点击视频 → 视频能正常播放（不被隐藏）
5. 直接访问 bilibili.com/video/BVxxx → 视频正常显示
6. 搜索页右下角「本次跳过」→ 点击后推荐显示且不被重新隐藏，popup「破戒次数」+1
7. 两个标签页同时导航 → report 里两条访问记录都在（不丢数据）
