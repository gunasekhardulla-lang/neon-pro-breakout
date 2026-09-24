/**
 * NEON BREAKOUT - Retro-Neon Arcade Game
 * Plain vanilla JavaScript with HTML5 Canvas & Web Audio API.
 * Zero external libraries or assets.
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. CONSTANTS & CONFIGURATION
  // ==========================================================================
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  const PADDLE_DEFAULT_WIDTH = 110;
  const PADDLE_WIDE_WIDTH = 165;
  const PADDLE_HEIGHT = 16;
  const PADDLE_Y = 550;
  const PADDLE_SPEED = 700; // px per second via keyboard

  const BALL_RADIUS = 7;
  const BALL_BASE_SPEED = 420;
  const BALL_SPEED_LEVEL_INCREMENT = 28;
  const BALL_MAX_SPEED = 660;

  const INITIAL_LIVES = 3;
  const MAX_LIVES = 5;

  const POWERUP_DROP_CHANCE = 0.22;
  const POWERUP_FALL_SPEED = 135;
  const POWERUP_WIDTH = 34;
  const POWERUP_HEIGHT = 20;

  // Power-up durations in seconds
  const POWERUP_DURATIONS = {
    wide: 12,
    slow: 10,
    lasers: 8,
    fireball: 7
  };

  const LASER_COOLDOWN = 0.24; // min seconds between shots
  const LASER_SPEED = 850;

  // Neon Color Palette
  const COLORS = {
    cyan: '#00f0ff',
    magenta: '#ff007f',
    purple: '#9d00ff',
    yellow: '#ffe600',
    green: '#00ff88',
    orange: '#ff6600',
    red: '#ff2255',
    white: '#ffffff',
    titanium: '#4a5568'
  };

  // Pentatonic frequency table for musical combo brick hits
  const COMBO_NOTES = [
    261.63, 293.66, 329.63, 392.00, 440.00, // C4, D4, E4, G4, A4
    523.25, 587.33, 659.25, 783.99, 880.00, // C5, D5, E5, G5, A5
    1046.50, 1174.66, 1318.51               // C6, D6, E6
  ];

  // ==========================================================================
  // 2. WEB AUDIO API SYNTHESIZER
  // ==========================================================================
  class SoundSynth {
    constructor() {
      this.ctx = null;
      this.isMuted = localStorage.getItem('neon_breakout_muted') === 'true';
      this.masterGain = null;
    }

    init() {
      if (this.ctx) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.45, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      } catch (e) {
        console.warn('Web Audio API not supported', e);
      }
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    setMuted(muted) {
      this.isMuted = muted;
      localStorage.setItem('neon_breakout_muted', muted ? 'true' : 'false');
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.45, this.ctx.currentTime, 0.03);
      }
    }

    // Short UI click
    playUi() {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.06);
    }

    // Paddle bounce with pitch based on hit position
    playPaddleBounce(offset) {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // offset is -1 to +1 -> base freq shifts between 360Hz and 560Hz
      const freq = 420 + Math.abs(offset) * 160;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.1);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.1);
    }

    // Wall bounce
    playWallBounce() {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.06);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.06);
    }

    // Brick hit chime with musical combo pitch
    playBrickHit(combo) {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const noteIdx = Math.min(combo, COMBO_NOTES.length - 1);
      const freq = COMBO_NOTES[noteIdx];

      const osc = this.ctx.createOscillator();
      const oscHarmonic = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      oscHarmonic.type = 'triangle';
      oscHarmonic.frequency.setValueAtTime(freq * 2, t);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      osc.connect(gain);
      oscHarmonic.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      oscHarmonic.start(t);
      osc.stop(t + 0.18);
      oscHarmonic.stop(t + 0.18);
    }

    // Brick destroyed explosion sound
    playBrickDestroy() {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;

      // Noise buffer for punchy impact
      const bufferSize = this.ctx.sampleRate * 0.12;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, t);
      filter.frequency.exponentialRampToValueAtTime(200, t + 0.12);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.12);
    }

    // Power-up caught: sparkling arpeggio
    playPowerUpCollect() {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = t + idx * 0.05;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.28, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(start);
        osc.stop(start + 0.12);
      });
    }

    // Laser fired
    playLaser() {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(280, t + 0.09);

      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.09);
    }

    // Losing a life
    playLifeLost() {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(380, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.4);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.4);
    }

    // Level Clear Fanfare
    playLevelClear() {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const chords = [
        { f: 523.25, d: 0.1 }, // C5
        { f: 659.25, d: 0.1 }, // E5
        { f: 783.99, d: 0.1 }, // G5
        { f: 1046.50, d: 0.35 } // C6
      ];

      let delay = 0;
      chords.forEach(c => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = t + delay;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(c.f, start);

        gain.gain.setValueAtTime(0.35, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + c.d);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(start);
        osc.stop(start + c.d);

        delay += 0.09;
      });
    }

    // Game Over
    playGameOver() {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const notes = [330, 311.13, 293.66, 220]; // E4, Eb4, D4, A3

      notes.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = t + idx * 0.16;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, start);

        gain.gain.setValueAtTime(0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(start);
        osc.stop(start + 0.25);
      });
    }

    // Countdown pip
    playCountdown(isFinal) {
      if (!this.ctx || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const freq = isFinal ? 1320 : 660;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (isFinal ? 0.25 : 0.1));

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + (isFinal ? 0.25 : 0.1));
    }
  }

  // ==========================================================================
  // 3. LEVEL DEFINITIONS
  // ==========================================================================
  // Level layout codes:
  // 0: Empty space
  // 1: Cyan (Normal 1-hit)
  // 2: Magenta (Normal 1-hit)
  // 3: Green (Normal 1-hit)
  // 4: Yellow (Normal 1-hit)
  // 5: Purple (Normal 1-hit)
  // R: Reinforced (2 hits)
  // A: Armored (3 hits)
  // E: Explosive (1 hit, destroys neighbors)
  // U: Unbreakable titanium obstacle
  const LEVELS = [
    // Level 1: "Neon Dawn" - Clean classical grid
    {
      name: "NEON DAWN",
      rows: 5,
      cols: 10,
      layout: [
        [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
        [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
        [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
        [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
      ]
    },
    // Level 2: "Synth Pyramid" - Stepped pyramid with explosive core & reinforced wings
    {
      name: "SYNTH PYRAMID",
      rows: 6,
      cols: 10,
      layout: [
        [0, 0, 0, 0, 'E', 'E', 0, 0, 0, 0],
        [0, 0, 0, 4, 4, 4, 4, 0, 0, 0],
        [0, 0, 2, 2, 'R', 'R', 2, 2, 0, 0],
        [0, 5, 5, 'R', 1, 1, 'R', 5, 5, 0],
        [3, 3, 3, 3, 'R', 'R', 3, 3, 3, 3],
        ['R', 1, 1, 1, 4, 4, 1, 1, 1, 'R']
      ]
    },
    // Level 3: "Twin Citadel" - Fortified towers with armored armor and explosive caches
    {
      name: "TWIN CITADEL",
      rows: 7,
      cols: 10,
      layout: [
        ['A', 'A', 0, 0, 0, 0, 0, 0, 'A', 'A'],
        ['A', 'R', 2, 0, 4, 4, 0, 2, 'R', 'A'],
        ['R', 'R', 2, 0, 'E', 'E', 0, 2, 'R', 'R'],
        [1, 1, 3, 3, 3, 3, 3, 3, 1, 1],
        [5, 'R', 0, 'R', 5, 5, 'R', 0, 'R', 5],
        [4, 4, 4, 4, 0, 0, 4, 4, 4, 4],
        [0, 'R', 1, 'R', 0, 0, 'R', 1, 'R', 0]
      ]
    },
    // Level 4: "Diamond Matrix" - Geometric matrix with indestructible titanium anchors
    {
      name: "DIAMOND MATRIX",
      rows: 7,
      cols: 10,
      layout: [
        [0, 0, 0, 0, 'A', 'A', 0, 0, 0, 0],
        [0, 0, 0, 2, 'R', 'R', 2, 0, 0, 0],
        [0, 0, 'U', 4, 'E', 'E', 4, 'U', 0, 0],
        [0, 1, 3, 'R', 5, 5, 'R', 3, 1, 0],
        [0, 0, 'U', 4, 'E', 'E', 4, 'U', 0, 0],
        [0, 0, 0, 2, 'R', 'R', 2, 0, 0, 0],
        [0, 0, 0, 0, 'A', 'A', 0, 0, 0, 0]
      ]
    },
    // Level 5: "The Neon Core" - Massive challenge with dense shielded rings
    {
      name: "THE NEON CORE",
      rows: 8,
      cols: 10,
      layout: [
        ['A', 'A', 'R', 'R', 'U', 'U', 'R', 'R', 'A', 'A'],
        ['A', 2, 2, 4, 4, 4, 4, 2, 2, 'A'],
        ['R', 5, 'E', 5, 'R', 'R', 5, 'E', 5, 'R'],
        ['R', 3, 3, 'A', 'E', 'E', 'A', 3, 3, 'R'],
        [1, 1, 4, 'A', 'U', 'U', 'A', 4, 1, 1],
        ['R', 2, 'E', 2, 'R', 'R', 2, 'E', 2, 'R'],
        ['A', 5, 5, 3, 3, 3, 3, 5, 5, 'A'],
        ['A', 'A', 'R', 'R', 1, 1, 'R', 'R', 'A', 'A']
      ]
    }
  ];

  // ==========================================================================
  // 4. MAIN GAME ENGINE
  // ==========================================================================
  class NeonBreakoutGame {
    constructor() {
      // Elements
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.container = document.querySelector('.canvas-container');

      // Screens & Overlays
      this.screenTitle = document.getElementById('screen-title');
      this.screenPause = document.getElementById('screen-pause');
      this.screenLevelClear = document.getElementById('screen-level-clear');
      this.screenGameOver = document.getElementById('screen-game-over');
      this.screenVictory = document.getElementById('screen-victory');
      this.countdownOverlay = document.getElementById('countdown-display');
      this.toastBanner = document.getElementById('toast-banner');

      // HUD elements
      this.hudScore = document.getElementById('hud-score');
      this.hudBest = document.getElementById('hud-best');
      this.hudLevel = document.getElementById('hud-level');
      this.hudLivesContainer = document.getElementById('hud-lives');
      this.hudActivePowerups = document.getElementById('active-powerups');
      this.btnAudioToggle = document.getElementById('btn-audio-toggle');
      this.btnPause = document.getElementById('btn-pause');

      // Audio Synthesizer
      this.audio = new SoundSynth();

      // Game States: 'TITLE', 'COUNTDOWN', 'PLAYING', 'PAUSED', 'LEVEL_CLEAR', 'GAME_OVER', 'VICTORY'
      this.state = 'TITLE';

      // Core Game Data
      this.score = 0;
      this.highScore = parseInt(localStorage.getItem('neon_breakout_highscore') || '0', 10);
      this.levelIndex = 0;
      this.lives = INITIAL_LIVES;
      this.comboCount = 0;
      this.bricksDestroyed = 0;

      // Entities
      this.paddle = {
        x: CANVAS_WIDTH / 2,
        y: PADDLE_Y,
        targetX: CANVAS_WIDTH / 2,
        width: PADDLE_DEFAULT_WIDTH,
        height: PADDLE_HEIGHT,
        baseWidth: PADDLE_DEFAULT_WIDTH,
        vx: 0,
        rippleTimer: 0
      };

      this.balls = [];
      this.bricks = [];
      this.powerups = [];
      this.lasers = [];
      this.particles = [];
      this.floatingTexts = [];
      this.bgStars = [];

      // Active timed power-ups
      this.activeTimers = {
        wide: 0,
        slow: 0,
        lasers: 0,
        fireball: 0
      };

      this.laserCooldownTimer = 0;

      // Input State
      this.keys = {
        left: false,
        right: false,
        space: false
      };
      this.pointerX = CANVAS_WIDTH / 2;
      this.isPointerControlling = false;

      // Screen shake
      this.screenShake = 0;

      // Timing
      this.lastTime = 0;
      this.countdownValue = 3;
      this.countdownTimer = 0;

      this.initBackgroundStars();
      this.setupEventListeners();
      this.resizeCanvas();
      this.updateHud();

      // Start main animation loop
      requestAnimationFrame(this.gameLoop.bind(this));
    }

    // ------------------------------------------------------------------------
    // Initialization & Background
    // ------------------------------------------------------------------------
    initBackgroundStars() {
      this.bgStars = [];
      for (let i = 0; i < 45; i++) {
        this.bgStars.push({
          x: Math.random() * CANVAS_WIDTH,
          y: Math.random() * CANVAS_HEIGHT,
          radius: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.7 + 0.2,
          speed: Math.random() * 12 + 4,
          color: Math.random() > 0.5 ? COLORS.cyan : COLORS.magenta
        });
      }
    }

    // ------------------------------------------------------------------------
    // Canvas & High-DPI Scaling
    // ------------------------------------------------------------------------
    resizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = CANVAS_WIDTH * dpr;
      this.canvas.height = CANVAS_HEIGHT * dpr;
      this.ctx.resetTransform();
      this.ctx.scale(dpr, dpr);
    }

    // Convert screen pointer coordinates to canvas 800x600 coordinates
    getCanvasCoord(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    // ------------------------------------------------------------------------
    // Event Listeners
    // ------------------------------------------------------------------------
    setupEventListeners() {
      window.addEventListener('resize', () => this.resizeCanvas());

      // Keyboard Controls
      window.addEventListener('keydown', (e) => {
        this.audio.init();

        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          this.keys.left = true;
          this.isPointerControlling = false;
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          this.keys.right = true;
          this.isPointerControlling = false;
        }
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (this.state === 'TITLE') {
            this.startNewGame();
          } else if (this.state === 'GAME_OVER') {
            this.startNewGame();
          } else if (this.state === 'VICTORY') {
            this.startNewGame();
          } else {
            this.handleActionTrigger();
          }
        }
        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
          e.preventDefault();
          this.togglePause();
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          this.keys.left = false;
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          this.keys.right = false;
        }
      });

      // Mouse Controls on Canvas Container
      this.container.addEventListener('mousemove', (e) => {
        const pt = this.getCanvasCoord(e.clientX, e.clientY);
        this.paddle.targetX = pt.x;
        this.isPointerControlling = true;
      });

      this.container.addEventListener('mousedown', (e) => {
        this.audio.init();
        if (e.button === 0) { // Left click
          this.handleActionTrigger();
        }
      });

      // Touch Controls (Smooth dragging without scrolling)
      this.container.addEventListener('touchstart', (e) => {
        this.audio.init();
        e.preventDefault();
        if (e.touches.length > 0) {
          const pt = this.getCanvasCoord(e.touches[0].clientX, e.touches[0].clientY);
          this.paddle.targetX = pt.x;
          this.isPointerControlling = true;
          this.handleActionTrigger();
        }
      }, { passive: false });

      this.container.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length > 0) {
          const pt = this.getCanvasCoord(e.touches[0].clientX, e.touches[0].clientY);
          this.paddle.targetX = pt.x;
          this.isPointerControlling = true;
        }
      }, { passive: false });

      // HUD Buttons
      this.btnAudioToggle.addEventListener('click', () => {
        this.audio.init();
        const newMuted = !this.audio.isMuted;
        this.audio.setMuted(newMuted);
        this.updateAudioButtonState();
        if (!newMuted) this.audio.playUi();
      });

      this.btnPause.addEventListener('click', () => {
        this.audio.init();
        this.togglePause();
      });

      // Mobile Launch / Fire Bar Button
      const touchLaunchBtn = document.getElementById('btn-touch-action');
      if (touchLaunchBtn) {
        touchLaunchBtn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.audio.init();
          this.handleActionTrigger();
        });
        touchLaunchBtn.addEventListener('click', () => {
          this.audio.init();
          this.handleActionTrigger();
        });
      }

      // UI Screen Buttons
      document.getElementById('btn-start-game').addEventListener('click', () => {
        this.audio.init();
        this.audio.playUi();
        this.startNewGame();
      });

      document.getElementById('btn-resume').addEventListener('click', () => {
        this.audio.init();
        this.audio.playUi();
        this.togglePause();
      });

      document.getElementById('btn-restart-pause').addEventListener('click', () => {
        this.audio.init();
        this.audio.playUi();
        this.hideAllScreens();
        this.startNewGame();
      });

      document.getElementById('btn-next-level').addEventListener('click', () => {
        this.audio.init();
        this.audio.playUi();
        this.proceedToNextLevel();
      });

      document.getElementById('btn-retry-gameover').addEventListener('click', () => {
        this.audio.init();
        this.audio.playUi();
        this.startNewGame();
      });

      document.getElementById('btn-play-again-victory').addEventListener('click', () => {
        this.audio.init();
        this.audio.playUi();
        this.startNewGame();
      });

      // Update initial audio button icon
      this.updateAudioButtonState();
    }

    updateAudioButtonState() {
      if (this.audio.isMuted) {
        this.btnAudioToggle.innerHTML = '🔇';
        this.btnAudioToggle.title = 'Unmute Sound';
      } else {
        this.btnAudioToggle.innerHTML = '🔊';
        this.btnAudioToggle.title = 'Mute Sound';
      }
    }

    // ------------------------------------------------------------------------
    // Screen / State Transitions
    // ------------------------------------------------------------------------
    hideAllScreens() {
      [
        this.screenTitle,
        this.screenPause,
        this.screenLevelClear,
        this.screenGameOver,
        this.screenVictory
      ].forEach(el => el.classList.add('hidden'));
    }

    showToast(message, color = COLORS.cyan) {
      this.toastBanner.textContent = message;
      this.toastBanner.style.borderColor = color;
      this.toastBanner.style.color = color;
      this.toastBanner.classList.add('show');
      if (this.toastTimeout) clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        this.toastBanner.classList.remove('show');
      }, 1800);
    }

    startNewGame() {
      this.score = 0;
      this.levelIndex = 0;
      this.lives = INITIAL_LIVES;
      this.comboCount = 0;
      this.bricksDestroyed = 0;
      this.resetPowerUps();
      this.loadLevel(this.levelIndex);
      this.hideAllScreens();
      this.startCountdown();
    }

    startCountdown() {
      this.state = 'COUNTDOWN';
      this.countdownValue = 3;
      this.countdownTimer = 0;
      this.countdownOverlay.textContent = '3';
      this.countdownOverlay.classList.add('pop');
      this.audio.playCountdown(false);

      this.resetBallAndPaddle();
    }

    loadLevel(index) {
      this.levelIndex = index;
      const levelData = LEVELS[index % LEVELS.length];

      this.bricks = [];
      const brickWidth = 68;
      const brickHeight = 22;
      const padding = 8;
      const leftMargin = (CANVAS_WIDTH - (levelData.cols * brickWidth + (levelData.cols - 1) * padding)) / 2;
      const topMargin = 72;

      for (let r = 0; r < levelData.rows; r++) {
        for (let c = 0; c < levelData.cols; c++) {
          const code = levelData.layout[r][c];
          if (!code || code === 0) continue;

          let brick = {
            x: leftMargin + c * (brickWidth + padding),
            y: topMargin + r * (brickHeight + padding),
            width: brickWidth,
            height: brickHeight,
            type: 'normal',
            hp: 1,
            maxHp: 1,
            color: COLORS.cyan,
            score: 100,
            isExplosive: false,
            isUnbreakable: false,
            flashTimer: 0
          };

          if (code === 1) {
            brick.color = COLORS.cyan;
            brick.score = 100;
          } else if (code === 2) {
            brick.color = COLORS.magenta;
            brick.score = 120;
          } else if (code === 3) {
            brick.color = COLORS.green;
            brick.score = 140;
          } else if (code === 4) {
            brick.color = COLORS.yellow;
            brick.score = 160;
          } else if (code === 5) {
            brick.color = COLORS.purple;
            brick.score = 180;
          } else if (code === 'R') {
            brick.type = 'reinforced';
            brick.hp = 2;
            brick.maxHp = 2;
            brick.color = COLORS.cyan;
            brick.score = 250;
          } else if (code === 'A') {
            brick.type = 'armored';
            brick.hp = 3;
            brick.maxHp = 3;
            brick.color = COLORS.yellow;
            brick.score = 450;
          } else if (code === 'E') {
            brick.type = 'explosive';
            brick.hp = 1;
            brick.maxHp = 1;
            brick.color = COLORS.orange;
            brick.score = 200;
            brick.isExplosive = true;
          } else if (code === 'U') {
            brick.type = 'unbreakable';
            brick.hp = Infinity;
            brick.maxHp = Infinity;
            brick.color = COLORS.titanium;
            brick.score = 0;
            brick.isUnbreakable = true;
          }

          this.bricks.push(brick);
        }
      }

      this.powerups = [];
      this.lasers = [];
      this.particles = [];
      this.updateHud();
    }

    resetBallAndPaddle() {
      this.paddle.x = CANVAS_WIDTH / 2;
      this.paddle.targetX = CANVAS_WIDTH / 2;
      this.paddle.width = this.activeTimers.wide > 0 ? PADDLE_WIDE_WIDTH : PADDLE_DEFAULT_WIDTH;

      const currentSpeed = Math.min(
        BALL_BASE_SPEED + this.levelIndex * BALL_SPEED_LEVEL_INCREMENT,
        BALL_MAX_SPEED
      );

      this.balls = [{
        x: this.paddle.x,
        y: this.paddle.y - BALL_RADIUS - 1,
        radius: BALL_RADIUS,
        speed: currentSpeed,
        vx: 0,
        vy: 0,
        isAttached: true,
        penetrating: this.activeTimers.fireball > 0,
        trail: []
      }];
    }

    resetPowerUps() {
      this.activeTimers = {
        wide: 0,
        slow: 0,
        lasers: 0,
        fireball: 0
      };
      this.paddle.width = PADDLE_DEFAULT_WIDTH;
      this.updateActivePowerUpsHud();
    }

    handleActionTrigger() {
      if (this.state === 'PLAYING') {
        // Check if ball is attached to paddle: launch it!
        let hasLaunched = false;
        this.balls.forEach(b => {
          if (b.isAttached) {
            this.launchBall(b);
            hasLaunched = true;
          }
        });

        // If lasers active, fire laser cannons
        if (this.activeTimers.lasers > 0 && this.laserCooldownTimer <= 0) {
          this.fireLasers();
        }
      } else if (this.state === 'PAUSED') {
        this.togglePause();
      } else if (this.state === 'LEVEL_CLEAR') {
        this.proceedToNextLevel();
      }
    }

    launchBall(ball) {
      ball.isAttached = false;
      // Slight random launch angle around straight up
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.45;
      const speed = this.activeTimers.slow > 0 ? ball.speed * 0.65 : ball.speed;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      this.audio.playPaddleBounce(0);
    }

    fireLasers() {
      this.laserCooldownTimer = LASER_COOLDOWN;
      this.audio.playLaser();

      const offset = this.paddle.width * 0.42;
      // Twin lasers
      this.lasers.push({
        x: this.paddle.x - offset,
        y: this.paddle.y - 8,
        vy: -LASER_SPEED,
        width: 4,
        height: 14,
        color: COLORS.orange
      });
      this.lasers.push({
        x: this.paddle.x + offset,
        y: this.paddle.y - 8,
        vy: -LASER_SPEED,
        width: 4,
        height: 14,
        color: COLORS.orange
      });
    }

    togglePause() {
      if (this.state === 'PLAYING') {
        this.state = 'PAUSED';
        this.screenPause.classList.remove('hidden');
        this.btnPause.textContent = '▶';
        this.btnPause.title = 'Resume Game';
      } else if (this.state === 'PAUSED') {
        this.state = 'PLAYING';
        this.screenPause.classList.add('hidden');
        this.btnPause.textContent = '⏸';
        this.btnPause.title = 'Pause Game (P)';
        this.lastTime = performance.now(); // avoid delta time spike
      }
    }

    // ------------------------------------------------------------------------
    // Power-ups Management
    // ------------------------------------------------------------------------
    spawnPowerUp(x, y) {
      if (Math.random() > POWERUP_DROP_CHANCE) return;

      const types = ['wide', 'multiball', 'slow', 'lasers', 'fireball'];
      // Extra life is rarer
      if (this.lives < MAX_LIVES && Math.random() < 0.25) {
        types.push('life');
      }

      const type = types[Math.floor(Math.random() * types.length)];
      let color = COLORS.cyan;
      let symbol = 'W';

      switch (type) {
        case 'wide': color = COLORS.cyan; symbol = 'W'; break;
        case 'multiball': color = COLORS.magenta; symbol = 'M'; break;
        case 'slow': color = COLORS.purple; symbol = 'S'; break;
        case 'lasers': color = COLORS.orange; symbol = 'L'; break;
        case 'life': color = COLORS.green; symbol = '+'; break;
        case 'fireball': color = COLORS.yellow; symbol = 'F'; break;
      }

      this.powerups.push({
        x,
        y,
        type,
        color,
        symbol,
        vy: POWERUP_FALL_SPEED,
        pulse: 0
      });
    }

    activatePowerUp(p) {
      this.audio.playPowerUpCollect();
      this.createSparkExplosion(p.x, p.y, p.color, 16);
      this.addFloatingText(p.type.toUpperCase() + '!', p.x, p.y - 10, p.color);

      switch (p.type) {
        case 'wide':
          this.activeTimers.wide = POWERUP_DURATIONS.wide;
          this.paddle.width = PADDLE_WIDE_WIDTH;
          this.showToast('WIDE PADDLE ACTIVATED!', COLORS.cyan);
          break;

        case 'slow':
          this.activeTimers.slow = POWERUP_DURATIONS.slow;
          this.balls.forEach(b => {
            const currentSpeed = Math.hypot(b.vx, b.vy);
            const targetSpeed = b.speed * 0.65;
            if (currentSpeed > 0) {
              b.vx = (b.vx / currentSpeed) * targetSpeed;
              b.vy = (b.vy / currentSpeed) * targetSpeed;
            }
          });
          this.showToast('SLOW BALL ACTIVATED!', COLORS.purple);
          break;

        case 'lasers':
          this.activeTimers.lasers = POWERUP_DURATIONS.lasers;
          this.showToast('TWIN LASERS ACTIVATED!', COLORS.orange);
          break;

        case 'fireball':
          this.activeTimers.fireball = POWERUP_DURATIONS.fireball;
          this.balls.forEach(b => b.penetrating = true);
          this.showToast('FIREBALL PLASMA ACTIVATED!', COLORS.yellow);
          break;

        case 'multiball':
          this.showToast('MULTI-BALL ACTIVATED!', COLORS.magenta);
          const ballsToAdd = [];
          this.balls.forEach(b => {
            if (!b.isAttached) {
              const speed = Math.hypot(b.vx, b.vy) || b.speed;
              const angle1 = Math.atan2(b.vy, b.vx) - 0.4;
              const angle2 = Math.atan2(b.vy, b.vx) + 0.4;

              ballsToAdd.push({
                x: b.x,
                y: b.y,
                radius: BALL_RADIUS,
                speed: b.speed,
                vx: Math.cos(angle1) * speed,
                vy: Math.sin(angle1) * speed,
                isAttached: false,
                penetrating: this.activeTimers.fireball > 0,
                trail: []
              });

              ballsToAdd.push({
                x: b.x,
                y: b.y,
                radius: BALL_RADIUS,
                speed: b.speed,
                vx: Math.cos(angle2) * speed,
                vy: Math.sin(angle2) * speed,
                isAttached: false,
                penetrating: this.activeTimers.fireball > 0,
                trail: []
              });
            }
          });

          if (ballsToAdd.length === 0 && this.balls.length > 0) {
            // If ball was attached, launch and spawn
            this.balls[0].isAttached = false;
            this.launchBall(this.balls[0]);
          }

          this.balls.push(...ballsToAdd.slice(0, 4)); // cap max balls
          break;

        case 'life':
          if (this.lives < MAX_LIVES) {
            this.lives++;
            this.showToast('+1 LIFE!', COLORS.green);
            this.updateHud();
          }
          break;
      }

      this.updateActivePowerUpsHud();
    }

    updateActivePowerUpsHud() {
      this.hudActivePowerups.innerHTML = '';

      const badgeDefs = [
        { key: 'wide', label: 'WIDE', color: COLORS.cyan },
        { key: 'slow', label: 'SLOW', color: COLORS.purple },
        { key: 'lasers', label: 'LASER', color: COLORS.orange },
        { key: 'fireball', label: 'FIRE', color: COLORS.yellow }
      ];

      badgeDefs.forEach(b => {
        const time = this.activeTimers[b.key];
        if (time > 0) {
          const badge = document.createElement('div');
          badge.className = 'active-powerup-badge';
          badge.style.borderColor = b.color;
          badge.style.color = b.color;
          badge.textContent = `${b.label} ${Math.ceil(time)}s`;
          this.hudActivePowerups.appendChild(badge);
        }
      });
    }

    // ------------------------------------------------------------------------
    // Explosions & Explosive Bricks
    // ------------------------------------------------------------------------
    triggerBrickExplosion(sourceBrick) {
      const centerX = sourceBrick.x + sourceBrick.width / 2;
      const centerY = sourceBrick.y + sourceBrick.height / 2;
      const blastRadius = 90;

      this.audio.playBrickDestroy();
      this.createSparkExplosion(centerX, centerY, COLORS.orange, 35);
      this.screenShake = 10;

      this.bricks.forEach(b => {
        if (b === sourceBrick || b.isUnbreakable) return;
        const bx = b.x + b.width / 2;
        const by = b.y + b.height / 2;
        const dist = Math.hypot(bx - centerX, by - centerY);

        if (dist <= blastRadius) {
          b.hp -= 2;
          if (b.hp <= 0) {
            this.destroyBrick(b, false);
          } else {
            b.flashTimer = 0.2;
          }
        }
      });
    }

    destroyBrick(brick, triggerDrop = true) {
      brick.hp = 0;
      this.score += brick.score * Math.max(1, Math.floor(this.comboCount / 3));
      this.bricksDestroyed++;
      this.comboCount++;

      this.audio.playBrickDestroy();
      this.createSparkExplosion(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color, 18);
      this.addFloatingText(`+${brick.score}`, brick.x + brick.width / 2, brick.y, brick.color);

      if (triggerDrop) {
        this.spawnPowerUp(brick.x + brick.width / 2, brick.y + brick.height / 2);
      }

      if (brick.isExplosive) {
        this.triggerBrickExplosion(brick);
      }

      this.updateHud();

      // Check if all destructible bricks are cleared
      const remainingBricks = this.bricks.filter(b => !b.isUnbreakable && b.hp > 0);
      if (remainingBricks.length === 0) {
        this.handleLevelCompleted();
      }
    }

    // ------------------------------------------------------------------------
    // Life Loss & Game Over
    // ------------------------------------------------------------------------
    handleBallLost(ballIndex) {
      this.balls.splice(ballIndex, 1);

      // Only lose a life if NO balls remain in play
      if (this.balls.length === 0) {
        this.lives--;
        this.comboCount = 0;
        this.screenShake = 18;
        this.audio.playLifeLost();
        this.updateHud();

        // Expire timed powerups upon life loss
        this.resetPowerUps();

        if (this.lives <= 0) {
          this.handleGameOver();
        } else {
          this.startCountdown();
        }
      }
    }

    handleGameOver() {
      this.state = 'GAME_OVER';
      this.audio.playGameOver();

      const isNewBest = this.score > this.highScore;
      if (isNewBest) {
        this.highScore = this.score;
        localStorage.setItem('neon_breakout_highscore', this.highScore.toString());
      }

      document.getElementById('gameover-score').textContent = this.score.toLocaleString();
      document.getElementById('gameover-best').textContent = this.highScore.toLocaleString();
      document.getElementById('gameover-bricks').textContent = this.bricksDestroyed.toString();

      const recordTag = document.getElementById('gameover-record-tag');
      if (recordTag) {
        recordTag.style.display = isNewBest ? 'block' : 'none';
      }

      this.screenGameOver.classList.remove('hidden');
    }

    handleLevelCompleted() {
      this.state = 'LEVEL_CLEAR';
      this.audio.playLevelClear();

      const levelBonus = 500 * (this.levelIndex + 1);
      const lifeBonus = this.lives * 250;
      const totalBonus = levelBonus + lifeBonus;
      this.score += totalBonus;
      this.updateHud();

      if (this.levelIndex >= LEVELS.length - 1) {
        // Game victory!
        this.handleVictory();
        return;
      }

      document.getElementById('clear-level-num').textContent = (this.levelIndex + 1).toString();
      document.getElementById('clear-bonus-pts').textContent = `+${totalBonus.toLocaleString()} BONUS`;
      this.screenLevelClear.classList.remove('hidden');
    }

    proceedToNextLevel() {
      this.hideAllScreens();
      this.levelIndex++;
      this.loadLevel(this.levelIndex);
      this.startCountdown();
    }

    handleVictory() {
      this.state = 'VICTORY';
      document.getElementById('victory-score').textContent = this.score.toLocaleString();
      document.getElementById('victory-bricks').textContent = this.bricksDestroyed.toString();
      this.screenVictory.classList.remove('hidden');

      // Grand fireworks burst
      for (let i = 0; i < 60; i++) {
        this.createSparkExplosion(
          Math.random() * CANVAS_WIDTH,
          Math.random() * CANVAS_HEIGHT * 0.6,
          Object.values(COLORS)[Math.floor(Math.random() * 6)],
          15
        );
      }
    }

    // ------------------------------------------------------------------------
    // Visual Particles & Floating Text
    // ------------------------------------------------------------------------
    createSparkExplosion(x, y, color, count = 16) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 220 + 60;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color,
          radius: Math.random() * 2.5 + 1.2,
          life: 1,
          decay: Math.random() * 1.8 + 1.2
        });
      }
    }

    addFloatingText(text, x, y, color) {
      this.floatingTexts.push({
        text,
        x,
        y,
        color,
        life: 1,
        vy: -40
      });
    }

    // ------------------------------------------------------------------------
    // Update Loop
    // ------------------------------------------------------------------------
    update(dt) {
      // Background star movement
      this.bgStars.forEach(s => {
        s.y += s.speed * dt;
        if (s.y > CANVAS_HEIGHT) {
          s.y = 0;
          s.x = Math.random() * CANVAS_WIDTH;
        }
      });

      // Screen Shake decay
      if (this.screenShake > 0) {
        this.screenShake = Math.max(0, this.screenShake - dt * 45);
      }

      // Countdown State
      if (this.state === 'COUNTDOWN') {
        this.countdownTimer += dt;
        if (this.countdownTimer >= 0.75) {
          this.countdownTimer = 0;
          this.countdownValue--;

          if (this.countdownValue > 0) {
            this.countdownOverlay.textContent = this.countdownValue.toString();
            this.audio.playCountdown(false);
            this.countdownOverlay.classList.remove('pop');
            void this.countdownOverlay.offsetWidth; // reflow
            this.countdownOverlay.classList.add('pop');
          } else if (this.countdownValue === 0) {
            this.countdownOverlay.textContent = 'GO!';
            this.audio.playCountdown(true);
            this.countdownOverlay.classList.remove('pop');
            void this.countdownOverlay.offsetWidth;
            this.countdownOverlay.classList.add('pop');
          } else {
            this.countdownOverlay.classList.remove('pop');
            this.state = 'PLAYING';
            // Auto launch the ball after GO
            this.balls.forEach(b => {
              if (b.isAttached) this.launchBall(b);
            });
          }
        }
      }

      // Smooth Paddle Movement
      if (this.isPointerControlling) {
        // Smoothly interpolate paddle to target pointer X
        const diff = this.paddle.targetX - this.paddle.x;
        this.paddle.x += diff * Math.min(1, dt * 25);
      } else {
        // Keyboard controls
        if (this.keys.left) {
          this.paddle.x -= PADDLE_SPEED * dt;
        }
        if (this.keys.right) {
          this.paddle.x += PADDLE_SPEED * dt;
        }
      }

      // Clamp paddle inside canvas bounds
      const halfW = this.paddle.width / 2;
      this.paddle.x = Math.max(halfW, Math.min(CANVAS_WIDTH - halfW, this.paddle.x));

      // Update Active Power-up Timers
      let timersChanged = false;
      for (const key in this.activeTimers) {
        if (this.activeTimers[key] > 0) {
          this.activeTimers[key] -= dt;
          timersChanged = true;
          if (this.activeTimers[key] <= 0) {
            this.activeTimers[key] = 0;
            // On expiry effects
            if (key === 'wide') this.paddle.width = PADDLE_DEFAULT_WIDTH;
            if (key === 'fireball') this.balls.forEach(b => b.penetrating = false);
            if (key === 'slow') {
              this.balls.forEach(b => {
                const currentSpeed = Math.hypot(b.vx, b.vy);
                if (currentSpeed > 0) {
                  b.vx = (b.vx / currentSpeed) * b.speed;
                  b.vy = (b.vy / currentSpeed) * b.speed;
                }
              });
            }
          }
        }
      }
      if (timersChanged) {
        this.updateActivePowerUpsHud();
      }

      // Laser Cooldown
      if (this.laserCooldownTimer > 0) {
        this.laserCooldownTimer -= dt;
      }

      // Update Lasers
      for (let i = this.lasers.length - 1; i >= 0; i--) {
        const l = this.lasers[i];
        l.y += l.vy * dt;

        let laserHit = false;
        // Check collision with bricks
        for (let j = 0; j < this.bricks.length; j++) {
          const b = this.bricks[j];
          if (b.hp <= 0) continue;

          if (
            l.x >= b.x &&
            l.x <= b.x + b.width &&
            l.y >= b.y &&
            l.y <= b.y + b.height
          ) {
            laserHit = true;
            this.createSparkExplosion(l.x, l.y, COLORS.orange, 8);
            if (!b.isUnbreakable) {
              b.hp--;
              if (b.hp <= 0) {
                this.destroyBrick(b, true);
              } else {
                b.flashTimer = 0.15;
                this.audio.playBrickHit(this.comboCount);
              }
            }
            break;
          }
        }

        if (laserHit || l.y < -20) {
          this.lasers.splice(i, 1);
        }
      }

      // Update Bricks (Hit Flash timer)
      this.bricks.forEach(b => {
        if (b.flashTimer > 0) {
          b.flashTimer -= dt;
        }
      });

      // Update Power-ups falling
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i];
        p.y += p.vy * dt;
        p.pulse += dt * 5;

        // Collision with Paddle
        if (
          p.y + POWERUP_HEIGHT / 2 >= this.paddle.y - this.paddle.height / 2 &&
          p.y - POWERUP_HEIGHT / 2 <= this.paddle.y + this.paddle.height / 2 &&
          p.x + POWERUP_WIDTH / 2 >= this.paddle.x - this.paddle.width / 2 &&
          p.x - POWERUP_WIDTH / 2 <= this.paddle.x + this.paddle.width / 2
        ) {
          this.activatePowerUp(p);
          this.powerups.splice(i, 1);
          continue;
        }

        // Offscreen cleanup
        if (p.y > CANVAS_HEIGHT + 30) {
          this.powerups.splice(i, 1);
        }
      }

      // Update Balls Physics
      if (this.state === 'PLAYING' || this.state === 'COUNTDOWN') {
        for (let i = this.balls.length - 1; i >= 0; i--) {
          const b = this.balls[i];

          if (b.isAttached) {
            b.x = this.paddle.x;
            b.y = this.paddle.y - this.paddle.height / 2 - b.radius;
            continue;
          }

          // Motion trail
          b.trail.unshift({ x: b.x, y: b.y, alpha: 0.85 });
          if (b.trail.length > 8) b.trail.pop();
          b.trail.forEach(t => t.alpha -= dt * 3.5);

          // Sub-step collision detection to prevent tunneling at high velocity
          const stepDist = Math.hypot(b.vx, b.vy) * dt;
          const steps = Math.max(1, Math.ceil(stepDist / 6));
          const subDt = dt / steps;

          for (let s = 0; s < steps; s++) {
            b.x += b.vx * subDt;
            b.y += b.vy * subDt;

            // Wall Collisions
            if (b.x - b.radius <= 0) {
              b.x = b.radius;
              b.vx = Math.abs(b.vx);
              this.audio.playWallBounce();
              this.createSparkExplosion(b.x, b.y, COLORS.cyan, 6);
            } else if (b.x + b.radius >= CANVAS_WIDTH) {
              b.x = CANVAS_WIDTH - b.radius;
              b.vx = -Math.abs(b.vx);
              this.audio.playWallBounce();
              this.createSparkExplosion(b.x, b.y, COLORS.cyan, 6);
            }

            if (b.y - b.radius <= 0) {
              b.y = b.radius;
              b.vy = Math.abs(b.vy);
              this.audio.playWallBounce();
              this.createSparkExplosion(b.x, b.y, COLORS.cyan, 6);
            }

            // Paddle Collision
            const pTop = this.paddle.y - this.paddle.height / 2;
            const pBottom = this.paddle.y + this.paddle.height / 2;
            const pLeft = this.paddle.x - this.paddle.width / 2;
            const pRight = this.paddle.x + this.paddle.width / 2;

            if (
              b.y + b.radius >= pTop &&
              b.y - b.radius <= pBottom &&
              b.x >= pLeft - 4 &&
              b.x <= pRight + 4 &&
              b.vy > 0
            ) {
              b.y = pTop - b.radius;

              // Angle depends on where ball hits paddle (-1 to 1)
              const hitOffset = (b.x - this.paddle.x) / (this.paddle.width / 2);
              const clampedOffset = Math.max(-0.95, Math.min(0.95, hitOffset));

              // Max bounce angle is ~68 degrees from vertical
              const maxAngle = Math.PI * 0.38;
              const bounceAngle = clampedOffset * maxAngle;
              const currentSpeed = Math.hypot(b.vx, b.vy);

              b.vx = currentSpeed * Math.sin(bounceAngle);
              b.vy = -currentSpeed * Math.cos(bounceAngle);

              this.comboCount = 0; // Reset combo when ball touches paddle
              this.paddle.rippleTimer = 0.2;
              this.audio.playPaddleBounce(clampedOffset);
              this.createSparkExplosion(b.x, b.y, COLORS.cyan, 8);
              break;
            }

            // Brick Collisions
            let hitBrick = false;
            for (let j = 0; j < this.bricks.length; j++) {
              const brick = this.bricks[j];
              if (brick.hp <= 0) continue;

              // Nearest point on brick rectangle to ball center
              const nearestX = Math.max(brick.x, Math.min(b.x, brick.x + brick.width));
              const nearestY = Math.max(brick.y, Math.min(b.y, brick.y + brick.height));
              const distX = b.x - nearestX;
              const distY = b.y - nearestY;
              const distSq = distX * distX + distY * distY;

              if (distSq < b.radius * b.radius) {
                hitBrick = true;

                // Fireball mode pierces through without bouncing
                if (!b.penetrating) {
                  // Determine hit normal
                  const overlapX = (b.radius + brick.width / 2) - Math.abs(b.x - (brick.x + brick.width / 2));
                  const overlapY = (b.radius + brick.height / 2) - Math.abs(b.y - (brick.y + brick.height / 2));

                  if (overlapX < overlapY) {
                    b.vx = -b.vx;
                  } else {
                    b.vy = -b.vy;
                  }
                }

                if (brick.isUnbreakable) {
                  this.audio.playWallBounce();
                  this.createSparkExplosion(nearestX, nearestY, COLORS.titanium, 6);
                } else {
                  const damage = b.penetrating ? 2 : 1;
                  brick.hp -= damage;
                  if (brick.hp <= 0) {
                    this.destroyBrick(brick, true);
                  } else {
                    brick.flashTimer = 0.15;
                    this.comboCount++;
                    this.audio.playBrickHit(this.comboCount);
                    this.createSparkExplosion(nearestX, nearestY, brick.color, 8);
                  }
                }
                break;
              }
            }

            if (hitBrick) break;
          }

          // Bottom screen: ball lost
          if (b.y - b.radius > CANVAS_HEIGHT) {
            this.handleBallLost(i);
          }
        }
      }

      // Update Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }

      // Update Floating Texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.y += ft.vy * dt;
        ft.life -= dt * 1.5;
        if (ft.life <= 0) {
          this.floatingTexts.splice(i, 1);
        }
      }

      // Paddle ripple animation
      if (this.paddle.rippleTimer > 0) {
        this.paddle.rippleTimer -= dt;
      }
    }

    // ------------------------------------------------------------------------
    // Render Loop
    // ------------------------------------------------------------------------
    render() {
      const ctx = this.ctx;

      ctx.save();

      // Screen Shake translation
      if (this.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * this.screenShake;
        const shakeY = (Math.random() - 0.5) * this.screenShake;
        ctx.translate(shakeX, shakeY);
      }

      // Clear Canvas with deep space color
      ctx.fillStyle = '#060714';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Render Ambient Stars
      this.bgStars.forEach(s => {
        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.alpha;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Render Subtle Grid Lines at bottom
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let y = 460; y < CANVAS_HEIGHT; y += 35) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // Render Bricks
      this.bricks.forEach(b => {
        if (b.hp <= 0) return;

        ctx.save();
        const cornerRadius = 4;

        // Shadow glow
        ctx.shadowColor = b.color;
        ctx.shadowBlur = b.isExplosive ? 14 : 8;

        // Base fill
        ctx.fillStyle = b.flashTimer > 0 ? '#ffffff' : b.color;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.width, b.height, cornerRadius);
        ctx.fill();

        // Inner dark bevel for neon glass depth
        if (b.flashTimer <= 0) {
          ctx.fillStyle = 'rgba(10, 12, 30, 0.65)';
          ctx.beginPath();
          ctx.roundRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4, cornerRadius - 1);
          ctx.fill();

          // Highlight top sheen
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(b.x + 3, b.y + 3);
          ctx.lineTo(b.x + b.width - 3, b.y + 3);
          ctx.stroke();

          // Health / Reinforced indicator (Cracks or border)
          if (b.type === 'reinforced' && b.hp === 1) {
            // Draw crack line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(b.x + b.width * 0.3, b.y + 3);
            ctx.lineTo(b.x + b.width * 0.55, b.y + b.height * 0.6);
            ctx.lineTo(b.x + b.width * 0.75, b.y + b.height - 3);
            ctx.stroke();
          } else if (b.type === 'armored') {
            // Metallic cross-hatch
            ctx.strokeStyle = 'rgba(255, 230, 0, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(b.x + 5, b.y + 4, b.width - 10, b.height - 8);
          } else if (b.isExplosive) {
            // Center glowing pulse core
            ctx.fillStyle = COLORS.yellow;
            ctx.beginPath();
            ctx.arc(b.x + b.width / 2, b.y + b.height / 2, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.restore();
      });

      // Render Falling Power-ups
      this.powerups.forEach(p => {
        ctx.save();
        const halfW = POWERUP_WIDTH / 2;
        const halfH = POWERUP_HEIGHT / 2;
        const hoverOffset = Math.sin(p.pulse) * 3;

        ctx.translate(p.x, p.y + hoverOffset);

        // Glow
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;

        // Capsule Body
        ctx.fillStyle = 'rgba(8, 10, 28, 0.9)';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-halfW, -halfH, POWERUP_WIDTH, POWERUP_HEIGHT, 8);
        ctx.fill();
        ctx.stroke();

        // Symbol
        ctx.shadowBlur = 4;
        ctx.fillStyle = p.color;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.symbol, 0, 1);

        ctx.restore();
      });

      // Render Lasers
      this.lasers.forEach(l => {
        ctx.save();
        ctx.shadowColor = l.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = l.color;
        ctx.fillRect(l.x - l.width / 2, l.y, l.width, l.height);

        // Inner white hot core
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(l.x - 1, l.y + 2, 2, l.height - 4);
        ctx.restore();
      });

      // Render Paddle
      ctx.save();
      const p = this.paddle;
      const pHalfW = p.width / 2;
      const pHalfH = p.height / 2;

      // Glow aura
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 16;

      // Paddle Body Gradient
      const grad = ctx.createLinearGradient(p.x - pHalfW, 0, p.x + pHalfW, 0);
      grad.addColorStop(0, COLORS.magenta);
      grad.addColorStop(0.2, COLORS.cyan);
      grad.addColorStop(0.8, COLORS.cyan);
      grad.addColorStop(1, COLORS.magenta);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(p.x - pHalfW, p.y - pHalfH, p.width, p.height, 8);
      ctx.fill();

      // Metallic top cap
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - pHalfW + 6, p.y - pHalfH + 2, p.width - 12, 2);

      // Twin Laser Cannons visual attachment
      if (this.activeTimers.lasers > 0) {
        ctx.fillStyle = COLORS.orange;
        ctx.shadowColor = COLORS.orange;
        ctx.shadowBlur = 8;
        const offset = p.width * 0.42;
        ctx.fillRect(p.x - offset - 3, p.y - pHalfH - 5, 6, 7);
        ctx.fillRect(p.x + offset - 3, p.y - pHalfH - 5, 6, 7);
      }

      // Paddle ripple hit effect
      if (p.rippleTimer > 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(p.x - pHalfW - 3, p.y - pHalfH - 3, p.width + 6, p.height + 6, 10);
        ctx.stroke();
      }

      ctx.restore();

      // Render Ball(s) and Trails
      this.balls.forEach(b => {
        ctx.save();

        // Render Trail
        b.trail.forEach(t => {
          if (t.alpha <= 0) return;
          ctx.beginPath();
          ctx.arc(t.x, t.y, b.radius * 0.75, 0, Math.PI * 2);
          ctx.fillStyle = b.penetrating
            ? `rgba(255, 230, 0, ${t.alpha * 0.5})`
            : `rgba(0, 240, 255, ${t.alpha * 0.5})`;
          ctx.fill();
        });

        // Ball Glow
        const ballColor = b.penetrating ? COLORS.yellow : COLORS.cyan;
        ctx.shadowColor = ballColor;
        ctx.shadowBlur = b.penetrating ? 22 : 14;

        // Ball Core
        ctx.fillStyle = ballColor;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();

        // Hot White Center
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });

      // Render Particles
      this.particles.forEach(pt => {
        ctx.save();
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.shadowColor = pt.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Render Floating Texts
      this.floatingTexts.forEach(ft => {
        ctx.save();
        ctx.fillStyle = ft.color;
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = Math.max(0, ft.life);
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      });

      ctx.restore(); // Restore shake translation
    }

    // ------------------------------------------------------------------------
    // HUD Updates
    // ------------------------------------------------------------------------
    updateHud() {
      this.hudScore.textContent = this.score.toLocaleString();
      this.hudBest.textContent = this.highScore.toLocaleString();
      this.hudLevel.textContent = (this.levelIndex + 1).toString();

      // Lives Display
      this.hudLivesContainer.innerHTML = '';
      for (let i = 0; i < MAX_LIVES; i++) {
        const heart = document.createElement('span');
        heart.className = `life-icon ${i < this.lives ? '' : 'lost'}`;
        this.hudLivesContainer.appendChild(heart);
      }
    }

    // ------------------------------------------------------------------------
    // Main Animation Loop
    // ------------------------------------------------------------------------
    gameLoop(timestamp) {
      if (!this.lastTime) this.lastTime = timestamp;
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // clamp delta
      this.lastTime = timestamp;

      if (this.state !== 'PAUSED') {
        this.update(dt);
      }

      this.render();

      requestAnimationFrame(this.gameLoop.bind(this));
    }
  }

  // Initialize on DOM ready
  window.addEventListener('DOMContentLoaded', () => {
    window.game = new NeonBreakoutGame();
  });

})();
