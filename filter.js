/*
 * Quietgram filter. Injected into instagram.com before each page loads.
 *
 * Everything you are likely to tune is in CONFIG and TEXT below.
 * Instagram changes its markup often, so the rules avoid class names and
 * rely on URLs, visible labels and page structure instead.
 */
(function () {
  'use strict';
  if (window.__quietgram) return;
  window.__quietgram = true;

  var CONFIG = {
    blockReelsTab: true,          // hide the Reels tab and refuse to open /reels/
    lockSingleReels: true,        // a reel opened from a DM or profile can't scroll on to other reels
    blockExploreGrid: true,       // Explore keeps its search box but loses the recommended grid
    hideSuggestedPosts: true,     // feed posts labelled "Suggested for you"
    hideUnfollowedPosts: true,    // feed posts that carry a Follow button (accounts you don't follow)
    hideSponsored: true,          // feed ads
    hideSuggestedAccounts: true,  // "Suggested for you" account carousels in the feed
    hideAfterCaughtUp: false,     // everything below "You're all caught up" (off: it also removes older posts from people you follow)
    endFeedWhenOnlyHidden: true,  // stop the feed once everything left in it is filtered out
    hideOpenAppButtons: true,     // "Open app" / "Use the app" prompts
    rememberSound: true,          // unmute (or mute) once and every later video follows, until the app is closed
    startUnmuted: false,          // true = videos play with sound from the moment the app opens
    debug: false,                 // show the current address and route in a small label
    diagnostics: true             // small "QG" button: copy a report for troubleshooting, or switch filters off to compare
  };

  // Labels are matched exactly (case-insensitive) against visible text.
  // Add the strings for whatever language your Instagram account uses.
  var TEXT = {
    suggested: ['Suggested for you', 'Suggested posts', 'Suggested', 'Suggestions for you',
                'Suggestions pour vous', 'Publications suggérées', 'Suggestions'],
    sponsored: ['Sponsored', 'Sponsorisé', 'Sponsorisée'],
    follow: ['Follow', 'Suivre'],
    caughtUp: ["You're all caught up", 'You are all caught up', 'Vous êtes à jour'],
    openApp: ['Open app', 'Open the app', 'Use the app', 'Use app', 'Open Instagram',
              "Ouvrir l'application", "Utiliser l'application"]
  };

  var HIDE = 'data-qg-hide';
  var filtersOff = false;
  try { filtersOff = localStorage.getItem('qg-off') === '1'; } catch (e) {}
  var ROUTE = 'data-qg-route';

  // ---------------------------------------------------------------- styles

  var css = ['[' + HIDE + ']{display:none!important}',
             '#qg-debug{position:fixed;top:0;left:0;z-index:2147483647;font:10px monospace;' +
             'background:#000;color:#0f0;padding:2px 4px;pointer-events:none;opacity:.8}',
             'html[' + ROUTE + '="blocked"] body{visibility:hidden!important}',
             'main[data-qg-end]{position:relative!important;overflow:hidden!important}',
             'main[data-qg-end]::after{content:"End of your feed \\2014  pull down to refresh";' +
             'position:absolute;left:0;right:0;bottom:0;height:110px;display:flex;align-items:center;' +
             'justify-content:center;font:14px -apple-system,sans-serif;color:#8e8e8e}'];
  if (CONFIG.blockReelsTab && !filtersOff) {
    css.push('a[href="/reels/"]{display:none!important}');
  }
  css.push('#qg-diag{position:fixed;left:8px;bottom:84px;z-index:2147483647;font:12px -apple-system,sans-serif}' +
           '#qg-diag>button{border:0;border-radius:14px;padding:6px 9px;background:rgba(0,0,0,.55);color:#fff;font:inherit}' +
           '#qg-diag .qg-menu{display:none;margin-bottom:6px;background:#222;border-radius:10px;padding:4px}' +
           '#qg-diag.open .qg-menu{display:block}' +
           '#qg-diag .qg-menu button{display:block;width:100%;text-align:left;border:0;background:none;color:#fff;' +
           'font:inherit;padding:9px 12px}');
  if (CONFIG.blockExploreGrid) {
    css.push('html[' + ROUTE + '="explore"] main a[href^="/p/"],' +
             'html[' + ROUTE + '="explore"] main a[href^="/reel/"],' +
             'html[' + ROUTE + '="explore"] main a[href^="/reels/"]{display:none!important}');
  }

  function injectStyle() {
    var root = document.head || document.documentElement;
    if (!root) return false;
    if (document.getElementById('qg-style')) return true;
    var style = document.createElement('style');
    style.id = 'qg-style';
    style.textContent = css.join('\n');
    root.appendChild(style);
    return true;
  }

  // --------------------------------------------------------------- helpers

  function norm(s) {
    return s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function normList(list) {
    return list.map(norm);
  }

  var T = {};
  Object.keys(TEXT).forEach(function (k) { T[k] = normList(TEXT[k]); });

  /** Elements whose own text is exactly one of the given labels. */
  function findByText(root, labels) {
    var out = [];
    if (!root) return out;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue;
      if (!value || value.length > 60) continue;
      if (labels.indexOf(norm(value)) !== -1 && node.parentElement) out.push(node.parentElement);
    }
    return out;
  }

  /** One walk over `root`, sorting exact label matches into groups: {name: [elements]}. */
  function collect(root, groups) {
    var out = {};
    var names = Object.keys(groups);
    var i;
    for (i = 0; i < names.length; i++) out[names[i]] = [];
    if (!root) return out;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue;
      if (!value || value.length > 60 || !node.parentElement) continue;
      var text = norm(value);
      if (!text) continue;
      for (i = 0; i < names.length; i++) {
        if (groups[names[i]].indexOf(text) !== -1) out[names[i]].push(node.parentElement);
      }
    }
    return out;
  }

  function hide(el, reason) {
    if (el && !el.hasAttribute(HIDE)) el.setAttribute(HIDE, reason || 'x');
  }

  /** Hide a feed row only if it holds no post we decided to keep. */
  function hideRow(el, reason) {
    if (!el) return;
    var posts = el.tagName === 'ARTICLE' ? [el] : el.querySelectorAll('article');
    for (var i = 0; i < posts.length; i++) {
      if (!posts[i].closest('[' + HIDE + ']')) return;
    }
    hide(el, reason);
  }

  function clearHidden() {
    var marked = document.querySelectorAll('[' + HIDE + ']');
    for (var i = 0; i < marked.length; i++) marked[i].removeAttribute(HIDE);
    var capped = document.querySelector('main[data-qg-end]');
    if (capped) {
      capped.removeAttribute('data-qg-end');
      capped.style.removeProperty('max-height');
    }
    lastShownBottom = 0;
  }

  function holdsArticle(el) {
    return el.tagName === 'ARTICLE' || !!el.querySelector('article');
  }

  /** The ancestor of `el` that sits alongside feed posts, i.e. one feed row. */
  function feedItem(el, main) {
    var node = el;
    while (node && node !== main && node.parentElement) {
      var siblings = node.parentElement.children;
      for (var i = 0; i < siblings.length; i++) {
        if (siblings[i] !== node && holdsArticle(siblings[i])) return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  // ---------------------------------------------------------------- routes

  function classify(path) {
    if (path === '/') return 'home';
    if (/^\/reels\/?$/.test(path)) return 'reels-tab';
    var m = path.match(/^\/(?:[^\/]+\/)?(reels?)\/([^\/]+)\/?$/);
    if (m) return m[1] === 'reel' ? 'reel' : 'reels-item';
    if (/^\/explore\/?$/.test(path)) return 'explore';
    if (path.indexOf('/direct/') === 0) return 'direct';
    return 'other';
  }

  function reelIdOf(path) {
    var m = path.match(/\/reels?\/([^\/]+)\/?$/);
    return m ? m[1] : null;
  }

  function isReelKind(kind) {
    return kind === 'reel' || kind === 'reels-item';
  }

  var lastPath = null;
  var reelId = null;
  var reelOrigin = '/';
  var bouncing = false;
  var routeChangedAt = Date.now();
  var checked = new WeakMap(); // article -> number of times inspected
  var lastShownBottom = 0;     // page position of the bottom of the lowest post we let through

  function bounce(to) {
    bouncing = true;
    if (document.documentElement) document.documentElement.setAttribute(ROUTE, 'blocked');
    location.replace(to || '/');
  }

  function onRoute() {
    if (bouncing || filtersOff) {
      if (filtersOff && document.documentElement) {
        document.documentElement.setAttribute(ROUTE, classify(location.pathname));
      }
      return;
    }
    var path = location.pathname;
    if (path === lastPath) return;

    var prev = lastPath;
    var prevKind = prev === null ? null : classify(prev);
    var kind = classify(path);
    lastPath = path;

    if (CONFIG.blockReelsTab && kind === 'reels-tab') return bounce('/');

    if (isReelKind(kind)) {
      var id = reelIdOf(path);
      if (isReelKind(prevKind)) {
        // Already watching a reel and the URL moved to a different one: that is the endless feed.
        if (CONFIG.lockSingleReels && id !== reelId) return bounce(reelOrigin);
      } else {
        // /reels/<id> is what the Reels tab produces. Only accept it from a DM or a direct load.
        if (CONFIG.blockReelsTab && kind === 'reels-item' && prevKind !== null && prevKind !== 'direct') {
          return bounce(prev);
        }
        reelId = id;
        reelOrigin = prev || '/';
      }
    }

    if (document.documentElement) document.documentElement.setAttribute(ROUTE, kind);
    routeChangedAt = Date.now();
    checked = new WeakMap();
    clearHidden();
    setTouchGuard(CONFIG.lockSingleReels && (isReelKind(kind) || kind === 'direct'));
    schedule();
  }

  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function () {
      var result = original.apply(this, arguments);
      try { onRoute(); } catch (e) {}
      return result;
    };
  });
  window.addEventListener('popstate', onRoute);
  setInterval(onRoute, 400); // safety net if Instagram navigates some other way

  // --------------------------------------------------------------- scanning

  function collapseNavLinks() {
    if (!CONFIG.blockReelsTab) return;
    var links = document.querySelectorAll('a[href="/reels/"]');
    for (var i = 0; i < links.length; i++) {
      // Hide the wrapper too, so the remaining tabs re-space themselves.
      var node = links[i];
      while (node.parentElement && node.parentElement !== document.body &&
             node.parentElement.children.length === 1) {
        node = node.parentElement;
      }
      hide(node, 'reels-tab');
    }
  }

  function hasFollowButton(article) {
    var buttons = article.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < buttons.length; i++) {
      var label = buttons[i].textContent;
      if (label && label.length < 30 && T.follow.indexOf(norm(label)) !== -1) return true;
    }
    return false;
  }

  function scanFeed() {
    var main = document.querySelector('main') || document.body;
    var i;

    // Posts fill in over a few moments, so look at each one a handful of times, then leave it alone.
    var articles = main.querySelectorAll('article');
    for (i = 0; i < articles.length; i++) {
      var article = articles[i];
      if (article.hasAttribute(HIDE)) continue;
      var seen = checked.get(article) || 0;
      if (seen >= 6) continue;
      checked.set(article, seen + 1);
      var found = collect(article, { sponsored: T.sponsored, suggested: T.suggested });
      if (CONFIG.hideSponsored && found.sponsored.length) { hide(article, 'ad'); continue; }
      if (CONFIG.hideSuggestedPosts && found.suggested.length) { hide(article, 'suggested-post'); continue; }
      if (CONFIG.hideUnfollowedPosts && hasFollowButton(article)) { hide(article, 'not-followed'); continue; }
    }

    var labels = collect(main, { suggested: T.suggested, caughtUp: T.caughtUp });

    if (CONFIG.hideSuggestedAccounts) {
      for (i = 0; i < labels.suggested.length; i++) {
        if (labels.suggested[i].closest('article')) continue;
        hideRow(feedItem(labels.suggested[i], main), 'suggested-accounts');
      }
    }

    if (CONFIG.hideAfterCaughtUp && labels.caughtUp.length) {
      // Hide every row after the marker, including the "load more" trigger,
      // so Instagram stops fetching suggested posts in the background.
      var node = feedItem(labels.caughtUp[0], main);
      while (node && node !== main) {
        var next = node.nextElementSibling;
        while (next) { hide(next, 'after-caught-up'); next = next.nextElementSibling; }
        node = node.parentElement;
      }
    }

    endFeed(main, articles);
  }

  /**
   * Instagram keeps a filtered-out post's space reserved and keeps loading more, so once only
   * filtered posts remain the feed turns into an endless blank page. Cut it off after the last
   * post that was shown.
   */
  function endFeed(main, articles) {
    if (!CONFIG.endFeedWhenOnlyHidden || main.tagName !== 'MAIN') return;
    var scrollTop = window.pageYOffset || 0;
    var trailing = 0;
    var counting = true;
    for (var i = articles.length - 1; i >= 0; i--) {
      if (articles[i].closest('[' + HIDE + ']')) {
        if (counting) trailing++;
      } else {
        counting = false;
        var bottom = articles[i].getBoundingClientRect().bottom + scrollTop;
        if (bottom > lastShownBottom) lastShownBottom = bottom;
      }
    }
    if (main.hasAttribute('data-qg-end') || trailing < 4) return;
    var mainTop = main.getBoundingClientRect().top + scrollTop;
    var height = Math.max(lastShownBottom - mainTop, 0) + 110;
    main.style.setProperty('max-height', Math.round(height) + 'px', 'important');
    main.setAttribute('data-qg-end', '');
  }

  function scanExplore() {
    if (!CONFIG.blockExploreGrid) return;
    var main = document.querySelector('main');
    if (!main) return;
    var tile = main.querySelector('a[href^="/p/"], a[href^="/reel/"], a[href^="/reels/"]');
    if (!tile) return;
    // Hide the whole grid block (and its loader) but never anything holding the search box.
    var node = tile;
    while (node.parentElement && node.parentElement !== main &&
           !node.parentElement.querySelector('input')) {
      node = node.parentElement;
    }
    if (!node.querySelector('input')) hide(node, 'explore-grid');
  }

  function hideOpenAppButtons() {
    if (!CONFIG.hideOpenAppButtons) return;
    if (Date.now() - routeChangedAt > 15000) return; // these prompts appear early; stop looking after that
    var hits = findByText(document.body, T.openApp);
    for (var i = 0; i < hits.length; i++) {
      hide(hits[i].closest('a, button, [role="button"]') || hits[i], 'open-app');
    }
  }

  // -------------------------------------------------------------- reel lock
  // A reel opened from a DM (or a profile) should be one video, not a doorway into the Reels feed.
  // Three independent guards: the address check in onRoute, hiding the next videos in the
  // viewer, and refusing vertical swipes on the video itself.

  function currentKind() {
    return document.documentElement ? document.documentElement.getAttribute(ROUTE) : null;
  }

  /** The large video on screen, if there is one. */
  function mainVideo() {
    var videos = document.querySelectorAll('video');
    var vh = window.innerHeight || 1;
    var best = null;
    var bestVisible = 0;
    for (var i = 0; i < videos.length; i++) {
      var r = videos[i].getBoundingClientRect();
      if (r.height < vh * 0.6) continue;
      var visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (visible > bestVisible) { bestVisible = visible; best = videos[i]; }
    }
    return best;
  }

  /** The largest wrapper around a video that is still about one screen tall: one reel. */
  function slideOf(video) {
    var vh = window.innerHeight || 1;
    var node = video;
    while (node.parentElement && node.parentElement !== document.body) {
      if (node.parentElement.getBoundingClientRect().height > vh * 1.15) break;
      node = node.parentElement;
    }
    return node;
  }

  function lockTarget() {
    if (!CONFIG.lockSingleReels) return null;
    var kind = currentKind();
    if (!isReelKind(kind) && kind !== 'direct') return null;
    var video = mainVideo();
    return video ? { video: video, slide: slideOf(video) } : null;
  }

  function hideNextReels() {
    var target = lockTarget();
    if (!target) return;
    var next = target.slide.nextElementSibling;
    while (next) {
      if (next.tagName === 'VIDEO' || next.querySelector('video')) hide(next, 'next-reel');
      next = next.nextElementSibling;
    }
  }

  /** True when the touch is inside something scrollable that isn't the reel list (e.g. comments). */
  function inOwnScroller(el, target) {
    var node = el;
    while (node && node !== target.slide && node !== document.body) {
      if (node.scrollHeight > node.clientHeight + 4 && !node.contains(target.video)) {
        var overflow = getComputedStyle(node).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  var touch = { block: false, x: 0, y: 0, swiped: false };

  function onTouchStart(e) {
    touch.block = false;
    touch.swiped = false;
    var target = lockTarget();
    if (!target || !e.touches || !e.touches.length) return;
    if (!target.slide.contains(e.target) || inOwnScroller(e.target, target)) return;
    touch.block = true;
    touch.x = e.touches[0].clientX;
    touch.y = e.touches[0].clientY;
  }

  function onTouchMove(e) {
    if (!touch.block || !e.touches || !e.touches.length) return;
    var dx = Math.abs(e.touches[0].clientX - touch.x);
    var dy = Math.abs(e.touches[0].clientY - touch.y);
    if (dy > dx && dy > 6) touch.swiped = true;
    if (touch.swiped) {
      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  function onTouchEnd(e) {
    if (touch.block && touch.swiped) {
      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
    }
    touch.block = false;
  }

  // Only listen while a reel could be open: these listeners make scrolling wait on script.
  var guardOn = false;
  function setTouchGuard(on) {
    if (on === guardOn) return;
    guardOn = on;
    var method = on ? 'addEventListener' : 'removeEventListener';
    var opts = { capture: true, passive: false };
    window[method]('touchstart', onTouchStart, opts);
    window[method]('touchmove', onTouchMove, opts);
    window[method]('touchend', onTouchEnd, opts);
  }

  // ------------------------------------------------------------------ sound
  // Instagram's mobile site mutes every video separately. Remember the last choice instead:
  // the first tap that changes sound sets it for every video until the app is closed.

  var soundPref = CONFIG.startUnmuted ? false : null; // null = follow Instagram until the first tap
  var nativeMuted = null;

  function setupSound() {
    if (!CONFIG.rememberSound || typeof HTMLMediaElement === 'undefined') return;
    var desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    if (!desc || !desc.set || !desc.get || !desc.configurable) return;
    nativeMuted = desc;
    var armedUntil = 0;

    function applyAll() {
      var videos = document.querySelectorAll('video');
      for (var i = 0; i < videos.length; i++) desc.set.call(videos[i], soundPref);
    }

    // A tap on or next to a video may be the sound button.
    window.addEventListener('click', function (e) {
      var node = e.target;
      for (var depth = 0; node && depth < 8; depth++) {
        if (node.tagName === 'VIDEO') { armedUntil = Date.now() + 600; return; }
        var inside = node.querySelectorAll ? node.querySelectorAll('video').length : 0;
        if (inside === 1) { armedUntil = Date.now() + 600; return; } // one post or one reel
        if (inside > 1) return;                                      // a whole feed: not a sound button
        node = node.parentElement;
      }
    }, true);

    Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
      configurable: true,
      enumerable: desc.enumerable,
      get: function () { return desc.get.call(this); },
      set: function (value) {
        value = !!value;
        if (this.tagName !== 'VIDEO') return desc.set.call(this, value);
        if (Date.now() < armedUntil) {
          // Instagram changed sound right after a tap: that is you pressing the button.
          armedUntil = 0;
          soundPref = soundPref === null ? value : !soundPref;
          applyAll();
          return;
        }
        desc.set.call(this, soundPref === null ? value : soundPref);
      }
    });

    // Videos that arrive already muted in their markup never pass through the setter.
    document.addEventListener('play', function (e) {
      var el = e.target;
      if (soundPref === null || !el || el.tagName !== 'VIDEO') return;
      if (desc.get.call(el) !== soundPref) desc.set.call(el, soundPref);
    }, true);
  }

  // ------------------------------------------------------------------ debug

  function updateDebug() {
    if (!CONFIG.debug || !document.body) return;
    var badge = document.getElementById('qg-debug');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'qg-debug';
      document.body.appendChild(badge);
    }
    var text = location.pathname + ' | ' + currentKind() + ' | lock:' + (lockTarget() ? 'yes' : 'no') +
               ' | sound:' + (soundPref === null ? 'ig' : soundPref ? 'muted' : 'on');
    if (badge.textContent !== text) badge.textContent = text;
  }

  // ------------------------------------------------------------ diagnostics
  // A "QG" button that copies a description of the page (structure, sizes, what was hidden and
  // why) so problems can be diagnosed without a Mac, and a switch to turn every filter off.

  function describe(el) {
    var d = el.tagName.toLowerCase();
    var role = el.getAttribute('role');
    if (role) d += '[' + role + ']';
    var href = el.getAttribute('href');
    if (href) d += '{' + href.slice(0, 30) + '}';
    var r = el.getBoundingClientRect();
    d += ' h' + Math.round(r.height) + ' y' + Math.round(r.top + (window.pageYOffset || 0));
    var cs = getComputedStyle(el);
    if (cs.position !== 'static') d += ' pos:' + cs.position;
    if (cs.transform && cs.transform !== 'none') d += ' tf';
    if (el.style.height || el.style.minHeight || el.style.paddingTop || el.style.paddingBottom) {
      d += ' inline:' + (el.getAttribute('style') || '').replace(/\s+/g, '').slice(0, 60);
    }
    var hidden = el.getAttribute(HIDE);
    if (hidden) d += ' HIDDEN:' + hidden;
    var own = '';
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) own += c.nodeValue;
    }
    own = own.replace(/\s+/g, ' ').trim();
    if (own) d += ' "' + own.slice(0, 24) + '"';
    return d;
  }

  function outline(root, maxLines) {
    var lines = [];
    (function walk(el, depth) {
      if (lines.length >= maxLines) return;
      if (el.id === 'qg-diag' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' ||
          el.tagName === 'svg' || el.tagName === 'SVG' || el.tagName === 'path') return;
      var kids = el.children;
      // Collapse long chains of single-child wrappers.
      var chain = 0;
      while (kids.length === 1 && !el.getAttribute(HIDE) && el.tagName !== 'ARTICLE' && chain < 20) {
        el = kids[0];
        kids = el.children;
        chain++;
      }
      lines.push(new Array(depth + 1).join(' ') + (chain ? '(' + chain + ')' : '') + describe(el));
      if (el.tagName === 'ARTICLE' || el.getAttribute(HIDE)) return; // don't expand posts
      for (var i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
    })(root, 0);
    return lines;
  }

  function report() {
    var main = document.querySelector('main');
    var counts = {};
    var marked = document.querySelectorAll('[' + HIDE + ']');
    for (var i = 0; i < marked.length; i++) {
      var k = marked[i].getAttribute(HIDE);
      counts[k] = (counts[k] || 0) + 1;
    }
    var se = document.scrollingElement || document.documentElement;
    var head = [
      'Quietgram report',
      'path ' + location.pathname + ' route ' + currentKind() + ' filters ' + (filtersOff ? 'OFF' : 'on'),
      'viewport ' + window.innerWidth + 'x' + window.innerHeight + ' scrollY ' + Math.round(window.pageYOffset || 0) +
        ' pageHeight ' + se.scrollHeight,
      'articles ' + document.querySelectorAll('article').length + ' hidden ' + JSON.stringify(counts),
      'main ' + (main ? 'h' + Math.round(main.getBoundingClientRect().height) +
        (main.hasAttribute('data-qg-end') ? ' END-CAPPED' : '') : 'missing'),
      '---'
    ];
    return head.concat(outline(main || document.body, 260)).join('\n');
  }

  function copyText(text) {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.qgCopy) {
        window.webkit.messageHandlers.qgCopy.postMessage(text);
        return true;
      }
    } catch (e) {}
    try { navigator.clipboard.writeText(text); return true; } catch (e) {}
    return false;
  }

  function setupDiagnostics() {
    if (!CONFIG.diagnostics || !document.body || document.getElementById('qg-diag')) return;
    var box = document.createElement('div');
    box.id = 'qg-diag';
    box.innerHTML = '<div class="qg-menu">' +
      '<button data-a="copy">Copy report</button>' +
      '<button data-a="off">' + (filtersOff ? 'Turn filters back on' : 'Turn filters off (test)') + '</button>' +
      '<button data-a="close">Close</button></div>' +
      '<button data-a="toggle">QG' + (filtersOff ? ' (off)' : '') + '</button>';
    box.addEventListener('click', function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      if (a === 'toggle') box.classList.toggle('open');
      if (a === 'close') box.classList.remove('open');
      if (a === 'copy') {
        e.target.textContent = copyText(report()) ? 'Copied. Paste it to Claude' : 'Copy failed';
      }
      if (a === 'off') {
        try { localStorage.setItem('qg-off', filtersOff ? '0' : '1'); } catch (err) {}
        location.reload();
      }
    }, true);
    document.body.appendChild(box);
  }

  function scan() {
    if (bouncing || !document.body) return;
    injectStyle();
    try { setupDiagnostics(); } catch (e) {}
    if (filtersOff) return;
    var kind = document.documentElement.getAttribute(ROUTE);
    try { collapseNavLinks(); } catch (e) {}
    try { if (kind === 'home') scanFeed(); } catch (e) {}
    try { if (kind === 'explore') scanExplore(); } catch (e) {}
    try { hideNextReels(); } catch (e) {}
    try { hideOpenAppButtons(); } catch (e) {}
    try { updateDebug(); } catch (e) {}
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; scan(); }, 350);
  }

  // ------------------------------------------------------------------ start

  function start() {
    if (!document.documentElement) return setTimeout(start, 10);
    injectStyle();
    if (!filtersOff) { try { setupSound(); } catch (e) {} }
    onRoute();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.__quietgramTest = { classify: classify, scan: scan, onRoute: onRoute,
                             sound: function () { return soundPref; }, report: report };
  start();
})();
