import { ensureRoughFilter } from '../../shared/hand-drawn.js';

ensureRoughFilter();

const LEVELS = [
  {
    grid: 3,
    target: 'traffic-light',
    targetName: '红绿灯',
    targetCount: 2,
    distractors: ['car'],
    time: 20,
    wrongLimit: 3,
    effects: [],
  },
  {
    grid: 4,
    target: 'bicycle',
    targetName: '自行车',
    targetCount: 3,
    distractors: ['motorcycle'],
    time: 25,
    wrongLimit: 3,
    effects: [],
  },
  {
    grid: 3,
    target: 'crosswalk',
    targetName: '人行横道',
    targetCount: 2,
    distractors: ['stairs'],
    time: 18,
    wrongLimit: 2,
    effects: ['inked'],
  },
  {
    grid: 4,
    target: 'bus',
    targetName: '公交车',
    targetCount: 4,
    distractors: ['car', 'motorcycle'],
    time: 28,
    wrongLimit: 3,
    effects: ['blur'],
  },
  {
    grid: 5,
    target: 'fire-hydrant',
    targetName: '消防栓',
    targetCount: 5,
    distractors: ['traffic-light', 'motorcycle'],
    time: 35,
    wrongLimit: 2,
    effects: ['rotate'],
  },
  {
    grid: 4,
    target: 'bicycle',
    targetName: '自行车',
    targetCount: 0,
    distractors: ['car', 'motorcycle', 'bus'],
    time: 25,
    wrongLimit: 2,
    effects: ['shake', 'blur', 'inked'],
    reverse: true,
    reverseName: '自行车',
  },
];

class CaptchaGame {
  constructor() {
    this.state = 'START';

    this.gameEl = document.getElementById('game');
    this.stage = document.getElementById('captcha-stage');
    this.card = document.getElementById('captcha-card');
    this.prompt = document.getElementById('prompt');
    this.gridEl = document.getElementById('grid');
    this.verifyBtn = document.getElementById('verify-btn');

    this.hud = document.getElementById('hud');
    this.levelNum = document.getElementById('level-num');
    this.wrongNum = document.getElementById('wrong-num');
    this.wrongLimitEl = document.getElementById('wrong-limit');
    this.timerEl = document.getElementById('timer');

    this.overlayStart = document.getElementById('overlay-start');
    this.overlayWin = document.getElementById('overlay-win');
    this.overlayLose = document.getElementById('overlay-lose');
    this.loseTitle = document.getElementById('lose-title');
    this.loseReason = document.getElementById('lose-reason');

    this.levelIndex = 0;
    this.wrongCount = 0;
    this.timeLeft = 0;
    this.timerId = null;
    this.selected = new Set();
    this.targetCells = new Set();

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('start-btn').addEventListener('click', () => this.start());
    document.getElementById('restart-win').addEventListener('click', () => this.reset());
    document.getElementById('restart-lose').addEventListener('click', () => this.reset());

    this.verifyBtn.addEventListener('click', () => this.verify());

    this.gridEl.addEventListener('click', (e) => {
      if (this.state !== 'PLAYING') return;
      const cell = e.target.closest('.cell');
      if (!cell) return;
      this.toggleCell(parseInt(cell.dataset.index, 10));
    });
  }

  start() {
    this.state = 'PLAYING';
    this.overlayStart.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.levelIndex = 0;
    this.loadLevel(0);
  }

  reset() {
    this.state = 'START';
    this.overlayWin.classList.add('hidden');
    this.overlayLose.classList.add('hidden');
    this.overlayStart.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.stopTimer();
    this.clearGrid();
  }

  clearGrid() {
    this.gridEl.innerHTML = '';
    this.gridEl.className = 'grid';
    this.selected.clear();
    this.targetCells.clear();
  }

  loadLevel(index) {
    this.levelIndex = index;
    this.wrongCount = 0;
    this.selected.clear();
    this.targetCells.clear();

    const cfg = LEVELS[index];
    this.timeLeft = cfg.time;

    this.updateHud();
    this.renderGrid(cfg);
    this.startTimer();
  }

  renderGrid(cfg) {
    this.clearGrid();
    this.gridEl.style.gridTemplateColumns = `repeat(${cfg.grid}, 1fr)`;

    const total = cfg.grid * cfg.grid;
    const indices = Array.from({ length: total }, (_, i) => i);

    // Shuffle indices and pick target cells
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const actualTargetCount = cfg.reverse
      ? Math.max(3, Math.floor(total * 0.45))
      : cfg.targetCount;

    const targetIndices = new Set(indices.slice(0, actualTargetCount));
    targetIndices.forEach(i => this.targetCells.add(i));

    for (let i = 0; i < total; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;

      const isTarget = targetIndices.has(i);
      let imgSrc;
      if (cfg.reverse) {
        imgSrc = isTarget
          ? null
          : `../../assets/captcha/${this.pickDistractor(cfg.distractors)}.svg`;
      } else {
        imgSrc = isTarget
          ? `../../assets/captcha/${cfg.target}.svg`
          : `../../assets/captcha/${this.pickDistractor(cfg.distractors)}.svg`;
      }

      if (imgSrc) {
        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = '';
        cell.appendChild(img);
      }

      cfg.effects.forEach(effect => cell.classList.add(effect));
      this.gridEl.appendChild(cell);
    }

    if (cfg.reverse) {
      this.prompt.innerHTML = `请点击所有 <strong>不包含 ${cfg.reverseName}</strong> 的方块`;
    } else {
      this.prompt.innerHTML = `请点击所有包含 <strong>${cfg.targetName}</strong> 的方块`;
    }
  }

  pickDistractor(distractors) {
    return distractors[Math.floor(Math.random() * distractors.length)];
  }

  toggleCell(index) {
    const cell = this.gridEl.querySelector(`[data-index="${index}"]`);
    if (!cell) return;

    if (this.selected.has(index)) {
      this.selected.delete(index);
      cell.classList.remove('selected');
    } else {
      this.selected.add(index);
      cell.classList.add('selected');
    }
  }

  verify() {
    if (this.state !== 'PLAYING') return;

    // For reverse mode, targetCells are the empty cells; selected must match exactly.
    const correct = this.setsEqual(this.selected, this.targetCells);

    if (correct) {
      this.nextLevel();
    } else {
      this.handleWrong();
    }
  }

  setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) {
      if (!b.has(x)) return false;
    }
    return true;
  }

  handleWrong() {
    this.wrongCount += 1;
    this.updateHud();
    this.shakeGrid();

    if (this.wrongCount >= LEVELS[this.levelIndex].wrongLimit) {
      this.lose('wrong', '错误次数太多，系统觉得你在瞎点。');
    }
  }

  shakeGrid() {
    this.gridEl.style.transform = `translate(${(Math.random()-0.5)*10}px, ${(Math.random()-0.5)*10}px)`;
    setTimeout(() => {
      this.gridEl.style.transform = '';
    }, 200);

    this.gridEl.querySelectorAll('.cell').forEach(cell => {
      const idx = parseInt(cell.dataset.index, 10);
      const shouldBeSelected = this.targetCells.has(idx);
      const isSelected = this.selected.has(idx);
      if (shouldBeSelected !== isSelected) {
        cell.classList.add('wrong');
        setTimeout(() => cell.classList.remove('wrong'), 400);
      }
    });
  }

  nextLevel() {
    this.stopTimer();
    if (this.levelIndex >= LEVELS.length - 1) {
      this.win();
      return;
    }
    this.loadLevel(this.levelIndex + 1);
  }

  win() {
    this.state = 'WON';
    this.stopTimer();
    this.hud.classList.add('hidden');
    this.overlayWin.classList.remove('hidden');
  }

  lose(type, reason) {
    this.state = 'LOST';
    this.stopTimer();
    this.loseTitle.textContent = type === 'timeout' ? '超时失败' : '验证失败';
    this.loseReason.textContent = reason;
    this.hud.classList.add('hidden');
    this.overlayLose.classList.remove('hidden');
  }

  startTimer() {
    this.stopTimer();
    this.timerId = setInterval(() => {
      if (this.state !== 'PLAYING') return;
      this.timeLeft -= 1;
      this.updateHud();
      if (this.timeLeft <= 0) {
        this.lose('timeout', '时间耗尽，系统判定你不是人类。');
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  updateHud() {
    const cfg = LEVELS[this.levelIndex];
    this.levelNum.textContent = this.levelIndex + 1;
    this.wrongNum.textContent = this.wrongCount;
    this.wrongLimitEl.textContent = cfg.wrongLimit;
    this.timerEl.textContent = this.timeLeft;

    const timerItem = this.timerEl.parentElement;
    if (this.timeLeft <= 5) timerItem.classList.add('danger');
    else timerItem.classList.remove('danger');
  }
}

new CaptchaGame();
