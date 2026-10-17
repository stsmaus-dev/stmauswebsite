/*
  St Shenouda Coptic Orthodox Monastery, Putty NSW. "Through the Gate."
  assets/site.js. Builder 2: the JavaScript, written against review/build-contract.md, assets/fragment.html
  and assets/site.css. Plain ES module, no dependencies, no build step.

  Exports:
    initStShenoudaHome(root, baseURL)  root is the document (standalone) or a shadow root (the Wix element);
                                       baseURL is '' standalone or the GitHub Pages origin with a trailing slash.
    scrollToVisit()                    scrolls the last initialised page to #visit.

  Every query runs on root. Asset URLs are built from baseURL. Scroll and media queries use window.
  Observers use the viewport. Every scroll-driven DOM write is delta-gated. No loop free-runs: the hero lerp
  rests when converged and never runs with the hero off screen, the walk updates once per scroll frame, the
  hold and the cross fill tween only while they move, and el.style.transition is never written.
*/

const VIDEO_BYTES = 7247541;
const VIDEO_FILE = 'assets/hero-scrub.mp4';
const POSTER_FILE = 'assets/hero-poster.jpg';

/* the five static-hero gates, character for character the CSS media query list */
const GATES = [
  '(max-width: 720px)',
  '(orientation: portrait) and (max-width: 1024px)',
  '(orientation: portrait) and (pointer: coarse)',
  '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
  '(prefers-reduced-motion: reduce)'
];

const LERP_K = 0.10;          // smoothing per 60fps frame, slower than the 0.16 default on purpose
const CONVERGE = 0.0005;
const BAND_EPS = 0.008;       // band opacity and --k
const HOLD_EPS = 0.004;       // --hold
const LINE_EPS = 0.5;         // stroke-dashoffset, px
const LOAD_RAMP_MS = 1600;    // band 1's one-time assembly ramp
const LEAD = 0.66;            // the drawn tip of the Drive Line sits this far down the viewport
const HOLD_UP_MS = 3000;
const HOLD_DOWN_MS = 6000;
const CF_TWEEN_MS = 600;
const SEED = 20261016;

const CLOCK = ['2:00 pm', '2:15 pm', '2:30 pm', '2:45 pm', '3:00 pm', '3:15 pm', '3:30 pm', '3:45 pm', '4:00 pm'];
const INSTR_REST = 'Press and hold.';
const INSTR_HOLD = 'Keep still.';
const INSTR_DONE = 'Dinner is at four. Sunset prayers at five.';
const QUOTE = 'To hear God\'s voice, we need to stop speaking and pay attention.';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (p, e0, e1) => {
  const t = clamp((p - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/* cubic-bezier(x1, y1, x2, y2) as a function of x, Newton iterations from t = x */
function bezier(x1, y1, x2, y2) {
  const A = (a1, a2) => 1 - 3 * a2 + 3 * a1;
  const B = (a1, a2) => 3 * a2 - 6 * a1;
  const C = (a1) => 3 * a1;
  const at = (t, a1, a2) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const slope = (t, a1, a2) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const s = slope(t, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      t -= (at(t, x1, x2) - x) / s;
    }
    return clamp(at(clamp(t, 0, 1), y1, y2), 0, 1);
  };
}
const easeStill = bezier(0.22, 0.61, 0.36, 1);   // --ease-still

/* seeded generator so the split offsets are identical on every load */
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/* delta gate: true when v differs from the cached value by more than eps, or lands on 0 or 1 */
function gate(cache, key, v, eps) {
  const prev = cache[key];
  if (prev === v) return false;
  if (typeof prev === 'number' && prev >= 0 && Math.abs(v - prev) < eps && v !== 0 && v !== 1) return false;
  cache[key] = v;
  return true;
}

const inited = new WeakSet();
let current = null;

export function initStShenoudaHome(root, baseURL) {
  root = root || document;
  baseURL = baseURL || '';
  const wrap = root.querySelector('.stsm');
  if (!wrap) return null;
  if (inited.has(wrap)) return current;
  inited.add(wrap);
  current = createPage(root, baseURL, wrap);
  return current;
}

export function scrollToVisit() {
  if (current) current.scrollToVisit();
}

function createPage(root, baseURL, wrap) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const byId = (id) => (typeof root.getElementById === 'function'
    ? root.getElementById(id)
    : root.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(id) : id)));
  const mk = (tag, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };

  /* ---------- 0. first acts ---------- */

  wrap.classList.add('js');

  if (baseURL) {
    root.querySelectorAll('img[data-asset]').forEach((img) => {
      img.src = baseURL + 'assets/' + img.dataset.asset;
    });
  }

  let topOffset = 0;
  function applyTopOffset() {
    const raw = wrap.getAttribute('data-top-offset');
    const v = raw === null ? NaN : parseFloat(raw);
    topOffset = Number.isFinite(v) ? v : 0;
    if (raw !== null) wrap.style.setProperty('--top-offset', topOffset + 'px');
  }
  applyTopOffset();

  document.addEventListener('visibilitychange', () => {
    wrap.classList.toggle('paused', document.hidden);
    if (!document.hidden) updateNow();
  });

  /* ---------- elements ---------- */

  const nav = byId('nav');
  const hero = byId('hero');
  const stage = byId('stage');
  const poster = byId('poster');
  const video = byId('hero-video');
  const ring = byId('ring');
  const env = byId('env');
  const walk = byId('walk');
  const drivePath = byId('drive-path');
  const drivePathDark = byId('drive-path-dark');
  const clipRect = byId('still-clip-rect');
  const threshold = byId('threshold');
  const still = byId('still');
  const hold = byId('hold');
  const holdTarget = byId('hold-target');
  const holdClock = byId('hold-clock');
  const holdInstruction = byId('hold-instruction');
  const holdLive = byId('hold-live');
  const holdRevealed = byId('hold-revealed');
  const crossEnd = byId('cross-end');
  const visit = byId('visit');
  const visitTitle = byId('visit-title');
  const stDay = byId('st-day');
  const timetable = byId('timetable');
  const faq = byId('faq');
  const questions = byId('questions');
  const stations = Array.from(root.querySelectorAll('.station[data-anchor]'));
  const bands = Array.from(root.querySelectorAll('.band')).map((el, i) => ({
    el, n: i + 1,
    a: parseFloat(el.dataset.a), b: parseFloat(el.dataset.b),
    ramp: el.dataset.ramp ? parseFloat(el.dataset.ramp) : 0,
    op: -1, k: -1
  }));

  if (env) env.classList.add('alive');

  /* ---------- the hero: progress, lerp, seeks, captions, pin ---------- */

  let target = 0, shown = 0, rafId = null, lastTick = 0;
  let heroOnScreen = false;
  let loadK = 0, loadStart = null, loadStarted = false;
  let splitDone = false;
  const stageCache = { cue: -1, lift: -1 };
  let pinChecked = false, pinMode = false, pinY = -1, pinApplied = 0;

  function heroProgress() {
    if (!hero) return 0;
    const r = hero.getBoundingClientRect();
    const range = r.height - window.innerHeight;
    if (range <= 1) return r.top <= 0 ? 1 : 0;
    return clamp(-r.top / range, 0, 1);
  }

  let seekBusy = false, pendingTime = null;
  function requestSeek(t) {
    if (!video) return;
    const d = video.duration;
    if (!d || !Number.isFinite(d)) return;
    t = clamp(t, 0, Math.max(0, d - 0.02));   // never seek onto the exact end; the last frame starts earlier
    if (seekBusy) { pendingTime = t; return; }
    if (Math.abs(video.currentTime - t) < 0.0005) return;
    seekBusy = true;
    video.currentTime = t;
  }
  if (video) {
    video.addEventListener('seeked', () => {
      seekBusy = false;
      if (pendingTime !== null) {
        const t = pendingTime;
        pendingTime = null;
        requestSeek(t);                       // exactly one follow-up
      }
    });
    video.addEventListener('error', () => { // the deadlock escape, and the still-image fallback
      seekBusy = false;
      pendingTime = null;
      failVideo();
    });
  }

  function updateCaptions(p) {
    if (!stage) return;
    for (const bd of bands) {
      const f = Math.min(0.02, (bd.b - bd.a) / 3);
      const ein = bd.n === 1 ? 1 : smoothstep(p, bd.a, bd.a + f);
      const eout = bd.n === bands.length ? 1 : 1 - smoothstep(p, bd.b - f, bd.b);
      const op = ein * eout;
      const win = bd.ramp || Math.min(0.025, (bd.b - bd.a) * 0.35);
      let k = clamp((p - bd.a) / win, 0, 1);
      if (bd.n === 1) k = Math.max(k, loadK);
      if (gate(bd, 'op', op, BAND_EPS)) bd.el.style.opacity = op.toFixed(4);
      if (gate(bd, 'k', k, BAND_EPS)) bd.el.style.setProperty('--k', k.toFixed(4));
    }
    const cue = 1 - smoothstep(p, 0, 0.05);
    if (gate(stageCache, 'cue', cue, BAND_EPS)) stage.style.setProperty('--cue', cue.toFixed(4));
    const lift = smoothstep(p, 0.90, 1.00);
    if (gate(stageCache, 'lift', lift, BAND_EPS)) stage.style.setProperty('--lift', lift.toFixed(4));
  }

  /* the transform pin fallback: proven at runtime on the first scroll inside the hero */
  function updatePin() {
    if (!hero || !stage) return;
    const r = hero.getBoundingClientRect();
    const range = r.height - window.innerHeight;
    if (!pinChecked && range > 0) {
      const p = -r.top / range;
      const st = stage.getBoundingClientRect().top;
      if (p > 0.02 && p < 0.98) {
        pinChecked = true;
        if (Math.abs(st - topOffset) > 2) pinMode = true;
      } else if (p <= 0.02 && r.top >= topOffset && st - r.top > 2) {
        /* before the hero has scrolled the stage must sit at the hero's top; a shift here means a
           non-scrolling overflow ancestor (a Wix wrapper) is applying the sticky top as a constant offset */
        pinChecked = true;
        pinMode = true;
      }
    }
    if (pinMode) {
      const sr = stage.getBoundingClientRect();
      /* the stage's natural offset inside the hero without our translate: 0 when sticky is simply dead,
         the sticky top when an overflow ancestor turns it into a constant shift; measured, never assumed */
      const off = sr.top - pinApplied - r.top;
      const ty = clamp(topOffset - r.top, 0, Math.max(0, r.height - sr.height)) - off;
      if (Math.abs(ty - pinY) >= LINE_EPS) {
        pinY = ty;
        pinApplied = Math.round(ty * 10) / 10;
        stage.style.transform = 'translateY(' + pinApplied.toFixed(1) + 'px)';
      }
    }
  }

  function tick(now) {
    if (!heroOnScreen) { rafId = null; lastTick = 0; return; }
    const dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    if (loadStart !== null) {
      const u = Math.min(1, (now - loadStart) / LOAD_RAMP_MS);
      loadK = easeStill(u);
      if (u >= 1) { loadK = 1; loadStart = null; }
    }
    shown += (target - shown) * (1 - Math.pow(1 - LERP_K, dt / 16.667));
    let resting = false;
    if (Math.abs(target - shown) < CONVERGE) {
      shown = target;
      resting = loadStart === null;
    }
    if (resting) { rafId = null; lastTick = 0; }
    else rafId = requestAnimationFrame(tick);
    if (video) requestSeek(shown * video.duration);
    updateCaptions(shown);
  }

  function onScroll() {
    target = heroProgress();
    updatePin();
    if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
  }

  function startLoadRamp() {
    if (loadStarted) return;
    loadStarted = true;
    if (!heroOnScreen) { loadK = 1; updateCaptions(shown); return; }
    loadStart = performance.now();
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  /* ---------- the streamed Blob with the loading ring ---------- */

  let heroInited = false;
  function initHeroOnce() {
    if (heroInited || !stage || !video) return;
    heroInited = true;
    const posterURL = baseURL + POSTER_FILE;
    if (poster) poster.style.backgroundImage = 'url(\'' + posterURL + '\')';
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      loadHeroBlob().catch(failVideo);
    };
    const img = new Image();
    img.onload = start;
    img.onerror = start;
    img.src = posterURL;
    setTimeout(start, 4000);                 // a hung poster never blocks the video forever
  }

  async function loadHeroBlob() {
    const ctrl = new AbortController();
    let watchdog = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(baseURL + VIDEO_FILE, { priority: 'low', signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error('video fetch failed: ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0, lastRing = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ctrl.abort(), 20000);   // 20 s with no progress aborts the stream
      chunks.push(value);
      got += value.length;
      const frac = Math.min(1, got / total);
      const now = performance.now();
      if (now - lastRing > 100 || frac === 1) {
        lastRing = now;
        if (ring) ring.style.setProperty('--ld', Math.round(126 * (1 - frac)));
      }
    }
    clearTimeout(watchdog);
    if (ring) ring.style.setProperty('--ld', 0);
    video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    video.load();
    video.addEventListener('canplay', () => {
      requestSeek(heroProgress() * video.duration);   // land on the current scroll position
      stage.classList.add('video-ready');
    }, { once: true });
  }

  function makeChevron() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'chevron');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M6 9l6 6 6-6');
    svg.appendChild(path);
    return svg;
  }

  function failVideo() {
    if (ring && ring.isConnected) ring.replaceWith(makeChevron());
    if (stage) stage.classList.add('video-failed');
  }

  /* ---------- the gates, decided live ---------- */

  const MQLS = GATES.map((q) => window.matchMedia(q));
  let scrubOn = false;
  let pinned = false;

  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    initHeroOnce();
    window.addEventListener('scroll', onScroll, { passive: true });
    bands.forEach((b) => { b.op = -1; b.k = -1; });
    stageCache.cue = -1;
    stageCache.lift = -1;
    unpinFinalStates();
    target = heroProgress();
    shown = target;
    if (splitDone) startLoadRamp();
    updateCaptions(shown);
    if (video) requestSeek(shown * video.duration);
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return;
    scrubOn = false;
    window.removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
  }
  function applyHeroMode() {
    const gated = MQLS.some((m) => m.matches);
    if (gated) disableScrub();
    else enableScrub();
    if (!MQLS[4].matches && pinned) unpinFinalStates();
  }

  /* ---------- the walk: the Drive Line, threshold, stations, cross ---------- */

  const geo = { endY: 0, thrY: 0, holdY: 0, stations: [] };
  const walkCache = { thr: -1, cd: -1, cf: -1 };
  let lastDrawn = -1, holdLit = null, walkRaf = null;
  let cfTarget = 0, cfShown = 0, cfFrom = 0, cfStart = 0, cfRaf = null;

  /* a client rect includes the entrance translate of any .rise ancestor still arriving (16px before .in,
     less mid-transition); the line geometry wants the resting position, so subtract that translate */
  function riseShift(el) {
    let dy = 0;
    for (let p = el; p && p !== wrap; p = p.parentElement) {
      if (!p.classList || !p.classList.contains('rise')) continue;
      const t = getComputedStyle(p).transform;
      if (!t || t === 'none') continue;
      const m = /matrix\(([^)]+)\)/.exec(t);
      if (m) dy += parseFloat(m[1].split(',')[5]) || 0;
    }
    return dy;
  }
  const restTop = (el) => el.getBoundingClientRect().top - riseShift(el);

  function measureWalk() {
    if (!walk) return;
    const wr = walk.getBoundingClientRect();
    const grid = visit ? visit.querySelector('.split-grid') : null;
    if (grid && visitTitle) {
      const gr = grid.getBoundingClientRect();
      const ct = Math.round(restTop(visitTitle) + visitTitle.getBoundingClientRect().height - gr.top + 10);
      grid.style.setProperty('--cross-top', ct + 'px');
    }
    const endEl = crossEnd || walk;
    const endTop = crossEnd ? restTop(crossEnd) : endEl.getBoundingClientRect().bottom;
    geo.endY = Math.max(0, Math.round((endTop - wr.top) * 2) / 2);
    const d = 'M32 0V' + geo.endY;
    for (const p of [drivePath, drivePathDark]) {
      if (!p) continue;
      p.setAttribute('stroke-dasharray', String(geo.endY));
      p.setAttribute('d', d);
    }
    if (clipRect && still) {
      const sr = still.getBoundingClientRect();
      clipRect.setAttribute('y', (sr.top - wr.top).toFixed(1));
      clipRect.setAttribute('height', Math.max(0, sr.height).toFixed(1));
    }
    geo.stations = [];
    for (const g of stations) {
      const anchor = byId(g.dataset.anchor);
      if (!anchor) continue;
      const ar = anchor.getBoundingClientRect();
      const y = Math.round((restTop(anchor) + ar.height / 2 - wr.top) * 2) / 2;
      g.setAttribute('transform', 'translate(32,' + y + ')');
      const prev = geo.stations.find((s) => s.el === g);
      geo.stations.push({ el: g, y, lit: prev ? prev.lit : null });
    }
    if (hold) {
      const hr = hold.getBoundingClientRect();
      geo.holdY = restTop(hold) + hr.height / 2 - wr.top;
    }
    if (threshold) {
      const tr = threshold.getBoundingClientRect();
      geo.thrY = tr.top + tr.height / 2 - wr.top;
    }
    lastDrawn = -1;
  }

  function updateWalk(force) {
    if (pinned || !walk || !geo.endY) return;
    const wr = walk.getBoundingClientRect();
    const drawn = clamp(-wr.top + window.innerHeight * LEAD, 0, geo.endY);
    if (force || Math.abs(drawn - lastDrawn) >= LINE_EPS) {
      lastDrawn = drawn;
      const off = (geo.endY - drawn).toFixed(1);
      if (drivePath) drivePath.setAttribute('stroke-dashoffset', off);
      if (drivePathDark) drivePathDark.setAttribute('stroke-dashoffset', off);
    }
    for (const s of geo.stations) {
      const lit = drawn >= s.y;
      if (lit !== s.lit) { s.lit = lit; s.el.classList.toggle('lit', lit); }
    }
    if (hold) {
      const hl = drawn >= geo.holdY;
      if (hl !== holdLit) { holdLit = hl; hold.classList.toggle('lit', hl); }
    }
    if (threshold) {
      const tk = clamp((drawn - (geo.thrY - 30)) / 60, 0, 1);
      if (gate(walkCache, 'thr', tk, BAND_EPS)) threshold.style.setProperty('--k', tk.toFixed(3));
    }
    if (!crossEnd) return;
    const span = Math.max(1, window.innerHeight * 0.10);
    const cd = clamp((drawn - (geo.endY - span)) / span, 0, 1);
    if (gate(walkCache, 'cd', cd, BAND_EPS)) crossEnd.style.setProperty('--cd', cd.toFixed(3));
    const cft = drawn >= geo.endY - 0.5 ? 1 : 0;
    if (cft !== cfTarget) {
      cfTarget = cft;
      cfFrom = cfShown;
      cfStart = performance.now();
      if (cfRaf === null) cfRaf = requestAnimationFrame(cfTick);
    } else if (cfRaf === null && gate(walkCache, 'cf', cfShown, BAND_EPS)) {
      crossEnd.style.setProperty('--cf', cfShown.toFixed(3));
    }
  }

  function cfTick(now) {
    const u = clamp((now - cfStart) / CF_TWEEN_MS, 0, 1);
    cfShown = cfFrom + (cfTarget - cfFrom) * easeStill(u);
    if (crossEnd && gate(walkCache, 'cf', cfShown, BAND_EPS)) crossEnd.style.setProperty('--cf', cfShown.toFixed(3));
    cfRaf = u < 1 ? requestAnimationFrame(cfTick) : null;
  }

  let navSettled = null;
  function updateNavSettled() {
    if (pinned || !nav || !hero) return;
    const r = hero.getBoundingClientRect();
    const s = r.bottom <= window.innerHeight + 1;
    if (s !== navSettled) { navSettled = s; nav.classList.toggle('settled', s); }
  }

  /* the page scroll listener: one rAF per scroll burst for the walk, the nav hairline and the FAQ hairline */
  let nearAt = 0, nearLi = null, questionsAlive = false;
  const faqItems = faq ? Array.from(faq.children).filter((li) => li.tagName === 'LI') : [];
  function updateNear() {
    if (!faqItems.length) return;
    const mid = window.innerHeight / 2;
    let best = null, bd = Infinity;
    for (const li of faqItems) {
      const r = li.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bd) { bd = d; best = li; }
    }
    if (best !== nearLi) {
      if (nearLi) nearLi.classList.remove('near');
      nearLi = best;
      if (best) best.classList.add('near');
    }
  }
  function walkFrame(now) {
    walkRaf = null;
    updateWalk(false);
    updateNavSettled();
    if (questionsAlive && now - nearAt > 100) { nearAt = now; updateNear(); }
  }
  function onPageScroll() {
    if (walkRaf === null) walkRaf = requestAnimationFrame(walkFrame);
  }
  window.addEventListener('scroll', onPageScroll, { passive: true });

  /* ---------- entrances and living elements ---------- */

  const inIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || pinned) continue;
      const el = e.target;
      const r = el.getBoundingClientRect();           // a notification computed before a layout change
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue;   // (the reduced-motion flip) is ignored
      inIO.unobserve(el);
      el.classList.add('in');
      setTimeout(() => el.classList.add('done'), 2000);
    }
  }, { threshold: 0.01, rootMargin: '0px 0px -15% 0px' });
  const inTargets = Array.from(root.querySelectorAll('[data-in]'));
  inTargets.forEach((el) => inIO.observe(el));

  const stationsBySection = new Map();
  for (const g of stations) {
    const anchor = byId(g.dataset.anchor);
    const section = anchor ? anchor.closest('.section') : null;
    if (!section) continue;
    if (!stationsBySection.has(section.id)) stationsBySection.set(section.id, []);
    stationsBySection.get(section.id).push(g);
  }
  const aliveIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const el = e.target;
      el.classList.toggle('alive', e.isIntersecting);
      (stationsBySection.get(el.id) || []).forEach((g) => g.classList.toggle('alive', e.isIntersecting));
      if (el === questions) {
        questionsAlive = e.isIntersecting;
        if (questionsAlive) updateNear();
        else if (nearLi) { nearLi.classList.remove('near'); nearLi = null; }   // no hairline breathes off screen
      }
    }
  }, { threshold: 0 });
  ['welcome', 'requests', 'day', 'questions', 'still', 'words', 'visit'].forEach((id) => {
    const el = byId(id);
    if (el) aliveIO.observe(el);
  });

  const heroIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const was = heroOnScreen;
      heroOnScreen = e.isIntersecting;
      if (stage) stage.classList.toggle('alive', e.isIntersecting);
      if (e.isIntersecting && scrubOn) {
        if (!was && rafId === null) { target = heroProgress(); shown = target; }
        onScroll();
      }
    }
  }, { threshold: 0 });
  if (hero) heroIO.observe(hero);

  /* ---------- the timetable and the Now marker ---------- */

  const rows = timetable ? Array.from(timetable.querySelectorAll('li[data-start][data-end]')) : [];
  let nowRow = null, breathOn = null;
  let fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney', hour: 'numeric', minute: 'numeric', weekday: 'short', hour12: false
    });
  } catch (e) { fmt = null; }

  function sydneyNow() {
    if (!fmt) return null;
    let h = 0, m = 0, day = -1;
    for (const p of fmt.formatToParts(new Date())) {
      if (p.type === 'hour') h = parseInt(p.value, 10) % 24;
      else if (p.type === 'minute') m = parseInt(p.value, 10);
      else if (p.type === 'weekday') day = DAYS.indexOf(p.value.slice(0, 3));
    }
    return { min: h * 60 + m, day };
  }
  const stationForRow = (li) => {
    const a = li.querySelector('.row-anchor');
    return a ? byId('ts-' + a.id.replace(/^row-/, '')) : null;
  };
  function updateNow() {
    let t = null;
    try { t = sydneyNow(); } catch (e) { t = null; }
    let best = null;
    if (t && t.min >= 240 && t.min < 1140) {
      for (const li of rows) {
        const a = parseInt(li.dataset.start, 10), b = parseInt(li.dataset.end, 10);
        if (!(t.min >= a && t.min < b)) continue;
        const days = li.dataset.days;
        if (days) {
          if (!days.split(/[\s,]+/).map(Number).includes(t.day)) continue;
          if (!best || !best.dataset.days) best = li;    // the Saturday Vespers row wins its hour
        } else if (!best) {
          best = li;
        }
      }
    }
    const breath = !best;
    if (stDay && breath !== breathOn) { breathOn = breath; stDay.classList.toggle('breath', breath); }
    if (best === nowRow) return;
    if (nowRow) {
      nowRow.classList.remove('is-now');
      const g = stationForRow(nowRow);
      if (g) g.classList.remove('is-now');
    }
    nowRow = best;
    if (best) {
      best.classList.add('is-now');
      const g = stationForRow(best);
      if (g) g.classList.add('is-now');
    }
  }
  updateNow();
  setInterval(updateNow, 60000);

  /* ---------- the hold: the one interactive moment ---------- */

  let holdT = 0, holdV = 0, holdPressed = false, holdDone = false, holdRaf = null, holdLast = 0;
  const holdCache = { v: -1 };
  let clockIdx = -1, clockAt = 0, instr = '';

  function writeHold(v) {
    if (gate(holdCache, 'v', v, HOLD_EPS)) wrap.style.setProperty('--hold', v.toFixed(4));
  }
  function setInstruction(s) {
    if (s === instr || !holdInstruction) return;
    instr = s;
    holdInstruction.textContent = s;
  }
  function updateClock(now, force) {
    if (!holdClock) return;
    const idx = Math.min(8, Math.floor(holdV * 8));
    if (!force && now - clockAt < 100) return;
    if (idx === clockIdx) return;
    clockIdx = idx;
    clockAt = now;
    holdClock.textContent = CLOCK[idx];
  }
  function holdTick(now) {
    const dt = Math.min(100, now - (holdLast || now));
    holdLast = now;
    if (holdPressed) holdT = Math.min(1, holdT + dt / HOLD_UP_MS);
    else holdT = Math.max(0, holdT - dt / HOLD_DOWN_MS);
    holdV = easeStill(holdT);
    writeHold(holdV);
    if (holdT >= 1) {
      holdRaf = null; holdLast = 0;
      completeHold();
      return;
    }
    if (!holdPressed && holdT <= 0) {
      holdRaf = null; holdLast = 0;
      holdV = 0;
      writeHold(0);
      updateClock(now, true);
      return;
    }
    updateClock(now, false);
    holdRaf = requestAnimationFrame(holdTick);
  }
  function completeHold() {
    holdDone = true;
    holdPressed = false;
    holdV = 1;
    writeHold(1);
    updateClock(performance.now(), true);
    setInstruction(INSTR_DONE);
    if (holdTarget) holdTarget.setAttribute('aria-pressed', 'true');
    if (holdRevealed) {
      holdRevealed.classList.add('in');
      setTimeout(() => holdRevealed.classList.add('done'), 3000);
    }
    if (holdLive && holdLive.textContent !== QUOTE) holdLive.textContent = QUOTE;
  }
  function press() {
    if (holdDone || holdPressed) return;
    holdPressed = true;
    if (holdTarget) holdTarget.setAttribute('aria-pressed', 'true');
    setInstruction(INSTR_HOLD);
    if (holdRaf === null) { holdLast = 0; holdRaf = requestAnimationFrame(holdTick); }
  }
  function release() {
    if (!holdPressed) return;
    holdPressed = false;
    if (holdDone) return;
    if (holdTarget) holdTarget.setAttribute('aria-pressed', 'false');
    setInstruction(INSTR_REST);
    if (holdRaf === null && holdT > 0) { holdLast = 0; holdRaf = requestAnimationFrame(holdTick); }
  }
  function resetHold() {
    if (holdRaf !== null) { cancelAnimationFrame(holdRaf); holdRaf = null; holdLast = 0; }
    holdT = 0; holdV = 0; holdPressed = false;
    writeHold(0);
    clockIdx = -1;
    updateClock(performance.now(), true);
    setInstruction(INSTR_REST);
    if (holdTarget) holdTarget.setAttribute('aria-pressed', 'false');
    if (holdRevealed) holdRevealed.classList.remove('in', 'done');
  }
  if (holdTarget) {
    const isKey = (e) => e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter';
    holdTarget.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { holdTarget.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
      press();
    });
    holdTarget.addEventListener('pointerup', release);
    holdTarget.addEventListener('pointercancel', release);
    holdTarget.addEventListener('lostpointercapture', release);
    holdTarget.addEventListener('contextmenu', (e) => e.preventDefault());
    holdTarget.addEventListener('keydown', (e) => {
      if (!isKey(e)) return;
      e.preventDefault();
      if (e.repeat) return;
      press();
    });
    holdTarget.addEventListener('keyup', (e) => {
      if (!isKey(e)) return;
      e.preventDefault();
      release();
    });
    holdTarget.addEventListener('blur', release);
    setInstruction(INSTR_REST);
  }

  /* ---------- reduced motion: pin and unpin ---------- */

  let pinnedIn = [];
  function pinToFinalStates() {
    if (pinned) return;
    pinned = true;
    applyHeroMode();
    if (drivePath) drivePath.setAttribute('stroke-dashoffset', '0');
    if (drivePathDark) drivePathDark.setAttribute('stroke-dashoffset', '0');
    stations.forEach((g) => g.classList.add('lit'));
    if (hold) hold.classList.add('lit');
    if (crossEnd) { crossEnd.style.setProperty('--cd', '1'); crossEnd.style.setProperty('--cf', '1'); }
    if (threshold) threshold.style.setProperty('--k', '1');
    pinnedIn = inTargets.filter((el) => !el.classList.contains('in'));
    pinnedIn.forEach((el) => el.classList.add('in', 'done'));
    if (!holdDone) {
      if (holdRaf !== null) { cancelAnimationFrame(holdRaf); holdRaf = null; holdLast = 0; }
      holdPressed = false;
      holdT = 1; holdV = 1;
      writeHold(1);
      updateClock(performance.now(), true);
      setInstruction(INSTR_DONE);
      if (holdTarget) holdTarget.setAttribute('aria-pressed', 'true');
      if (holdRevealed) holdRevealed.classList.add('in', 'done');
    }
    if (nav) { nav.classList.add('settled'); navSettled = true; }
  }
  function unpinFinalStates() {
    if (!pinned) return;
    pinned = false;
    stations.forEach((g) => g.classList.remove('lit'));
    geo.stations.forEach((s) => { s.lit = null; });
    if (hold) hold.classList.remove('lit');
    holdLit = null;
    if (crossEnd) { crossEnd.style.removeProperty('--cd'); crossEnd.style.removeProperty('--cf'); }
    walkCache.cd = -1; walkCache.cf = -1; walkCache.thr = -1;
    cfShown = 0; cfTarget = 0;
    if (cfRaf !== null) { cancelAnimationFrame(cfRaf); cfRaf = null; }
    if (threshold) threshold.style.removeProperty('--k');
    pinnedIn.forEach((el) => { el.classList.remove('in', 'done'); inIO.unobserve(el); inIO.observe(el); });
    pinnedIn = [];
    if (!holdDone) resetHold();
    if (nav) { nav.classList.remove('settled'); navSettled = null; }
    lastDrawn = -1;
    updateWalk(true);
    updateNavSettled();
  }

  MQLS.forEach((m) => m.addEventListener('change', applyHeroMode));
  MQLS[4].addEventListener('change', (e) => {
    if (e.matches) pinToFinalStates();
    else applyHeroMode();
  });

  /* ---------- in-root anchors ---------- */

  function focusEl(t) {
    if (!t.hasAttribute('tabindex')) {
      t.setAttribute('tabindex', '-1');
      t.addEventListener('blur', () => t.removeAttribute('tabindex'), { once: true });
    }
    try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
  }
  function scrollToEl(t, smooth) {
    const y = restTop(t) + window.scrollY - topOffset;   // the resting position, not the entrance's offset
    const reduced = MQLS[4].matches;
    window.scrollTo({ top: Math.max(0, Math.round(y)), left: 0, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    focusEl(t);
  }
  wrap.addEventListener('click', (e) => {
    const start = e.target instanceof Element ? e.target : null;
    const a = start ? start.closest('a[href^="#"]') : null;
    if (!a || !wrap.contains(a)) return;
    const id = (a.getAttribute('href') || '').slice(1);
    if (!id) return;
    const t = byId(id);
    if (!t) return;
    e.preventDefault();
    scrollToEl(t, true);
  });
  function handleHash() {
    const h = (window.location.hash || '').slice(1);
    if (!h) return;
    let id = h;
    try { id = decodeURIComponent(h); } catch (e) { id = h; }
    const t = byId(id);
    if (t) scrollToEl(t, false);
  }

  /* ---------- measure, height event, resize ---------- */

  let lastHeight = -1;
  function emitHeight() {
    const h = Math.round(wrap.getBoundingClientRect().height);
    if (h === lastHeight) return;
    lastHeight = h;
    wrap.dispatchEvent(new CustomEvent('stsm-height', { bubbles: true, composed: true, detail: { height: h } }));
  }
  let measureRaf = null;
  function measureAll() {
    measureWalk();
    updateWalk(true);
    updateNavSettled();
    emitHeight();
    if (scrubOn) onScroll();
    if (questionsAlive) updateNear();
  }
  function scheduleMeasure() {
    if (measureRaf === null) measureRaf = requestAnimationFrame(() => { measureRaf = null; measureAll(); });
  }
  const ro = new ResizeObserver(scheduleMeasure);
  ro.observe(wrap);
  window.addEventListener('resize', scheduleMeasure);
  if (document.fonts && typeof document.fonts.addEventListener === 'function') {
    document.fonts.addEventListener('loadingdone', scheduleMeasure);   // a late web font reflows the walk
  }
  new MutationObserver(() => { applyTopOffset(); scheduleMeasure(); })
    .observe(wrap, { attributes: true, attributeFilter: ['data-top-offset'] });

  /* ---------- the split, once, after the fonts ---------- */

  const rnd = rng(SEED);
  function splitElement(el) {
    const entrance = el.dataset.entrance || '';
    /* the words, in order; a <br> in the source marks a designed line break after the word before it (the
       screen-reader copy and the soft copy carry the plain sentence, the visual copy keeps the break) */
    const words = [];
    const breaks = new Set();
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 1 && node.tagName === 'BR') { if (words.length) breaks.add(words.length - 1); continue; }
      const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) words.push(...t.split(' '));
    }
    const text = words.join(' ');
    const total = words.length;
    const band = el.closest('.band');
    const spreadRaw = (band && band.dataset.spread) || el.dataset.spread;
    const spread = spreadRaw ? parseFloat(spreadRaw) : 0.5;
    const leadRaw = (band && band.dataset.lead) || el.dataset.lead;
    const lead = leadRaw ? Math.max(0, parseInt(leadRaw, 10) || 0) : 0;
    el.textContent = '';
    const sr = mk('span', 'sr');
    sr.textContent = text;
    const vis = mk('span', 'vis');
    vis.setAttribute('aria-hidden', 'true');
    words.forEach((word, i) => {
      const w = mk('span', 'w');
      for (const ch of word) {
        const c = mk('span', 'c');
        c.textContent = ch;
        w.appendChild(c);
      }
      let th = 0, jx = 0, jy = 0, jr = 0;
      if (entrance === 'halves') jx = i === 0 ? 14 : -14;
      else if (entrance === 'stagger' && lead > 0) {
        /* the leading words are settled from the band's first frame (negative thresholds); the trailing words
           start at --k .47 and spread over data-spread of --k, so they rise one after another as the trees pass */
        th = i < lead ? -0.4 + i * 0.1 : 0.47 + ((i - lead) / Math.max(1, total - lead - 1)) * spread + rnd() * 0.02;
      }
      else if (entrance === 'stagger') th = (i / total) * spread + rnd() * 0.06;
      else if (entrance === 'settle') th = (i / total) * 0.4 + rnd() * 0.04;
      else if (entrance === 'words') w.style.setProperty('--i', String(i));
      w.style.setProperty('--th', th.toFixed(3));
      w.style.setProperty('--jx', jx + 'px');
      w.style.setProperty('--jy', jy + 'px');
      w.style.setProperty('--jr', jr + 'deg');
      vis.appendChild(w);
      if (i < total - 1) vis.appendChild(breaks.has(i) ? document.createElement('br') : document.createTextNode(' '));
    });
    el.appendChild(sr);
    el.appendChild(vis);
    if (entrance === 'mist' || entrance === 'approach') {
      const soft = mk('span', 'soft');
      soft.setAttribute('aria-hidden', 'true');
      soft.textContent = text;
      el.appendChild(soft);
    }
    el.classList.add('is-split');
  }
  function splitAll() {
    root.querySelectorAll('[data-split]').forEach((el) => {
      if (el.classList.contains('is-split')) return;
      try { splitElement(el); } catch (e) { el.classList.add('is-split'); }
    });
    splitDone = true;
    if (scrubOn) startLoadRamp();
  }
  const fontsReady = Promise.race([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((r) => setTimeout(r, 2500))
  ]);

  /* ---------- go ---------- */

  applyHeroMode();
  if (MQLS[4].matches) pinToFinalStates();
  scheduleMeasure();

  fontsReady.then(() => {
    splitAll();
    measureAll();
    handleHash();
  });

  const api = {
    scrollToVisit() {
      const t = byId('visit');
      if (t) scrollToEl(t, true);
    },
    getState() {
      return {
        scrubOn, pinned, pinMode, heroOnScreen, splitDone,
        target, shown, loadK,
        videoReady: !!stage && stage.classList.contains('video-ready'),
        videoFailed: !!stage && stage.classList.contains('video-failed'),
        videoTime: video ? video.currentTime : 0, videoDuration: video ? video.duration : 0,
        endY: geo.endY, drawn: lastDrawn,
        hold: holdV, holdDone,
        nowRow: nowRow ? nowRow.querySelector('.row-anchor').id : null,
        bands: bands.map((b) => ({ n: b.n, op: b.op, k: b.k }))
      };
    }
  };
  wrap.stsmState = api.getState;   // a read-only probe for the review tools, not a DOM write
  return api;
}
