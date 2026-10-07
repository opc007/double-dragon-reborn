/**
 * 音频层 —— 纯 WebAudio 合成的 chiptune，仓库里没有一个音频文件。
 *
 * 音色沿用 FC 音源的思路：脉冲波主旋律 + 三角波贝斯 + 噪声打击乐。
 * BGM 用极简 step 音序器前读调度（lookahead），不跟 requestAnimationFrame 抢时间。
 */

type Wave = OscillatorType;

const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface Track {
  bpm: number;
  /** 16 个 step / 小节，0 = 休止，-1 = 延音 */
  bass: number[];
  lead: number[];
  /** 和声垫（琶音），0 = 休止 */
  harm?: number[];
  /** K=底鼓 S=军鼓 h=闭镲 .=休止 */
  drum: string;
  leadWave: Wave;
  bassWave: Wave;
  /** 音量微调 */
  vol?: number;
}

/**
 * 曲库。全部现写，仓库里没有一个音频文件。
 *
 * 每首 16 个 step / 小节，循环播放。harm 是和声垫（琶音），
 * 加这一层之后音乐才"厚"得起来——单主旋律听起来像手机闹铃。
 */
const TRACKS: Record<string, Track> = {
  /** 标题：深沉、带点威胁感，让人还没开打就紧张 */
  title: {
    bpm: 92,
    bass: [33, 0, 33, 0, 33, 0, 40, 0, 36, 0, 36, 0, 43, 0, 40, 0],
    lead: [69, 0, 0, 72, 0, 76, 0, 0, 74, 0, 0, 71, 0, 69, 0, 0],
    harm: [57, 0, 0, 60, 0, 64, 0, 0, 60, 0, 0, 64, 0, 67, 0, 0],
    drum: 'K...h...S...h...',
    leadWave: 'square', bassWave: 'triangle',
  },
  /** 道场：安静、放松，是"休息一下"的地方 */
  dojo: {
    bpm: 78,
    bass: [45, 0, 0, 0, 48, 0, 0, 0, 43, 0, 0, 0, 40, 0, 0, 0],
    lead: [72, 0, 0, 0, 76, 0, 0, 0, 79, 0, 0, 0, 76, 0, 0, 0],
    harm: [60, 0, 0, 0, 64, 0, 0, 0, 67, 0, 0, 0, 64, 0, 0, 0],
    drum: 'K.......h.......',
    leadWave: 'triangle', bassWave: 'sine',
  },
  /** 城市：明快、往前冲 */
  stage1: {
    bpm: 150,
    bass: [40, 40, 0, 40, 40, 0, 43, 0, 45, 0, 43, 0, 40, 0, 38, 0],
    lead: [64, 0, 67, 0, 71, 0, 67, 0, 69, 0, 67, 0, 64, 0, 62, 0],
    harm: [52, 0, 0, 55, 0, 0, 59, 0, 57, 0, 0, 55, 0, 0, 52, 0],
    drum: 'K..hK..hS..hK.hh',
    leadWave: 'square', bassWave: 'sawtooth',
  },
  /** 工厂：机械感、更密的鼓 */
  stage2: {
    bpm: 158,
    bass: [45, 0, 45, 45, 0, 45, 47, 0, 45, 0, 45, 45, 0, 45, 43, 0],
    lead: [69, 0, 72, 74, 0, 72, 69, 0, 67, 0, 69, 72, 0, 74, 76, 0],
    harm: [57, 0, 60, 0, 0, 64, 0, 0, 57, 0, 60, 0, 0, 67, 0, 0],
    drum: 'K.hhK.hhS.hhK.hh',
    leadWave: 'square', bassWave: 'square',
  },
  /** 林道：沉、慢，制造"树林里不对劲"的感觉 */
  stage3: {
    bpm: 142,
    bass: [38, 0, 38, 0, 41, 0, 43, 0, 38, 0, 38, 0, 36, 0, 38, 0],
    lead: [62, 0, 65, 0, 69, 0, 65, 0, 67, 0, 65, 0, 62, 0, 60, 0],
    harm: [50, 0, 0, 53, 0, 0, 57, 0, 55, 0, 0, 53, 0, 0, 50, 0],
    drum: 'K..h..hS..h..hS',
    leadWave: 'triangle', bassWave: 'sawtooth',
  },
  /** 基地：压迫、往下走 */
  stage4: {
    bpm: 160,
    bass: [36, 36, 0, 36, 36, 0, 36, 36, 39, 0, 39, 0, 41, 0, 39, 0],
    lead: [60, 0, 63, 0, 60, 0, 58, 0, 60, 0, 63, 0, 66, 0, 63, 0],
    harm: [48, 0, 0, 51, 0, 0, 55, 0, 51, 0, 0, 55, 0, 0, 48, 0],
    drum: 'KhKhK.hS.hKhKhS.',
    leadWave: 'sawtooth', bassWave: 'sawtooth',
  },
  /** BOSS：最快最密，压得人喘不过气 */
  boss: {
    bpm: 176,
    bass: [33, 33, 33, 33, 33, 33, 33, 33, 34, 34, 34, 34, 35, 35, 36, 36],
    lead: [69, 70, 72, 70, 69, 67, 68, 70, 72, 73, 75, 73, 72, 70, 69, 68],
    harm: [57, 0, 60, 0, 57, 0, 60, 0, 58, 0, 61, 0, 58, 0, 61, 0],
    drum: 'K.hKh.hKS.hKh.hK',
    leadWave: 'sawtooth', bassWave: 'square',
  },
  /** 通关：明亮的上行 */
  victory: {
    bpm: 120,
    bass: [48, 0, 0, 0, 53, 0, 0, 0, 55, 0, 0, 0, 57, 0, 0, 0],
    lead: [72, 0, 76, 0, 79, 0, 84, 0, 81, 0, 79, 0, 76, 0, 79, 0],
    harm: [64, 0, 0, 67, 0, 0, 71, 0, 72, 0, 0, 76, 0, 0, 79, 0],
    drum: 'K...h...S...h..h',
    leadWave: 'square', bassWave: 'triangle',
  },
  /** Game Over：下行 */
  gameover: {
    bpm: 70,
    bass: [45, 0, 0, 0, 44, 0, 0, 0, 43, 0, 0, 0, 41, 0, 0, 0],
    lead: [69, 0, 0, 0, 67, 0, 0, 0, 65, 0, 0, 0, 64, 0, 0, 0],
    drum: 'K.......h.......',
    leadWave: 'triangle', bassWave: 'sine',
  },
};

export type SfxName =
  | 'punch' | 'kick' | 'hitHeavy' | 'whiff' | 'jump' | 'land'
  | 'grab' | 'throw' | 'weapon' | 'ko' | 'levelup' | 'super'
  | 'explode' | 'boss' | 'select' | 'coin' | 'break';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private cur: Track | null = null;
  private curName = '';

  sfxVolume = 0.62;
  bgmVolume = 0.5;
  muted = false;

  /** 浏览器要求首次交互后才能出声 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1.0;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.bgmVolume;
    this.bgmGain.connect(this.master);

    // 1 秒白噪声，打击乐全部由它切出来
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.nextTime = this.ctx.currentTime + 0.06;
    this.startClock();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1.0, this.ctx.currentTime, 0.02);
    }
  }

  /* ---------------- 基础合成原语 ---------------- */

  private tone(opts: {
    type: Wave; f0: number; f1?: number; t0?: number; dur: number;
    vol: number; dest?: GainNode | null; attack?: number;
  }): void {
    if (!this.ctx) return;
    const { type, f0, f1, dur, vol } = opts;
    const t = opts.t0 ?? this.ctx.currentTime;
    const dest = opts.dest ?? this.sfxGain;
    if (!dest) return;

    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== undefined && f1 !== f0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    }
    const g = this.ctx.createGain();
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(opts: {
    dur: number; vol: number; f0?: number; f1?: number; q?: number;
    t0?: number; dest?: GainNode | null;
  }): void {
    if (!this.ctx || !this.noiseBuf) return;
    const { dur, vol } = opts;
    const t = opts.t0 ?? this.ctx.currentTime;
    const dest = opts.dest ?? this.sfxGain;
    if (!dest) return;

    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;

    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = opts.q ?? 1.1;
    f.frequency.setValueAtTime(opts.f0 ?? 1200, t);
    if (opts.f1 !== undefined) {
      f.frequency.exponentialRampToValueAtTime(Math.max(60, opts.f1), t + dur);
    }

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    s.connect(f).connect(g).connect(dest);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  /* ---------------- 音效表 ---------------- */

  sfx(name: SfxName): void {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'punch':
        this.noise({ dur: 0.075, vol: 0.34, f0: 1700, f1: 480, q: 0.9 });
        this.tone({ type: 'square', f0: 320, f1: 150, dur: 0.06, vol: 0.1 });
        break;
      case 'kick':
        this.noise({ dur: 0.11, vol: 0.36, f0: 900, f1: 220, q: 0.8 });
        this.tone({ type: 'triangle', f0: 190, f1: 78, dur: 0.11, vol: 0.2 });
        break;
      case 'hitHeavy':
        this.noise({ dur: 0.18, vol: 0.44, f0: 2400, f1: 200, q: 0.6 });
        this.tone({ type: 'square', f0: 240, f1: 62, dur: 0.2, vol: 0.24 });
        break;
      case 'whiff':
        this.noise({ dur: 0.1, vol: 0.13, f0: 2600, f1: 900, q: 2.4 });
        break;
      case 'jump':
        this.tone({ type: 'square', f0: 300, f1: 720, dur: 0.1, vol: 0.13 });
        break;
      case 'land':
        this.noise({ dur: 0.07, vol: 0.17, f0: 500, f1: 130, q: 0.8 });
        break;
      case 'grab':
        this.tone({ type: 'square', f0: 520, f1: 660, dur: 0.06, vol: 0.13 });
        break;
      case 'throw':
        this.tone({ type: 'sawtooth', f0: 700, f1: 180, dur: 0.17, vol: 0.15 });
        this.noise({ dur: 0.14, vol: 0.16, f0: 1600, f1: 380 });
        break;
      case 'weapon':
        this.tone({ type: 'square', f0: 620, dur: 0.045, vol: 0.14 });
        this.tone({ type: 'square', f0: 930, dur: 0.06, vol: 0.13, t0: (this.ctx?.currentTime ?? 0) + 0.05 });
        break;
      case 'ko':
        this.tone({ type: 'square', f0: 420, f1: 70, dur: 0.42, vol: 0.22 });
        this.noise({ dur: 0.3, vol: 0.2, f0: 1500, f1: 160 });
        break;
      case 'levelup':
        [64, 71, 76, 83].forEach((m, i) => {
          this.tone({
            type: 'square', f0: midi(m), dur: 0.1, vol: 0.16,
            t0: (this.ctx?.currentTime ?? 0) + i * 0.075,
          });
        });
        break;
      case 'super':
        this.tone({ type: 'sawtooth', f0: 180, f1: 1500, dur: 0.34, vol: 0.26 });
        this.noise({ dur: 0.6, vol: 0.24, f0: 500, f1: 4000, q: 0.5 });
        break;
      case 'explode':
        this.noise({ dur: 0.55, vol: 0.5, f0: 1900, f1: 60, q: 0.35 });
        this.tone({ type: 'triangle', f0: 130, f1: 34, dur: 0.5, vol: 0.3 });
        break;
      case 'boss':
        this.tone({ type: 'sawtooth', f0: 90, f1: 60, dur: 0.6, vol: 0.24 });
        this.noise({ dur: 0.5, vol: 0.16, f0: 300, f1: 90, q: 0.7 });
        break;
      case 'select':
        this.tone({ type: 'square', f0: 760, dur: 0.05, vol: 0.15 });
        break;
      case 'coin':
        this.tone({ type: 'square', f0: 990, dur: 0.05, vol: 0.15 });
        this.tone({ type: 'square', f0: 1480, dur: 0.09, vol: 0.14, t0: (this.ctx?.currentTime ?? 0) + 0.05 });
        break;
      case 'break':
        this.noise({ dur: 0.22, vol: 0.32, f0: 2600, f1: 500, q: 0.5 });
        break;
    }
  }

  /* ---------------- BGM 音序器 ---------------- */

  private startClock(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  /** 前读 0.2s，避免 rAF 抖动导致节奏不稳 */
  private schedule(): void {
    if (!this.ctx || !this.cur || !this.bgmGain) return;
    const spb = 60 / this.cur.bpm / 4; // 16 分音符时长
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      this.emitStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step = (this.step + 1) % 16;
    }
  }

  private emitStep(i: number, t: number, spb: number): void {
    const tr = this.cur;
    if (!tr || !this.bgmGain) return;

    const bn = tr.bass[i] ?? 0;
    if (bn > 0) {
      this.tone({ type: tr.bassWave, f0: midi(bn), dur: spb * 1.7, vol: 0.26, t0: t, dest: this.bgmGain });
    }
    const ln = tr.lead[i] ?? 0;
    if (ln > 0) {
      this.tone({ type: tr.leadWave, f0: midi(ln), dur: spb * 1.45, vol: 0.15, t0: t, dest: this.bgmGain });
    }
    const hn = tr.harm?.[i] ?? 0;
    if (hn > 0) {
      this.tone({ type: 'square', f0: midi(hn), dur: spb * 2.6, vol: 0.045, t0: t, dest: this.bgmGain });
    }

    const d = tr.drum[i] ?? '.';
    if (d === 'K') {
      this.tone({ type: 'sine', f0: 150, f1: 44, dur: 0.13, vol: 0.42, t0: t, dest: this.bgmGain });
    } else if (d === 'S') {
      this.noise({ dur: 0.12, vol: 0.24, f0: 1900, f1: 800, q: 0.7, t0: t, dest: this.bgmGain });
    } else if (d === 'h') {
      this.noise({ dur: 0.032, vol: 0.09, f0: 7800, q: 1.4, t0: t, dest: this.bgmGain });
    }
  }

  playBgm(name: string): void {
    if (!this.ctx) return;
    if (this.curName === name && this.cur) return;
    const tr = TRACKS[name];
    if (!tr) return;
    this.cur = tr;
    this.curName = name;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
  }

  stopBgm(): void {
    this.cur = null;
    this.curName = '';
  }
}

export const audio = new AudioEngine();
