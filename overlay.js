// overlay.js - Goal input overlay logic

document.addEventListener('DOMContentLoaded', async () => {
  const goalInput = document.getElementById('goalInput');
  const submitBtn = document.getElementById('submitBtn');

  const submitGoal = async () => {
    const goalText = goalInput.value.trim();
    if (!goalText) {
      goalInput.style.borderColor = '#ff4444';
      goalInput.placeholder = '请输入学习目标';
      return;
    }

    await InfoFilterStorage.addGoal(goalText);

    // Redirect directly - page navigation will clean up overlay
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
