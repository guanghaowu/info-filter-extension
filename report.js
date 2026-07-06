// report.js - Daily report logic

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Clean up old data on report open
  await InfoFilterStorage.cleanup(30);

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
    goalsEl.innerHTML = '';
    data.goals.forEach(goal => {
      const div = document.createElement('div');
      div.className = 'goal-item';
      div.textContent = goal;
      goalsEl.appendChild(div);
    });
  }

  // Calculate stats
  visitedCountEl.textContent = data.visited.length;
  escapeCountEl.textContent = data.escapes.length;

  const totalSeconds = data.visited.reduce((sum, v) => sum + (v.duration || 0), 0);
  totalDurationEl.textContent = Math.round(totalSeconds / 60);

  // Display visited pages
  if (data.visited.length > 0) {
    visitedListEl.innerHTML = '';
    data.visited.forEach(v => {
      const time = new Date(v.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const duration = v.duration ? `${Math.round(v.duration / 60)}分钟` : '';

      const item = document.createElement('div');
      item.className = 'visited-item';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'visited-title';

      if (isValidUrl(v.url)) {
        const a = document.createElement('a');
        a.href = v.url;
        a.target = '_blank';
        a.textContent = v.title || '无标题';
        titleDiv.appendChild(a);
      } else {
        titleDiv.textContent = v.title || '无标题';
      }

      const metaDiv = document.createElement('div');
      metaDiv.className = 'visited-meta';

      const platformSpan = document.createElement('span');
      platformSpan.className = 'visited-platform';
      platformSpan.textContent = v.platform || '';

      metaDiv.appendChild(platformSpan);
      metaDiv.appendChild(document.createTextNode(`${time} ${duration}`));

      item.appendChild(titleDiv);
      item.appendChild(metaDiv);
      visitedListEl.appendChild(item);
    });
  }

  // Display escapes
  if (data.escapes.length > 0) {
    escapeListEl.innerHTML = '';
    data.escapes.forEach(e => {
      const time = new Date(e.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      });

      const div = document.createElement('div');
      div.className = 'escape-item';
      div.textContent = `${time} - ${e.platform || ''} - ${e.section || ''}`;
      escapeListEl.appendChild(div);
    });
  }
});
