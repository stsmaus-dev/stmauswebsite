/*
  St Shenouda Coptic Orthodox Monastery, Putty NSW. "Through the Gate."
  wix/stsm-home.js: the <stsm-home> Custom Element that mounts the homepage inside a Wix page
  (design package, section 10). Builder 3.

  One build, two mounts. index.html loads the same page standalone; this element fetches the same
  assets/site.css and assets/fragment.html from the GitHub Pages origin, writes them into an open
  shadow root, swaps the <main> for a labelled region (the Wix document already has a main landmark),
  then imports assets/site.js and calls initStShenoudaHome(this.shadowRoot, ORIGIN). Fonts are loaded
  by the element into document.head, because font links inside a shadow root do not load reliably.

  Attributes read from the element (set in the Wix Editor or from Velo):
    data-base        the asset origin, with or without a trailing slash (default: ORIGIN below)
    data-top-offset  the height in px of a sticky Wix header above the page; written to --top-offset
    data-nav="off"   hides the page's own nav when the Wix header stays and carries "Plan your visit"
  Methods and events on the element:
    scrollToVisit()  scrolls the document to the call to action (#visit inside the shadow root)
    stsm-height      CustomEvent, bubbles, detail.height = the page's measured height in px, fired on
                     load and whenever the height changes (for a Velo handler that sets the container height)
    stsm-ready       CustomEvent, bubbles, fired once when the page has initialised

  Failure: if site.css, fragment.html or site.js cannot be fetched (or take longer than 20 s), the
  element renders one plain link to the standalone page at the same origin instead of a blank box.

  This file is written to run either as a classic script or as an ES module: no import or export
  statements, only a dynamic import(), and everything inside one function scope.
*/
(function () {
  'use strict';

  /* The asset origin: the GitHub Pages site of github.com/stsmaus-dev/stmauswebsite (set 17 October 2026).
     A data-base attribute on the element overrides this constant, so the Wix page can also point at a
     jsDelivr tag such as 'https://cdn.jsdelivr.net/gh/stsmaus-dev/stmauswebsite@v1.0.0/' without
     editing this file. */
  var ORIGIN = 'https://stsmaus-dev.github.io/stmauswebsite/';

  var TAG = 'stsm-home';
  var FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Cardo:ital@0;1&family=Atkinson+Hyperlegible:wght@400;700&family=Courier+Prime&display=swap';
  var FETCH_TIMEOUT_MS = 20000;
  var FONT_WAIT_MS = 3000;
  var REGION_LABEL = 'St Shenouda Monastery homepage';
  var FALLBACK_TEXT = 'Open the St Shenouda Monastery homepage';
  var FRAME_HEIGHT = 720;
  var FRAME_TITLE = 'St Shenouda Monastery homepage';
  var FRAME_LINES = [
    'The full page, with its scrolling video, appears on the published site.',
    'The Wix Editor and Preview show custom elements inside a frame, so this preview box stands in for it here.'
  ];

  /* The Wix Editor and Preview render a Custom Element inside an iframe; the live site does not.
     A page sized in vh grows with that frame, the Editor grows the frame to fit the page, and the
     loop saved a height of 1,084,964 px on 17 October 2026. Inside a frame the element therefore
     shows a fixed-height preview box instead. data-frame="full" overrides this. Reading window.top
     throws when the frame is cross-origin, which also means "inside a frame". */
  function inFrame() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  /* Inherited properties are the one thing a host page's CSS can push through a shadow boundary
     (letter-spacing, text-align, font-style and so on). The wrapper .stsm declares its own font,
     size, line-height and colour; this rule returns every other inheritable property to its initial
     value at the host, so Wix's body styles stop at the element's edge. :host rules have the lowest
     precedence inside the shadow tree, so nothing in site.css is overridden. */
  var HOST_RESET = [
    ':host{display:block;overflow-x:hidden;overflow-x:clip;letter-spacing:normal;word-spacing:normal;',
    'text-transform:none;text-indent:0;text-align:start;text-shadow:none;font-style:normal;font-weight:400;',
    'font-variant:normal;font-size:18px;line-height:1.6;white-space:normal;direction:ltr;visibility:visible;',
    'cursor:auto;color:#24261F}',
    ':host([hidden]){display:none}'
  ].join('');

  function withSlash(u) {
    u = (u === null || u === undefined) ? '' : String(u).trim();
    if (!u) return '';
    return u.charAt(u.length - 1) === '/' ? u : u + '/';
  }

  /* the preconnect pair and the Google Fonts link, once per document, guarded by ids */
  function ensureFonts() {
    var head = document.head || document.documentElement;
    function link(id, rel, href, cross) {
      var el = document.getElementById(id);
      if (el) return el;
      el = document.createElement('link');
      el.id = id;
      el.rel = rel;
      el.href = href;
      if (cross) el.crossOrigin = 'anonymous';
      head.appendChild(el);
      return el;
    }
    link('stsm-preconnect-a', 'preconnect', 'https://fonts.googleapis.com', false);
    link('stsm-preconnect-b', 'preconnect', 'https://fonts.gstatic.com', true);
    var fonts = link('stsm-fonts', 'stylesheet', FONTS_HREF, false);
    return new Promise(function (resolve) {
      if (fonts.sheet) { resolve(); return; }           // already loaded by an earlier instance
      var done = function () { resolve(); };
      fonts.addEventListener('load', done, { once: true });
      fonts.addEventListener('error', done, { once: true });
      setTimeout(done, FONT_WAIT_MS);                   // a slow font host never delays the page
    });
  }

  function fetchText(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, { signal: ctrl.signal }).then(function (res) {
      if (!res.ok) throw new Error(url + ' responded ' + res.status);
      return res.text();
    }).finally(function () { clearTimeout(timer); });
  }

  /* inside Wix the document already has a <main>; the page's becomes a labelled region with the same id,
     so site.js, the stylesheet (#main) and the skip link all keep working */
  function toRegion(root) {
    var main = root.querySelector('main');
    if (!main) return;
    var region = document.createElement('div');
    for (var i = 0; i < main.attributes.length; i++) {
      region.setAttribute(main.attributes[i].name, main.attributes[i].value);
    }
    region.id = 'main';
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', REGION_LABEL);
    if (!region.hasAttribute('tabindex')) region.setAttribute('tabindex', '-1');
    while (main.firstChild) region.appendChild(main.firstChild);
    main.parentNode.replaceChild(region, main);
    var skips = root.querySelectorAll('a.skip');
    for (var k = 0; k < skips.length; k++) skips[k].setAttribute('href', '#main');
  }

  class StsmHome extends HTMLElement {
    constructor() {
      super();
      this._state = 'idle';
      this._api = null;
      this._wrap = null;
      this._visitPending = false;
      if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    }
    static get observedAttributes() { return ['data-top-offset', 'data-nav']; }
    get origin() { return withSlash(this.getAttribute('data-base')) || ORIGIN; }
  }

  StsmHome.prototype.connectedCallback = function () {
    if (this._state !== 'idle') return;                 // a move in the DOM never mounts twice
    if (inFrame() && this.getAttribute('data-frame') !== 'full') { this._placeholder(); return; }
    this._state = 'loading';
    var self = this;
    this._mount().catch(function (err) { self._fail(err); });
  };

  /* Wix sizes a Custom Element from two variables on its wrapper, --custom-element-width and
     --custom-element-height, read by a rule like `.DURcgf > :first-child { width: var(...); min-height: var(...) }`
     and saved by the Editor, together with a position offset from Wix's 980 px page grid. Measured on the live
     page on 17 October 2026: a saved height of 1,084,964 px (the frame loop above) and a saved width of 1,509 px
     at left -34 px on a 1,440 px screen; on Wix's mobile layout, 280 px wide with 20 px margins all round. On the
     live site the element sizes its own wrapper: full width with no offset or margins, and exactly the page's
     real height, rewritten whenever that height changes. Outside Wix (the mount
     test, any other host) the wrapper carries neither marker and nothing is touched. */
  StsmHome.prototype._fitWixBox = function (h) {
    var box = this.parentElement;
    if (!box || box === document.body || !(h > 0)) return;
    var isWix = box.getAttribute('data-testid') === 'custom-element' ||
      getComputedStyle(box).getPropertyValue('--custom-element-height').trim() !== '';
    if (!isWix) return;
    this._fitH = h;
    var px = Math.ceil(h) + 'px';
    var s = box.style;
    var want = [
      ['--custom-element-height', px, ''], ['height', px, 'important'], ['min-height', '0px', 'important'],
      ['--custom-element-width', '100%', ''], ['width', '100%', 'important'],
      ['margin-left', '0px', 'important'], ['margin-right', '0px', 'important'], ['left', '0px', 'important'],
      ['margin-top', '0px', 'important'], ['margin-bottom', '0px', 'important'], ['top', '0px', 'important']
    ];
    for (var i = 0; i < want.length; i++) {             // write only what differs, so the observer below settles
      if (s.getPropertyValue(want[i][0]) !== want[i][1] || s.getPropertyPriority(want[i][0]) !== want[i][2]) {
        s.setProperty(want[i][0], want[i][1], want[i][2]);
      }
    }
    if (!this._fitObs && typeof MutationObserver !== 'undefined') {
      var self = this;                                   // if Wix rewrites the wrapper's style, put the fit back
      this._fitObs = new MutationObserver(function () { if (self._fitH) self._fitWixBox(self._fitH); });
      this._fitObs.observe(box, { attributes: true, attributeFilter: ['style'] });
    }
  };

  /* the fixed-height stand-in shown inside the Wix Editor and Preview frames */
  StsmHome.prototype._placeholder = function () {
    this._state = 'framed';
    var root = this.shadowRoot;
    while (root.firstChild) root.removeChild(root.firstChild);
    var box = document.createElement('div');
    box.className = 'stsm-framed';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', REGION_LABEL);
    box.style.cssText = 'box-sizing:border-box;height:' + FRAME_HEIGHT + 'px;display:flex;align-items:center;' +
      'justify-content:center;padding:32px;background:#DDDCD5 center/cover no-repeat url("' + this.origin +
      'assets/hero-end.jpg");';
    var card = document.createElement('div');
    card.style.cssText = 'max-width:560px;padding:28px 32px;border-radius:12px;background:rgba(236,232,223,.9);' +
      'color:#24261F;text-align:center;font:18px/1.6 Georgia,"Times New Roman",serif;';
    var h = document.createElement('p');
    h.style.cssText = 'margin:0 0 12px;font-size:28px;line-height:1.2;';
    h.textContent = FRAME_TITLE;
    card.appendChild(h);
    for (var i = 0; i < FRAME_LINES.length; i++) {
      var p = document.createElement('p');
      p.style.cssText = 'margin:' + (i ? '8px' : '0') + ' 0 0;font-size:16px;';
      p.textContent = FRAME_LINES[i];
      card.appendChild(p);
    }
    box.appendChild(card);
    root.appendChild(box);
  };

  StsmHome.prototype.attributeChangedCallback = function () {
    this._mirror();
  };

  /* data-top-offset and data-nav live on the wrapper for site.js and site.css; mirror them there */
  StsmHome.prototype._mirror = function () {
    var w = this._wrap;
    if (!w) return;
    var top = this.getAttribute('data-top-offset');
    var topValue = top === null ? '0' : top;             // a removed offset means 0, not the last value
    if (w.getAttribute('data-top-offset') !== topValue) w.setAttribute('data-top-offset', topValue);
    var nav = this.getAttribute('data-nav');
    if (nav === null) { if (w.hasAttribute('data-nav')) w.removeAttribute('data-nav'); }
    else if (w.getAttribute('data-nav') !== nav) w.setAttribute('data-nav', nav);
  };

  StsmHome.prototype.scrollToVisit = function () {
    if (this._api) this._api.scrollToVisit();
    else this._visitPending = true;                      // honoured as soon as the page is ready
  };

  StsmHome.prototype._mount = function () {
    var self = this;
    var origin = this.origin;
    var root = this.shadowRoot;
    var fontsReady = ensureFonts();
    var modulePromise = import(origin + 'assets/site.js');
    modulePromise.catch(function () { /* reported below, once the fetches have settled too */ });

    return Promise.all([
      fetchText(origin + 'assets/site.css'),
      fetchText(origin + 'assets/fragment.html')
    ]).then(function (texts) {
      while (root.firstChild) root.removeChild(root.firstChild);
      var reset = document.createElement('style');
      reset.textContent = HOST_RESET;
      var style = document.createElement('style');
      style.textContent = texts[0];
      var tpl = document.createElement('template');
      tpl.innerHTML = texts[1];
      /* the fragment's images carry relative srcs for the standalone page; point them at the origin while the
         template is still inert, or the browser requests them against the Wix page's URL (a 404 each) in the
         moment before site.js sets the same absolute URLs */
      var imgs = tpl.content.querySelectorAll('img[data-asset]');
      for (var n = 0; n < imgs.length; n++) imgs[n].setAttribute('src', origin + 'assets/' + imgs[n].getAttribute('data-asset'));
      root.appendChild(reset);
      root.appendChild(style);
      root.appendChild(tpl.content);
      toRegion(root);
      self._wrap = root.querySelector('.stsm');
      if (!self._wrap) throw new Error('fragment.html has no .stsm wrapper');
      self._mirror();

      /* site.js dispatches stsm-height on the wrapper (bubbles, composed); re-dispatch it from the element so
         the host page and Velo see exactly one event, targeted at the element, with the same detail */
      root.addEventListener('stsm-height', function (e) {
        e.stopPropagation();
        var h = e.detail && typeof e.detail.height === 'number' ? e.detail.height : Math.round(self._wrap.getBoundingClientRect().height);
        self._fitWixBox(h);                              // live Wix: the wrapper follows the page's real height
        self.dispatchEvent(new CustomEvent('stsm-height', { bubbles: true, composed: false, detail: { height: h } }));
      });

      return fontsReady;                                 // the Google Fonts CSS is in before the split runs
    }).then(function () {
      return modulePromise;
    }).then(function (mod) {
      if (!mod || typeof mod.initStShenoudaHome !== 'function') throw new Error('site.js exports no initStShenoudaHome');
      self._api = mod.initStShenoudaHome(root, origin);
      if (!self._api) throw new Error('initStShenoudaHome found no page to initialise');
      self._fitWixBox(Math.ceil(self._wrap.getBoundingClientRect().height));
      self._state = 'ready';
      if (self._visitPending) { self._visitPending = false; self._api.scrollToVisit(); }
      self.dispatchEvent(new CustomEvent('stsm-ready', { bubbles: true, composed: false }));
    });
  };

  /* any failure leaves a visible, plain link to the standalone page rather than an empty element */
  StsmHome.prototype._fail = function (err) {
    this._state = 'failed';
    this._api = null;
    this._wrap = null;
    var root = this.shadowRoot;
    while (root.firstChild) root.removeChild(root.firstChild);
    var box = document.createElement('div');
    box.className = 'stsm-fallback';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', REGION_LABEL);
    box.style.cssText = 'padding:32px 16px;background:#DDDCD5;color:#24261F;font:18px/1.6 Georgia,"Times New Roman",serif;text-align:center;';
    var p = document.createElement('p');
    p.style.margin = '0';
    var a = document.createElement('a');
    a.href = this.origin + 'index.html';
    a.textContent = FALLBACK_TEXT;
    a.style.color = '#6E5440';
    p.appendChild(a);
    box.appendChild(p);
    root.appendChild(box);
    if (typeof console !== 'undefined' && console.warn) console.warn('stsm-home: showing the fallback link. ' + (err && err.message ? err.message : err));
  };

  if (typeof customElements !== 'undefined' && !customElements.get(TAG)) {
    customElements.define(TAG, StsmHome);
  }
})();
