/**
 * KairoHAL.ts — 开罗 DoJa / Starlets 硬件抽象层
 * 统一管理 Canvas 2D 上下文 (480x568 物理像素 / 240x284 逻辑像素)、Web Audio 音效合成、VFS 持久化及材质纹理
 */
import { CartridgeBundle } from '../types/kairo';

export class KairoHAL {
  public mainCanvas: HTMLCanvasElement;
  public mainCtx: CanvasRenderingContext2D;
  public offCanvas: HTMLCanvasElement;
  public offCtx: CanvasRenderingContext2D;
  public mainG: any;
  public offG: any;
  public offImageObj: any;
  public imageCache: Record<string, any> = {};
  public pngDims: Record<string, [number, number, number]> = {};
  public pngB64: Record<string, string> = {};
  public vfsMemory: Record<string, string> = {};
  public gameId: string;

  // Audio Context
  public audioEnabled = true;
  private audioCtx: AudioContext | null = null;

  // Keypad & Input State
  public keyState = 0;
  public keyPulse = 0;
  public softLeft = '';
  public softRight = '';
  public onSoftLabelChange?: (left: string, right: string) => void;

  constructor(canvas: HTMLCanvasElement, gameId = 'game_dev_story') {
    this.mainCanvas = canvas;
    this.mainCtx = canvas.getContext('2d')!;
    this.mainCtx.imageSmoothingEnabled = false;

    // Physical dimensions: 480 x 568 (2x of 240 x 284)
    this.mainCanvas.width = 480;
    this.mainCanvas.height = 568;

    this.offCanvas = document.createElement('canvas');
    this.offCanvas.width = 480;
    this.offCanvas.height = 568;
    this.offCtx = this.offCanvas.getContext('2d')!;
    this.offCtx.imageSmoothingEnabled = false;

    this.gameId = gameId;

    this.mainG = this.makeGraphics(this.mainCtx);
    this.offG = this.makeGraphics(this.offCtx);
    this.offImageObj = {
      __type: 'kairo.unity.ui.Image',
      name: '__offscreen__',
      el: this.offCanvas,
      width: 240,
      height: 284,
      texScale: 2,
      g: this.offG
    };
  }

  public loadBundleTextures(bundle: CartridgeBundle): void {
    this.pngB64 = bundle.pngB64 || {};
    this.pngDims = bundle.pngDims || {};
    for (const name of Object.keys(this.pngB64)) {
      this.getImageObj(name);
    }
  }

  public makeGraphics(ctx: CanvasRenderingContext2D) {
    return {
      __type: 'kairo.unity.ui.Graphics',
      ctx,
      ox: 0,
      oy: 0,
      color: 0xffffff,
      cssColor: '#ffffff',
      alpha: 1.0,
      mode: 0,
      modeStack: [] as Array<[number, number]>,
      flipMode: 0,
      font: { __type: 'kairo.unity.ui.Font', size: 11 }
    };
  }

  public getImageObj(rawName: string, defaultW = 240, defaultH = 240) {
    let clean = String(rawName || '').trim();
    if (clean.includes('/')) clean = clean.split('/').pop()!;
    if (!clean.endsWith('.png')) clean += '.png';
    if (this.imageCache[clean]) return this.imageCache[clean];

    const dims = this.pngDims[clean] || [defaultW, defaultH, 1];
    const imgEl = new Image();
    if (this.pngB64[clean]) {
      imgEl.src = this.pngB64[clean];
    }
    const obj = {
      __type: 'kairo.unity.ui.Image',
      name: clean,
      el: imgEl,
      width: dims[0],
      height: dims[1],
      texScale: dims[2] || 1,
      g: this.offG
    };
    this.imageCache[clean] = obj;
    return obj;
  }

  public applyGraphicsMode(g: any) {
    const ctx: CanvasRenderingContext2D = g.ctx;
    ctx.imageSmoothingEnabled = false;
    if (g.mode === 1) {
      ctx.globalAlpha = Math.max(0, Math.min(1, g.alpha));
      ctx.globalCompositeOperation = 'source-over';
    } else if (g.mode === 2) {
      ctx.globalAlpha = Math.max(0, Math.min(1, g.alpha));
      ctx.globalCompositeOperation = 'lighter';
    } else {
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  public drawImageRegion(
    g: any,
    img: any,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    sx: number,
    sy: number,
    sw: number,
    sh: number
  ) {
    if (!img || !img.el) return;
    if (img.el.tagName === 'IMG' && !img.el.complete) return;
    const ctx: CanvasRenderingContext2D = g.ctx;
    this.applyGraphicsMode(g);
    const ts = img.texScale || 1;
    let flipX = (g.flipMode & 1) !== 0;
    let flipY = (g.flipMode & 2) !== 0;
    if (sw < 0) { sw = -sw; sx -= sw; flipX = !flipX; }
    if (sh < 0) { sh = -sh; sy -= sh; flipY = !flipY; }
    if (dw < 0) { dw = -dw; dx -= dw; flipX = !flipX; }
    if (dh < 0) { dh = -dh; dy -= dh; flipY = !flipY; }
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;

    const tx = dx + g.ox;
    const ty = dy + g.oy;

    if (flipX || flipY) {
      ctx.save();
      ctx.translate(tx + (flipX ? dw : 0), ty + (flipY ? dh : 0));
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.drawImage(img.el, sx * ts, sy * ts, sw * ts, sh * ts, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img.el, sx * ts, sy * ts, sw * ts, sh * ts, tx, ty, dw, dh);
    }
  }

  public drawKairoString(g: any, str: any, x: number, y: number, align = 0) {
    if (str === null || str === undefined || str === '') return;
    const s = String(str);
    const ctx: CanvasRenderingContext2D = g.ctx;
    this.applyGraphicsMode(g);
    const fsize = (g.font && g.font.size) ? g.font.size : 11;
    ctx.font = `bold ${fsize}px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif`;
    ctx.textBaseline = 'top';
    let tx = x + g.ox;
    const ty = y + g.oy + 1;
    if (align === 2) tx -= this.measureKairoText(s, fsize) / 2;
    else if (align === 1) tx -= this.measureKairoText(s, fsize);
    ctx.fillStyle = g.cssColor;
    ctx.fillText(s, tx, ty);
  }

  public measureKairoText(str: any, fsize = 11): number {
    const s = String(str || '');
    let w = 0;
    for (let i = 0; i < s.length; i++) {
      w += s.charCodeAt(i) > 255 ? fsize : Math.ceil(fsize * 0.55);
    }
    return w;
  }

  public playTone(freq: number, dur = 0.05, type: OscillatorType = 'square', vol = 0.05) {
    if (!this.audioEnabled) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      if (!this.audioCtx) this.audioCtx = new AudioCtxClass();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + dur);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + dur);
    } catch {}
  }

  public getStorageItem(key: string): string | null {
    const scopedKey = `kairo_vfs_${this.gameId}_${key}`;
    try {
      return (
        localStorage.getItem(scopedKey) ||
        localStorage.getItem(`gds_1to1_${key}`) ||
        this.vfsMemory[scopedKey] ||
        null
      );
    } catch {
      return this.vfsMemory[scopedKey] || null;
    }
  }

  public setStorageItem(key: string, val: string): void {
    const scopedKey = `kairo_vfs_${this.gameId}_${key}`;
    this.vfsMemory[scopedKey] = val;
    try {
      localStorage.setItem(scopedKey, val);
      localStorage.setItem(`gds_1to1_${key}`, val);
    } catch {}
  }

  public captureThumbnailDataUrl(): string {
    try {
      const thumb = document.createElement('canvas');
      thumb.width = 240;
      thumb.height = 284;
      const tctx = thumb.getContext('2d')!;
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(this.mainCanvas, 0, 0, 480, 568, 0, 0, 240, 284);
      return thumb.toDataURL('image/png');
    } catch {
      return '';
    }
  }
}
