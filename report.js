// report.js - Daily report logic

document.addEventListener('DOMContentLoaded', async () => {
  const dateEl = document.getElementById('date');
  const goalsEl = document.getElementById('goals');
  const visitedCountEl = document.getElementById('visitedCount');
  const escapeCountEl = document.getElementById('escapeCount');
  const totalDurationEl = document.getElementById('totalDuration');
  const visitedListEl = document.getElementById('visitedList');
  const escapeListEl = document.getElementById('escapeList');

  // Get today's data
  const data = await InfoFilterStorage.getTodayData();

  // Display date
  dateEl.textContent = InfoFilterStorage.getToday();

  // Display goals
  if (data.goals.length > 0) {
    goalsEl.innerHTML = data.goals
      .map(goal => `<div class="goal-item">${goal}</div>`)
      .join('');
  }

  // Calculate stats
  visitedCountEl.textContent = data.visited.length;
  escapeCountEl.textContent = data.escapes.length;

  const totalSeconds = data.visited.reduce((sum, v) => sum + (v.duration || 0), 0);
  totalDurationEl.textContent = Math.round(totalSeconds / 60);

  // Display visited pages
  if (data.visited.length > 0) {
    visitedListEl.innerHTML = data.visited
      .map(v => {
        const time = new Date(v.timestamp).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const duration = v.duration ? `${Math.round(v.duration / 60)}分钟` : '';

        return `
          <div class="visited-item">
            <div class="visited-title">
              <a href="${v.url}" target="_blank">${v.title || '无标题'}</a>
            </div>
            <div class="visited-meta">
              <span class="visited-platform">${v.platform}</span>
              ${time} ${duration}
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Display escapes
  if (data.escapes.length > 0) {
    escapeListEl.innerHTML = data.escapes
      .map(e => {
        const time = new Date(e.timestamp).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        });

        return `
          <div class="escape-item">
            ${time} - ${e.platform} - ${e.section}
          </div>
        `;
      })
      .join('');
  }
});
