/**
 * KairoHAL.ts — 开罗泛用卡带硬件抽象层
 * 负责管理 Canvas 2D 上下文 (480x568 物理像素 / 240x284 逻辑像素)、Web Audio 音效合成、按 gameId 隔离的 VFS 存储及纹理缓存
 */
import { CartridgeBundle } from '../types/kairo';

export interface KairoTexture {
  name: string;
  el: HTMLImageElement;
  width: number;
  height: number;
  texScale: number;
}

export class KairoHAL {
  public mainCanvas: HTMLCanvasElement;
  public mainCtx: CanvasRenderingContext2D;
  public imageCache: Record<string, KairoTexture> = {};
  public pngDims: Record<string, [number, number, number]> = {};
  public pngB64: Record<string, string> = {};
  public vfsMemory: Record<string, string> = {};
  public gameId: string;

  public audioEnabled = true;
  private audioCtx: AudioContext | null = null;

  constructor(canvas: HTMLCanvasElement, gameId = 'jumbo_airport_story') {
    this.mainCanvas = canvas;
    this.mainCtx = canvas.getContext('2d')!;
    this.mainCtx.imageSmoothingEnabled = false;

    // 物理分辨率 480x568 (逻辑分辨率 240x284 的 2x 整数缩放)
    this.mainCanvas.width = 480;
    this.mainCanvas.height = 568;
    this.gameId = gameId;
  }

  public loadBundleTextures(bundle: CartridgeBundle): void {
    this.pngB64 = bundle.pngB64 || {};
    this.pngDims = bundle.pngDims || {};
    for (const name of Object.keys(this.pngB64)) {
      this.getImageObj(name);
    }
  }

  public getImageObj(rawName: string, defaultW = 60, defaultH = 60): KairoTexture {
    let clean = String(rawName || '').trim();
    if (clean.includes('/')) clean = clean.split('/').pop()!;
    if (!clean.endsWith('.png')) clean += '.png';
    if (this.imageCache[clean]) return this.imageCache[clean];

    const dims = this.pngDims[clean] || [defaultW, defaultH, 1];
    const imgEl = new Image();
    if (this.pngB64[clean]) {
      imgEl.src = this.pngB64[clean];
    }
    const obj: KairoTexture = {
      name: clean,
      el: imgEl,
      width: dims[0],
      height: dims[1],
      texScale: dims[2] || 1
    };
    this.imageCache[clean] = obj;
    return obj;
  }

  public playTone(freq: number, dur = 0.05, type: OscillatorType = 'square', vol = 0.05): void {
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

  public stopAudio(): void {
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.suspend();
      } catch {}
    }
  }

  public getStorageItem(key: string): string | null {
    const scopedKey = `kairo_vfs_${this.gameId}_${key}`;
    try {
      return localStorage.getItem(scopedKey) || this.vfsMemory[scopedKey] || null;
    } catch {
      return this.vfsMemory[scopedKey] || null;
    }
  }

  public setStorageItem(key: string, val: string): void {
    const scopedKey = `kairo_vfs_${this.gameId}_${key}`;
    this.vfsMemory[scopedKey] = val;
    try {
      localStorage.setItem(scopedKey, val);
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
