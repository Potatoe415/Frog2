/* game.js - v0.7.2 Mobile-friendly Start overlay + smooth lanes + instant visual log lock */
(() => {
  const W = 11, H = 11;
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
  const boardWrap = document.getElementById('board-wrap');
  const dpadButtons = document.querySelectorAll('.dpad__btn');
  const bestEl = document.getElementById('best-score');

  const VERSION = 'v0.7.2';
  const TICK_MS = 150;
  const START_POS = { x: 5, y: 10 };
  const HOME_SLOTS_X = [1, 3, 5, 7, 9];
  const STATE = { TITLE:'title', PLAYING:'playing', LIFE_LOST:'life_lost', WIN:'win', GAME_OVER:'game_over', PAUSED:'paused' };

  const cells = [];
  const idx = (x, y) => y * W + x;

  function ensureCells(){
    if (cells.length) return;
    const frag = document.createDocumentFragment();
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        const c = document.createElement('div');
        c.className = 'cell';
        c.setAttribute('role','gridcell');
        c.dataset.x = x; c.dataset.y = y;
        cells.push(c);
        frag.appendChild(c);
      }
    }
    boardEl.appendChild(frag);
  }
  ensureCells();

  function makeLanes(baseSpeedMod = 0) {
    const s = (v) => Math.max(1, v - baseSpeedMod); // ticks per move
    return [
      { type: 'home' },
      { type: 'river', dir:  1, speed: s(4), length: 3, spawn: [1, 7] },
      { type: 'river', dir: -1, speed: s(5), length: 2, spawn: [4] },
      { type: 'river', dir:  1, speed: s(4), length: 2, spawn: [2, 8] },
      { type: 'river', dir: -1, speed: s(5), length: 3, spawn: [6] },
      { type: 'grass' },
      { type: 'road',  dir: -1, speed: s(4), length: 1, spawn: [1, 7] },
      { type: 'road',  dir:  1, speed: s(4), length: 1, spawn: [4] },
      { type: 'road',  dir: -1, speed: s(3), length: 1, spawn: [9] },
      { type: 'road',  dir:  1, speed: s(4), length: 1, spawn: [0, 6] },
      { type: 'grass' },
    ];
  }

  let lanes, frog, lives, level, score, state, homesFilled, maxProgressY;
  let lastAlpha = 0; // store last alpha for visual-attach tests
  let best = Number(localStorage.getItem('froggo-best') || 0);
  if (bestEl) bestEl.textContent = best;

  function initLanes(baseSpeedMod=0){
    lanes = makeLanes(baseSpeedMod);
    for(let y=0;y<H;y++){
      const L=lanes[y]; L.ticks=0; L.items=[];
      if(L.type==='road'||L.type==='river'){
        for(const s of L.spawn) L.items.push({x:s, length:L.length});
      }
    }
  }

  function resetFrog(){ frog.x=START_POS.x; frog.y=START_POS.y; maxProgressY=START_POS.y; }

  function setState(next){
    state = next;
    overlayEl.classList.add('hidden');
    btnStart.classList.add('hidden');
    btnRestart.classList.add('hidden');
    btnContinue.classList.add('hidden');

    if (next === STATE.TITLE) {
      overlayTitleEl.textContent = 'Froggo';
      overlaySubEl.textContent = 'Tap Start (or anywhere) to play';
      btnStart.classList.remove('hidden');
      overlayEl.classList.remove('hidden');
    } else if (next === STATE.LIFE_LOST) {
      overlayTitleEl.textContent = 'Ouch!';
      overlaySubEl.textContent = 'Life lost';
      btnContinue.classList.remove('hidden');
      overlayEl.classList.remove('hidden');
      navigator.vibrate?.(80);
    } else if (next === STATE.GAME_OVER) {
      overlayTitleEl.textContent = 'Game Over';
      overlaySubEl.textContent = `Score: ${score}`;
      btnRestart.classList.remove('hidden');
      overlayEl.classList.remove('hidden');
      if (score > best) { best = score; localStorage.setItem('froggo-best', String(best)); bestEl && (bestEl.textContent = best); }
      navigator.vibrate?.([60,60,120]);
    } else if (next === STATE.WIN) {
      overlayTitleEl.textContent = 'Level Clear!';
      overlaySubEl.textContent = `Level ${level} complete`;
      btnContinue.classList.remove('hidden');
      overlayEl.classList.remove('hidden');
      navigator.vibrate?.([50,40,50]);
    } else if (next === STATE.PAUSED) {
      overlayTitleEl.textContent = 'Paused';
      overlaySubEl.textContent = 'Tap Continue';
      btnContinue.classList.remove('hidden');
      overlayEl.classList.remove('hidden');
    }
  }

  function startNewGame(){
    score=0; lives=3; level=1; homesFilled=HOME_SLOTS_X.map(()=>false); frog={...START_POS}; maxProgressY=START_POS.y;
    initLanes(0);
    setState(STATE.PLAYING);
  }

  function nextLevel(){
    level++; score += 100; homesFilled=HOME_SLOTS_X.map(()=>false); resetFrog();
    initLanes(Math.min(level-1,2));
    setState(STATE.PLAYING);
  }

  (function init(){
    initLanes(0);
    frog={...START_POS}; lives=3; level=1; score=0; homesFilled=HOME_SLOTS_X.map(()=>false); maxProgressY=START_POS.y;
    setState(STATE.TITLE);
  })();

  function onLogVisual(x, y, alpha) {
    const L = lanes[y];
    if (!L || L.type !== 'river') return false;
    const frac = (L.ticks + alpha) / L.speed; // 0..1
    for (const log of L.items) {
      for (let k=0;k<log.length;k++) {
        const base = (log.x + k + W) % W;
        if (x === base) return true;
        // neighbor in movement direction visually overlaps due to transform
        const neighbor = (base + L.dir + W) % W;
        if (x === neighbor) return true;
      }
    }
    return false;
  }

  function tick(){
    // Move items one cell per movement tick (strictly linear, lane dir)
    for(let y=0;y<H;y++){
      const L=lanes[y];
      if(L.type!=='road'&&L.type!=='river') continue;
      if(++L.ticks>=L.speed){
        L.ticks=0;
        for(const item of L.items){ item.x=(item.x+L.dir+W)%W; }
      }
    }

    // Carry frog with log after logs move
    const laneF=lanes[frog.y];
    if(laneF&&laneF.type==='river'){
      let onLog=false; 
      for(const log of laneF.items){ 
        for (let k=0;k<log.length;k++){
          const base=(log.x+k+W)%W;
          if(((frog.x-base+W)%W)<1){ onLog=true; break; }
        }
        if(onLog) break;
      }
      if(onLog){ frog.x=(frog.x+laneF.dir+W)%W; }
    }

    // Collisions / drown
    if(laneF){
      if(laneF.type==='road'){
        for(const car of laneF.items){ if(((frog.x-car.x+W)%W)<car.length) return loseLife(); }
      } else if(laneF.type==='river'){
        let onAny=false; 
        for(const log of laneF.items){ 
          for (let k=0;k<log.length;k++){
            const base=(log.x+k+W)%W;
            if(((frog.x-base+W)%W)<1){ onAny=true; break; }
          }
          if(onAny) break;
        }
        if(!onAny) return loseLife();
      }
    }

    // Home row
    if(frog.y===0){
      const i=HOME_SLOTS_X.indexOf(frog.x);
      if(i>=0&&!homesFilled[i]){ homesFilled[i]=true; score+=50; if(homesFilled.every(Boolean)) setState(STATE.WIN); else resetFrog(); }
      else { loseLife(); }
      return;
    }

    // Progress score
    if(frog.y<maxProgressY){ score+=10; maxProgressY=frog.y; }
  }

  function loseLife(){ lives--; setState((lives<=0)?STATE.GAME_OVER:STATE.LIFE_LOST); }

  function render(alpha) {
    // HUD
    scoreEl.textContent = String(score);
    livesEl.textContent = String(lives);
    levelEl.textContent = String(level);

    const carMap=Array.from({length:H},()=>Array(W).fill(false));
    const logMap=Array.from({length:H},()=>Array(W).fill(false));

    for(let y=0;y<H;y++){
      const L=lanes[y];
      if(L.type==='road'){
        for(const car of L.items){ for(let k=0;k<car.length;k++) carMap[y][(car.x+k)%W]=true; }
      } else if(L.type==='river'){
        for(const log of L.items){ for(let k=0;k<log.length;k++) logMap[y][(log.x+k)%W]=true; }
      }
    }

    // Per-lane smooth shift (pixels) based on fractional progress toward next cell
    const cellPx = boardEl.clientWidth / W;
    const laneShift = new Array(H).fill(0);
    for (let y=0; y<H; y++) {
      const L = lanes[y];
      let shift = 0;
      if (L.type==='road' || L.type==='river') {
        const progress = ((L.ticks) + alpha) / L.speed; // 0..1 toward next move
        shift = progress * L.dir * cellPx;
      }
      laneShift[y] = shift;
      for (let x=0; x<W; x++) {
        cells[idx(x,y)].style.setProperty('--lane-shift', shift+'px');
      }
    }

    // Paint cells/classes
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        const L=lanes[y]; let cls='cell ';
        if(L.type==='home'){
          const filled=HOME_SLOTS_X.includes(x)&&homesFilled[HOME_SLOTS_X.indexOf(x)];
          cls+='home'+(filled?' home--filled':'');
        } else cls+=(L.type||'grass');
        if(carMap[y][x]) cls+=' car';
        if(logMap[y][x]) cls+=' log';
        if(frog.x===x&&frog.y===y&&state===STATE.PLAYING) cls+=' frog';
        cells[idx(x,y)].className=cls;
      }
    }

    // Smooth carry for frog riding a log: translate frog by lane shift if on/overlapping a log visually
    let frogShift = 0;
    if (onLogVisual(frog.x, frog.y, alpha)) {
      frogShift = laneShift[frog.y];
    }
    cells[idx(frog.x,frog.y)].style.setProperty('--frog-shift', frogShift+'px');

    lastAlpha = alpha;
  }

  function tryMove(dx,dy){ 
    if(state!==STATE.PLAYING) return; 
    frog.x=Math.max(0,Math.min(W-1,frog.x+dx)); 
    frog.y=Math.max(0,Math.min(H-1,frog.y+dy)); 
    // If we landed in river, visually attach immediately if overlapping a log this frame
    if (lanes[frog.y]?.type==='river') {
      // touching is handled visually in render via onLogVisual; nothing else needed here for visuals
      // (carrying as integer x happens in tick)
    }
  }

  // Keyboard
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key)) e.preventDefault();
    if(state===STATE.TITLE&&(k==='enter'||k===' ')){ startNewGame(); return; }
    if(k==='p'){ setState((state===STATE.PLAYING)?STATE.PAUSED:STATE.PLAYING); return; }
    if(state!==STATE.PLAYING) return;
    if(k==='arrowup'||k==='w')tryMove(0,-1);
    else if(k==='arrowdown'||k==='s')tryMove(0,1);
    else if(k==='arrowleft'||k==='a')tryMove(-1,0);
    else if(k==='arrowright'||k==='d')tryMove(1,0);
  },{passive:false});

  // Buttons (mobile-friendly)
  btnStart?.addEventListener('click', startNewGame);
  btnRestart?.addEventListener('click', startNewGame);
  btnContinue?.addEventListener('click', () => {
    if (state === STATE.LIFE_LOST) { resetFrog(); setState(STATE.PLAYING); }
    else if (state === STATE.WIN) { nextLevel(); }
    else if (state === STATE.PAUSED) { setState(STATE.PLAYING); }
  });
  btnPause?.addEventListener('click', () => {
    setState(state === STATE.PLAYING ? STATE.PAUSED : STATE.PLAYING);
  });
  // Tap anywhere on overlay to start
  overlayEl.addEventListener('click', () => { if (state===STATE.TITLE) startNewGame(); });

  // D-pad one-step (with optional hold repeat)
  let repeatTimer=null;
  function handleDir(dir){ if(dir==='up')tryMove(0,-1); else if(dir==='down')tryMove(0,1); else if(dir==='left')tryMove(-1,0); else if(dir==='right')tryMove(1,0); }
  dpadButtons.forEach(btn=>{
    btn.addEventListener('pointerdown',(e)=>{ e.preventDefault(); const dir=btn.dataset.dir; handleDir(dir); btn.setPointerCapture(e.pointerId); clearInterval(repeatTimer); repeatTimer=setInterval(()=>handleDir(dir),170); },{passive:false});
    const stop=()=>{ clearInterval(repeatTimer); };
    btn.addEventListener('pointerup',stop); btn.addEventListener('pointercancel',stop); btn.addEventListener('pointerleave',stop);
  });

  // Swipe: single-finger, one move, ignore diagonals
  let swipeActive=false, startX=0, startY=0, ptrId=null, moved=false;
  boardWrap.addEventListener('pointerdown',(e)=>{
    if(e.pointerType!=='touch') return; if(swipeActive) return; swipeActive=true; moved=false; ptrId=e.pointerId; startX=e.clientX; startY=e.clientY; e.preventDefault(); boardWrap.setPointerCapture(ptrId);
  },{passive:false});
  boardWrap.addEventListener('pointermove',(e)=>{ if(!swipeActive||e.pointerId!==ptrId) return; e.preventDefault(); },{passive:false});
  boardWrap.addEventListener('pointerup',(e)=>{
    if(!swipeActive||e.pointerId!==ptrId) return; const dx=e.clientX-startX, dy=e.clientY-startY; const ax=Math.abs(dx), ay=Math.abs(dy);
    if(!moved){ if(ax>=28 && ay<28){ handleDir(dx>0?'right':'left'); moved=true; } else if(ay>=28 && ax<28){ handleDir(dy>0?'down':'up'); moved=true; } }
    try{ boardWrap.releasePointerCapture(ptrId); }catch{}
    swipeActive=false; ptrId=null; e.preventDefault();
  },{passive:false});

  // Fixed-step loop
  let last=0, acc=0;
  function loop(ts){
    if(!last) last=ts;
    acc += ts - last;
    last = ts;
    while(acc >= TICK_MS){ if(state===STATE.PLAYING) tick(); acc -= TICK_MS; }
    const alpha = acc / TICK_MS; // 0..1 fraction of next tick
    render(alpha);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
