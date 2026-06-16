// background.js - Background service worker

// Track tab closures for daily report
let bilibiliTabs = new Set();
let youtubeTabs = new Set();

// Initialize tracked tabs on startup
chrome.tabs.query({}, (tabs) => {
  if (!tabs) return;
  tabs.forEach(tab => {
    if (tab.url && tab.url.includes('bilibili.com')) {
      bilibiliTabs.add(tab.id);
    } else if (tab.url && tab.url.includes('youtube.com')) {
      youtubeTabs.add(tab.id);
    }
  });
});

/**
 * Check if URL is target platform
 */
function isTargetUrl(url) {
  return url && (
    url.includes('bilibili.com') ||
    url.includes('youtube.com')
  );
}

/**
 * Get platform from URL
 */
function getPlatform(url) {
  if (url.includes('bilibili.com')) return 'bilibili';
  if (url.includes('youtube.com')) return 'youtube';
  return null;
}

/**
 * Show daily report
 */
async function showDailyReport() {
  const today = new Date().toISOString().split('T')[0];
  const result = await chrome.storage.local.get(today);
  const data = result[today];

  // Only show report if there's meaningful data
  if (!data || (data.goals.length === 0 && data.visited.length === 0)) return;

  // Create new tab with report
  chrome.tabs.create({
    url: chrome.runtime.getURL('report.html')
  });
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isTargetUrl(tab.url)) {
    const platform = getPlatform(tab.url);
    if (platform === 'bilibili') {
      bilibiliTabs.add(tabId);
    } else if (platform === 'youtube') {
      youtubeTabs.add(tabId);
    }
  }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  const wasBilibili = bilibiliTabs.has(tabId);
  const wasYoutube = youtubeTabs.has(tabId);

  bilibiliTabs.delete(tabId);
  youtubeTabs.delete(tabId);

  // Check if last tab of either platform was closed
  if ((wasBilibili && bilibiliTabs.size === 0) ||
      (wasYoutube && youtubeTabs.size === 0)) {
    showDailyReport();
  }
});

// Listen for extension install
chrome.runtime.onInstalled.addListener(() => {
  console.log('信息源过滤器已安装');
});
