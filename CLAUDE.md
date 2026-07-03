# 信息源过滤器 Chrome Extension

## 项目概述
Chrome Extension (Manifest V3)，在 bilibili.com / YouTube 首页拦截推荐内容，强制用户设定学习目标后跳转搜索结果页。纯本地存储，无后端。

## 文件结构
- `manifest.json` — Extension 配置（MV3, permissions, content_scripts）
- `content.js` — 核心内容脚本：首页拦截、覆盖层注入、内容隐藏、访问追踪
- `overlay.js` — 目标输入弹窗逻辑（iframe 内运行）
- `storage.js` — chrome.storage.local 封装（目标/访问/跳过记录）
- `background.js` — Service worker（onInstalled/onStartup）
- `popup.html/js` — 扩展弹出窗口
- `report.html/js` — 每日报告页
- `styles/content.css` — 页面内容隐藏规则（按 info-filter-homepage/search class 区分）
- `styles/overlay.css` — 覆盖层样式

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

### 跨页面跳转
- 用户在覆盖层输入目标后，overlay.js 直接 `window.parent.location.href` 跳转搜索页
- 搜索页需要检测 `document.referrer` 判断是否从 bilibili 跳转，若是则继承首页级隐藏
- 搜索结果加载后（300ms 延迟）移除首页隐藏规则
- **SPA 导航**：bilibili 用 pushState/replaceState 做 SPA 路由，content script 不会重新执行。用 MutationObserver 监听 `location.href` 变化，URL 变化时调用 `onUrlChange()` 清理非首页的隐藏规则（移除 early-hide style + info-filter-homepage class）
- 目标设置完成后（`INFO_FILTER_GOAL_SET` 消息），立即移除残留的 early-hide style

### 禁止事项
- 不要把 bilibili 的视频卡片选择器（`.bili-video-card` 等）写成全局隐藏规则——搜索结果和视频页都用这些 class
- 不要在搜索页应用首页级隐藏而不移除——会导致搜索结果空白
- 不要在视频页隐藏任何内容——`isVideoPage()` 为 true 时，MutationObserver 跳过、CSS 不生效
- 不要改 `run_at` 为 `document_idle`——会失去零延迟隐藏能力
- 不要在 overlay.js 里用 postMessage 后再跳转——直接跳转更可靠

### 验证清单
改完内容隐藏相关代码后，必须验证：
1. 打开 bilibili.com → 不闪首页，直接显示输入弹窗
2. 输入目标点击开始学习 → 跳转搜索页不闪首页，结果正常显示
3. 搜索结果页侧边栏推荐被隐藏
4. 搜索结果页点击视频 → 视频能正常播放（不被隐藏）
5. 直接访问 bilibili.com/video/BVxxx → 视频正常显示
