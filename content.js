// content.js - Content script for DOM manipulation

(function() {
  'use strict';

  // EARLIEST POSSIBLE: No longer needed — init() handles early-hide creation
  // after DOM is available, which is sufficient since overlay covers the page anyway

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
      // Hide homepage feed — relies on .info-filter-youtube-home CSS class
      // No JS hiding needed for feed; CSS handles it
      // Sidebar and comments: hide on all pages (not just homepage)
      document.querySelectorAll('ytd-compact-video-renderer, ytd-compact-autoplay-renderer').forEach(el => {
        el.classList.add('info-filter-hidden');
      });

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
      // Remove early-hide style (no longer needed after goal is set)
      const earlyHideEl = document.getElementById('info-filter-early-hide');
      if (earlyHideEl) earlyHideEl.remove();
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

    // Check if navigated from bilibili (referral from overlay)
    const fromBilibili = document.referrer && document.referrer.includes('bilibili.com');

    // Mark page type via body class for CSS targeting
    if (isHomepage() && !isSearchPage()) {
      document.documentElement.classList.add('info-filter-homepage');
      // Add platform-specific class for YouTube CSS rules
      if (currentPlatform === 'youtube') {
        document.documentElement.classList.add('info-filter-youtube-home');
      }
    } else if (isSearchPage()) {
      document.documentElement.classList.add('info-filter-search');
      // If coming from bilibili overlay, also apply homepage hiding during transition
      if (fromBilibili) {
        document.documentElement.classList.add('info-filter-homepage');
      }
    }

    // AGGRESSIVE: Hide entire document immediately, then selectively show
    // This prevents ANY flash of content before overlay is ready
    if (isHomepage() && !isSearchPage()) {
      // Homepage: full nuclear hide
      const earlyHide = document.createElement('style');
      earlyHide.id = 'info-filter-early-hide';
      earlyHide.textContent = `
        body > *:not(#info-filter-cover):not(#info-filter-overlay) {
          display: none !important;
        }
      `;
      document.documentElement.appendChild(earlyHide);

      const headerSelectors = [
        '#bili-header', '.bili-header', '.bili-header__bar',
        '.mini-header', 'header', 'nav', '.navbar', '.top-bar',
        '#app > div:first-child'
      ];
      headerSelectors.forEach(sel => {
        try {
          document.querySelectorAll(sel).forEach(el => {
            el.style.setProperty('display', 'none', 'important');
          });
        } catch(e) {}
      });

      const cover = document.createElement('div');
      cover.id = 'info-filter-cover';
      cover.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;background:white;';
      document.documentElement.appendChild(cover);
    } else if (isSearchPage() && fromBilibili) {
      // Search page from bilibili: also nuclear hide during transition
      const earlyHide = document.createElement('style');
      earlyHide.id = 'info-filter-early-hide';
      earlyHide.textContent = `
        body > *:not(#info-filter-cover):not(#info-filter-overlay) {
          display: none !important;
        }
      `;
      document.documentElement.appendChild(earlyHide);

      const headerSelectors = [
        '#bili-header', '.bili-header', '.bili-header__bar',
        '.mini-header', 'header', 'nav', '.navbar', '.top-bar',
        '#app > div:first-child'
      ];
      headerSelectors.forEach(sel => {
        try {
          document.querySelectorAll(sel).forEach(el => {
            el.style.setProperty('display', 'none', 'important');
          });
        } catch(e) {}
      });

      const cover = document.createElement('div');
      cover.id = 'info-filter-cover';
      cover.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;background:white;';
      document.documentElement.appendChild(cover);

      // After search results load, remove homepage hiding and show results
      const waitForResults = () => {
        // Remove nuclear hide style
        const styleEl = document.getElementById('info-filter-early-hide');
        if (styleEl) styleEl.remove();
        // Remove cover
        const coverEl = document.getElementById('info-filter-cover');
        if (coverEl) coverEl.remove();
        // Remove homepage class (keep search class)
        document.documentElement.classList.remove('info-filter-homepage');
        // Restore body overflow
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      };

      // Wait for search results to appear
      if (document.readyState === 'complete') {
        setTimeout(waitForResults, 300);
      } else {
        window.addEventListener('load', () => setTimeout(waitForResults, 300));
      }
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

    // Intercept pushState/replaceState for reliable SPA navigation detection
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function(...args) {
      origPushState.apply(this, args);
      onUrlChange();
    };
    history.replaceState = function(...args) {
      origReplaceState.apply(this, args);
      onUrlChange();
    };

    // Also listen for popstate (back/forward)
    window.addEventListener('popstate', () => {
      onUrlChange();
    });

    function onUrlChange() {
      const isHome = isHomepage();
      const isVid = isVideoPage();
      const isSearch = isSearchPage();

      // On video/search pages: remove homepage-specific hiding
      if (!isHome) {
        // Remove early-hide style if still present
        const earlyHideEl = document.getElementById('info-filter-early-hide');
        if (earlyHideEl) earlyHideEl.remove();

        // Remove homepage class (so CSS rules stop targeting this page)
        document.documentElement.classList.remove('info-filter-homepage');
        document.documentElement.classList.remove('info-filter-youtube-home');

        // Restore scroll
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      }

      if (isVid) {
        // On video page: ensure nothing is hidden
        document.querySelectorAll('.info-filter-hidden').forEach(el => {
          el.classList.remove('info-filter-hidden');
        });
      } else if (!isHome) {
        // On non-homepage, non-video page (e.g. channel): apply search-level hiding only
        hideContent();
      }
    }
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
