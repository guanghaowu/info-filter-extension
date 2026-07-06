// background.js - Background service worker

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] 信息源过滤器已安装', details.reason);
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
