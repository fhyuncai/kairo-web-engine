/**
 * KairoEngine.ts — 开罗泛用卡带核心控制器
 * 负责驱动 KairoVM 渲染管线、触控碰撞检测、按键分发与 FastResume 事件驱动快照系统
 */
import { KairoVM } from './KairoVM';
import { KairoHAL } from './KairoHAL';
import { FastResumeManager } from './FastResumeManager';
import { CartridgeBundle, FastResumeSnapshot, GameRuntimeMetadata } from '../types/kairo';

export class KairoEngine {
  public hal: KairoHAL;
  public vm: KairoVM;
  public resumeMgr: FastResumeManager;
  public bundle: CartridgeBundle;
  public gameId: string;
  public gameTitle: string;
  public simSpeed = 1;
  public audioEnabled = true;
  public useOriginalFund = true;
  public isInfiniteFunds = false;
  public isNamingModalOpen = false;

  private isRunning = false;
  private animFrameId: number | null = null;
  private lastTickTime = 0;
  private uiCounter = 0;
  private settleTimer: number | null = null;

  public onAutoSnapshotCallback?: (snap: FastResumeSnapshot) => void;
  public onMetadataUpdate?: (meta: GameRuntimeMetadata) => void;
  public onSoftLabelUpdate?: (left: string, right: string) => void;
  public onOpenNamingModal?: (info: { defaultVal: string; title: string; presets: string[] }) => void;
  public onGameExitCallback?: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    bundle: CartridgeBundle,
    resumeMgr: FastResumeManager,
    onAutoSnapshot?: (snap: FastResumeSnapshot) => void,
    onMetadataUpdate?: (meta: GameRuntimeMetadata) => void,
    onSoftLabelUpdate?: (left: string, right: string) => void,
    onOpenNamingModal?: (info: { defaultVal: string; title: string; presets: string[] }) => void
  ) {
    this.bundle = bundle;
    this.gameId = bundle.meta?.id || 'jumbo_airport_story';
    this.gameTitle = bundle.meta?.title || '珍宝机场物语';
    this.hal = new KairoHAL(canvas, this.gameId);
    this.vm = new KairoVM(this.hal, this.useOriginalFund);
    this.resumeMgr = resumeMgr;
    this.onAutoSnapshotCallback = onAutoSnapshot;
    this.onMetadataUpdate = onMetadataUpdate;
    this.onSoftLabelUpdate = onSoftLabelUpdate;
    this.onOpenNamingModal = onOpenNamingModal;

    this.bindVMCallbacks();
    this.vm.init(bundle);
    this.renderFrame();
    this.updateMeta();
    this.bindLifecycleEvents();
  }

  private bindVMCallbacks(): void {
    this.vm.onUpdateSoftKeys = (left, right) => {
      if (this.onSoftLabelUpdate) this.onSoftLabelUpdate(left, right);
    };
    this.vm.onOpenNamingModal = () => {
      this.handleOpenNamingModal();
    };
    this.vm.onStateSnapshotNeeded = reason => {
      this.scheduleInteractionSnapshot(reason);
    };
    this.vm.onGameExit = () => {
      queueMicrotask(() => {
        if (this.onGameExitCallback) this.onGameExitCallback();
      });
    };
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTickTime = performance.now();

    const loop = (now: number) => {
      if (!this.isRunning) return;
      this.animFrameId = requestAnimationFrame(loop);

      const interval = 55 / Math.max(1, this.simSpeed);
      if (now - this.lastTickTime >= interval) {
        this.lastTickTime = now;

        if (!this.isNamingModalOpen) {
          const steps = this.simSpeed > 2 ? 2 : 1;
          for (let i = 0; i < steps; i++) {
            this.stepSingleUpdate();
          }
        }

        this.renderFrame();

        if ((++this.uiCounter & 15) === 0) {
          this.updateMeta();
        }
      }
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    this.hal.stopAudio();
  }

  public renderFrame(): void {
    if (!this.vm.initialized) return;
    const ctx = this.hal.mainCtx;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#181c28';
    ctx.fillRect(0, 0, 240, 284);
    ctx.save();
    this.vm.draw(ctx);
    ctx.restore();
    this.vm.updateSoftKeys();
  }

  public stepSingleUpdate(): void {
    if (this.isInfiniteFunds) {
      this.vm.setFunds(99999999);
    }
    this.vm.update();
  }

  public triggerKey(keyBit: number): void {
    if (!this.vm.initialized || this.isNamingModalOpen) return;

    this.hal.playTone(keyBit === 1048576 ? 660 : keyBit === 4194304 ? 420 : 520, 0.035);

    if (keyBit === 2097152 && this.vm.state.screen === 'map') {
      this.saveInGame(true);
      return;
    }

    this.vm.handleKey(keyBit);
    this.renderFrame();
    this.updateMeta();

    if (keyBit === 1048576 || keyBit === 4194304) {
      this.scheduleInteractionSnapshot('玩家确认/菜单操作后静默快照');
    }
  }

  public handleCanvasPointerDown(clientX: number, clientY: number, rect: DOMRect): void {
    if (!this.vm.initialized || this.isNamingModalOpen) return;

    const lx = ((clientX - rect.left) / rect.width) * 240;
    const ly = ((clientY - rect.top) / rect.height) * 284;

    let hit = null;
    for (let i = this.vm.touchRegions.length - 1; i >= 0; i--) {
      const r = this.vm.touchRegions[i];
      if (r.w <= 0 || r.h <= 0) continue;
      if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) {
        hit = r;
        break;
      }
    }

    if (!hit) {
      if (this.vm.state.screen === 'tutorial') {
        this.triggerKey(1048576);
      } else if (this.vm.state.screen === 'map') {
        if (ly >= 256) this.triggerKey(1048576);
        else this.triggerKey(4194304);
      }
      return;
    }

    this.hal.playTone(660, 0.035);
    this.vm.handleTouch(hit.param);
    this.renderFrame();
    this.updateMeta();
    this.scheduleInteractionSnapshot('触控交互后静默快照');
  }

  public handleOpenNamingModal(): void {
    this.isNamingModalOpen = true;
    const theme = this.bundle.meta?.theme;
    const fallbackName = this.bundle.meta?.defaultCompanyName || '开罗国际机场';
    const title = theme === 'airport' ? '请输入国际机场名称' : '请输入观光牧场名称';
    const defVal = this.vm.state?.companyName || fallbackName;
    const presets =
      theme === 'airport'
        ? ['开罗国际机场', '晴空枢纽机场', '星海羽田机场', '太平洋航空港', '云端珍宝机场']
        : ['开罗像素牧场', '四季繁花牧场', '阳光森林牧场', '星露谷观光牧场', '云端绿野牧场'];

    if (this.onOpenNamingModal) {
      this.onOpenNamingModal({ defaultVal: defVal, title, presets });
    }
  }

  public finishNaming(ok: boolean, text?: string): void {
    this.isNamingModalOpen = false;
    this.vm.finishNaming(ok, text);
    this.renderFrame();
    this.updateMeta();
  }

  public setSpeed(speed: number): void {
    this.simSpeed = Math.max(1, speed);
  }

  public setInfiniteFunds(enabled: boolean): void {
    this.isInfiniteFunds = enabled;
    this.useOriginalFund = !enabled;
    this.vm.useOriginalFund = !enabled;
    if (enabled) {
      this.vm.setFunds(99999999);
    }
    this.updateMeta();
    this.renderFrame();
    this.hal.playTone(enabled ? 880 : 440, 0.08);
  }

  public modifyFundsOnce(amountOrDelta: number, isDelta = false): number {
    this.isInfiniteFunds = false;
    this.useOriginalFund = true;
    this.vm.useOriginalFund = true;

    const current = this.vm.getFunds();
    const target = isDelta ? current + amountOrDelta : amountOrDelta;
    this.vm.setFunds(target);
    this.updateMeta();
    this.renderFrame();
    this.hal.playTone(720, 0.08);
    return this.vm.getFunds();
  }

  public toggleAudio(): void {
    this.audioEnabled = !this.audioEnabled;
    this.hal.audioEnabled = this.audioEnabled;
  }

  public extractMetadata(): GameRuntimeMetadata {
    return this.vm.getMetadata();
  }

  public updateMeta(): void {
    if (this.onMetadataUpdate) {
      this.onMetadataUpdate(this.extractMetadata());
    }
  }

  public async triggerEventSnapshot(
    reason: string,
    slotType: 'auto' | 'manual' = 'auto',
    customLabel = ''
  ): Promise<FastResumeSnapshot> {
    const meta = this.extractMetadata();
    const vmState = this.vm.serializeState();
    const thumbnailDataUrl = this.hal.captureThumbnailDataUrl();
    const id = slotType === 'auto' ? `auto_${this.gameId}` : `manual_${this.gameId}_${Date.now()}`;

    const vfsData = {
      sysSave: this.hal.getStorageItem('sysSave'),
      slot0: this.hal.getStorageItem('save_0')
    };

    const engineSettings = {
      simSpeed: this.simSpeed,
      audioEnabled: this.audioEnabled ? 1 : 0,
      isInfiniteFunds: this.isInfiniteFunds
    };

    const snap: FastResumeSnapshot = {
      id,
      gameId: this.gameId,
      gameTitle: this.gameTitle,
      slotType,
      label: customLabel || (slotType === 'auto' ? '自动暂存现场' : '玩家手动快照'),
      triggerReason: reason,
      timestamp: Date.now(),
      thumbnailDataUrl,
      meta,
      vfsData,
      engineSettings,
      vmState
    };

    await this.resumeMgr.saveSnapshot(snap);
    if (this.onAutoSnapshotCallback) {
      this.onAutoSnapshotCallback(snap);
    }
    return snap;
  }

  public scheduleInteractionSnapshot(reason: string): void {
    if (!this.isRunning || this.vm.isOnTitleScreen()) return;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      if (!this.isRunning || this.vm.isOnTitleScreen()) return;
      this.triggerEventSnapshot(reason, 'auto');
    }, 400);
  }

  public async restoreSnapshot(snap: FastResumeSnapshot): Promise<void> {
    this.stop();
    if (!this.vm.initialized) {
      this.vm.init(this.bundle);
    }
    if (snap.vfsData) {
      if (snap.vfsData.sysSave) this.hal.setStorageItem('sysSave', snap.vfsData.sysSave);
      if (snap.vfsData.slot0) this.hal.setStorageItem('save_0', snap.vfsData.slot0);
    }
    if (snap.engineSettings) {
      if (typeof snap.engineSettings.simSpeed === 'number') {
        this.setSpeed(snap.engineSettings.simSpeed);
      }
      if (snap.engineSettings.audioEnabled !== undefined) {
        this.audioEnabled = !!snap.engineSettings.audioEnabled;
        this.hal.audioEnabled = this.audioEnabled;
      }
      if (typeof snap.engineSettings.isInfiniteFunds === 'boolean') {
        this.isInfiniteFunds = snap.engineSettings.isInfiniteFunds;
        this.useOriginalFund = !this.isInfiniteFunds;
        this.vm.useOriginalFund = this.useOriginalFund;
      }
    }
    this.vm.deserializeState(snap.vmState);
    this.vm.updateSoftKeys();
    this.renderFrame();
    this.updateMeta();
    this.hal.playTone(760, 0.08);
    this.start();
  }

  public rebootVM(): void {
    this.stop();
    this.isInfiniteFunds = false;
    this.useOriginalFund = true;
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }

    this.vm = new KairoVM(this.hal, this.useOriginalFund);
    this.bindVMCallbacks();
    this.vm.init(this.bundle);
    this.renderFrame();
    this.updateMeta();
  }

  public saveInGame(showNotice = true): boolean {
    if (!this.vm.initialized) return false;
    const ok = this.vm.saveNative();
    if (ok) {
      this.hal.playTone(880, 0.1);
      if (showNotice) {
        const meta = this.extractMetadata();
        alert(`💾 游戏原生存档已保存成功！\n场地：${meta.companyName}\n时间：${meta.dateLabel}\n资金：${meta.fundsLabel}`);
      }
    }
    return ok;
  }

  public loadNativeSave(): boolean {
    const ok = this.vm.loadNative();
    if (!ok) {
      alert('未检测到可用的游戏原生存档记录');
      return false;
    }
    this.renderFrame();
    this.updateMeta();
    this.hal.playTone(760, 0.08);
    this.start();
    const meta = this.extractMetadata();
    alert(`⚡ 已成功载入游戏原生存档！\n场地：${meta.companyName}\n时间：${meta.dateLabel}\n资金：${meta.fundsLabel}`);
    return true;
  }

  private bindLifecycleEvents(): void {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        this.triggerEventSnapshot('切出后台 / 锁屏自动挂起 (visibilitychange)');
      }
    };
    const handlePageHide = () => {
      this.triggerEventSnapshot('页面离开 / 标签页关闭前夕 (pagehide)');
    };
    const handleBlur = () => {
      this.scheduleInteractionSnapshot('窗口失焦自动备份 (blur)');
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('blur', handleBlur);
  }
}
