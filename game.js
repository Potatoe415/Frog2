/* game.js - Full logic for Froggo (cleaned + fewer cars, linear motion) */
(() => {
  const W = 11, H = 11;
  const boardEl = document.getElementById('board');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const overlayEl = document.getElementById('overlay');
  const btnStart = document.getElementById('btn-start');
  const btnRestart = document.getElementById('btn-restart');
  const btnContinue = document.getElementById('btn-continue');
  const btnPause = document.getElementById('btn-pause');
  const boardWrap = document.getElementById('board-wrap');
  const dpadButtons = document.querySelectorAll('.dpad__btn');

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
        cells.push(c);
        frag.appendChild(c);
      }
    }
    boardEl.appendChild(frag);
  }
  ensureCells();

  // Layout (top→bottom): home → 4× river → grass → 4× road → grass(start)
  // Fewer cars + wider spacing + slower lanes for "less blood".
  function makeLanes(baseSpeedMod = 0) {
    const s = (v) => Math.max(1, v - baseSpeedMod); // speed is ticks per move (higher = slower)
    return [
      { type: 'home' },                                            // y=0 arrival

      // Rivers (fewer, longer logs; clean linear wrap)
      { type: 'river', dir:  1, speed: s(4), length: 3, spawn: [1, 7] },   // y=1
      { type: 'river', dir: -1, speed: s(5), length: 2, spawn: [4] },      // y=2
      { type: 'river', dir:  1, speed: s(4), length: 2, spawn: [2, 8] },   // y=3
      { type: 'river', dir: -1, speed: s(5), length: 3, spawn: [6] },      // y=4

      { type: 'grass' },                                          // y=5 median

      // Roads (fewer, single-cell cars; linear wrap; slower speeds)
      { type: 'road',  dir: -1, speed: s(4), length: 1, spawn: [1, 7] },   // y=6
      { type: 'road',  dir:  1, speed: s(4), length: 1, spawn: [4] },      // y=7
      { type: 'road',  dir: -1, speed: s(3), length: 1, spawn: [9] },      // y=8
      { type: 'road',  dir:  1, speed: s(4), length: 1, spawn: [0, 6] },   // y=9

      { type: 'grass' },                                          // y=10 start row
    ];
  }

  let lanes, frog, lives, level, score, state, homesFilled, maxProgressY;

  function initGame(){
    lanes = makeLanes(0);
    for(let y=0;y<H;y++){
      const L=lanes[y]; L.ticks=0; L.items=[];
      if(L.type==='road'||L.type==='river'){
        for(const s of L.spawn) L.items.push({x:s, length:L.length});
      }
    }
    frog={...START_POS};
    lives=3; level=1; score=0; homesFilled=HOME_SLOTS_X.map(()=>false); maxProgressY=START_POS.y; state=STATE.TITLE;
  }
  initGame();

  function resetFrog(){ frog.x=START_POS.x; frog.y=START_POS.y; maxProgressY=START_POS.y; }

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
      let onLog=false; for(const log of laneF.items){ if(((frog.x-log.x+W)%W)<log.length){ onLog=true; break; } }
      if(onLog){ frog.x=(frog.x+laneF.dir+W)%W; }
    }

    // Collisions / drown
    if(laneF){
      if(laneF.type==='road'){
        for(const car of laneF.items){ if(((frog.x-car.x+W)%W)<car.length) return loseLife(); }
      } else if(laneF.type==='river'){
        let onAny=false; for(const log of laneF.items){ if(((frog.x-log.x+W)%W)<log.length){ onAny=true; break; } }
        if(!onAny) return loseLife();
      }
    }

    // Home row
    if(frog.y===0){
      const i=HOME_SLOTS_X.indexOf(frog.x);
      if(i>=0&&!homesFilled[i]){ homesFilled[i]=true; score+=50; if(homesFilled.every(Boolean)) state=STATE.WIN; else resetFrog(); }
      else { loseLife(); }
      return;
    }

    // Progress score
    if(frog.y<maxProgressY){ score+=10; maxProgressY=frog.y; }
  }

  function loseLife(){ lives--; state=(lives<=0)?STATE.GAME_OVER:STATE.LIFE_LOST; }

  function render(){
    scoreEl.textContent=score; livesEl.textContent=lives; levelEl.textContent=level;
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
  }

  function tryMove(dx,dy){ if(state!==STATE.PLAYING) return; frog.x=Math.max(0,Math.min(W-1,frog.x+dx)); frog.y=Math.max(0,Math.min(H-1,frog.y+dy)); }

  // Keyboard
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key)) e.preventDefault();
    if(state===STATE.TITLE&&(k==='enter'||k===' ')){ state=STATE.PLAYING; return; }
    if(k==='p'){ state=(state===STATE.PLAYING)?STATE.PAUSED:STATE.PLAYING; return; }
    if(state!==STATE.PLAYING) return;
    if(k==='arrowup'||k==='w')tryMove(0,-1);
    else if(k==='arrowdown'||k==='s')tryMove(0,1);
    else if(k==='arrowleft'||k==='a')tryMove(-1,0);
    else if(k==='arrowright'||k==='d')tryMove(1,0);
  },{passive:false});

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

  let last=0,acc=0; function loop(ts){ if(!last) last=ts; acc+=ts-last; last=ts; while(acc>=TICK_MS){ if(state===STATE.PLAYING) tick(); acc-=TICK_MS;} render(); requestAnimationFrame(loop);} requestAnimationFrame(loop);
})();