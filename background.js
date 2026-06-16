// background.js - Background service worker

chrome.runtime.onInstalled.addListener((details) => {
  console.log('信息源过滤器已安装', details.reason);
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('信息源过滤器启动');
});
