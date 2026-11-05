/**
 * KairoEngine.ts — 开罗游戏核心控制器
 * 采用 1:1 双倍缩放原生渲染管线、触控区域碰撞检测映射、ProcessEvent 按键分发与 FastResume 快照系统
 */
import { CilVM } from './CilVM';
import { KairoHAL } from './KairoHAL';
import { FastResumeManager } from './FastResumeManager';
import { CartridgeBundle, FastResumeSnapshot, GameRuntimeMetadata } from '../types/kairo';

export class KairoEngine {
  public hal: KairoHAL;
  public vm: CilVM;
  public resumeMgr: FastResumeManager;
  public bundle: CartridgeBundle;
  public gameId: string;
  public gameTitle: string;
  public simSpeed = 1;
  public audioEnabled = true;
  public useOriginalFund = true;
  public isNamingModalOpen = false;

  private isRunning = false;
  private animFrameId: number | null = null;
  private lastTickTime = 0;
  private uiCounter = 0;
  private settleTimer: number | null = null;

  public onAutoSnapshotCallback?: (snap: FastResumeSnapshot) => void;
  public onMetadataUpdate?: (meta: GameRuntimeMetadata) => void;
  public onSoftLabelUpdate?: (left: string, right: string) => void;
  public onOpenNamingModal?: (info: { panelMode: number; defaultVal: string; title: string; presets: string[] }) => void;
  public onGameExitCallback?: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    bundle: CartridgeBundle,
    resumeMgr: FastResumeManager,
    onAutoSnapshot?: (snap: FastResumeSnapshot) => void,
    onMetadataUpdate?: (meta: GameRuntimeMetadata) => void,
    onSoftLabelUpdate?: (left: string, right: string) => void,
    onOpenNamingModal?: (info: { panelMode: number; defaultVal: string; title: string; presets: string[] }) => void
  ) {
    this.bundle = bundle;
    this.gameId = bundle.meta?.id || 'game_dev_story';
    this.gameTitle = bundle.meta?.title || '游戏发展国';
    this.hal = new KairoHAL(canvas, this.gameId);
    this.vm = new CilVM(this.hal);
    this.resumeMgr = resumeMgr;
    this.onAutoSnapshotCallback = onAutoSnapshot;
    this.onMetadataUpdate = onMetadataUpdate;
    this.onSoftLabelUpdate = onSoftLabelUpdate;
    this.onOpenNamingModal = onOpenNamingModal;

    // Connect soft keys notification
    this.vm.onUpdateSoftKeys = (left, right) => {
      if (this.onSoftLabelUpdate) this.onSoftLabelUpdate(left, right);
    };

    // Connect in-game naming modal request
    this.vm.onOpenSetPanel = () => {
      this.handleOpenSetPanel();
    };

    // Connect auto snapshot trigger on interaction
    this.vm.onStateSnapshotNeeded = reason => {
      this.scheduleInteractionSnapshot(reason);
    };

    // Connect in-game quit event
    this.vm.onGameExit = () => {
      queueMicrotask(() => {
        if (this.onGameExitCallback) {
          this.onGameExitCallback();
        }
      });
    };

    this.vm.useOriginalFund = this.useOriginalFund;

    // Initialize bytecode and engine
    this.vm.init(bundle);
    this.renderFrame();
    this.updateMeta();
    this.bindLifecycleEvents();
  }

  public start() {
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

  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public renderFrame() {
    if (!this.vm.initialized) return;
    this.vm.touchRegions.length = 0;

    const ctx = this.hal.mainCtx;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#181c28';
    ctx.fillRect(0, 0, 240, 284);
    ctx.save();

    const stack =
      this.vm.fm && this.vm.fm.formStack_ && this.vm.fm.formStack_._vec
        ? this.vm.fm.formStack_._vec
        : [];
    for (let i = 0; i < stack.length; i++) {
      const f = stack[i];
      this.vm.fm.currentForm_ = f;
      this.hal.mainG.ox = 0;
      this.hal.mainG.oy = 0;
      this.hal.mainG.mode = 0;
      this.hal.mainG.alpha = 1.0;
      this.hal.mainG.flipMode = 0;
      ctx.restore();
      ctx.save();
      this.vm.execMethod(this.vm.resolveVirtual(f.__type, 'Draw', 1, 0), f, [this.hal.mainG]);
    }
    ctx.restore();

    // Adjust overlapping touch regions for clean hit-testing
    const tr = this.vm.touchRegions;
    for (let i = 0; i < tr.length - 1; i++) {
      const a = tr[i], b = tr[i + 1];
      if (
        a.type === b.type &&
        [3, 10, 11, 12].includes(a.type) &&
        a.x === b.x &&
        a.y < b.y &&
        a.y + a.h > b.y
      ) {
        a.h = b.y - a.y;
      }
    }

    this.vm.updateSoftKeys();
  }

  public stepSingleUpdate() {
    const top = this.vm.getTopForm();
    if (!top) return;
    this.vm.fm.currentForm_ = top;
    this.vm.execMethod(this.vm.resolveVirtual(top.__type, 'Update', 0, 0), top, []);
    while (this.vm.queuedKeys.length > 0) {
      const kb = this.vm.queuedKeys.shift()!;
      this.triggerKeyBit(kb);
    }
  }

  public triggerKey(keyBit: number) {
    this.triggerKeyBit(keyBit);
  }

  public triggerKeyBit(keyBit: number) {
    if (!this.vm.initialized || this.isNamingModalOpen) return;

    this.hal.playTone(keyBit === 1048576 ? 660 : keyBit === 4194304 ? 420 : 520, 0.035);

    const top1 = this.vm.getTopForm();
    if (!top1) return;

    const prevMF = this.vm.staticFields['form.GameForm::ModeForm'];
    const prevMM = this.vm.staticFields['form.GameForm::ModeMenu'];

    // Dispatch KEY_DOWN (event type 3)
    const pe1 = this.vm.resolveVirtual(top1.__type, 'ProcessEvent', 2, 0);
    if (pe1) {
      this.vm.execMethod(pe1, top1, [3, keyBit]);
    }

    // Step logic frame
    this.stepSingleUpdate();

    // Dispatch KEY_UP (event type 2) if still on same state
    const top2 = this.vm.getTopForm();
    const curKT = this.vm.staticFields['form.GameForm::KeyTime'];
    if (
      top2 &&
      top2 === top1 &&
      this.vm.staticFields['form.GameForm::ModeForm'] === prevMF &&
      this.vm.staticFields['form.GameForm::ModeMenu'] === prevMM &&
      curKT >= 0
    ) {
      const pe2 = this.vm.resolveVirtual(top2.__type, 'ProcessEvent', 2, 0);
      if (pe2) {
        this.vm.execMethod(pe2, top2, [2, keyBit]);
      }
    } else if (top2) {
      this.vm.staticFields['form.GameForm::KeyPress'] = 0;
    }

    this.vm.updateSoftKeys();
    this.updateMeta();

    if (
      keyBit === 2097152 &&
      this.vm.staticFields['form.GameForm::MainMode'] === 0 &&
      this.vm.staticFields['form.GameForm::ModeForm'] === 0 &&
      this.vm.staticFields['form.GameForm::ModeMenu'] === 0
    ) {
      this.saveInGame(true);
    } else if (keyBit === 1048576 || keyBit === 4194304) {
      this.scheduleInteractionSnapshot('玩家确认/菜单操作后静默快照');
    }
  }

  public handleCanvasPointerDown(clientX: number, clientY: number, rect: DOMRect) {
    if (!this.vm.initialized || this.isNamingModalOpen) return;

    const lx = ((clientX - rect.left) / rect.width) * 240;
    const ly = ((clientY - rect.top) / rect.height) * 284;

    let hit = null;
    for (let i = this.vm.touchRegions.length - 1; i >= 0; i--) {
      const r = this.vm.touchRegions[i];
      if (r.w <= 0 || r.h <= 0) continue;
      if (r.type === 2 && r.param === 0 && this.vm.staticFields['form.GameForm::ModeForm'] !== 14) {
        continue;
      }
      if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) {
        hit = r;
        break;
      }
    }

    if (!hit) {
      if (this.vm.staticFields['form.GameForm::ModeForm'] === 14) {
        this.triggerKeyBit(1048576);
      } else if (
        this.vm.staticFields['form.GameForm::MainMode'] === 0 &&
        this.vm.staticFields['form.GameForm::ModeForm'] === 0 &&
        this.vm.staticFields['form.GameForm::ModeMenu'] === 0
      ) {
        if (ly >= 260) this.triggerKeyBit(1048576);
        else this.triggerKeyBit(4194304);
      }
      return;
    }

    const t = hit.type, p = hit.param;
    if (t === 6) {
      this.triggerKeyBit(1 << (p & 0x1f));
      return;
    }
    if ([1, 4, 5, 7, 17, 18, 20, 21, 27, 28].includes(t)) {
      const shift = p === 0 ? 20 : p & 0x1f;
      this.triggerKeyBit(1 << shift);
      return;
    }
    if (t === 13 || t === 14) {
      this.triggerKeyBit(ly < hit.y + hit.h / 2 ? 131072 : 524288);
      return;
    }
    if (t === 25) {
      this.triggerKeyBit(1048576);
      return;
    }
    if (p !== 0) {
      this.vm.execMethod(100669595, this.vm.gv, [p, null]);
    }
    this.triggerKeyBit(1048576);
  }

  public handleOpenSetPanel() {
    this.isNamingModalOpen = true;
    const pm = this.vm.staticFields['form.GameForm::PanelMode'] || 1;
    let title = '请输入名称', defVal = '开罗游戏社', presets: string[] = [];

    if (pm === 1) {
      title = this.vm.translateLT('会社名を入力してください') || '请输入公司名称';
      defVal = this.vm.staticFields['form.GameForm::KaishaName'] || '开罗游戏社';
      if (defVal === 'カイロソフト' || defVal === 'Kairosoft') defVal = '开罗游戏社';
      presets = ['开罗游戏社', '幻影工作室', '像素工坊', '星海娱乐', '任天堂本社', '光荣梦想'];
    } else if (pm === 2) {
      title = this.vm.translateLT('ゲームのタイトルを入力してください') || '请输入新游戏作品名称';
      const gIdx = this.vm.staticFields['form.GameForm::GameIndex'] || 0;
      const gt = this.vm.staticFields['form.GameForm::GameTitle'];
      defVal = gt && gt[gIdx] ? gt[gIdx] : '游戏发展国';
      presets = ['游戏发展国', '勇者斗恶龙', '最终幻想', '塞尔达传说', '口袋妖怪', '超级马里奥', '怪物猎人', '星露谷物语'];
    } else if (pm === 3) {
      title = this.vm.translateLT('ハード名を入力してください') || '请输入自主研发主机名称';
      const hIdx = this.vm.staticFields['form.GameForm::HardIndex'] || 0;
      const hn = this.vm.staticFields['form.GameForm::HardName'];
      defVal = hn && hn[hIdx] ? hn[hIdx] : '开罗主机';
      presets = ['开罗次世代', '红白机FC', '超任SFC', '幻影主机', '掌上星河', '量子矩阵'];
    }

    if (this.onOpenNamingModal) {
      this.onOpenNamingModal({ panelMode: pm, defaultVal: defVal, title, presets });
    }
  }

  public finishNaming(ok: boolean, text?: string) {
    this.isNamingModalOpen = false;
    this.vm.finishSetPanel(ok, text);
    this.renderFrame();
    this.updateMeta();
  }

  public setSpeed(speed: number) {
    this.simSpeed = Math.max(1, speed);
  }

  public toggleFund() {
    this.useOriginalFund = !this.useOriginalFund;
    this.vm.useOriginalFund = this.useOriginalFund;
    if (!this.useOriginalFund) {
      this.vm.staticFields['form.GameForm::Shikin'] = 99999999;
    } else {
      this.vm.staticFields['form.GameForm::Shikin'] = 5000;
    }
    this.updateMeta();
  }

  public toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    this.hal.audioEnabled = this.audioEnabled;
  }

  public extractMetadata(): GameRuntimeMetadata {
    const companyName = String(this.vm.staticFields['form.GameForm::KaishaName'] || '开罗游戏社');
    const timeDay = Number(this.vm.staticFields['form.GameForm::TimeDay'] ?? 12);
    const year = Math.floor(timeDay / 48) + 1;
    const month = (Math.floor(timeDay / 4) % 12) + 1;
    const week = (timeDay % 4) + 1;
    const shikin = Number(this.vm.staticFields['form.GameForm::Shikin'] ?? 5000);
    const research = Number(this.vm.staticFields['form.GameForm::KaishaData'] ?? 0);
    const top = this.vm.getTopForm();
    const isTitle = top && top.__type === 'form.TitleForm';
    const mf = Number(this.vm.staticFields['form.GameForm::ModeForm'] ?? 0);
    const mm = Number(this.vm.staticFields['form.GameForm::ModeMenu'] ?? 0);

    let sceneLabel = '办公室经营中';
    if (isTitle) sceneLabel = '标题画面';
    else if (mf === 14) sceneLabel = '剧情对话中';
    else if (mf === 13 || mf === 51) sceneLabel = '新策划书制定';
    else if (mm > 0) sceneLabel = '菜单操作中';

    return {
      companyName,
      year,
      month,
      week,
      dateLabel: `${year}年 ${month}月 ${week}周`,
      funds: shikin,
      fundsLabel: `${shikin.toLocaleString()}币`,
      researchPoints: research,
      sceneLabel
    };
  }

  public updateMeta() {
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
    const vmState = this.vm.serializeVMHeap();
    const thumbnailDataUrl = this.hal.captureThumbnailDataUrl();
    const id = slotType === 'auto' ? `auto_${this.gameId}` : `manual_${this.gameId}_${Date.now()}`;

    const vfsData = {
      sysSave: this.hal.getStorageItem('sysSave'),
      slot0: this.hal.getStorageItem('save_0'),
      slot1: this.hal.getStorageItem('save_1')
    };

    const engineSettings = {
      simSpeed: this.simSpeed,
      audioEnabled: this.audioEnabled ? 1 : 0,
      useOriginalFund: this.useOriginalFund
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

  public scheduleInteractionSnapshot(reason: string) {
    if (!this.isRunning) return;
    const top = this.vm.getTopForm();
    if (!top || top.__type === 'form.TitleForm' || top === this.vm.tf) {
      return;
    }
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      if (!this.isRunning) return;
      const curTop = this.vm.getTopForm();
      if (!curTop || curTop.__type === 'form.TitleForm' || curTop === this.vm.tf) return;
      this.triggerEventSnapshot(reason, 'auto');
    }, 400);
  }

  public async restoreSnapshot(snap: FastResumeSnapshot) {
    this.stop();
    if (!this.vm.initialized) {
      this.vm.init(this.bundle);
    }
    if (snap.vfsData) {
      if (snap.vfsData.sysSave !== undefined && snap.vfsData.sysSave !== null) {
        this.hal.setStorageItem('sysSave', snap.vfsData.sysSave);
      }
      if (snap.vfsData.slot0 !== undefined && snap.vfsData.slot0 !== null) {
        this.hal.setStorageItem('save_0', snap.vfsData.slot0);
      }
      if (snap.vfsData.slot1 !== undefined && snap.vfsData.slot1 !== null) {
        this.hal.setStorageItem('save_1', snap.vfsData.slot1);
      }
    }
    if (snap.engineSettings) {
      if (typeof snap.engineSettings.simSpeed === 'number') {
        this.setSpeed(snap.engineSettings.simSpeed);
      }
      if (snap.engineSettings.audioEnabled !== undefined) {
        this.audioEnabled = !!snap.engineSettings.audioEnabled;
        this.hal.audioEnabled = this.audioEnabled;
      }
      if (typeof snap.engineSettings.useOriginalFund === 'boolean') {
        this.useOriginalFund = snap.engineSettings.useOriginalFund;
        this.vm.useOriginalFund = this.useOriginalFund;
      }
    }
    this.vm.deserializeVMHeap(snap.vmState);
    this.vm.updateSoftKeys();
    this.renderFrame();
    this.updateMeta();
    this.hal.playTone(760, 0.08);
    this.start();
  }

  public rebootVM() {
    this.stop();
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }

    this.vm = new CilVM(this.hal, this.useOriginalFund);

    this.vm.onUpdateSoftKeys = (left, right) => {
      if (this.onSoftLabelUpdate) this.onSoftLabelUpdate(left, right);
    };

    this.vm.onOpenSetPanel = () => {
      this.handleOpenSetPanel();
    };

    this.vm.onStateSnapshotNeeded = reason => {
      this.scheduleInteractionSnapshot(reason);
    };

    this.vm.onGameExit = () => {
      queueMicrotask(() => {
        if (this.onGameExitCallback) {
          this.onGameExitCallback();
        }
      });
    };

    this.vm.init(this.bundle);
    this.renderFrame();
    this.updateMeta();
  }

  public restartGame() {
    this.rebootVM();
    this.hal.playTone(600, 0.08);
    this.start();
  }

  public saveInGame(showNotice = true): boolean {
    if (!this.vm.initialized || !this.vm.gf) return false;
    try {
      this.vm.staticFields['form.GameForm::KirokuLoadGame'] = 1;
      this.vm.staticFields['form.GameForm::KirokuLoadGameName'] =
        this.vm.staticFields['form.GameForm::KaishaName'] || '开罗游戏社';
      this.vm.staticFields['form.GameForm::KirokuLoadGameMoney'] =
        this.vm.staticFields['form.GameForm::Shikin'] ?? 5000;
      this.vm.staticFields['form.GameForm::KirokuLoadGameDay'] =
        this.vm.staticFields['form.GameForm::TimeDay'] ?? 12;

      this.vm.execMethod(100669134, this.vm.gf, []); // HiScoreSave
      this.vm.execMethod(100669136, this.vm.gf, [0]); // SaveSystemData
      this.vm.execMethod(100669136, this.vm.gf, [1]); // SaveGameData

      this.hal.playTone(880, 0.1);
      if (showNotice) {
        const meta = this.extractMetadata();
        alert(`💾 游戏原生存档已保存成功！\n公司：${meta.companyName}\n时间：${meta.dateLabel}\n资金：${meta.fundsLabel}`);
      }
      return true;
    } catch (e: any) {
      console.error('saveInGame error:', e);
      return false;
    }
  }

  public loadNativeSave(): boolean {
    const sys = this.hal.getStorageItem('sysSave');
    const save = this.hal.getStorageItem('save_0') || this.hal.getStorageItem('save_1');
    if (!sys || !save) {
      alert('未检测到可用的游戏原生存档记录');
      return false;
    }
    try {
      this.rebootVM();
      // Load game slot 1 (which reads save_0)
      this.vm.execMethod(100669139, this.vm.gf, [1, 1]); // GameLoad(LOAD_MODE_GAME, 1)
      this.renderFrame();
      this.updateMeta();
      this.hal.playTone(760, 0.08);
      this.start();
      const meta = this.extractMetadata();
      alert(`⚡ 已成功载入游戏原生存档！\n公司：${meta.companyName}\n时间：${meta.dateLabel}\n资金：${meta.fundsLabel}`);
      return true;
    } catch (e: any) {
      console.error('loadNativeSave error:', e);
      alert('载入原生存档失败: ' + e.message);
      this.start();
      return false;
    }
  }

  private bindLifecycleEvents() {
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
