/* Froggo - Vanilla JS Frogger-like on 11x11 grid (v2 layout) */
(() => {
  'use strict';

  // --- DOM ---
  const boardEl = document.getElementById('board');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const overlayEl = document.getElementById('overlay');
  const overlayTitleEl = document.getElementById('overlay-title');
  const overlaySubEl = document.getElementById('overlay-sub');
  const btnStart = document.getElementById('btn-start');
  const btnRestart = document.getElementById('btn-restart');
  const btnContinue = document.getElementById('btn-continue');
  const btnPause = document.getElementById('btn-pause');
  const bestEl = document.getElementById('best-score');
  const boardWrap = document.getElementById('board-wrap');
  const dpadButtons = document.querySelectorAll('.dpad__btn');

  // --- Constants ---
  const W = 11, H = 11;
  const TICK_MS = 150;
  const SWIPE_THRESHOLD = 28;
  const START_POS = { x: 5, y: 10 };
  const HOME_SLOTS_X = [1, 3, 5, 7, 9];
  const STATE = { TITLE:'title', PLAYING:'playing', LIFE_LOST:'life_lost', WIN:'win', GAME_OVER:'game_over', PAUSED:'paused' };

  // --- Viewport unit fallback ---
  function updateVhVar() {
    const supportsDvh = CSS.supports('height', '1dvh');
    if (!supportsDvh) document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  }
  updateVhVar();
  window.addEventListener('resize', updateVhVar);
  window.addEventListener('orientationchange', updateVhVar);

  // --- Board cells ---
  const cells = [];
  const idx = (x, y) => y * W + x;
  function ensureCells() {
    if (cells.length) return;
    const frag = document.createDocumentFragment();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = document.createElement('div');
        c.className = 'cell';
        c.setAttribute('role', 'gridcell');
        c.dataset.x = x; c.dataset.y = y;
        cells.push(c);
        frag.appendChild(c);
      }
    }
    boardEl.appendChild(frag);
  }
  ensureCells();

  // --- Lanes: top (y=0) to bottom (y=10)
  // Requested layout: home → 4× river → grass → 4× road → grass(start)
  function makeLanes(baseSpeedMod = 0) {
    return [
      { type: 'home' }, // y=0
      { type: 'river', dir:  1, speed: Math.max(1, 3 - baseSpeedMod), length: 3, spawn: [0, 5, 9] },  // y=1
      { type: 'river', dir: -1, speed: Math.max(1, 4 - baseSpeedMod), length: 2, spawn: [2, 7] },      // y=2
      { type: 'river', dir:  1, speed: Math.max(1, 3 - baseSpeedMod), length: 3, spawn: [1, 6, 10] },  // y=3
      { type: 'river', dir: -1, speed: Math.max(1, 3 - baseSpeedMod), length: 2, spawn: [4, 8] },      // y=4
      { type: 'grass' }, // y=5
      { type: 'road',  dir: -1, speed: Math.max(1, 2 - baseSpeedMod), length: 2, spawn: [0, 4, 8] },   // y=6
      { type: 'road',  dir:  1, speed: Math.max(1, 3 - baseSpeedMod), length: 3, spawn: [1, 6] },      // y=7
      { type: 'road',  dir: -1, speed: Math.max(1, 2 - baseSpeedMod), length: 1, spawn: [3, 7, 10] },  // y=8
      { type: 'road',  dir:  1, speed: Math.max(1, 2 - baseSpeedMod), length: 2, spawn: [2, 5, 9] },   // y=9
      { type: 'grass' }, // y=10 start
    ];
  }

  // --- Game state ---
  let lanes = makeLanes(0);
  for (let y = 0; y < H; y++) {
    const L = lanes[y]; L.ticks = 0; L.items = [];
    if (L.type === 'road' || L.type === 'river') for (const s of L.spawn) L.items.push({ x: s, length: L.length });
  }

  let frog = { ...START_POS };
  let lives = 3, level = 1, score = 0;
  let best = Number(localStorage.getItem('froggo-best') || 0);
  const homesFilled = HOME_SLOTS_X.map(() => false);
  let state = STATE.TITLE;
  let maxProgressY = START_POS.y;

  if (document.getElementById('best-score')) document.getElementById('best-score').textContent = best;

  // --- Helpers ---
  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
  const onSegment = (x, start, length) => ((x - start + W) % W) < length;
  const vibrate = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };

  function resetFrog() { frog.x = START_POS.x; frog.y = START_POS.y; maxProgressY = START_POS.y; }

  function setState(next) {
    state = next;
    if (!overlayEl) return;
    overlayEl.classList.add('hidden'); btnStart?.classList.add('hidden'); btnRestart?.classList.add('hidden'); btnContinue?.classList.add('hidden');
    if (next === STATE.TITLE) {
      overlayTitleEl.textContent = 'Froggo'; overlaySubEl.textContent = 'Press Enter or Tap Start'; btnStart?.classList.remove('hidden'); overlayEl.classList.remove('hidden');
    } else if (next === STATE.LIFE_LOST) {
      overlayTitleEl.textContent = 'Ouch!'; overlaySubEl.textContent = 'Life lost'; btnContinue?.classList.remove('hidden'); overlayEl.classList.remove('hidden'); vibrate(80);
    } else if (next === STATE.GAME_OVER) {
      overlayTitleEl.textContent = 'Game Over'; overlaySubEl.textContent = `Score: ${score}`; btnRestart?.classList.remove('hidden'); overlayEl.classList.remove('hidden');
      if (score > best) { best = score; localStorage.setItem('froggo-best', String(best)); document.getElementById('best-score').textContent = best; }
      vibrate([60,60,120]);
    } else if (next === STATE.WIN) {
      overlayTitleEl.textContent = 'Level Clear!'; overlaySubEl.textContent = `Level ${level} complete`; btnContinue?.classList.remove('hidden'); overlayEl.classList.remove('hidden'); vibrate([50,40,50]);
    } else if (next === STATE.PAUSED) {
      overlayTitleEl.textContent = 'Paused'; overlaySubEl.textContent = 'Press P or Tap Continue'; btnContinue?.classList.remove('hidden'); overlayEl.classList.remove('hidden');
    }
  }

  function startNewGame() {
    score = 0; lives = 3; level = 1;
    lanes = makeLanes(0);
    for (let y = 0; y < H; y++) {
      const L = lanes[y]; L.ticks = 0; L.items = [];
      if (L.type === 'road' || L.type === 'river') for (const s of L.spawn) L.items.push({ x: s, length: L.length });
    }
    for (let i = 0; i < homesFilled.length; i++) homesFilled[i] = false;
    resetFrog(); setState(STATE.PLAYING);
  }

  function nextLevel() {
    level++; score += 100;
    lanes = makeLanes(Math.min(level - 1, 2));
    for (let y = 0; y < H; y++) {
      const L = lanes[y]; L.ticks = 0; L.items = [];
      if (L.type === 'road' || L.type === 'river') for (const s of L.spawn) L.items.push({ x: s, length: L.length });
    }
    for (let i = 0; i < homesFilled.length; i++) homesFilled[i] = false;
    resetFrog(); setState(STATE.PLAYING);
  }

  // --- Tick ---
  function tick() {
    // move items
    for (let y = 0; y < H; y++) {
      const L = lanes[y];
      if (L.type !== 'road' && L.type !== 'river') continue;
      if (++L.ticks >= L.speed) {
        L.ticks = 0;
        for (const item of L.items) item.x = (item.x + L.dir + W) % W;
      }
    }

    // carry frog on log
    const laneF = lanes[frog.y];
    if (laneF && laneF.type === 'river') {
      let onLog = false;
      for (const log of laneF.items) if (onSegment(frog.x, log.x, log.length)) { onLog = true; break; }
      if (onLog) frog.x = (frog.x + laneF.dir + W) % W;
    }

    // collisions / drown
    if (laneF) {
      if (laneF.type === 'road') {
        for (const car of laneF.items) if (onSegment(frog.x, car.x, car.length)) return loseLife();
      } else if (laneF.type === 'river') {
        let onAny = false;
        for (const log of laneF.items) if (onSegment(frog.x, log.x, log.length)) { onAny = true; break; }
        if (!onAny) return loseLife();
      }
    }

    // home row
    if (frog.y === 0) {
      const i = HOME_SLOTS_X.indexOf(frog.x);
      if (i >= 0 && !homesFilled[i]) {
        homesFilled[i] = true; score += 50;
        if (homesFilled.every(Boolean)) setState(STATE.WIN); else resetFrog();
      } else { loseLife(); }
      return;
    }

    // progress score
    if (frog.y < maxProgressY) { score += 10; maxProgressY = frog.y; }
  }

  function loseLife() { lives--; setState(lives <= 0 ? STATE.GAME_OVER : STATE.LIFE_LOST); }

  // --- Render ---
  function render() {
    scoreEl.textContent = String(score); livesEl.textContent = String(lives); levelEl.textContent = String(level);

    const carMap = Array.from({ length: H }, () => new Array(W).fill(false));
    const logMap = Array.from({ length: H }, () => new Array(W).fill(false));

    for (let y = 0; y < H; y++) {
      const L = lanes[y];
      if (L.type === 'road') {
        for (const car of L.items) for (let k = 0; k < car.length; k++) carMap[y][(car.x + k) % W] = true;
      } else if (L.type === 'river') {
        for (const log of L.items) for (let k = 0; k < log.length; k++) logMap[y][(log.x + k) % W] = true;
      }
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const L = lanes[y]; const c = cells[idx(x, y)];
        let cls = 'cell ';
        if (L.type === 'home') {
          const filled = HOME_SLOTS_X.includes(x) && homesFilled[HOME_SLOTS_X.indexOf(x)];
          cls += 'home' + (filled ? ' home--filled' : '');
        } else {
          cls += (L.type || 'grass');
        }
        if (carMap[y][x]) cls += ' car';
        if (logMap[y][x]) cls += ' log';
        if (frog.x === x && frog.y === y && state === STATE.PLAYING) cls += ' frog';
        c.className = cls;
      }
    }
  }

  // --- Input: keyboard ---
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key)) e.preventDefault();
    if (state === STATE.TITLE && (k === 'enter' || k === ' ')) { startNewGame(); return; }
    if (k === 'p') { setState(state === STATE.PLAYING ? STATE.PAUSED : STATE.PLAYING); return; }
    if (state !== STATE.PLAYING) return;
    if (k === 'arrowup' || k === 'w') tryMove(0, -1);
    else if (k === 'arrowdown' || k === 's') tryMove(0, 1);
    else if (k === 'arrowleft' || k === 'a') tryMove(-1, 0);
    else if (k === 'arrowright' || k === 'd') tryMove(1, 0);
  }, { passive: false });

  // --- D-pad (repeat on hold) ---
  let repeatTimer = null;
  function handleDir(dir) { if (dir === 'up') tryMove(0,-1); else if (dir === 'down') tryMove(0,1); else if (dir === 'left') tryMove(-1,0); else if (dir === 'right') tryMove(1,0); }
  dpadButtons.forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const dir = btn.dataset.dir; handleDir(dir);
      btn.setPointerCapture(e.pointerId);
      clearInterval(repeatTimer); repeatTimer = setInterval(() => handleDir(dir), 170);
    }, { passive: false });
    const stop = () => { clearInterval(repeatTimer); };
    btn.addEventListener('pointerup', stop); btn.addEventListener('pointercancel', stop); btn.addEventListener('pointerleave', stop);
  });

  // --- Swipe ---
  let swipeActive = false, startX = 0, startY = 0, ptrId = null, moved = false;
  boardWrap.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    if (swipeActive) return;
    swipeActive = true; moved = false; ptrId = e.pointerId; startX = e.clientX; startY = e.clientY;
    e.preventDefault(); boardWrap.setPointerCapture(ptrId);
  }, { passive: false });
  boardWrap.addEventListener('pointermove', (e) => {
    if (!swipeActive || e.pointerId !== ptrId) return; e.preventDefault();
  }, { passive: false });
  boardWrap.addEventListener('pointerup', (e) => {
    if (!swipeActive || e.pointerId !== ptrId) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (!moved) {
      if (ax >= 28 && ay < 28) { handleDir(dx > 0 ? 'right' : 'left'); moved = True; }
      else if (ay >= 28 && ax < 28) { handleDir(dy > 0 ? 'down' : 'up'); moved = True; }
    }
    try { boardWrap.releasePointerCapture(ptrId); } catch {}
    swipeActive = false; ptrId = null; e.preventDefault();
  }, { passive: false });

  // --- Movement ---
  function tryMove(dx, dy) {
    if (state !== STATE.PLAYING) return;
    frog.x = clamp(frog.x + dx, 0, W - 1);
    frog.y = clamp(frog.y + dy, 0, H - 1);
  }

  // --- Loop ---
  let last = 0, acc = 0;
  function loop(ts) {
    if (!last) last = ts;
    acc += ts - last; last = ts;
    while (acc >= TICK_MS) { if (state === STATE.PLAYING) tick(); acc -= TICK_MS; }
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // --- Start on title ---
  setState(STATE.TITLE);
})();
