// storage.js - Storage utility functions
// Loaded in two scopes: content scripts / extension pages (window) and the
// background service worker (self, via importScripts).

// Read-modify-write on a single day key is not atomic. Two tabs recording a
// visit at the same time both read {visited: []} and both write back their own
// single entry, so one is lost. The service worker is the only single instance
// in the browser, so every mutation is funnelled there and serialized by the
// queue in background.js. Reads stay local — they cannot clobber anything.
const IN_SERVICE_WORKER = typeof window === 'undefined';

async function delegate(op, args) {
  const res = await chrome.runtime.sendMessage({ type: 'INFO_FILTER_MUTATE', op, args });
  if (!res || !res.ok) {
    throw new Error((res && res.error) || `storage mutation failed: ${op}`);
  }
  return res.result;
}

const Storage = {
  /**
   * Get today's date string (YYYY-MM-DD)
   */
  getToday() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  /**
   * Get all data for today
   */
  async getTodayData() {
    const today = this.getToday();
    const result = await chrome.storage.local.get(today);
    return result[today] || {
      goals: [],
      visited: [],
      escapes: []
    };
  },

  /**
   * Save today's data
   */
  async saveTodayData(data) {
    const today = this.getToday();
    await chrome.storage.local.set({ [today]: data });
  },

  /**
   * Add a goal for today
   */
  async addGoal(goalText) {
    if (!IN_SERVICE_WORKER) return delegate('addGoal', [goalText]);
    const data = await this.getTodayData();
    data.goals.push(goalText);
    await this.saveTodayData(data);
    return data;
  },

  /**
   * Add a visited page record
   */
  async addVisited(platform, title, url) {
    if (!IN_SERVICE_WORKER) return delegate('addVisited', [platform, title, url]);
    const data = await this.getTodayData();
    data.visited.push({
      platform,
      title,
      url,
      duration: 0,
      timestamp: Date.now()
    });
    await this.saveTodayData(data);
    return data;
  },

  /**
   * Update duration for a specific visited entry.
   * dayKey is explicit — a page opened before midnight must write back to the
   * day it was recorded under, not to whatever getToday() returns on unload.
   */
  async updateVisitedDuration(dayKey, index, duration) {
    if (!IN_SERVICE_WORKER) return delegate('updateVisitedDuration', [dayKey, index, duration]);
    const result = await chrome.storage.local.get(dayKey);
    const data = result[dayKey];
    if (data && data.visited && data.visited[index]) {
      data.visited[index].duration = duration;
      await chrome.storage.local.set({ [dayKey]: data });
    }
    return data;
  },

  /**
   * Add an escape record
   */
  async addEscape(platform, section) {
    if (!IN_SERVICE_WORKER) return delegate('addEscape', [platform, section]);
    const data = await this.getTodayData();
    data.escapes.push({
      platform,
      section,
      timestamp: Date.now()
    });
    await this.saveTodayData(data);
    return data;
  },

  /**
   * Check if goal is set for today
   */
  async hasGoalToday() {
    const data = await this.getTodayData();
    return data.goals.length > 0;
  },

  /**
   * Get all data (for report)
   */
  async getAllData() {
    return await chrome.storage.local.get(null);
  },

  /**
   * Clean up data older than N days to prevent storage quota overflow
   * Keeps only the last 30 days of data
   */
  async cleanup(maxDays = 30) {
    const allData = await this.getAllData();
    const today = new Date();
    let keysToDelete = [];

    for (const key of Object.keys(allData)) {
      // Only clean up date-formatted keys (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        const keyDate = new Date(key);
        const diffDays = (today - keyDate) / (1000 * 60 * 60 * 24);
        if (diffDays > maxDays) {
          keysToDelete.push(key);
        }
      }
    }

    if (keysToDelete.length > 0) {
      await chrome.storage.local.remove(keysToDelete);
    }
  }
};

// Make available globally — `window` in pages, `self` in the service worker
(IN_SERVICE_WORKER ? self : window).InfoFilterStorage = Storage;
