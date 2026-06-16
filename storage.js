// storage.js - Storage utility functions

const Storage = {
  /**
   * Get today's date string (YYYY-MM-DD)
   */
  getToday() {
    return new Date().toISOString().split('T')[0];
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
    const data = await this.getTodayData();
    data.goals.push(goalText);
    await this.saveTodayData(data);
    return data;
  },

  /**
   * Add a visited page record
   */
  async addVisited(platform, title, url) {
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
   * Update duration for last visited page
   */
  async updateLastVisitedDuration(duration) {
    const data = await this.getTodayData();
    if (data.visited.length > 0) {
      data.visited[data.visited.length - 1].duration = duration;
      await this.saveTodayData(data);
    }
    return data;
  },

  /**
   * Add an escape record
   */
  async addEscape(platform, section) {
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
  }
};

// Make available globally
window.Storage = Storage;
