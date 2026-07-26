// background.js - Background service worker
//
// Single writer for chrome.storage. Content scripts never mutate storage
// directly — they send INFO_FILTER_MUTATE here, where a promise queue runs the
// read-modify-write cycles one at a time. The service worker is the only single
// instance in the browser, so this is what makes concurrent tabs safe.

importScripts('storage.js');

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] 信息源过滤器已安装', details.reason);
});

const ALLOWED_OPS = ['addGoal', 'addVisited', 'addEscape', 'updateVisitedDuration'];
// Exact hosts, mirroring content_scripts.matches in manifest.json. Substring or
// loose-regex matching would let evilbilibili.com through.
const ALLOWED_HOSTS = ['www.bilibili.com', 'search.bilibili.com', 'www.youtube.com'];

function isAllowedSender(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && ALLOWED_HOSTS.includes(hostname);
  } catch (e) {
    return false;
  }
}

let writeQueue = Promise.resolve();

/**
 * Run fn after every previously queued mutation has settled.
 */
function serialize(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(() => {}, () => {});
  return run;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'INFO_FILTER_MUTATE') return false;
  // Only our own content scripts
  if (!isAllowedSender(sender.url)) return false;
  if (!ALLOWED_OPS.includes(message.op)) return false;

  serialize(() => InfoFilterStorage[message.op](...(message.args || [])))
    .then(result => sendResponse({ ok: true, result }))
    .catch(err => sendResponse({ ok: false, error: String((err && err.message) || err) }));

  return true;  // keep the channel open for the async sendResponse
});
