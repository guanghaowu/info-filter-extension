// overlay.js - Goal input overlay logic

document.addEventListener('DOMContentLoaded', async () => {
  const goalInput = document.getElementById('goalInput');
  const submitBtn = document.getElementById('submitBtn');

  console.log('[Overlay] DOM loaded, goalInput:', !!goalInput, 'submitBtn:', !!submitBtn);
  console.log('[Overlay] InfoFilterStorage available:', typeof InfoFilterStorage !== 'undefined');

  // Check if InfoFilterStorage is available
  if (typeof InfoFilterStorage === 'undefined') {
    console.error('[Overlay] InfoFilterStorage is undefined! storage.js may not have loaded.');
    // Fallback: try direct chrome.storage
    submitBtn.addEventListener('click', async () => {
      const goalText = goalInput.value.trim();
      if (!goalText) {
        goalInput.style.borderColor = '#ff4444';
        goalInput.placeholder = '请输入学习目标';
        return;
      }
      console.log('[Overlay] Fallback: saving goal directly');
      const today = new Date().toISOString().slice(0, 10);
      const result = await chrome.storage.local.get(today);
      const data = result[today] || { goals: [], visited: [], escapes: [] };
      data.goals.push(goalText);
      await chrome.storage.local.set({ [today]: data });
      console.log('[Overlay] Goal saved, notifying parent');
      window.parent.postMessage({ type: 'INFO_FILTER_GOAL_SET' }, '*');
    });
    return;
  }

  // Handle submit - save goal then redirect to search
  const submitGoal = async () => {
    const goalText = goalInput.value.trim();
    console.log('[Overlay] Submit clicked, goalText:', goalText);
    if (!goalText) {
      goalInput.style.borderColor = '#ff4444';
      goalInput.placeholder = '请输入学习目标';
      return;
    }

    await InfoFilterStorage.addGoal(goalText);
    console.log('[Overlay] Goal saved, redirecting to search');

    // Notify parent to remove overlay
    window.parent.postMessage({ type: 'INFO_FILTER_GOAL_SET' }, '*');

    // Redirect to B站 search results for this goal
    const searchUrl = 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(goalText);
    window.parent.location.href = searchUrl;
  };

  submitBtn.addEventListener('click', submitGoal);
  goalInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      submitGoal();
    }
  });
});
