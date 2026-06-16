// background.js - Background service worker

// Simple service worker - just keep alive
chrome.runtime.onInstalled.addListener(() => {
  console.log('信息源过滤器已安装');
});
