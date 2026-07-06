// content.js - Content script for DOM manipulation

(function() {
  'use strict';

  // EARLIEST POSSIBLE: Nuclear CSS hide — inject BEFORE browser renders anything
  // This is the only way to eliminate flash on SSR pages (bilibili/YouTube)
  // Must run at document_start, before ANY DOM manipulation
  // ONLY inject on homepage — search/video pages must not be affected
  const _hostname = window.location.hostname;
  const _path = window.location.pathname;
  const _isBilibiliHome = _hostname.includes('bilibili.com') && !_hostname.includes('search.') && (_path === '/' || _path === '/index.html');
  const _isYoutubeHome = _hostname.includes('youtube.com') && _path === '/';
  if (_isBilibiliHome || _isYoutubeHome) {
    const nuclearStyle = document.createElement('style');
    nuclearStyle.id = 'info-filter-nuclear-hide';
    // Hide only children of page app containers — NOT the containers themselves
    // `#app { display:none }` would hide search.bilibili.com's #app too
    nuclearStyle.textContent = '#app > *, ytd-app > * { display: none !important; }';
    document.documentElement.appendChild(nuclearStyle);
  }

  let startTime = Date.now();
  let currentPlatform = null;
  let overlayShown = false;
  let currentDayKey = null;
  let currentVisitedIndex = null;

  /**
   * Detect current platform
   */
  function detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('bilibili.com')) return 'bilibili';
    if (hostname.includes('youtube.com')) return 'youtube';
    return null;
  }

  /**
   * Check if on search results page
   */
  function isSearchPage() {
    return window.location.hostname === 'search.bilibili.com';
  }

  /**
   * Check if on a video/watch page (not homepage, not search)
   */
  function isVideoPage() {
    const path = window.location.pathname;
    if (currentPlatform === 'bilibili') {
      return path.startsWith('/video/');
    }
    if (currentPlatform === 'youtube') {
      return path === '/watch';
    }
    return false;
  }

  /**
   * Check if homepage
   */
  function isHomepage() {
    if (isSearchPage() || isVideoPage()) return false;
    const path = window.location.pathname;
    if (currentPlatform === 'bilibili') {
      return path === '/' || path === '/index.html';
    }
    if (currentPlatform === 'youtube') {
      return path === '/';
    }
    return false;
  }

  /**
   * Show goal input overlay
   */
  function showOverlay() {
    if (overlayShown) return;
    overlayShown = true;

    // Wait for body to be ready
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => {
        if (!overlayShown) return;
        actuallyShowOverlay();
      });
      return;
    }

    actuallyShowOverlay();
  }

  function actuallyShowOverlay() {
    // Remove initial cover
    const cover = document.getElementById('info-filter-cover');
    if (cover) cover.remove();

    // Create overlay container — direct DOM, no iframe (avoids cross-origin issues)
    const container = document.createElement('div');
    container.id = 'info-filter-overlay';
    container.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: 2147483647;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex; justify-content: center; align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Overlay content card
    const card = document.createElement('div');
    card.style.cssText = `
      background: white; padding: 40px; border-radius: 12px;
      text-align: center; max-width: 500px; width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    `;

    card.innerHTML = `
      <h1 style="color:#333;margin-bottom:8px;font-size:28px;">今天学什么？</h1>
      <p style="color:#666;margin-bottom:24px;font-size:16px;">设定目标，搜索学习内容</p>
      <input type="text" id="info-filter-goal-input" autofocus
        style="width:100%;padding:16px;font-size:18px;border:2px solid #ddd;border-radius:8px;margin-bottom:16px;outline:none;box-sizing:border-box;"
        placeholder="输入你想学的内容，直接搜索...">
      <button id="info-filter-submit-btn"
        style="width:100%;padding:16px;font-size:18px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;cursor:pointer;">
        开始学习
      </button>
      <p style="color:#999;margin-top:16px;font-size:14px;">输入目标后跳转到搜索结果</p>
    `;

    container.appendChild(card);
    document.body.appendChild(container);

    // Hide scroll
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Set up goal input listeners
    const goalInput = document.getElementById('info-filter-goal-input');
    const submitBtn = document.getElementById('info-filter-submit-btn');

    const submitGoal = async () => {
      const goalText = goalInput.value.trim();
      if (!goalText) {
        goalInput.style.borderColor = '#ff4444';
        goalInput.placeholder = '请输入学习目标';
        return;
      }

      try {
        await InfoFilterStorage.addGoal(goalText);
      } catch(e) {
        goalInput.style.borderColor = '#ff4444';
        goalInput.placeholder = '保存失败，请重试';
        return;
      }

      // Don't remove nuclear hide / cover / overlay — they block homepage content
      // during the transition. Navigation will tear down the old DOM anyway.
      // Navigate immediately to avoid exposing the homepage feed.
      const searchUrl = currentPlatform === 'youtube'
        ? 'https://www.youtube.com/results?search_query=' + encodeURIComponent(goalText)
        : 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(goalText);
      window.location.href = searchUrl;
    };

    submitBtn.addEventListener('click', submitGoal);
    goalInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitGoal();
    });

    // Focus input after render
    setTimeout(() => goalInput.focus(), 100);
  }

  /**
   * Remove overlay
   */
  function removeOverlay() {
    const container = document.getElementById('info-filter-overlay');
    if (container) {
      container.remove();
    }
    // Restore page scroll
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    overlayShown = false;
  }

  /**
   * Hide recommended content
   */
  function hideContent() {
    if (currentPlatform === 'bilibili') {
      if (isSearchPage()) {
        // On search page: hide sidebar recommendations
        document.querySelectorAll('.search-right, .recommend-list, .card-box, .recommend').forEach(el => {
          el.classList.add('info-filter-hidden');
        });
      } else if (isHomepage()) {
        // Hide homepage feed
        document.querySelectorAll('.bili-video-card, .feed-card, .card-list').forEach(el => {
          el.classList.add('info-filter-hidden');
        });
      } else if (!isVideoPage()) {
        // On non-video, non-homepage pages (e.g. channel): hide sidebar
        document.querySelectorAll('.search-right, .recommend-list, .card-box, .recommend').forEach(el => {
          el.classList.add('info-filter-hidden');
        });
      }

      // Hide comments on video pages
      if (isVideoPage()) {
        document.querySelectorAll('.comment-list, #comment').forEach(el => {
          el.classList.add('info-filter-hidden');
        });
      }
    }

    if (currentPlatform === 'youtube') {
      // Hide homepage feed — relies on .info-filter-youtube-home CSS class
      // No JS hiding needed for feed; CSS handles it
      // Sidebar: hide recommendations on all pages (keep comments visible — user wants to see discussions)
      document.querySelectorAll('ytd-compact-video-renderer, ytd-compact-autoplay-renderer').forEach(el => {
        el.classList.add('info-filter-hidden');
      });
    }
  }

  /**
   * Add escape button
   */
  function addEscapeButton(section, targetElement) {
    const btn = document.createElement('button');
    btn.className = 'info-filter-escape-btn';
    btn.textContent = '本次跳过';
    btn.style.position = 'absolute';
    btn.style.top = '10px';
    btn.style.right = '10px';

    btn.addEventListener('click', async () => {
      // Show hidden content
      targetElement.classList.remove('info-filter-hidden');
      btn.remove();

      // Record escape
      await InfoFilterStorage.addEscape(currentPlatform, section);
    });

    targetElement.style.position = 'relative';
    targetElement.appendChild(btn);
  }

  /**
   * Track page visit
   */
  async function trackVisit() {
    const title = document.title;
    const url = window.location.href;
    const data = await InfoFilterStorage.addVisited(currentPlatform, title, url);
    currentDayKey = InfoFilterStorage.getToday();
    currentVisitedIndex = data.visited.length - 1;
  }

  /**
   * Update duration on page leave (multiple fallback events)
   */
  function saveDuration() {
    if (currentDayKey === null || currentVisitedIndex === null) return;
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const data = { currentDayKey, currentVisitedIndex, duration };
    // Post a message to background script for reliable saving
    try {
      chrome.runtime.sendMessage({ type: 'SAVE_DURATION', data });
    } catch(e) {
      // If connection fails, fall back to sync save in storage
      InfoFilterStorage.updateLastVisitedDuration(duration, data.currentVisitedIndex).catch(() => {});
    }
  }

  function setupDurationTracking() {
    window.addEventListener('beforeunload', saveDuration);
    window.addEventListener('pagehide', saveDuration);
    // Save when tab becomes hidden (user switches tabs)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        saveDuration();
      }
    });
  }

  /**
   * Handle URL changes (SPA navigation)
   */
  function onUrlChange() {
    const isHome = isHomepage();
    const isVid = isVideoPage();
    const isSearch = isSearchPage();

    if (!isHome) {
      const nuclearHideEl = document.getElementById('info-filter-nuclear-hide');
      if (nuclearHideEl) nuclearHideEl.remove();
      const coverEl = document.getElementById('info-filter-cover');
      if (coverEl) coverEl.remove();
      document.documentElement.classList.remove('info-filter-homepage');
      document.documentElement.classList.remove('info-filter-youtube-home');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    if (isVid) {
      document.querySelectorAll('.info-filter-hidden').forEach(el => {
        el.classList.remove('info-filter-hidden');
      });
    } else if (!isHome) {
      hideContent();
    }
  }

  /**
   * Save duration when navigating away from current page (SPA navigation)
   */
  function setupNavigationDurationSave() {
    // Override history methods for SPA navigation detection
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function(...args) {
      origPushState.apply(this, args);
      saveDuration();
      onUrlChange();
    };
    history.replaceState = function(...args) {
      origReplaceState.apply(this, args);
      saveDuration();
      onUrlChange();
    };

    // Also save on popstate and hashchange
    window.addEventListener('popstate', () => {
      saveDuration();
      onUrlChange();
    });
    window.addEventListener('hashchange', () => {
      saveDuration();
      onUrlChange();
    });
  }

  /**
   * Listen for overlay messages
   */
  window.addEventListener('message', (event) => {
    const expectedOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
    console.log('[Content] Message received from:', event.origin, 'expected:', expectedOrigin, 'data:', event.data);

    // Accept messages from our extension origin OR from extension iframe
    if (event.origin !== expectedOrigin && !event.origin.startsWith('chrome-extension://')) {
      console.log('[Content] Message rejected - origin mismatch');
      return;
    }

    if (event.data && event.data.type === 'INFO_FILTER_GOAL_SET') {
      console.log('[Content] Goal set! Removing overlay');
      // Remove nuclear hide so page content becomes visible
      const nuclearHideEl = document.getElementById('info-filter-nuclear-hide');
      if (nuclearHideEl) nuclearHideEl.remove();
      // Remove white cover
      const coverEl = document.getElementById('info-filter-cover');
      if (coverEl) coverEl.remove();
      removeOverlay();
      hideContent();
    }
  });

  /**
   * Initialize
   */
  async function init() {
    currentPlatform = detectPlatform();
    console.log('[Content] Platform detected:', currentPlatform, 'isSearchPage:', isSearchPage());
    if (!currentPlatform) return;

    // Mark page type via body class for CSS targeting
    if (isHomepage() && !isSearchPage()) {
      document.documentElement.classList.add('info-filter-homepage');
      // Add platform-specific class for YouTube CSS rules
      if (currentPlatform === 'youtube') {
        document.documentElement.classList.add('info-filter-youtube-home');
      }
    } else if (isSearchPage()) {
      document.documentElement.classList.add('info-filter-search');
      // NOTE: Do NOT add info-filter-homepage here — its CSS rules (e.g.
      // .main-container { display:none }) would hide search results content.
      // Search pages only need sidebar recommendation hiding, not full homepage blocking.
    }

    // Nuclear hide already applied conditionally at top (homepage only).
    // No need for removal on search/video pages — it was never injected there.
    // Homepage: show cover while nuclear-hide keeps everything invisible.
    if (isHomepage() && !isSearchPage()) {
      const cover = document.createElement('div');
      cover.id = 'info-filter-cover';
      cover.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;background:white;';
      document.documentElement.appendChild(cover);
    }

    // Show overlay on homepage only (not on search results)
    if (isHomepage() && !isSearchPage()) {
      showOverlay();
    } else {
      hideContent();
    }

    // Track visit
    await trackVisit();

    // Setup duration tracking
    setupDurationTracking();

    // Re-apply hiding on navigation (for SPAs)
    const observer = new MutationObserver(() => {
      if (overlayShown) return;
      // Don't hide content on video pages — user navigated here intentionally
      if (isVideoPage()) return;
      hideContent();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Setup SPA navigation detection with duration saving
    setupNavigationDurationSave();
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
