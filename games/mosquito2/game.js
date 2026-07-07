import { ensureRoughFilter, SimpleNoise, distance, clamp } from '../../shared/hand-drawn.js';

ensureRoughFilter();

class MosquitoRevenge {
  constructor() {
    this.state = 'START';
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.gameEl = document.getElementById('game');
    this.bedroom = document.getElementById('bedroom');
    this.playerEl = document.getElementById('player');
    this.hud = document.getElementById('hud');
    this.hintEl = document.getElementById('hint');
    this.zzzEl = document.getElementById('zzz');
    this.slapEl = document.getElementById('slap');
    this.watersEl = document.getElementById('waters');
    this.racketEl = document.getElementById('racket');
    this.racketGlow = document.getElementById('racket-glow');
    this.coilEl = document.getElementById('coil');

    this.bloodFill = document.getElementById('blood2-fill');
    this.staminaFill = document.getElementById('stamina-fill');
    this.alertFill = document.getElementById('alert-fill');

    this.overlayStart = document.getElementById('overlay-start');
    this.overlayWin = document.getElementById('overlay-win');
    this.overlayLose = document.getElementById('overlay-lose');
    this.loseTitle = document.getElementById('lose-title');
    this.loseReason = document.getElementById('lose-reason');

    this.targetBlood = 100;
    this.blood = 0;
    this.stamina = 100;
    this.alert = 0;
    this.bloodFullness = 0;

    this.player = {
      x: this.width * 0.85,
      y: this.height * 0.2,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 18,
      isSucking: false,
      suckZone: null,
    };

    this.pointer = { active: false, x: this.player.x, y: this.player.y };
    this.noise = new SimpleNoise();

    this.zones = [
      { id: 'head', label: '头', x: 0.35, y: 0.48, r: 0.08, bloodRate: 22, alertRate: 35, enabled: true, ear: true },
      { id: 'arm', label: '手臂', x: 0.50, y: 0.42, r: 0.07, bloodRate: 14, alertRate: 12, enabled: true, ear: false },
      { id: 'leg', label: '腿', x: 0.68, y: 0.48, r: 0.08, bloodRate: 12, alertRate: 10, enabled: true, ear: false },
      { id: 'foot', label: '脚', x: 0.82, y: 0.52, r: 0.06, bloodRate: 7, alertRate: 5, enabled: true, ear: false },
    ];

    this.racket = {
      x: 0.92, y: 0.25, w: 0.07, h: 0.18,
      powered: false,
      cycle: 0,
      onDuration: 2200,
      offDuration: 1800,
    };

    this.coil = {
      x: 0.08, y: 0.82, r: 0.12,
    };

    this.waters = [];
    this.spawnWaters();

    this.sleep = {
      state: 'normal',
      timer: 0,
      nextEvent: 3000,
      snoring: false,
      scratchZone: null,
    };

    this.lastTime = 0;
    this.audioCtx = null;
    this.buzzOsc = null;
    this.buzzGain = null;
    this.snoreOsc = null;
    this.snoreGain = null;

    this.bindEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  bindEvents() {
    document.getElementById('start-btn').addEventListener('click', () => this.start());
    document.getElementById('restart-win').addEventListener('click', () => this.reset());
    document.getElementById('restart-lose').addEventListener('click', () => this.reset());

    this.gameEl.addEventListener('pointerdown', (e) => {
      if (this.state !== 'PLAYING') return;
      this.pointer.active = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.gameEl.setPointerCapture(e.pointerId);
    });

    this.gameEl.addEventListener('pointermove', (e) => {
      if (!this.pointer.active || this.state !== 'PLAYING') return;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    });

    this.gameEl.addEventListener('pointerup', (e) => {
      this.pointer.active = false;
      if (this.gameEl.hasPointerCapture(e.pointerId)) {
        this.gameEl.releasePointerCapture(e.pointerId);
      }
    });

    this.gameEl.addEventListener('pointercancel', () => {
      this.pointer.active = false;
    });
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  spawnWaters() {
    this.watersEl.innerHTML = '';
    this.waters = [];
    const positions = [
      { x: 0.15, y: 0.12 }, { x: 0.45, y: 0.08 }, { x: 0.75, y: 0.10 }, { x: 0.88, y: 0.15 },
    ];
    for (const p of positions) {
      const el = document.createElement('div');
      el.className = 'water';
      el.innerHTML = '<img src="../../assets/mosquito2/water.svg" alt="" draggable="false" />';
      el.style.left = `${p.x * 100}%`;
      el.style.top = `${p.y * 100}%`;
      this.watersEl.appendChild(el);
      this.waters.push({ x: p.x, y: p.y, r: 0.025, el, active: true });
    }
  }

  initAudio() {
    if (this.audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContext();

    this.buzzOsc = this.audioCtx.createOscillator();
    this.buzzOsc.type = 'sawtooth';
    this.buzzOsc.frequency.value = 130;
    this.buzzGain = this.audioCtx.createGain();
    this.buzzGain.gain.value = 0.0001;
    this.buzzOsc.connect(this.buzzGain);
    this.buzzGain.connect(this.audioCtx.destination);
    this.buzzOsc.start();

    this.snoreOsc = this.audioCtx.createOscillator();
    this.snoreOsc.type = 'sine';
    this.snoreOsc.frequency.value = 80;
    this.snoreGain = this.audioCtx.createGain();
    this.snoreGain.gain.value = 0.0001;
    this.snoreOsc.connect(this.snoreGain);
    this.snoreGain.connect(this.audioCtx.destination);
    this.snoreOsc.start();
  }

  updateAudio() {
    if (!this.audioCtx || this.state !== 'PLAYING') return;
    const now = this.audioCtx.currentTime;
    const speed = Math.hypot(this.player.vx, this.player.vy);
    const vol = clamp(0.03 + (speed / 300) * 0.12, 0.02, 0.18);
    this.buzzGain.gain.setTargetAtTime(vol, now, 0.05);
    this.buzzOsc.frequency.setTargetAtTime(120 + speed * 0.25, now, 0.1);

    if (this.sleep.snoring) {
      this.snoreGain.gain.setTargetAtTime(0.12, now, 0.2);
    } else {
      this.snoreGain.gain.setTargetAtTime(0.0001, now, 0.2);
    }
  }

  start() {
    this.initAudio();
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

    this.state = 'PLAYING';
    this.overlayStart.classList.add('hidden');
    this.hud.classList.remove('hidden');

    this.blood = 0;
    this.stamina = 100;
    this.alert = 0;
    this.bloodFullness = 0;
    this.player.x = this.width * 0.85;
    this.player.y = this.height * 0.2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.isSucking = false;
    this.sleep.state = 'normal';
    this.sleep.timer = 0;
    this.sleep.nextEvent = 2500;
    this.sleep.snoring = false;
    this.sleep.scratchZone = null;
    this.racket.cycle = 0;
    this.racket.powered = false;
    this.spawnWaters();

    this.lastTime = performance.now();
    this.loopId = requestAnimationFrame((t) => this.loop(t));
  }

  reset() {
    this.state = 'START';
    this.overlayWin.classList.add('hidden');
    this.overlayLose.classList.add('hidden');
    this.overlayStart.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.playerEl.classList.remove('sucking', 'exhausted');
    this.hintEl.classList.add('hidden');
    this.slapEl.classList.add('hidden');
    this.racketEl.classList.remove('powered');
    if (this.loopId) cancelAnimationFrame(this.loopId);
    if (this.audioCtx) {
      this.buzzGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.1);
      this.snoreGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.1);
    }
  }

  loop(now) {
    if (this.state !== 'PLAYING') return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.updateSleep(dt);
    this.updateRacket(dt);
    this.updatePlayer(dt);
    this.updateSucking(dt);
    this.updateHazards(dt);
    this.updateWaters(dt);
    this.updateAlert(dt);
    this.updateAudio();
    this.render();

    if (this.blood >= this.targetBlood) {
      this.win();
      return;
    }

    this.loopId = requestAnimationFrame((t) => this.loop(t));
  }

  updateSleep(dt) {
    this.sleep.timer += dt * 1000;
    if (this.sleep.timer >= this.sleep.nextEvent) {
      this.sleep.timer = 0;
      this.pickSleepEvent();
    }

    if (this.sleep.state === 'scratching') {
      if (this.sleep.timer >= 900) {
        this.sleep.state = 'normal';
        this.sleep.scratchZone = null;
      }
    }

    if (this.sleep.state === 'snoring') {
      if (this.sleep.timer >= 2500) {
        this.sleep.state = 'normal';
        this.sleep.snoring = false;
      }
    }
  }

  pickSleepEvent() {
    const r = Math.random();
    if (r < 0.35) {
      this.sleep.state = 'snoring';
      this.sleep.snoring = true;
      this.sleep.nextEvent = 3000 + Math.random() * 2500;
    } else if (r < 0.65) {
      this.sleep.state = 'rolling';
      const enabled = this.zones.map(z => z.enabled);
      this.zones.forEach(z => z.enabled = Math.random() > 0.35);
      if (this.zones.every(z => !z.enabled)) {
        this.zones[Math.floor(Math.random() * this.zones.length)].enabled = true;
      }
      document.getElementById('human').classList.add('rolling');
      setTimeout(() => {
        document.getElementById('human').classList.remove('rolling');
        this.zones.forEach((z, i) => z.enabled = enabled[i]);
        if (this.state === 'PLAYING') this.sleep.state = 'normal';
      }, 1200);
      this.sleep.nextEvent = 3500 + Math.random() * 2500;
    } else if (r < 0.9) {
      this.sleep.state = 'scratching';
      const enabledZones = this.zones.filter(z => z.enabled);
      this.sleep.scratchZone = enabledZones[Math.floor(Math.random() * enabledZones.length)] || this.zones[0];
      this.sleep.timer = 0;
      this.sleep.nextEvent = 4000 + Math.random() * 2000;
      setTimeout(() => this.slapZone(this.sleep.scratchZone), 400);
    } else {
      this.sleep.state = 'normal';
      this.sleep.nextEvent = 2000 + Math.random() * 2000;
    }
  }

  slapZone(zone) {
    if (this.state !== 'PLAYING' || !zone) return;
    const sx = zone.x * this.width;
    const sy = zone.y * this.height;
    this.showSlap(sx, sy);
    const d = distance(this.player.x, this.player.y, sx, sy);
    if (d < zone.r * this.width + this.player.radius) {
      this.lose('scratch', '人类睡梦中一巴掌把你拍扁了。');
    }
  }

  showSlap(x, y) {
    this.slapEl.style.left = `${x}px`;
    this.slapEl.style.top = `${y}px`;
    this.slapEl.classList.remove('hidden');
    setTimeout(() => this.slapEl.classList.add('hidden'), 360);
  }

  updateRacket(dt) {
    this.racket.cycle += dt * 1000;
    const total = this.racket.onDuration + this.racket.offDuration;
    const phase = this.racket.cycle % total;
    const wasPowered = this.racket.powered;
    this.racket.powered = phase < this.racket.onDuration;
    if (this.racket.powered !== wasPowered) {
      this.racketEl.classList.toggle('powered', this.racket.powered);
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    const maxSpeed = 220 * (1 - this.bloodFullness * 0.004);
    const accel = 520;
    const friction = 0.92;

    if (this.pointer.active && this.stamina > 0) {
      const dx = this.pointer.x - p.x;
      const dy = this.pointer.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 5) {
        const ax = (dx / d) * accel;
        const ay = (dy / d) * accel;
        p.vx += ax * dt;
        p.vy += ay * dt;
      }
      this.stamina = clamp(this.stamina - 6 * dt, 0, 100);
    }

    const speed = Math.hypot(p.vx, p.vy);
    if (speed > maxSpeed) {
      p.vx = (p.vx / speed) * maxSpeed;
      p.vy = (p.vy / speed) * maxSpeed;
    }

    p.vx *= friction;
    p.vy *= friction;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const margin = 30;
    p.x = clamp(p.x, margin, this.width - margin);
    p.y = clamp(p.y, margin, this.height - margin);

    if (speed > 5) {
      p.angle = Math.atan2(p.vy, p.vx) * (180 / Math.PI);
    }

    if (this.stamina <= 0) {
      this.lose('exhausted', '你飞不动了，累死在墙上。');
      return;
    }

    this.bloodFullness = clamp(this.bloodFullness - 2 * dt, 0, 100);
  }

  updateSucking(dt) {
    const p = this.player;
    if (p.isSucking) {
      if (!this.pointer.active || this.stamina <= 0) {
        p.isSucking = false;
        p.suckZone = null;
        return;
      }
    }

    let inZone = null;
    for (const z of this.zones) {
      if (!z.enabled) continue;
      const zx = z.x * this.width;
      const zy = z.y * this.height;
      const zr = z.r * this.width;
      if (distance(p.x, p.y, zx, zy) < zr) {
        inZone = z;
        break;
      }
    }

    if (inZone && this.pointer.active && this.bloodFullness < 100) {
      if (!p.isSucking) {
        p.isSucking = true;
        p.suckZone = inZone;
      }
      this.blood = clamp(this.blood + inZone.bloodRate * dt, 0, this.targetBlood);
      this.bloodFullness = clamp(this.bloodFullness + 12 * dt, 0, 100);
      this.alert = clamp(this.alert + inZone.alertRate * dt, 0, 100);
      this.stamina = clamp(this.stamina - 1.5 * dt, 0, 100);
    } else {
      p.isSucking = false;
      p.suckZone = null;
    }
  }

  updateHazards(dt) {
    const p = this.player;

    const rx = this.racket.x * this.width;
    const ry = this.racket.y * this.height;
    const rw = this.racket.w * this.width;
    const rh = this.racket.h * this.height;
    if (this.racket.powered &&
        p.x > rx - rw / 2 && p.x < rx + rw / 2 &&
        p.y > ry && p.y < ry + rh) {
      this.lose('racket', '你一头撞上了通电的电蚊拍。');
      return;
    }

    const cx = this.coil.x * this.width;
    const cy = this.coil.y * this.height;
    const cr = this.coil.r * Math.min(this.width, this.height);
    if (distance(p.x, p.y, cx, cy) < cr) {
      this.stamina = clamp(this.stamina - 18 * dt, 0, 100);
      this.alert = clamp(this.alert + 3 * dt, 0, 100);
    }
  }

  updateWaters(dt) {
    const p = this.player;
    for (const w of this.waters) {
      if (!w.active) continue;
      const wx = w.x * this.width;
      const wy = w.y * this.height;
      const wr = w.r * Math.min(this.width, this.height);
      if (distance(p.x, p.y, wx, wy) < wr + p.radius) {
        this.stamina = clamp(this.stamina + 35, 0, 100);
        this.bloodFullness = clamp(this.bloodFullness - 30, 0, 100);
        w.active = false;
        w.el.style.opacity = '0.2';
        setTimeout(() => {
          w.active = true;
          w.el.style.opacity = '1';
        }, 5000);
      }
    }
  }

  updateAlert(dt) {
    const p = this.player;
    const head = this.zones.find(z => z.ear);
    const hx = head.x * this.width;
    const hy = head.y * this.height;
    const dToEar = distance(p.x, p.y, hx, hy);
    const earRange = Math.max(this.width, this.height) * 0.22;

    let alertGain = 0;
    if (dToEar < earRange) {
      const proximity = 1 - clamp(dToEar / earRange, 0, 1);
      alertGain += proximity * 6 * dt;
    }

    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 80) {
      alertGain += (speed - 80) / 400 * dt;
    }

    if (this.sleep.snoring) {
      alertGain *= 1.6;
    }

    this.alert = clamp(this.alert + alertGain - 5 * dt, 0, 100);

    if (this.alert >= 100) {
      this.sleep.state = 'normal';
      this.showSlap(p.x, p.y);
      setTimeout(() => {
        if (this.state === 'PLAYING') {
          this.lose('awake', '人类被你吵醒了，一巴掌送你归西。');
        }
      }, 350);
    }
  }

  render() {
    const p = this.player;
    this.playerEl.style.left = `${p.x}px`;
    this.playerEl.style.top = `${p.y}px`;
    this.playerEl.style.transform = `translate(-50%, -50%) rotate(${p.angle + 90}deg)`;
    this.playerEl.classList.toggle('sucking', p.isSucking);
    this.playerEl.classList.toggle('exhausted', this.stamina < 25);

    this.bloodFill.style.width = `${(this.blood / this.targetBlood) * 100}%`;
    this.staminaFill.style.width = `${this.stamina}%`;
    this.alertFill.style.width = `${this.alert}%`;

    if (p.isSucking && p.suckZone) {
      this.hintEl.textContent = '吸血中…';
      this.hintEl.style.left = `${p.x}px`;
      this.hintEl.style.top = `${p.y - 36}px`;
      this.hintEl.classList.remove('hidden');
    } else if (p.suckZone && this.pointer.active && this.bloodFullness >= 100) {
      this.hintEl.textContent = '喝口水再战';
      this.hintEl.style.left = `${p.x}px`;
      this.hintEl.style.top = `${p.y - 36}px`;
      this.hintEl.classList.remove('hidden');
    } else if (p.suckZone && !this.pointer.active) {
      this.hintEl.textContent = '按住吸血';
      this.hintEl.style.left = `${p.x}px`;
      this.hintEl.style.top = `${p.y - 36}px`;
      this.hintEl.classList.remove('hidden');
    } else {
      this.hintEl.classList.add('hidden');
    }

    if (Math.random() < 0.015 + (this.sleep.snoring ? 0.03 : 0)) {
      this.spawnZzz();
    }
  }

  spawnZzz() {
    const head = this.zones.find(z => z.ear);
    const z = document.createElement('span');
    z.className = 'zzz';
    z.textContent = 'z';
    const baseX = head.x * this.width + (Math.random() - 0.5) * 40;
    const baseY = head.y * this.height - 40 + (Math.random() - 0.5) * 20;
    z.style.left = `${baseX}px`;
    z.style.top = `${baseY}px`;
    z.style.fontSize = `${1 + Math.random()}rem`;
    this.zzzEl.appendChild(z);
    setTimeout(() => z.remove(), 2600);
  }

  win() {
    this.state = 'WON';
    if (this.audioCtx) {
      this.buzzGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.1);
      this.snoreGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.1);
    }
    this.hud.classList.add('hidden');
    this.overlayWin.classList.remove('hidden');
  }

  lose(type, reason) {
    this.state = 'LOST';
    if (this.audioCtx) {
      this.buzzGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.1);
      this.snoreGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.1);
    }
    this.loseTitle.textContent = type === 'awake' ? '被拍死了…' : type === 'racket' ? '触电身亡' : type === 'exhausted' ? '累死了…' : '拍扁了…';
    this.loseReason.textContent = reason;
    this.hud.classList.add('hidden');
    this.overlayLose.classList.remove('hidden');
  }
}

new MosquitoRevenge();
