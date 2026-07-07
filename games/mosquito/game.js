import { ensureRoughFilter, SimpleNoise, distance, clamp } from '../../shared/hand-drawn.js';

ensureRoughFilter();

class MosquitoGame {
  constructor() {
    this.state = 'START';
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.mosquitoEl = document.getElementById('mosquito');
    this.hud = document.getElementById('hud');
    this.bloodFill = document.getElementById('blood-fill');
    this.lightBtn = document.getElementById('light-btn');
    this.lightCountEl = document.getElementById('light-count');
    this.biteMarksEl = document.getElementById('bite-marks');

    this.overlayStart = document.getElementById('overlay-start');
    this.overlayWin = document.getElementById('overlay-win');
    this.overlayLose = document.getElementById('overlay-lose');

    this.maxBlood = 6;
    this.blood = this.maxBlood;
    this.lightUses = 3;
    this.lightCooldown = 0;
    this.lightDuration = 1800;
    this.biteInterval = 4200;
    this.biteTimer = 0;
    this.lastTime = 0;

    this.hitRadius = 50;
    this.mosquito = {
      x: this.width * 0.5,
      y: this.height * 0.5,
      vx: 0,
      vy: 0,
      angle: 0,
      noiseOffset: Math.random() * 1000,
      speed: 140,
    };
    this.noise = new SimpleNoise();

    this.audioCtx = null;
    this.buzzOsc = null;
    this.buzzGain = null;
    this.panner = null;
    this.tremolo = null;
    this.tremoloGain = null;

    this.bindEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  bindEvents() {
    document.getElementById('start-btn').addEventListener('click', () => this.start());
    document.getElementById('restart-win').addEventListener('click', () => this.reset());
    document.getElementById('restart-lose').addEventListener('click', () => this.reset());
    this.lightBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.useLight();
    });

    document.getElementById('game').addEventListener('pointerdown', (e) => {
      if (this.state !== 'PLAYING') return;
      this.clap(e.clientX, e.clientY);
    });
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    if (this.audioCtx && this.panner) {
      this.audioCtx.listener.positionX.value = this.width / 2;
      this.audioCtx.listener.positionY.value = this.height / 2;
      this.audioCtx.listener.positionZ.value = 0;
    }
  }

  initAudio() {
    if (this.audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContext();

    this.panner = this.audioCtx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 200;
    this.panner.maxDistance = 1200;
    this.panner.rolloffFactor = 1.2;
    this.panner.coneInnerAngle = 360;
    this.panner.coneOuterAngle = 360;
    this.panner.coneOuterGain = 0;
    this.panner.positionZ.value = 0;

    this.buzzOsc = this.audioCtx.createOscillator();
    this.buzzOsc.type = 'sawtooth';
    this.buzzOsc.frequency.value = 145;

    this.tremolo = this.audioCtx.createOscillator();
    this.tremolo.type = 'sine';
    this.tremolo.frequency.value = 28;
    this.tremoloGain = this.audioCtx.createGain();
    this.tremoloGain.gain.value = 80;

    this.buzzGain = this.audioCtx.createGain();
    this.buzzGain.gain.value = 0.0001;

    this.tremolo.connect(this.tremoloGain);
    this.tremoloGain.connect(this.buzzOsc.frequency);
    this.buzzOsc.connect(this.buzzGain);
    this.buzzGain.connect(this.panner);
    this.panner.connect(this.audioCtx.destination);

    this.buzzOsc.start();
    this.tremolo.start();
    this.resize();
  }

  updateBuzzSound() {
    if (!this.audioCtx || this.state !== 'PLAYING') return;
    this.panner.positionX.value = this.mosquito.x;
    this.panner.positionY.value = this.mosquito.y;

    const d = distance(this.mosquito.x, this.mosquito.y, this.width / 2, this.height / 2);
    const maxD = Math.max(this.width, this.height) * 0.6;
    const baseVol = 0.12 + 0.18 * (1 - clamp(d / maxD, 0, 1));
    const now = this.audioCtx.currentTime;
    this.buzzGain.gain.setTargetAtTime(baseVol, now, 0.05);

    const speedRatio = Math.hypot(this.mosquito.vx, this.mosquito.vy) / this.mosquito.speed;
    this.buzzOsc.frequency.setTargetAtTime(130 + speedRatio * 60, now, 0.1);
  }

  start() {
    this.initAudio();
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

    this.state = 'PLAYING';
    this.overlayStart.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.resetMosquito();

    this.blood = this.maxBlood;
    this.lightUses = 3;
    this.lightCooldown = 0;
    this.biteTimer = 0;
    this.biteMarksEl.innerHTML = '';
    this.updateHud();

    this.lastTime = performance.now();
    this.loopId = requestAnimationFrame((t) => this.loop(t));
  }

  reset() {
    this.state = 'START';
    this.overlayWin.classList.add('hidden');
    this.overlayLose.classList.add('hidden');
    this.overlayStart.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.mosquitoEl.classList.remove('lit');
    if (this.loopId) cancelAnimationFrame(this.loopId);
    if (this.audioCtx) {
      this.buzzGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.1);
    }
  }

  resetMosquito() {
    const margin = 80;
    this.mosquito.x = margin + Math.random() * (this.width - margin * 2);
    this.mosquito.y = margin + Math.random() * (this.height - margin * 2);
    this.mosquito.noiseOffset += 1000;
  }

  loop(now) {
    if (this.state !== 'PLAYING') return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.updateMosquito(dt, now / 1000);
    this.updateBite(dt);
    this.updateLight(dt);
    this.updateBuzzSound();

    this.loopId = requestAnimationFrame((t) => this.loop(t));
  }

  updateMosquito(dt, time) {
    const m = this.mosquito;
    const margin = 60;
    const nx = this.noise.noise2D(time * 0.4, m.noiseOffset);
    const ny = this.noise.noise2D(time * 0.4, m.noiseOffset + 100);

    const targetVx = nx * m.speed;
    const targetVy = ny * m.speed;
    m.vx += (targetVx - m.vx) * 3 * dt;
    m.vy += (targetVy - m.vy) * 3 * dt;

    m.x += m.vx * dt;
    m.y += m.vy * dt;

    if (m.x < margin) { m.x = margin; m.vx *= -0.7; }
    if (m.x > this.width - margin) { m.x = this.width - margin; m.vx *= -0.7; }
    if (m.y < margin) { m.y = margin; m.vy *= -0.7; }
    if (m.y > this.height - margin) { m.y = this.height - margin; m.vy *= -0.7; }

    m.angle = Math.atan2(m.vy, m.vx) * (180 / Math.PI);

    this.mosquitoEl.style.left = `${m.x}px`;
    this.mosquitoEl.style.top = `${m.y}px`;
    this.mosquitoEl.style.transform = `translate(-50%, -50%) rotate(${m.angle + 90}deg)`;
  }

  updateBite(dt) {
    this.biteTimer += dt * 1000;
    if (this.biteTimer >= this.biteInterval) {
      this.biteTimer = 0;
      this.bite();
    }
  }

  bite() {
    this.blood -= 1;
    this.updateHud();

    const mark = document.createElement('img');
    mark.src = '../../assets/mosquito/bite-mark.svg';
    mark.className = 'bite-mark';
    const x = Math.random() * (this.width - 80) + 40;
    const y = Math.random() * (this.height - 80) + 40;
    mark.style.left = `${x}px`;
    mark.style.top = `${y}px`;
    this.biteMarksEl.appendChild(mark);

    if (this.blood <= 0) {
      this.lose();
    }
  }

  updateLight(dt) {
    if (this.lightCooldown > 0) {
      this.lightCooldown -= dt * 1000;
      if (this.lightCooldown <= 0) {
        this.lightCooldown = 0;
        this.lightBtn.classList.remove('cooling');
        this.lightBtn.disabled = false;
      }
    }
  }

  useLight() {
    if (this.lightUses <= 0 || this.lightCooldown > 0 || this.state !== 'PLAYING') return;
    this.lightUses -= 1;
    this.lightCooldown = 8000;
    this.lightBtn.classList.add('cooling');
    this.lightBtn.disabled = true;
    this.updateHud();

    this.mosquitoEl.classList.add('lit');
    setTimeout(() => {
      this.mosquitoEl.classList.remove('lit');
    }, this.lightDuration);
  }

  clap(x, y) {
    const clap = document.createElement('div');
    clap.className = 'clap';
    clap.style.left = `${x}px`;
    clap.style.top = `${y}px`;
    clap.innerHTML = '<img src="../../assets/mosquito/hands.svg" alt="" draggable="false" />';
    document.getElementById('game').appendChild(clap);
    setTimeout(() => clap.remove(), 350);

    const d = distance(x, y, this.mosquito.x, this.mosquito.y);
    if (d <= this.hitRadius) {
      this.win();
    }
  }

  updateHud() {
    this.bloodFill.style.width = `${(this.blood / this.maxBlood) * 100}%`;
    this.lightCountEl.textContent = `(${this.lightUses})`;
    if (this.lightUses <= 0) {
      this.lightBtn.disabled = true;
      this.lightBtn.classList.add('cooling');
    }
  }

  win() {
    this.state = 'WON';
    this.mosquitoEl.classList.add('lit');
    if (this.audioCtx) {
      this.buzzGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.1);
    }
    setTimeout(() => {
      this.overlayWin.classList.remove('hidden');
      this.hud.classList.add('hidden');
    }, 600);
  }

  lose() {
    this.state = 'LOST';
    if (this.audioCtx) {
      this.buzzGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.1);
    }
    this.overlayLose.classList.remove('hidden');
    this.hud.classList.add('hidden');
  }
}

new MosquitoGame();
