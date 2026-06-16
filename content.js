// content.js - Content script for DOM manipulation

(function() {
  'use strict';

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
   * Check if homepage
   */
  function isHomepage() {
    if (isSearchPage()) return false;
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

    // Create overlay container
    const container = document.createElement('div');
    container.id = 'info-filter-overlay';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483647;
      background: white;
    `;

    // Load overlay.html content via iframe
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('overlay.html');
    iframe.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    `;
    container.appendChild(iframe);

    // Hide page content behind overlay
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    document.body.appendChild(container);
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
        // On search page: only hide sidebar/recommendations, keep search results
        document.querySelectorAll('.search-right, .recommend-list, .card-box, .recommend').forEach(el => {
          el.classList.add('info-filter-hidden');
        });
      } else {
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
    const data = await InfoFilterStorage.addVisited(currentPlatform, title, url);
    currentDayKey = InfoFilterStorage.getToday();
    currentVisitedIndex = data.visited.length - 1;
  }

  /**
   * Update duration on page leave
   */
  function setupDurationTracking() {
    window.addEventListener('beforeunload', () => {
      if (currentDayKey === null || currentVisitedIndex === null) return;
      const duration = Math.floor((Date.now() - startTime) / 1000);
      chrome.storage.local.get(currentDayKey, (result) => {
        const data = result[currentDayKey];
        if (data && data.visited[currentVisitedIndex]) {
          data.visited[currentVisitedIndex].duration = duration;
          chrome.storage.local.set({ [currentDayKey]: data });
        }
      });
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

    // IMMEDIATELY cover entire page with white overlay (before any content loads)
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
