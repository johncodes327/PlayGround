(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);
  const W = 640, H = 360, FOV = Math.PI / 3;
  canvas.width = W; canvas.height = H;
  const map = [
    '################',
    '#..............#',
    '#..##......##..#',
    '#..#........#..#',
    '#..............#',
    '#....##........#',
    '#....#.........#',
    '#..............#',
    '#..##......##..#',
    '#..............#',
    '#..............#',
    '################'
  ];
  const MAP_W = map[0].length, MAP_H = map.length;
  const enemyStarts = [
    { x: 8.5, y: 2.5 }, { x: 12.5, y: 6.5 }, { x: 7.5, y: 9.5 }
  ];
  let player, enemies, bullet, running = false, won = false, lost = false;
  let keys = Object.create(null), touchMoves = Object.create(null), lastTime = 0;
  let bob = 0, hurt = 0, fireTimer = 0, enemyAttack = 0, toastTimer = 0, soundOn = true;
  let zBuffer = new Float32Array(W), audioCtx;

  function reset(active = true) {
    player = { x: 2.55, y: 9.45, angle: 0, health: 100, moving: false };
    enemies = enemyStarts.map((e, i) => ({ x: e.x, y: e.y, alive: true, phase: i * 2.1, attack: 0, hit: 0 }));
    bullet = { loaded: true, dropped: false, x: 0, y: 0 };
    running = active; won = lost = false; bob = hurt = fireTimer = enemyAttack = 0;
    $('startOverlay').classList.toggle('hidden', active); $('endOverlay').classList.add('hidden');
    if (active) showToast('THEY KNOW YOU’RE HERE'); updateHud();
  }
  function isWall(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    return ix < 0 || iy < 0 || ix >= MAP_W || iy >= MAP_H || map[iy][ix] === '#';
  }
  function canStand(x, y, radius = .2) {
    return !isWall(x - radius, y - radius) && !isWall(x + radius, y - radius) && !isWall(x - radius, y + radius) && !isWall(x + radius, y + radius);
  }
  function movePlayer(dx, dy) {
    const r = .22;
    if (canStand(player.x + dx, player.y, r)) player.x += dx;
    if (canStand(player.x, player.y + dy, r)) player.y += dy;
  }
  function raycast(angle, maxDistance = 18) {
    const rx = Math.cos(angle), ry = Math.sin(angle);
    let dist = 0, x = player.x, y = player.y;
    while (dist < maxDistance) {
      dist += .035; x = player.x + rx * dist; y = player.y + ry * dist;
      if (isWall(x, y)) return { dist, x, y, rx, ry };
    }
    return { dist: maxDistance, x, y, rx, ry };
  }
  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * amount));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * amount));
    const b = Math.max(0, Math.min(255, (n & 255) * amount));
    return `rgb(${r|0},${g|0},${b|0})`;
  }
  function renderWorld(time) {
    const horizon = H * .48 + Math.sin(bob) * 1.8;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#17131d'); sky.addColorStop(.72, '#3a2028'); sky.addColorStop(1, '#70402d');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon);
    ctx.fillStyle = '#bf7742'; ctx.fillRect(0, horizon - 2, W, 3);
    const floor = ctx.createLinearGradient(0, horizon, 0, H);
    floor.addColorStop(0, '#3a2925'); floor.addColorStop(.22, '#211a20'); floor.addColorStop(1, '#110f15');
    ctx.fillStyle = floor; ctx.fillRect(0, horizon, W, H - horizon);
    // Receding floor seams and scattered rusted plates.
    for (let row = 0; row < 20; row++) {
      const p = (row + 1) / 20;
      const y = horizon + p * p * (H - horizon);
      ctx.fillStyle = row % 3 === 0 ? '#b9794224' : '#0000001c';
      ctx.fillRect(0, y, W, row % 3 === 0 ? 1 : 2);
    }
    const cos = Math.cos(player.angle), sin = Math.sin(player.angle);
    const focal = W / (2 * Math.tan(FOV / 2));
    for (let sx = 0; sx < W; sx++) {
      const camera = (2 * sx / W - 1) * Math.tan(FOV / 2);
      const angle = player.angle + Math.atan(camera);
      const hit = raycast(angle);
      const corrected = Math.max(.08, hit.dist * Math.cos(angle - player.angle));
      zBuffer[sx] = corrected;
      const wallH = Math.min(H * 2, focal / corrected);
      const top = horizon - wallH * .52;
      const fracX = hit.x - Math.floor(hit.x), fracY = hit.y - Math.floor(hit.y);
      const sideX = Math.min(fracX,1-fracX) < Math.min(fracY,1-fracY);
      const u = sideX ? fracY : fracX;
      const mortar = Math.floor(u * 8) % 4;
      const band = Math.floor((horizon - top) / Math.max(8, wallH / 3));
      const texture = (mortar === 0 || (band + Math.floor(u * 8)) % 5 === 0) ? .65 : .94;
      const distShade = Math.max(.22, 1 - corrected / 16);
      const side = sideX ? .7 : 1;
      const flicker = .93 + Math.sin(time * .001 + Math.floor(sx / 8)) * .035;
      let color = shade('#854735', texture * distShade * side * flicker);
      ctx.fillStyle = color; ctx.fillRect(sx, top, 1.35, wallH);
      // Rusty brick seams and a few luminous conduit strips.
      if ((Math.floor(sx / 4) + mortar) % 13 === 0) {
        ctx.fillStyle = `rgba(235,143,80,${Math.max(0, .12 * distShade)})`;
        ctx.fillRect(sx, top + wallH * .38, 1, Math.max(1, wallH * .015));
      }
      if (wallH > 42 && sx % 89 < 2) { ctx.fillStyle = `rgba(212,255,72,${.35 * distShade})`; ctx.fillRect(sx, top + wallH * .2, 1, wallH * .17); }
      if (top < 0) { ctx.fillStyle = '#17131d'; ctx.fillRect(sx, 0, 1, Math.max(0, top + wallH * .05)); }
    }
    renderObjects(horizon, focal, cos, sin);
    drawWeapon(time);
  }
  function renderObjects(horizon, focal, cos, sin) {
    const objects = [];
    enemies.forEach((e, i) => { if (e.alive) objects.push({ type: 'enemy', e, i, x: e.x, y: e.y }); });
    if (bullet.dropped) objects.push({ type: 'bullet', x: bullet.x, y: bullet.y });
    if (enemies.every(e => !e.alive)) objects.push({ type: 'exit', x: 14.45, y: 9.5 });
    objects.sort((a, b) => ((b.x - player.x) * cos + (b.y - player.y) * sin) - ((a.x - player.x) * cos + (a.y - player.y) * sin));
    objects.forEach(o => {
      const dx = o.x - player.x, dy = o.y - player.y;
      const depth = dx * cos + dy * sin;
      if (depth < .16) return;
      const cameraX = -dx * sin + dy * cos;
      const sx = W / 2 + cameraX * focal / depth;
      const size = focal / depth;
      const center = sx;
      const feet = horizon + focal * .50 / depth;
      const col = Math.round(sx);
      if (col < 0 || col >= W || depth > zBuffer[col] + .1) return;
      ctx.save();
      if (o.type === 'enemy') drawDemon(ctx, center, feet, size, o.e, performance.now());
      else if (o.type === 'bullet') drawBullet(ctx, center, feet, size, performance.now());
      else drawExit(ctx, center, feet, size);
      ctx.restore();
    });
  }
  function polygon(c, pts, fill, stroke) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath(); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  function drawDemon(c, x, feet, size, e, time) {
    const scale = Math.min(1.7, size / 95), w = 95 * .72, h = 95 * .94;
    if (w < 2) return;
    const sway = Math.sin(time * .006 + e.phase) * size * .025;
    const hit = e.hit > 0 ? '#f5e3b2' : '#9a3634';
    c.translate(x, feet + sway); c.scale(scale, scale);
    c.shadowColor = '#f13e24'; c.shadowBlur = size * .08;
    // jagged silhouette, horns, and plated shoulders
    polygon(c, [[-w*.31,-h*.67],[-w*.53,-h*.88],[-w*.43,-h*.53],[-w*.5,-h*.36],[-w*.35,-h*.22],[-w*.29,-h*.02],[-w*.42,0],[-w*.37,h*.08],[-w*.1,h*.08],[-w*.04,-h*.11],[w*.06,-h*.11],[w*.13,h*.08],[w*.4,h*.08],[w*.44,0],[w*.3,-h*.03],[w*.38,-h*.25],[w*.53,-h*.43],[w*.42,-h*.57],[w*.48,-h*.86],[w*.27,-h*.68],[w*.13,-h*.75],[-w*.13,-h*.74]], hit, '#391e26');
    c.shadowBlur = 0;
    polygon(c, [[-w*.3,-h*.55],[-w*.2,-h*.72],[w*.18,-h*.72],[w*.3,-h*.52],[w*.25,-h*.29],[0,-h*.21],[-w*.26,-h*.32]], '#c56647', '#612b2e');
    polygon(c, [[-w*.22,-h*.48],[-w*.17,-h*.59],[-w*.04,-h*.55],[-w*.08,-h*.43]], '#ffcf83');
    polygon(c, [[w*.05,-h*.55],[w*.2,-h*.59],[w*.23,-h*.48],[w*.09,-h*.43]], '#ffcf83');
    c.fillStyle = '#fff0b2'; c.fillRect(-w*.16, -h*.53, w*.09, h*.025); c.fillRect(w*.08, -h*.53, w*.09, h*.025);
    polygon(c, [[-w*.11,-h*.31],[w*.12,-h*.31],[w*.06,-h*.19],[0,-h*.16],[-w*.07,-h*.2]], '#27161d');
    c.fillStyle = '#ef7151'; c.fillRect(-w*.05,-h*.2,w*.1,h*.025);
    polygon(c, [[-w*.38,-h*.43],[-w*.49,-h*.58],[-w*.46,-h*.29],[-w*.33,-h*.24]], '#dc7650');
    polygon(c, [[w*.38,-h*.43],[w*.49,-h*.58],[w*.46,-h*.29],[w*.33,-h*.24]], '#dc7650');
    polygon(c, [[-w*.27,-h*.22],[0,-h*.13],[w*.27,-h*.22],[w*.2,-h*.02],[-w*.2,-h*.02]], '#6b3032');
    polygon(c, [[-w*.23,-h*.08],[-w*.04,-h*.08],[-w*.1,0],[-w*.29,0]], '#39202a');
    polygon(c, [[w*.04,-h*.08],[w*.23,-h*.08],[w*.29,0],[w*.1,0]], '#39202a');
    for (let i = 0; i < 3; i++) { c.fillStyle = '#d9a06a'; c.fillRect(-w*.2+i*w*.13,-h*.17,w*.025,h*.04); }
    c.restore();
  }
  function drawBullet(c, x, feet, size, time) {
    const r = Math.max(2, Math.min(13, size * .12));
    const pulse = .7 + Math.sin(time * .008) * .2;
    c.save(); c.translate(x, feet - r * .8); c.shadowColor = '#d4ff48'; c.shadowBlur = r * 2.5;
    c.fillStyle = `rgba(212,255,72,${pulse * .27})`; c.beginPath(); c.arc(0,0,r*1.8,0,Math.PI*2); c.fill();
    c.fillStyle = '#d4ff48'; c.beginPath(); c.ellipse(0,0,r*1.15,r*.56,-.25,0,Math.PI*2); c.fill();
    c.fillStyle = '#fff7b0'; c.beginPath(); c.arc(-r*.34,-r*.22,r*.25,0,Math.PI*2); c.fill(); c.restore();
  }
  function drawExit(c, x, feet, size) {
    const w = size * .78, h = size * 1.2;
    if (w < 2) return;
    c.save(); c.translate(x, feet); c.shadowColor = '#73eaff'; c.shadowBlur = size * .22;
    c.strokeStyle = '#87eaff'; c.lineWidth = Math.max(1, size*.04); c.strokeRect(-w/2,-h,w,h);
    const g = c.createLinearGradient(0,-h,0,0); g.addColorStop(0,'#86f5ff88'); g.addColorStop(1,'#305ec066'); c.fillStyle = g; c.fillRect(-w/2,-h,w,h);
    c.fillStyle = '#e5ffff'; c.font = `bold ${Math.max(4,size*.12)}px monospace`; c.textAlign = 'center'; c.fillText('EXIT',0,-h*.52); c.restore();
  }
  function drawWeapon(time) {
    const swayX = Math.sin(bob) * 5, swayY = Math.abs(Math.cos(bob)) * 3;
    const recoil = Math.max(0, (fireTimer - .12) * 55);
    const x = W*.5 + swayX, y = H + 22 + swayY + recoil;
    ctx.save(); ctx.translate(x,y);
    // forearm, chunky industrial pistol, muzzle and engraved details
    polygon(ctx,[[-90,8],[-59,-31],[-30,-50],[9,-42],[46,-17],[70,32],[-60,43]],'#593a34','#1b171d');
    polygon(ctx,[[-38,-54],[-21,-117],[20,-130],[55,-112],[71,-54],[54,2],[-29,3]],'#29262d','#09090d');
    polygon(ctx,[[-23,-111],[-8,-134],[34,-134],[53,-112],[49,-93],[-24,-93]],'#51434a','#100e12');
    polygon(ctx,[[-15,-101],[-8,-126],[29,-126],[38,-101]],bullet.loaded?'#8f794b':'#55505a','#b79b59');
    ctx.fillStyle = '#d4ff48'; ctx.fillRect(-3,-119,22,3); ctx.fillStyle = '#17171b'; ctx.fillRect(-20,-78,58,8);
    ctx.fillStyle = '#a64b37'; ctx.fillRect(-17,-72,40,2); ctx.fillStyle='#81747d'; ctx.fillRect(7,-88,5,7);
    polygon(ctx,[[-30,-31],[44,-31],[38,12],[-8,13]],'#3a353c','#111015');
    for(let i=0;i<4;i++){ctx.fillStyle='#86746c';ctx.fillRect(-20+i*13,-24,5,3);}
    if (fireTimer > .12 && fireTimer < .2) {
      ctx.globalAlpha = (fireTimer-.12)*12; polygon(ctx,[[-15,-140],[0,-173],[5,-147],[27,-168],[18,-133],[41,-141],[16,-123]],'#e6ff80');
    }
    ctx.restore();
  }
  function updateHud() {
    if (!player) return;
    $('health').textContent = Math.max(0, Math.ceil(player.health));
    $('healthBar').style.width = `${Math.max(0, player.health)}%`;
    $('healthBar').style.background = player.health < 35 ? '#ff473b' : '#d4ff48';
    $('ammoLabel').textContent = bullet.loaded ? 'LOADED' : 'EMPTY';
    $('bulletIcon').style.opacity = bullet.loaded ? '1' : '.22';
    const remaining = enemies.filter(e => e.alive).length;
    $('enemyCount').innerHTML = `HOSTILES <b>0${remaining}</b>`;
    $('objective').textContent = remaining ? 'ELIMINATE ALL HOSTILES' : 'EXIT IS OPEN — GET OUT';
    $('pickupPrompt').classList.toggle('visible', running && bullet.dropped && Math.hypot(player.x-bullet.x,player.y-bullet.y)<1.15);
  }
  function showToast(message) {
    $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = 1.5;
  }
  function playTone(freq, duration, type = 'square', volume = .035) {
    if (!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(35, freq*.45), audioCtx.currentTime+duration);
      gain.gain.setValueAtTime(volume, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime+duration);
      osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime+duration);
    } catch (_) { /* audio is optional */ }
  }
  function fire() {
    if (!running || fireTimer > .2) return;
    if (!bullet.loaded) { showToast('YOUR ROUND IS STILL OUT THERE'); playTone(105,.06,'triangle',.02); return; }
    fireTimer = .26; bullet.loaded = false;
    const dx = Math.cos(player.angle), dy = Math.sin(player.angle);
    let lastX = player.x, lastY = player.y, hitEnemy = null;
    for (let d = .12; d < 10; d += .045) {
      const x = player.x + dx*d, y = player.y + dy*d;
      if (isWall(x,y)) break;
      lastX = x; lastY = y;
      hitEnemy = enemies.find(e => e.alive && Math.hypot(e.x-x,e.y-y) < .38) || null;
      if (hitEnemy) break;
    }
    bullet.x = lastX; bullet.y = lastY; bullet.dropped = true;
    if (hitEnemy) {
      hitEnemy.alive = false; showToast('HOSTILE DOWN — RECOVER THE ROUND');
      playTone(92,.21,'sawtooth',.06);
    } else { showToast('ROUND SPENT — GO GET IT'); playTone(155,.12,'square',.045); }
    updateHud();
  }
  function pickup() {
    if (!running) return;
    const distance = Math.hypot(player.x-bullet.x,player.y-bullet.y);
    if (bullet.dropped && distance < 1.15) {
      bullet.dropped = false; bullet.loaded = true;
      showToast('ROUND RECOVERED'); playTone(610,.09,'triangle',.04); updateHud();
    } else if (enemies.every(e=>!e.alive) && Math.hypot(player.x-14.45,player.y-9.5)<1.25) finish(true);
    else if (!bullet.loaded && bullet.dropped) showToast('GET CLOSER TO THE ROUND');
  }
  function finish(victory) {
    running = false; won = victory; lost = !victory;
    $('endOverlay').classList.remove('hidden');
    $('endEyebrow').innerHTML = victory ? '<span></span> UAC INCIDENT REPORT — CLOSED' : '<span></span> VITAL SIGNS — ZERO';
    $('endTitle').textContent = victory ? 'SECTOR CLEARED' : 'YOU DIDN’T MAKE IT';
    $('endText').innerHTML = victory ? 'Three hostiles down. One very well-traveled bullet.<br><b>That’s how it’s done, marine.</b>' : 'The nest is still breathing. Get back in there and make the round count.';
    playTone(victory?420:75,.45,victory?'triangle':'sawtooth',.05);
  }
  function update(dt, time) {
    if (!running) return;
    dt = Math.min(dt,.045); fireTimer = Math.max(0,fireTimer-dt); hurt = Math.max(0,hurt-dt);
    if (toastTimer > 0) { toastTimer-=dt; if (toastTimer<=0) $('toast').classList.remove('show'); }
    let turn = 0;
    if (keys.ArrowLeft || keys.KeyQ) turn -= 1;
    if (keys.ArrowRight) turn += 1;
    player.angle += turn * 2.2 * dt;
    const forward = (keys.KeyW || keys.ArrowUp || touchMoves.forward ? 1:0) - (keys.KeyS || keys.ArrowDown || touchMoves.back ? 1:0);
    const strafe = (keys.KeyD || touchMoves.right ? 1:0) - (keys.KeyA || touchMoves.left ? 1:0);
    player.moving = !!(forward || strafe);
    if (player.moving) {
      const speed = (keys.ShiftLeft || keys.ShiftRight ? 3.25:2.35)*dt;
      const fx=Math.cos(player.angle), fy=Math.sin(player.angle), rx=-fy, ry=fx;
      const len=Math.hypot(forward,strafe)||1;
      movePlayer((fx*forward+rx*strafe)/len*speed,(fy*forward+ry*strafe)/len*speed);
      bob += dt*(keys.ShiftLeft?13:9);
    }
    // Creatures stalk, then lunge into range. Their collision never traps the player in a wall.
    let nearest = Infinity;
    enemies.forEach(e=>{
      if (!e.alive) return;
      const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy); nearest=Math.min(nearest,d);
      e.phase+=dt*3; e.hit=Math.max(0,e.hit-dt*3);
      if (d>1.0) {
        const pace=(d<4? .55:.38)*dt;
        const mx=dx/d*pace,my=dy/d*pace;
        if(canStand(e.x+mx,e.y,.2))e.x+=mx;
        if(canStand(e.x,e.y+my,.2))e.y+=my;
      } else {
        e.attack-=dt;
        if(e.attack<=0){e.attack=1.15;player.health-=9;hurt=.22;$('damageFlash').classList.add('hit');setTimeout(()=>$('damageFlash').classList.remove('hit'),120);playTone(66,.12,'sawtooth',.045);updateHud();if(player.health<=0){player.health=0;updateHud();finish(false);}}
      }
    });
    if (enemies.every(e=>!e.alive) && Math.hypot(player.x-14.45,player.y-9.5)<1.25) pickup();
    updateHud();
  }
  function frame(time) {
    const dt = lastTime ? (time-lastTime)/1000:0; lastTime=time;
    update(dt,time); renderWorld(time);
    if (running) requestAnimationFrame(frame);
  }
  function start() { reset(true); lastTime=performance.now(); requestAnimationFrame(frame); }
  $('startButton').addEventListener('click', start);
  $('restartButton').addEventListener('click', start);
  $('soundToggle').addEventListener('click',()=>{
    soundOn=!soundOn; $('soundToggle').innerHTML=`♫ <span>SOUND ${soundOn?'ON':'OFF'}</span>`;
    if(soundOn)playTone(480,.07,'triangle',.025);
  });
  document.addEventListener('keydown',e=>{
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    keys[e.code]=true;
    if(e.code==='KeyE'&&!e.repeat)pickup();
    if(e.code==='Space'&&!e.repeat)fire();
    if(e.code==='Enter'&&!running)start();
  });
  document.addEventListener('keyup',e=>{keys[e.code]=false;});
  canvas.addEventListener('mousedown',e=>{
    if(!running)return;
    if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.();
    fire();
  });
  document.addEventListener('mousemove',e=>{
    if(running&&document.pointerLockElement===canvas)player.angle+=e.movementX*.0024;
  });
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  let touchLookX=null;
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'&&running){touchLookX=e.clientX;canvas.setPointerCapture(e.pointerId);}
  });
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch'&&touchLookX!==null){player.angle+=(e.clientX-touchLookX)*.009;touchLookX=e.clientX;}
  });
  canvas.addEventListener('pointerup',e=>{if(e.pointerType==='touch')touchLookX=null;});
  document.querySelectorAll('[data-move]').forEach(button=>{
    const direction=button.dataset.move;
    button.addEventListener('pointerdown',e=>{e.preventDefault();touchMoves[direction]=true;button.setPointerCapture(e.pointerId);});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,()=>{touchMoves[direction]=false;}));
  });
  $('touchFire').addEventListener('pointerdown',e=>{e.preventDefault();fire();});
  $('touchPickup').addEventListener('pointerdown',e=>{e.preventDefault();pickup();});
  reset(false); renderWorld(performance.now());
})();
