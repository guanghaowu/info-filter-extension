// popup.js - Popup logic

document.addEventListener('DOMContentLoaded', async () => {
  const goalList = document.getElementById('goalList');
  const visitedCount = document.getElementById('visitedCount');
  const escapeCount = document.getElementById('escapeCount');
  const viewReportBtn = document.getElementById('viewReport');

  // Load today's data
  const data = await InfoFilterStorage.getTodayData();

  // Display goals
  if (data.goals.length > 0) {
    goalList.innerHTML = data.goals
      .map(goal => `<li class="goal-item">${goal}</li>`)
      .join('');
  } else {
    goalList.innerHTML = '<li class="goal-item">未设定目标</li>';
  }

  // Display stats
  visitedCount.textContent = data.visited.length;
  escapeCount.textContent = data.escapes.length;

  // View report button
  viewReportBtn.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('report.html')
    });
  });
});
