// content.js - Content script for DOM manipulation

(function() {
  'use strict';

  // Hide only children of page app containers — NOT the containers themselves
  // `#app { display:none }` would hide search.bilibili.com's #app too
  const NUCLEAR_HIDE_CSS = '#app > *, ytd-app > * { display: none !important; }';
  const COVER_CSS = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;background:white;';

  // EARLIEST POSSIBLE: Nuclear CSS hide — inject BEFORE browser renders anything
  // This is the only way to eliminate flash on SSR pages (bilibili/YouTube)
  // Must run at document_start, before ANY DOM manipulation
  // ONLY inject on homepage — search/video pages must not be affected
  const _hostname = window.location.hostname;
  const _path = window.location.pathname;
  const _isBilibiliHome = _hostname.includes('bilibili.com') && !_hostname.includes('search.') && (_path === '/' || _path === '/index.html');
  const _isYoutubeHome = _hostname.includes('youtube.com') && _path === '/';
  const _isZhihu = _hostname === 'www.zhihu.com';
  if (_isBilibiliHome || _isYoutubeHome) {
    const nuclearStyle = document.createElement('style');
    nuclearStyle.id = 'info-filter-nuclear-hide';
    nuclearStyle.textContent = NUCLEAR_HIDE_CSS;
    document.documentElement.appendChild(nuclearStyle);

    // Page-type classes must land at document_start too — adding them in init()
    // (DOMContentLoaded) lets the page paint once before CSS rules apply.
    document.documentElement.classList.add('info-filter-homepage');
    if (_isYoutubeHome) {
      document.documentElement.classList.add('info-filter-youtube-home');
    }

    const cover = document.createElement('div');
    cover.id = 'info-filter-cover';
    cover.style.cssText = COVER_CSS;
    document.documentElement.appendChild(cover);
  } else if (_hostname === 'search.bilibili.com') {
    // NOTE: Do NOT add info-filter-homepage here — its CSS rules (e.g.
    // .main-container { display:none }) would hide search results content.
    document.documentElement.classList.add('info-filter-search');
  } else if (_isZhihu) {
    // Zhihu page-class for CSS scoping of .HotSearchCard / [role="listbox"] rules.
    // Deliberately no nuclear hide / cover / overlay here — Zhihu scope is hot-search
    // + search-discover only, NOT homepage blocking (see CLAUDE.md).
    document.documentElement.classList.add('info-filter-zhihu');
  }

  let startTime = Date.now();
  let currentPlatform = null;
  let overlayShown = false;
  let currentDayKey = null;
  let currentVisitedIndex = null;
  let currentNavKey = navKey();
  let escapedThisPage = false;

  /**
   * Identity of the current page for navigation/tracking purposes (hash ignored —
   * bilibili and YouTube both fire replaceState for hash-only changes).
   */
  function navKey() {
    return window.location.origin + window.location.pathname + window.location.search;
  }

  /**
   * Detect current platform
   */
  function detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('bilibili.com')) return 'bilibili';
    if (hostname.includes('youtube.com')) return 'youtube';
    if (hostname.includes('zhihu.com')) return 'zhihu';
    return null;
  }

  /**
   * Check if on search results page
   */
  function isSearchPage() {
    if (currentPlatform === 'zhihu') return window.location.pathname.startsWith('/search');
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
    if (currentPlatform === 'zhihu') {
      // 答案页 / 专栏 / 视频 / 直播 — user-navigated content pages, hide nothing.
      return /^\/(p|video|column|livings|zhuanlan|zvideo)/.test(path)
        || /^\/question\/[^/]+\/answer/.test(path);
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
    // Zhihu homepage is intentionally NOT flagged as 'homepage' — we don't block
    // the Zhihu home (no goal overlay, no nuclear hide). It falls through to
    // hideContent() which hides hot-search + search-discover only.
    return false;
  }

  /**
   * Apply homepage blocking: nuclear hide + white cover + goal overlay.
   * Idempotent — also called when SPA navigation returns to the homepage,
   * where the content script does NOT re-run (YouTube routes fully client-side).
   */
  function applyHomepageBlock() {
    if (!document.getElementById('info-filter-nuclear-hide')) {
      const style = document.createElement('style');
      style.id = 'info-filter-nuclear-hide';
      style.textContent = NUCLEAR_HIDE_CSS;
      document.documentElement.appendChild(style);
    }

    document.documentElement.classList.add('info-filter-homepage');
    if (currentPlatform === 'youtube') {
      document.documentElement.classList.add('info-filter-youtube-home');
    }

    if (!document.getElementById('info-filter-cover')) {
      const cover = document.createElement('div');
      cover.id = 'info-filter-cover';
      cover.style.cssText = COVER_CSS;
      document.documentElement.appendChild(cover);
    }

    showOverlay();
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
    // Video pages hide nothing — the user navigated here to watch. Bailing out
    // here (rather than per-platform) also keeps a fresh load of /watch behaving
    // identically to arriving there via SPA navigation.
    if (isVideoPage()) return;
    // User pressed 本次跳过 on this page — respect it until they navigate away,
    // otherwise the MutationObserver re-hides everything immediately.
    if (escapedThisPage) return;

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
      } else {
        // On non-video, non-homepage pages (e.g. channel): hide sidebar
        document.querySelectorAll('.search-right, .recommend-list, .card-box, .recommend').forEach(el => {
          el.classList.add('info-filter-hidden');
        });
      }
    }

    if (currentPlatform === 'youtube') {
      // Hide homepage feed — relies on .info-filter-youtube-home CSS class
      // No JS hiding needed for feed; CSS handles it
      // Sidebar: hide recommendations (keep comments visible — user wants to see discussions)
      document.querySelectorAll('ytd-compact-video-renderer, ytd-compact-autoplay-renderer').forEach(el => {
        el.classList.add('info-filter-hidden');
      });
    }

    if (currentPlatform === 'zhihu') {
      // CSS handles the actual hiding; this branch exists so ensureEscapeButton()
      // can detect there is something to escape (it watches for .info-filter-hidden).
      // Hot-search card appears on home + search pages; search-suggestion popover
      // appears on any page when the search input is focused.
      document.querySelectorAll('.HotSearchCard, [role="listbox"]').forEach(el => {
        el.classList.add('info-filter-hidden');
      });
    }

    ensureEscapeButton();
  }

  /**
   * Which part of the site the user is on — recorded with each escape.
   */
  function pageSection() {
    if (isSearchPage()) return 'search';
    if (isVideoPage()) return 'video';
    if (isHomepage()) return 'homepage';
    return 'other';
  }

  /**
   * One floating escape button per page (not one per hidden block — bilibili
   * feeds contain dozens of cards). Only appears once something is actually
   * hidden, so the homepage never gets one: it is blocked by the goal overlay,
   * which is deliberately not escapable.
   */
  function ensureEscapeButton() {
    if (escapedThisPage) return;
    if (document.getElementById('info-filter-escape-btn')) return;
    if (!document.querySelector('.info-filter-hidden')) return;

    const btn = document.createElement('button');
    btn.id = 'info-filter-escape-btn';
    btn.className = 'info-filter-escape-btn';
    btn.textContent = '本次跳过';

    btn.addEventListener('click', async () => {
      escapedThisPage = true;
      document.querySelectorAll('.info-filter-hidden').forEach(el => {
        el.classList.remove('info-filter-hidden');
      });
      btn.remove();
      try {
        await InfoFilterStorage.addEscape(currentPlatform, pageSection());
      } catch (e) {
        // Content stays revealed either way — losing the stat is not worth
        // undoing what the user just asked for.
      }
    });

    document.body.appendChild(btn);
  }

  /**
   * Drop the escape button and its "skipped" state — skipping is per-page.
   */
  function resetEscapeState() {
    escapedThisPage = false;
    const btn = document.getElementById('info-filter-escape-btn');
    if (btn) btn.remove();
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
    // Routed through the background worker like every other mutation, so it
    // cannot interleave with a concurrent tab's write to the same day key.
    InfoFilterStorage.updateVisitedDuration(currentDayKey, currentVisitedIndex, duration)
      .catch(() => {});
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
    if (isHomepage()) {
      // Back on the homepage via SPA routing — re-block it. The content script
      // never re-runs here, so without this the feed is fully exposed.
      applyHomepageBlock();
      return;
    }

    // Leaving the homepage: tear down every blocking layer, including the
    // overlay (e.g. user pressed Back from the homepage to a video page).
    const nuclearHideEl = document.getElementById('info-filter-nuclear-hide');
    if (nuclearHideEl) nuclearHideEl.remove();
    const coverEl = document.getElementById('info-filter-cover');
    if (coverEl) coverEl.remove();
    document.documentElement.classList.remove('info-filter-homepage');
    document.documentElement.classList.remove('info-filter-youtube-home');
    removeOverlay();

    if (isVideoPage()) {
      document.querySelectorAll('.info-filter-hidden').forEach(el => {
        el.classList.remove('info-filter-hidden');
      });
    } else {
      hideContent();
    }
  }

  /**
   * Handle a completed SPA navigation: close out the previous page's duration,
   * restart the timer, re-apply hiding rules, and track the new page.
   */
  function onNavigated() {
    const nextKey = navKey();
    if (nextKey === currentNavKey) return;  // replaceState fires for same-page updates
    currentNavKey = nextKey;

    saveDuration();
    // Without these the next saveDuration() would overwrite the previous page's
    // record with a cumulative time that spans both pages.
    startTime = Date.now();
    currentDayKey = null;
    currentVisitedIndex = null;
    resetEscapeState();

    onUrlChange();

    // document.title lags behind the route change — record once it settles.
    setTimeout(() => {
      if (navKey() === nextKey) trackVisit();
    }, 1000);
  }

  /**
   * Save duration when navigating away from current page (SPA navigation)
   */
  function setupNavigationDurationSave() {
    // The browser tells us about SPA route changes via the background worker.
    // Patching history.pushState here would NOT work: content scripts run in an
    // isolated world, so the patch only covers our own copy — the page's calls
    // go straight to the native method and we never hear about them.
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === 'INFO_FILTER_URL_CHANGED') onNavigated();
    });

    // These are real DOM events and do reach the isolated world, so handling
    // them locally reacts a tick sooner. onNavigated() dedupes by URL.
    window.addEventListener('popstate', onNavigated);
    window.addEventListener('hashchange', onNavigated);
  }

  /**
   * Listen for overlay messages
   */
  window.addEventListener('message', (event) => {
    // Cheapest filter first — host pages fire postMessage constantly, and
    // logging every one of them floods the console with page data.
    if (!event.data || event.data.type !== 'INFO_FILTER_GOAL_SET') return;

    // Only from our own extension pages
    if (event.origin !== chrome.runtime.getURL('').replace(/\/$/, '')) return;

    // Remove nuclear hide so page content becomes visible
    const nuclearHideEl = document.getElementById('info-filter-nuclear-hide');
    if (nuclearHideEl) nuclearHideEl.remove();
    // Remove white cover
    const coverEl = document.getElementById('info-filter-cover');
    if (coverEl) coverEl.remove();
    removeOverlay();
    hideContent();
  });

  /**
   * Initialize
   */
  async function init() {
    currentPlatform = detectPlatform();
    console.log('[Content] Platform detected:', currentPlatform, 'isSearchPage:', isSearchPage());
    if (!currentPlatform) return;

    // Page-type classes, nuclear hide and cover were already applied
    // synchronously at document_start. applyHomepageBlock() is idempotent and
    // only adds the goal overlay at this point.
    if (isHomepage()) {
      applyHomepageBlock();
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
