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
    hideAfterCaughtUp: true,      // everything below "You're all caught up"
    hideOpenAppButtons: true      // "Open app" / "Use the app" prompts
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
  var ROUTE = 'data-qg-route';

  // ---------------------------------------------------------------- styles

  var css = ['[' + HIDE + ']{display:none!important}',
             'html[' + ROUTE + '="blocked"] body{visibility:hidden!important}'];
  if (CONFIG.blockReelsTab) {
    css.push('a[href="/reels/"]{display:none!important}');
  }
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

  function hide(el) {
    if (el && !el.hasAttribute(HIDE)) el.setAttribute(HIDE, '');
  }

  function clearHidden() {
    var marked = document.querySelectorAll('[' + HIDE + ']');
    for (var i = 0; i < marked.length; i++) marked[i].removeAttribute(HIDE);
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

  function bounce(to) {
    bouncing = true;
    if (document.documentElement) document.documentElement.setAttribute(ROUTE, 'blocked');
    location.replace(to || '/');
  }

  function onRoute() {
    if (bouncing) return;
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
    clearHidden();
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
      hide(node);
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

    var articles = main.querySelectorAll('article');
    for (i = 0; i < articles.length; i++) {
      var article = articles[i];
      if (article.hasAttribute(HIDE)) continue;
      if (CONFIG.hideSponsored && findByText(article, T.sponsored).length) { hide(article); continue; }
      if (CONFIG.hideSuggestedPosts && findByText(article, T.suggested).length) { hide(article); continue; }
      if (CONFIG.hideUnfollowedPosts && hasFollowButton(article)) { hide(article); continue; }
    }

    if (CONFIG.hideSuggestedAccounts) {
      var labels = findByText(main, T.suggested);
      for (i = 0; i < labels.length; i++) {
        if (labels[i].closest('article')) continue;
        hide(feedItem(labels[i], main));
      }
    }

    if (CONFIG.hideAfterCaughtUp) {
      var marks = findByText(main, T.caughtUp);
      if (marks.length) {
        // Hide every row after the marker, including the "load more" trigger,
        // so Instagram stops fetching suggested posts in the background.
        var node = feedItem(marks[0], main);
        while (node && node !== main) {
          var next = node.nextElementSibling;
          while (next) { hide(next); next = next.nextElementSibling; }
          node = node.parentElement;
        }
      }
    }
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
    if (!node.querySelector('input')) hide(node);
  }

  function hideOpenAppButtons() {
    if (!CONFIG.hideOpenAppButtons) return;
    var hits = findByText(document.body, T.openApp);
    for (var i = 0; i < hits.length; i++) {
      hide(hits[i].closest('a, button, [role="button"]') || hits[i]);
    }
  }

  function scan() {
    if (bouncing || !document.body) return;
    injectStyle();
    var kind = document.documentElement.getAttribute(ROUTE);
    try { collapseNavLinks(); } catch (e) {}
    try { if (kind === 'home') scanFeed(); } catch (e) {}
    try { if (kind === 'explore') scanExplore(); } catch (e) {}
    try { hideOpenAppButtons(); } catch (e) {}
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; scan(); }, 150);
  }

  // ------------------------------------------------------------------ start

  function start() {
    if (!document.documentElement) return setTimeout(start, 10);
    injectStyle();
    onRoute();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.__quietgramTest = { classify: classify, scan: scan, onRoute: onRoute };
  start();
})();
