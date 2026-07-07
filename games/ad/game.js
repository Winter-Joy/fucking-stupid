import { ensureRoughFilter, clamp } from '../../shared/hand-drawn.js';

ensureRoughFilter();

class AdGame {
  constructor() {
    this.state = 'START';
    this.maxLevel = 6;
    this.level = 1;
    this.fakeClicks = 0;
    this.fakeLimit = 3;
    this.timeLeft = 20;
    this.timerId = null;
    this.loopId = null;
    this.lastTime = 0;
    this.evadeHandler = null;

    this.gameEl = document.getElementById('game');
    this.stage = document.getElementById('ad-stage');
    this.hud = document.getElementById('hud');
    this.levelNum = document.getElementById('level-num');
    this.fakeNum = document.getElementById('fake-num');
    this.fakeLimitEl = document.getElementById('fake-limit');
    this.timerEl = document.getElementById('timer');

    this.overlayStart = document.getElementById('overlay-start');
    this.overlayWin = document.getElementById('overlay-win');
    this.overlayLose = document.getElementById('overlay-lose');
    this.loseTitle = document.getElementById('lose-title');
    this.loseReason = document.getElementById('lose-reason');

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.bindEvents();
    window.addEventListener('resize', () => this.resize());
  }

  bindEvents() {
    document.getElementById('start-btn').addEventListener('click', () => this.start());
    document.getElementById('restart-win').addEventListener('click', () => this.reset());
    document.getElementById('restart-lose').addEventListener('click', () => this.reset());

    this.stage.addEventListener('click', (e) => this.handleStageClick(e));
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.close-btn, .fake-btn, .fake-close, .big-bait, .bait-btn, .sea-btn')) {
        e.stopPropagation();
      }
    });
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  start() {
    this.state = 'PLAYING';
    this.overlayStart.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.level = 1;
    this.loadLevel(1);
  }

  reset() {
    this.state = 'START';
    this.clearLevel();
    this.overlayWin.classList.add('hidden');
    this.overlayLose.classList.add('hidden');
    this.overlayStart.classList.remove('hidden');
    this.hud.classList.add('hidden');
    if (this.timerId) clearInterval(this.timerId);
    if (this.loopId) cancelAnimationFrame(this.loopId);
  }

  clearLevel() {
    this.stage.innerHTML = '';
    if (this.evadeHandler) {
      this.stage.removeEventListener('pointermove', this.evadeHandler);
      this.evadeHandler = null;
    }
  }

  loadLevel(n) {
    this.clearLevel();
    this.level = n;
    this.fakeClicks = 0;
    this.timeLeft = this.getLevelTime(n);
    this.fakeLimit = this.getFakeLimit(n);
    this.updateHud();

    const setupFn = this[`setupLevel${n}`];
    if (setupFn) setupFn.call(this);

    this.startTimer();
  }

  getLevelTime(n) {
    return [20, 20, 18, 22, 30, 35][n - 1] || 20;
  }

  getFakeLimit(n) {
    return [3, 3, 4, 5, 10, 6][n - 1] || 3;
  }

  startTimer() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => {
      if (this.state !== 'PLAYING') return;
      this.timeLeft -= 1;
      this.updateHud();
      if (this.timeLeft <= 0) {
        this.lose('timeout', '时间耗尽，广告永远关不掉了。');
      }
    }, 1000);
  }

  updateHud() {
    this.levelNum.textContent = this.level;
    this.fakeNum.textContent = this.fakeClicks;
    this.fakeLimitEl.textContent = this.fakeLimit;
    this.timerEl.textContent = this.timeLeft;

    const timerItem = this.timerEl.parentElement;
    if (this.timeLeft <= 5) timerItem.classList.add('danger');
    else timerItem.classList.remove('danger');
  }

  handleStageClick(e) {
    if (this.state !== 'PLAYING') return;
    const target = e.target;

    if (target.closest('.close-btn')) {
      this.nextLevel();
      return;
    }

    if (target.closest('.fake-btn, .fake-close, .big-bait, .bait-btn, .sea-btn')) {
      this.fakeClicks += 1;
      this.updateHud();
      this.shakeStage();
      if (this.fakeClicks >= this.fakeLimit) {
        this.lose('fake', '你点错了太多假按钮。');
      }
    }
  }

  shakeStage() {
    this.stage.style.transform = `translate(${(Math.random()-0.5)*8}px, ${(Math.random()-0.5)*8}px)`;
    setTimeout(() => this.stage.style.transform = '', 120);
  }

  nextLevel() {
    if (this.timerId) clearInterval(this.timerId);
    if (this.level >= this.maxLevel) {
      this.win();
      return;
    }
    this.loadLevel(this.level + 1);
  }

  win() {
    this.state = 'WON';
    if (this.timerId) clearInterval(this.timerId);
    this.hud.classList.add('hidden');
    this.overlayWin.classList.remove('hidden');
  }

  lose(type, reason) {
    this.state = 'LOST';
    if (this.timerId) clearInterval(this.timerId);
    this.loseTitle.textContent = type === 'timeout' ? '超时失败' : '被广告骗了';
    this.loseReason.textContent = reason;
    this.hud.classList.add('hidden');
    this.overlayLose.classList.remove('hidden');
  }

  createModal(htmlContent) {
    const modal = document.createElement('div');
    modal.className = 'ad-modal';
    modal.innerHTML = htmlContent;
    return modal;
  }

  addCloseBtn(parent, opts = {}) {
    const btn = document.createElement('button');
    btn.className = 'close-btn';
    btn.textContent = opts.text || '✕';
    btn.setAttribute('aria-label', '关闭');
    if (opts.size) {
      btn.style.width = opts.size;
      btn.style.height = opts.size;
      btn.style.fontSize = opts.fontSize || '1.2rem';
    }
    if (opts.opacity !== undefined) btn.style.opacity = opts.opacity;
    if (opts.top !== undefined) btn.style.top = opts.top;
    if (opts.right !== undefined) btn.style.right = opts.right;
    if (opts.bg) btn.style.background = opts.bg;
    if (opts.color) btn.style.color = opts.color;
    parent.appendChild(btn);
    return btn;
  }

  // Level 1: tiny translucent close next to big bait
  setupLevel1() {
    const modal = this.createModal(`
      <h2>🎉 恭喜你中奖了！</h2>
      <span class="ad-emoji">💰</span>
      <p>只要点击下面这个按钮，就能获得<br><strong>1000 万虚拟货币</strong></p>
      <div class="big-bait">立即领取</div>
      <p style="font-size:0.85rem; color:#636e72;">* 实际不会获得任何东西</p>
    `);
    this.stage.appendChild(modal);
    this.addCloseBtn(modal, { size: '28px', fontSize: '0.9rem', opacity: 0.35, top: '-10px', right: '-10px', bg: '#b2bec3' });
  }

  // Level 2: disguised close among fake buttons
  setupLevel2() {
    const modal = this.createModal(`
      <h2>📱 你的手机有 99 个病毒！</h2>
      <span class="ad-emoji">🦠</span>
      <p>请立即清理，否则手机将在 10 秒后爆炸。</p>
      <div class="bait-row">
        <button class="bait-btn primary">立即清理</button>
        <button class="bait-btn">下载杀毒大师</button>
        <button class="bait-btn">查看详情</button>
      </div>
      <p style="font-size:0.85rem; color:#636e72;">请选择正确的操作</p>
    `);
    this.stage.appendChild(modal);

    const real = this.addCloseBtn(modal, { text: '稍后处理', bg: '#dfe6e9', color: '#2d3436', size: 'auto' });
    real.style.position = 'static';
    real.style.display = 'inline-block';
    real.style.padding = '0.5rem 1rem';
    real.style.borderRadius = '255px 15px 225px 15px / 15px 225px 15px 255px';
    real.style.marginTop = '0.8rem';
    real.classList.add('bait-btn');

    const row = modal.querySelector('.bait-row');
    const fakes = row.querySelectorAll('.bait-btn');
    fakes.forEach(f => {
      f.classList.remove('bait-btn');
      f.classList.add('fake-btn');
      f.style.position = 'static';
    });
  }

  // Level 3: running away button
  setupLevel3() {
    const modal = this.createModal(`
      <h2>🏃 来抓我呀</h2>
      <span class="ad-emoji">😜</span>
      <p>真正的关闭按钮会逃跑。</p>
      <p style="font-size:0.85rem; color:#636e72;">试试你的反应速度。</p>
    `);
    this.stage.appendChild(modal);

    const btn = this.addCloseBtn(modal, { size: '50px', fontSize: '1.8rem', bg: '#00b894' });
    btn.style.transition = 'transform 0.08s ease';

    const radius = 140;
    this.evadeHandler = (e) => {
      if (this.state !== 'PLAYING') return;
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const d = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (d < radius) {
        const parentRect = modal.getBoundingClientRect();
        const maxX = parentRect.width - 70;
        const maxY = parentRect.height - 70;
        const nx = 10 + Math.random() * maxX;
        const ny = 10 + Math.random() * maxY;
        btn.style.left = `${nx}px`;
        btn.style.top = `${ny}px`;
        btn.style.right = 'auto';
      }
    };
    this.stage.addEventListener('pointermove', this.evadeHandler);
  }

  // Level 4: countdown kidnapping
  setupLevel4() {
    const modal = this.createModal(`
      <h2>⏳ 精彩视频即将播放</h2>
      <span class="ad-emoji">🎬</span>
      <p>广告倒计时结束后才能关闭。</p>
      <div class="countdown-box" id="countdown">5</div>
      <div class="bait-row" id="bait-row"></div>
    `);
    this.stage.appendChild(modal);

    const countdownEl = modal.querySelector('#countdown');
    const baitRow = modal.querySelector('#bait-row');
    let remaining = 5;

    const interval = setInterval(() => {
      if (this.state !== 'PLAYING') {
        clearInterval(interval);
        return;
      }
      remaining -= 1;
      countdownEl.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(interval);
        countdownEl.textContent = '可以关闭了！';
        countdownEl.style.color = '#00b894';
        this.addCloseBtn(modal, { size: '46px', fontSize: '1.6rem', bg: '#00b894' });
      }
    }, 1000);

    const baits = ['跳过广告', 'VIP 跳过', '双倍奖励'];
    baits.forEach(text => {
      const b = document.createElement('button');
      b.className = 'bait-btn';
      b.textContent = text;
      baitRow.appendChild(b);
    });
  }

  // Level 5: sea of buttons
  setupLevel5() {
    const wrap = document.createElement('div');
    wrap.className = 'sea-wrap';
    this.stage.appendChild(wrap);

    const count = 42;
    const realIndex = Math.floor(Math.random() * count);
    const size = 38;
    const margin = 24;

    for (let i = 0; i < count; i++) {
      const btn = document.createElement('button');
      btn.className = 'sea-btn';
      if (i === realIndex) btn.classList.add('real', 'close-btn');
      else btn.classList.add('fake-btn');
      btn.textContent = '✕';

      const x = margin + Math.random() * (this.width - size - margin * 2);
      const y = margin + Math.random() * (this.height - size - margin * 2);
      btn.style.left = `${x}px`;
      btn.style.top = `${y}px`;
      btn.style.transform = `rotate(${Math.random() * 360}deg)`;
      wrap.appendChild(btn);
    }
  }

  // Level 6: nested modals
  setupLevel6() {
    const nestCount = 4;
    const modals = [];
    const positions = [
      { x: '50%', y: '50%' },
      { x: '46%', y: '48%' },
      { x: '54%', y: '52%' },
      { x: '50%', y: '50%' },
    ];

    for (let i = 0; i < nestCount; i++) {
      const m = document.createElement('div');
      m.className = 'fake-modal';
      m.style.left = positions[i].x;
      m.style.top = positions[i].y;
      m.style.transform = 'translate(-50%, -50%)';
      m.style.zIndex = 12 + i;
      m.innerHTML = `
        <h3>${['系统警告', '内存不足', '更新提醒', '最终弹窗'][i]}</h3>
        <p>${['你的电脑很热', '请关闭 10 个程序', '新版本更好', '找到真正的 ✕'][i]}</p>
      `;

      const fakeClose = document.createElement('button');
      fakeClose.className = 'fake-close';
      fakeClose.textContent = '✕';
      fakeClose.dataset.index = i;
      m.appendChild(fakeClose);
      this.stage.appendChild(m);
      modals.push(m);
    }

    const innermost = modals[modals.length - 1];
    innermost.innerHTML = `
      <h3>恭喜抵达最后一层</h3>
      <p>这次是真的关闭按钮。</p>
    `;
    this.addCloseBtn(innermost, { size: '50px', fontSize: '1.8rem', bg: '#00b894' });

    this.stage.querySelectorAll('.fake-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        modals[idx].remove();
        this.fakeClicks += 1;
        this.updateHud();
        if (this.fakeClicks >= this.fakeLimit) {
          this.lose('fake', '你把所有假弹窗都点完了，还是没找到出口。');
        }
      });
    });
  }
}

new AdGame();
