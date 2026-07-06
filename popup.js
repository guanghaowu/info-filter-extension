// popup.js - Popup logic

document.addEventListener('DOMContentLoaded', async () => {
  // Clean up old data on popup open
  await InfoFilterStorage.cleanup(30);

  const goalList = document.getElementById('goalList');
  const visitedCount = document.getElementById('visitedCount');
  const escapeCount = document.getElementById('escapeCount');
  const viewReportBtn = document.getElementById('viewReport');

  // Load today's data
  const data = await InfoFilterStorage.getTodayData();

  // Display goals
  if (data.goals.length > 0) {
    goalList.innerHTML = '';
    data.goals.forEach(goal => {
      const li = document.createElement('li');
      li.className = 'goal-item';
      li.textContent = goal;
      goalList.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.className = 'goal-item';
    li.textContent = '未设定目标';
    goalList.appendChild(li);
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
