// content.js - Content script for DOM manipulation

(function() {
  'use strict';

  let startTime = Date.now();
  let currentPlatform = null;
  let overlayShown = false;

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
   * Check if homepage
   */
  function isHomepage() {
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

    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('overlay.html');
    iframe.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
      z-index: 999999;
    `;
    iframe.id = 'info-filter-overlay';
    document.body.appendChild(iframe);
    overlayShown = true;
  }

  /**
   * Remove overlay
   */
  function removeOverlay() {
    const iframe = document.getElementById('info-filter-overlay');
    if (iframe) {
      iframe.remove();
    }
    overlayShown = false;
  }

  /**
   * Hide recommended content
   */
  function hideContent() {
    if (currentPlatform === 'bilibili') {
      // Hide homepage feed
      if (isHomepage()) {
        document.querySelectorAll('.bili-video-card, .feed-card, .card-list').forEach(el => {
          el.classList.add('info-filter-hidden');
        });
      }

      // Hide sidebar
      document.querySelectorAll('.video-card, .bili-video-card').forEach(el => {
        el.classList.add('info-filter-hidden');
      });

      // Hide comments
      document.querySelectorAll('.comment-list, #comment').forEach(el => {
        el.classList.add('info-filter-hidden');
      });
    }

    if (currentPlatform === 'youtube') {
      // Hide homepage feed
      if (isHomepage()) {
        document.querySelectorAll('ytd-rich-grid-row, ytd-rich-item-renderer').forEach(el => {
          el.classList.add('info-filter-hidden');
        });
      }

      // Hide sidebar
      document.querySelectorAll('ytd-compact-video-renderer, ytd-compact-autoplay-renderer').forEach(el => {
        el.classList.add('info-filter-hidden');
      });

      // Hide comments
      document.querySelectorAll('ytd-comments').forEach(el => {
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
    await InfoFilterStorage.addVisited(currentPlatform, title, url);
  }

  /**
   * Update duration on page leave
   */
  function setupDurationTracking() {
    window.addEventListener('beforeunload', () => {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      // Use synchronous storage call - chrome.storage.local.set doesn't need await
      const data = InfoFilterStorage.getTodayData();
      data.then(d => {
        if (d.visited.length > 0) {
          d.visited[d.visited.length - 1].duration = duration;
          chrome.storage.local.set({ [InfoFilterStorage.getToday()]: d });
        }
      });
    });
  }

  /**
   * Listen for overlay messages
   */
  window.addEventListener('message', (event) => {
    if (event.origin !== chrome.runtime.getURL('').replace(/\/$/, '')) return;
    if (event.data.type === 'INFO_FILTER_GOAL_SET') {
      removeOverlay();
      hideContent();
    }
  });

  /**
   * Initialize
   */
  async function init() {
    currentPlatform = detectPlatform();
    if (!currentPlatform) return;

    // Check if goal set today
    const hasGoal = await InfoFilterStorage.hasGoalToday();
    if (!hasGoal) {
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
      hideContent();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
