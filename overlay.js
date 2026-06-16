// overlay.js - Goal input overlay logic

document.addEventListener('DOMContentLoaded', async () => {
  const goalInput = document.getElementById('goalInput');
  const submitBtn = document.getElementById('submitBtn');

  // Check if goal already set today
  const hasGoal = await InfoFilterStorage.hasGoalToday();
  if (hasGoal) {
    // Remove overlay and let user proceed
    window.parent.postMessage({ type: 'INFO_FILTER_GOAL_SET' }, chrome.runtime.getURL(''));
    return;
  }

  // Handle submit
  const submitGoal = async () => {
    const goalText = goalInput.value.trim();
    if (!goalText) {
      goalInput.style.borderColor = '#ff4444';
      goalInput.placeholder = '请输入学习目标';
      return;
    }

    await InfoFilterStorage.addGoal(goalText);
    window.parent.postMessage({ type: 'INFO_FILTER_GOAL_SET' }, chrome.runtime.getURL(''));
  };

  submitBtn.addEventListener('click', submitGoal);
  goalInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      submitGoal();
    }
  });
});
