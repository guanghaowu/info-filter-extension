// background.js - Background service worker

chrome.runtime.onInstalled.addListener((details) => {
  console.log('信息源过滤器已安装', details.reason);
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('信息源过滤器启动');
  // Clean up data older than 30 days to prevent storage quota overflow
  const allData = await chrome.storage.local.get(null);
  const today = new Date();
  const keysToDelete = [];

  for (const key of Object.keys(allData)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      const keyDate = new Date(key);
      const diffDays = (today - keyDate) / (1000 * 60 * 60 * 24);
      if (diffDays > 30) {
        keysToDelete.push(key);
      }
    }
  }

  if (keysToDelete.length > 0) {
    await chrome.storage.local.remove(keysToDelete);
    console.log(`清理了 ${keysToDelete.length} 条过期数据`);
  }
});

// Handle duration save from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_DURATION' && sender.url) {
    // Only accept from our content scripts
    if (!sender.url.includes('bilibili.com') && !sender.url.includes('youtube.com')) {
      return false;
    }
    const { currentDayKey, currentVisitedIndex, duration } = message.data;
    chrome.storage.local.get(currentDayKey, (result) => {
      const data = result[currentDayKey];
      if (data && data.visited[currentVisitedIndex]) {
        data.visited[currentVisitedIndex].duration = duration;
        chrome.storage.local.set({ [currentDayKey]: data });
      }
    });
  }
  return false;
});
