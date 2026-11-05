/**
 * KairoVM.ts — 开罗泛用卡带数据驱动虚拟机 (KAIRO_UNIVERSAL_DATA_V1)
 * 专为 tools/apk2cartridge.py 提取的开罗 IL2CPP 卡带设计，原生支持等轴测地图、设施建造、航线/特产、委托/竞赛与 FastResume 状态快照
 */
import { KairoHAL } from './KairoHAL';
import { CartridgeBundle, GameRuntimeMetadata, TouchRegion } from '../types/kairo';

export type ScreenMode =
  | 'title'
  | 'tutorial'
  | 'map'
  | 'main_menu'
  | 'build_catalog'
  | 'build_place'
  | 'special_routes'
  | 'challenges'
  | 'dictionary'
  | 'system';

export interface MapTileCell {
  gx: number;
  gy: number;
  baseType: string;
  itemIdx: number;
  level: number;
  popularity: number;
  scenery: number;
}

export interface MapActor {
  id: number;
  gx: number;
  gy: number;
  tx: number;
  ty: number;
  progress: number;
  dir: number;
  frame: number;
}

export interface MapVehicle {
  id: number;
  name: string;
  imgKey: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  state: 'landing' | 'parked' | 'takeoff';
  timer: number;
  reward: number;
}

export interface FloatingPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export interface KairoVMState {
  screen: ScreenMode;
  theme: 'airport' | 'farm' | string;
  companyName: string;
  timeDay: number;
  funds: number;
  researchPoints: number;
  fame: number;
  visitorsCount: number;
  hasNativeSave: boolean;
  titleMenuIdx: number;
  titleTick: number;
  titleShowHelp: boolean;
  tick: number;
  daySubTick: number;
  curX: number;
  curY: number;
  camX: number;
  camY: number;
  dialogIdx: number;
  menuCursor: number;
  buildCatIdx: number;
  buildCursor: number;
  selectedBuildIdx: number;
  specialTab: number;
  specialCursor: number;
  challengeCursor: number;
  dictTab: number;
  dictCursor: number;
  sysCursor: number;
  ownedSpecials: number[];
  unlockedRoutes: number[];
  completedChallenges: number[];
  mapGrid: MapTileCell[][];
  actors: MapActor[];
  vehicles: MapVehicle[];
  popups: FloatingPopup[];
  toastText: string;
  toastTimer: number;
}

export class KairoVM {
  public hal: KairoHAL;
  public bundle!: CartridgeBundle;
  public state!: KairoVMState;
  public touchRegions: TouchRegion[] = [];
  public initialized = false;
  public useOriginalFund = true;

  public onOpenNamingModal?: () => void;
  public onUpdateSoftKeys?: (left: string, right: string) => void;
  public onStateSnapshotNeeded?: (reason: string) => void;
  public onGameExit?: () => void;

  constructor(hal: KairoHAL, useOriginalFund = true) {
    this.hal = hal;
    this.useOriginalFund = useOriginalFund;
  }

  public init(bundle: CartridgeBundle): void {
    this.bundle = bundle;
    this.hal.loadBundleTextures(bundle);

    const meta = bundle.meta || { id: 'jumbo_airport_story', title: '珍宝机场物语' };
    const theme = meta.theme || (meta.id.includes('airport') ? 'airport' : 'farm');
    const defName = meta.defaultCompanyName || (theme === 'airport' ? '开罗国际机场' : '开罗像素牧场');
    const udata = bundle.universalData || {
      buildItems: [],
      specialItems: [],
      routesOrProducts: [],
      challenges: [],
      openingDialogs: ['欢迎来到开罗经营世界！让我们一起打造世界第一的名胜吧！'],
      manualPages: [],
      combos: []
    };

    const hasSave = !!(this.hal.getStorageItem('save_0') || this.hal.getStorageItem('sysSave'));

    // 初始化 9x9 等轴测地图网格
    const gridW = 9;
    const gridH = 9;
    const mapGrid: MapTileCell[][] = [];
    for (let gy = 0; gy < gridH; gy++) {
      const row: MapTileCell[] = [];
      for (let gx = 0; gx < gridW; gx++) {
        if (theme === 'airport') {
          let baseType = 'grass';
          if (gy === 0 || gy === 1) baseType = 'runway';
          else if (gy === 2 && gx >= 1 && gx <= 7) baseType = 'apron';
          else if (gy >= 3 && gy <= 7 && gx >= 1 && gx <= 7) baseType = 'floor';
          else if (gy === 8 && gx >= 3 && gx <= 5) baseType = 'road';
          row.push({ gx, gy, baseType, itemIdx: -1, level: 1, popularity: 10, scenery: 5 });
        } else {
          let baseType = 'grass';
          if (gx === 4 || gy === 4) baseType = 'road';
          else if (gx >= 1 && gx <= 3 && gy >= 1 && gy <= 3) baseType = 'soil';
          else if (gx >= 5 && gx <= 7 && gy >= 1 && gy <= 3) baseType = 'ranch';
          row.push({ gx, gy, baseType, itemIdx: -1, level: 1, popularity: 10, scenery: 8 });
        }
      }
      mapGrid.push(row);
    }

    const findItemIdxByImg = (substrs: string[], fallbackIdx: number) => {
      for (const s of substrs) {
        const idx = udata.buildItems.findIndex(
          it => (it.imgKey || '').includes(s) || (it.name || '').includes(s)
        );
        if (idx >= 0) return idx;
      }
      return Math.min(fallbackIdx, Math.max(0, udata.buildItems.length - 1));
    };

    if (udata.buildItems.length > 0) {
      if (theme === 'airport') {
        mapGrid[2][2].itemIdx = findItemIdxByImg(['spot0', '停机坪'], 6);
        mapGrid[2][5].itemIdx = findItemIdxByImg(['spot0', '停机坪'], 6);
        mapGrid[2][7].itemIdx = findItemIdxByImg(['control_tower', '管制塔'], 7);
        mapGrid[3][3].itemIdx = findItemIdxByImg(['boardinggate', '登机口'], 2);
        mapGrid[3][5].itemIdx = findItemIdxByImg(['exit', '到达口'], 3);
        mapGrid[5][2].itemIdx = findItemIdxByImg(['checkin', '值机'], 4);
        mapGrid[5][4].itemIdx = findItemIdxByImg(['security', '安检'], 12);
        mapGrid[6][6].itemIdx = findItemIdxByImg(['bench', '长椅'], 17);
        mapGrid[4][1].itemIdx = findItemIdxByImg(['sakura', '植物'], 16);
      } else {
        mapGrid[1][1].itemIdx = findItemIdxByImg(['hatake', '花田', '农田'], 2);
        mapGrid[1][2].itemIdx = findItemIdxByImg(['hatake', '花田'], 2);
        mapGrid[2][1].itemIdx = findItemIdxByImg(['hatake', '花田'], 3);
        mapGrid[2][2].itemIdx = findItemIdxByImg(['hatake', '蔬果'], 4);
        mapGrid[1][6].itemIdx = findItemIdxByImg(['saku_zimen', '动物', '牧栏'], 1);
        mapGrid[2][6].itemIdx = findItemIdxByImg(['saku_zimen', '动物'], 1);
        mapGrid[5][3].itemIdx = findItemIdxByImg(['shisetsu102', '休息', '长椅'], 6);
        mapGrid[5][5].itemIdx = findItemIdxByImg(['shisetsu107', '花店', '商店'], 7);
        mapGrid[6][3].itemIdx = findItemIdxByImg(['shisetsu106', '水井', '饮水'], 8);
      }
    }

    const actors: MapActor[] = [];
    for (let i = 0; i < 10; i++) {
      actors.push({
        id: i,
        gx: 2 + (i % 6),
        gy: 3 + (Math.floor(i / 2) % 5),
        tx: 2 + ((i + 3) % 6),
        ty: 3 + ((i + 2) % 5),
        progress: (i * 0.17) % 1,
        dir: i % 2,
        frame: i % 3
      });
    }

    const vehicles: MapVehicle[] = [
      {
        id: 0,
        name: udata.specialItems[0]?.name || (theme === 'airport' ? '天鹰 (SA-1)' : '向日葵号'),
        imgKey: udata.specialItems[0]?.imgKey || (theme === 'airport' ? 'cessna_b.png' : 'hana00.png'),
        x: 210,
        y: 52,
        targetX: 88,
        targetY: 56,
        state: 'landing',
        timer: 0,
        reward: udata.specialItems[0]?.income || 420
      }
    ];

    this.state = {
      screen: 'title',
      theme,
      companyName: defName,
      timeDay: 12,
      funds: this.useOriginalFund ? 12000 : 99999999,
      researchPoints: 25,
      fame: 35,
      visitorsCount: 18,
      hasNativeSave: hasSave,
      titleMenuIdx: hasSave ? 1 : 0,
      titleTick: 0,
      titleShowHelp: false,
      tick: 0,
      daySubTick: 0,
      curX: 4,
      curY: 4,
      camX: 0,
      camY: 0,
      dialogIdx: 0,
      menuCursor: 0,
      buildCatIdx: 0,
      buildCursor: 0,
      selectedBuildIdx: 0,
      specialTab: 0,
      specialCursor: 0,
      challengeCursor: 0,
      dictTab: 0,
      dictCursor: 0,
      sysCursor: 0,
      ownedSpecials: [0],
      unlockedRoutes: [0],
      completedChallenges: [],
      mapGrid,
      actors,
      vehicles,
      popups: [],
      toastText: '',
      toastTimer: 0
    };

    this.updateSoftKeys();
    this.initialized = true;
  }

  public isOnTitleScreen(): boolean {
    return !this.state || this.state.screen === 'title';
  }

  public getFunds(): number {
    return this.state ? this.state.funds : 12000;
  }

  public setFunds(amount: number): void {
    if (this.state) {
      this.state.funds = Math.min(99999999, Math.max(0, Math.floor(amount)));
    }
  }

  public getMetadata(): GameRuntimeMetadata {
    const s = this.state;
    const timeDay = s ? s.timeDay : 12;
    const year = Math.floor(timeDay / 48) + 1;
    const month = (Math.floor(timeDay / 4) % 12) + 1;
    const week = (timeDay % 4) + 1;
    const funds = s ? s.funds : 12000;

    let sceneLabel = s?.theme === 'airport' ? '机场运营中' : '牧场经营中';
    if (!s || s.screen === 'title') sceneLabel = '标题画面';
    else if (s.screen === 'tutorial') sceneLabel = '秘书引导中';
    else if (s.screen === 'build_place') sceneLabel = '设施选址建造中';
    else if (s.screen !== 'map') sceneLabel = '菜单操作中';

    return {
      companyName: s?.companyName || this.bundle?.meta?.defaultCompanyName || '开罗国际机场',
      year,
      month,
      week,
      dateLabel: `${year}年 ${month}月 ${week}周`,
      funds,
      fundsLabel: `${funds.toLocaleString()}币`,
      researchPoints: s?.researchPoints ?? 25,
      sceneLabel
    };
  }

  public updateSoftKeys(): void {
    if (!this.onUpdateSoftKeys || !this.state) return;
    if (this.state.screen === 'title') {
      this.onUpdateSoftKeys('确定', '说明');
    } else if (this.state.screen === 'tutorial') {
      this.onUpdateSoftKeys('继续', '跳过');
    } else if (this.state.screen === 'map') {
      this.onUpdateSoftKeys('存档', '菜单');
    } else {
      this.onUpdateSoftKeys('确定', '返回');
    }
  }

  public finishNaming(ok: boolean, text?: string): void {
    if (!this.state) return;
    const defName = this.bundle.meta?.defaultCompanyName || '开罗国际机场';
    const val = (text || '').trim() || defName;
    if (ok) {
      this.state.companyName = val;
    }
    if (this.state.screen === 'tutorial') {
      this.state.screen = 'map';
      this.state.toastText = `🎉 欢迎来到「${this.state.companyName}」！`;
      this.state.toastTimer = 65;
    }
    this.updateSoftKeys();
    if (this.onStateSnapshotNeeded) {
      this.onStateSnapshotNeeded('完成命名并开启经营自动快照');
    }
  }

  public saveNative(): boolean {
    if (!this.state) return false;
    try {
      this.state.hasNativeSave = true;
      const payload = JSON.stringify(this.state);
      const b64 = btoa(unescape(encodeURIComponent(payload)));
      this.hal.setStorageItem('sysSave', b64);
      this.hal.setStorageItem('save_0', b64);
      return true;
    } catch (e) {
      console.error('saveNative failed:', e);
      return false;
    }
  }

  public loadNative(): boolean {
    const raw = this.hal.getStorageItem('save_0') || this.hal.getStorageItem('sysSave');
    if (!raw) return false;
    try {
      const jsonStr = decodeURIComponent(escape(atob(raw)));
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.mapGrid) {
        this.state = {
          ...this.state,
          ...parsed,
          screen: 'map',
          hasNativeSave: true,
          toastText: '⚡ 原生存档读取成功！',
          toastTimer: 60
        };
        this.updateSoftKeys();
        return true;
      }
      return false;
    } catch (e) {
      console.error('loadNative failed:', e);
      return false;
    }
  }

  public serializeState(): { version: number; state: KairoVMState } {
    return {
      version: 2,
      state: JSON.parse(JSON.stringify(this.state))
    };
  }

  public deserializeState(vmState: any): boolean {
    if (!vmState) return false;
    const rawState = vmState.state || vmState.roots?.gf;
    if (!rawState) return false;
    this.state = JSON.parse(JSON.stringify(rawState));
    this.touchRegions.length = 0;
    this.updateSoftKeys();
    return true;
  }

  private addTouch(type: number, x: number, y: number, w: number, h: number, param: number) {
    this.touchRegions.push({ type, x, y, w, h, param });
  }

  private isoToScreen(gx: number, gy: number): [number, number] {
    const sx = 120 + (gx - gy) * 18 + (this.state.camX || 0);
    const sy = 56 + (gx + gy) * 9 + (this.state.camY || 0);
    return [sx, sy];
  }

  private drawIsoDiamond(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    fill: string,
    stroke: string
  ) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 18, sy + 9);
    ctx.lineTo(sx, sy + 18);
    ctx.lineTo(sx - 18, sy + 9);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  private drawSpriteFit(
    ctx: CanvasRenderingContext2D,
    key: string,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    sx = 0,
    sy = 0,
    sw?: number,
    sh?: number
  ): boolean {
    if (!key) return false;
    const imgObj = this.hal.getImageObj(key);
    if (!imgObj || !imgObj.el || (imgObj.el.tagName === 'IMG' && !imgObj.el.complete) || imgObj.width <= 0) {
      return false;
    }
    const srcW = sw ?? imgObj.width;
    const srcH = sh ?? imgObj.height;
    ctx.drawImage(imgObj.el, sx, sy, srcW, srcH, dx, dy, dw, dh);
    return true;
  }

  private drawKairoBox(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    bg = 'rgba(18, 28, 48, 0.92)',
    border = '#f59e0b'
  ) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  }

  private drawPixelText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color = '#ffffff',
    size = 10,
    align: CanvasTextAlign = 'left',
    shadow = true
  ) {
    ctx.font = `bold ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = align;
    if (shadow) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      ctx.fillText(text, x + 1, y + 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }

  private wrapTextLines(text: string, maxCharsPerLine: number): string[] {
    const clean = String(text || '').trim();
    if (!clean) return [];
    const out: string[] = [];
    let cur = '';
    for (const ch of clean) {
      cur += ch;
      if (cur.length >= maxCharsPerLine) {
        out.push(cur);
        cur = '';
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  public update(): void {
    const s = this.state;
    if (!s) return;

    if (s.screen === 'title') {
      s.titleTick++;
      return;
    }

    s.tick++;
    if (s.toastTimer > 0) s.toastTimer--;

    for (let i = s.popups.length - 1; i >= 0; i--) {
      s.popups[i].y -= 0.45;
      s.popups[i].life--;
      if (s.popups[i].life <= 0) s.popups.splice(i, 1);
    }

    if (s.screen !== 'map') return;

    // 推进经营日历与设施周结算
    s.daySubTick++;
    if (s.daySubTick >= 36) {
      s.daySubTick = 0;
      s.timeDay++;

      const udata = this.bundle.universalData;
      let facilityCount = 0;
      let weeklyIncome = 150;
      for (let y = 0; y < s.mapGrid.length; y++) {
        for (let x = 0; x < s.mapGrid[y].length; x++) {
          const cell = s.mapGrid[y][x];
          if (cell.itemIdx >= 0 && udata?.buildItems[cell.itemIdx]) {
            facilityCount++;
            const it = udata.buildItems[cell.itemIdx];
            weeklyIncome += Math.max(40, it.charge || 60);
          }
        }
      }
      const routeCount = s.unlockedRoutes.length;
      weeklyIncome += routeCount * 180;

      s.funds = Math.min(99999999, s.funds + weeklyIncome);
      s.researchPoints = Math.min(9999, s.researchPoints + Math.max(1, Math.floor(facilityCount / 3)));
      s.visitorsCount = 12 + facilityCount * 3 + routeCount * 5;
      s.popups.push({
        x: 120,
        y: 44,
        text: `+${weeklyIncome}币  +${Math.max(1, Math.floor(facilityCount / 3))}研`,
        color: '#fde047',
        life: 32
      });
    }

    // 访客与员工在等轴测网格内自主寻路与消费
    for (const ac of s.actors) {
      ac.progress += 0.035;
      if (s.tick % 6 === 0) ac.frame = (ac.frame + 1) % 3;
      if (ac.progress >= 1) {
        ac.gx = ac.tx;
        ac.gy = ac.ty;
        ac.progress = 0;

        const cell = s.mapGrid[ac.gy]?.[ac.gx];
        const udata = this.bundle.universalData;
        if (cell && cell.itemIdx >= 0 && udata?.buildItems[cell.itemIdx] && (s.tick + ac.id) % 3 === 0) {
          const it = udata.buildItems[cell.itemIdx];
          const bonus = Math.max(30, it.charge || 50);
          s.funds = Math.min(99999999, s.funds + bonus);
          const [sx, sy] = this.isoToScreen(ac.gx, ac.gy);
          if (s.popups.length < 8) {
            s.popups.push({
              x: sx,
              y: sy - 8,
              text: `+${bonus}G`,
              color: '#4ade80',
              life: 24
            });
          }
        }

        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ];
        const d = dirs[(s.tick + ac.id * 7) % 4];
        ac.tx = Math.max(1, Math.min(7, ac.gx + d[0]));
        ac.ty = Math.max(2, Math.min(7, ac.gy + d[1]));
        ac.dir = ac.tx >= ac.gx ? 0 : 1;
      }
    }

    // 航班客机或观光车辆起降循环
    for (const v of s.vehicles) {
      if (v.state === 'landing') {
        v.x -= 1.8;
        v.y += 0.35;
        if (v.x <= v.targetX) {
          v.state = 'parked';
          v.timer = 45;
          const bonus = v.reward || 450;
          s.funds = Math.min(99999999, s.funds + bonus);
          s.popups.push({
            x: v.x,
            y: v.y - 6,
            text: s.theme === 'airport' ? `✈ 航班抵达 +${bonus}币` : `🌻 观光巴士 +${bonus}币`,
            color: '#38bdf8',
            life: 30
          });
        }
      } else if (v.state === 'parked') {
        v.timer--;
        if (v.timer <= 0) v.state = 'takeoff';
      } else {
        v.x -= 2.2;
        v.y -= 0.5;
        if (v.x < -60) {
          const owned = s.ownedSpecials.length ? s.ownedSpecials : [0];
          const pickIdx = owned[s.tick % owned.length] || 0;
          const sp = this.bundle.universalData?.specialItems[pickIdx];
          v.name = sp?.name || v.name;
          v.imgKey = sp?.imgKey || v.imgKey;
          v.reward = sp?.income || 480;
          v.x = 248;
          v.y = 42;
          v.state = 'landing';
        }
      }
    }
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    if (!this.initialized || !this.state) return;
    this.touchRegions.length = 0;

    if (this.state.screen === 'title') {
      this.drawTitleScreen(ctx);
    } else {
      this.drawGameScreen(ctx);
    }
  }

  private drawTitleScreen(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const isAirport = s.theme === 'airport';
    const tick = s.titleTick;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, 284);
    if (isAirport) {
      bgGrad.addColorStop(0, '#1e88e5');
      bgGrad.addColorStop(0.65, '#90caf9');
      bgGrad.addColorStop(1, '#43a047');
    } else {
      bgGrad.addColorStop(0, '#29b6f6');
      bgGrad.addColorStop(0.6, '#b3e5fc');
      bgGrad.addColorStop(1, '#66bb6a');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 240, 284);

    if (isAirport) {
      this.drawSpriteFit(ctx, 'title_bg.png', 0, 0, 240, 240, 0, 0, 480, 480);
      this.drawSpriteFit(ctx, 'title_bgobj.png', 0, 145, 240, 66, 0, 0, 480, 132);
      const px = 250 - ((tick * 1.4) % 320);
      const py = 54 + Math.sin(tick * 0.08) * 5;
      this.drawSpriteFit(ctx, 'title_plane.png', px, py, 76, 38, 0, 0, 110, 56);
    } else {
      this.drawSpriteFit(ctx, 'title_back.png', 0, 0, 240, 240, 0, 0, 480, 480);
      const cx1 = 240 - ((tick * 0.6) % 310);
      const cx2 = 240 - (((tick * 0.4) + 150) % 310);
      this.drawSpriteFit(ctx, 'title_kumo0.png', cx1, 24, 80, 34, 0, 0, 143, 60);
      this.drawSpriteFit(ctx, 'title_kumo1.png', cx2, 48, 72, 30, 0, 0, 143, 60);
      this.drawSpriteFit(ctx, 'title_front1.png', 0, 132, 240, 110, 0, 0, 240, 127);
      this.drawSpriteFit(ctx, 'title_front0.png', 0, 224, 240, 26, 0, 0, 240, 26);
    }

    const logoDrawn = this.drawSpriteFit(
      ctx,
      'title_title.png',
      10,
      14,
      220,
      112,
      0,
      0,
      480,
      isAirport ? 255 : 260
    );
    if (!logoDrawn) {
      this.drawKairoBox(ctx, 20, 24, 200, 64, 'rgba(15, 23, 42, 0.88)', '#fbbf24');
      this.drawPixelText(ctx, this.bundle.meta?.title || '开罗经营物语', 120, 42, '#fde047', 16, 'center');
    }

    this.drawKairoBox(ctx, 32, 128, 176, 18, 'rgba(15, 23, 42, 0.82)', '#38bdf8');
    this.drawPixelText(
      ctx,
      isAirport ? '✈ 珍宝国际航空港 · 简体中文版' : '🌻 四季观光像素牧场 · 简体中文版',
      120,
      132,
      '#e0f2fe',
      9,
      'center'
    );

    const labels = [
      '▶ 开始新经营',
      s.hasNativeSave ? '⚡ 继续原生存档' : '📂 读取原生存档',
      '📖 玩法与相性辞典'
    ];
    for (let i = 0; i < labels.length; i++) {
      const bx = 42;
      const by = 156 + i * 28;
      const bw = 156;
      const bh = 23;
      const selected = s.titleMenuIdx === i;
      this.drawKairoBox(
        ctx,
        bx,
        by,
        bw,
        bh,
        selected ? 'rgba(245, 158, 11, 0.95)' : 'rgba(15, 23, 42, 0.88)',
        selected ? '#fef08a' : '#64748b'
      );
      this.drawPixelText(
        ctx,
        labels[i],
        120,
        by + 6,
        selected ? '#0f172a' : '#f8fafc',
        10,
        'center',
        !selected
      );
      this.addTouch(10, bx, by, bw, bh, 100 + i);
    }

    this.drawKairoBox(ctx, 0, 264, 240, 20, 'rgba(9, 13, 22, 0.92)', '#334155');
    this.drawPixelText(ctx, '© Kairosoft · 泛用卡带虚拟机运行层', 120, 269, '#94a3b8', 9, 'center');

    if (s.titleShowHelp) {
      this.drawKairoBox(ctx, 12, 28, 216, 224, 'rgba(15, 23, 42, 0.96)', '#fbbf24');
      this.drawPixelText(ctx, `📖 ${this.bundle.meta?.title || ''} 经营指南`, 120, 36, '#fde047', 11, 'center');
      const pages = this.bundle.universalData?.manualPages || [];
      const text = pages[0] || '通过规划道路与设施吸引访客，不断扩建并参加全国评级大赛！';
      const lines = this.wrapTextLines(text, 18).slice(0, 9);
      lines.forEach((ln, idx) => {
        this.drawPixelText(ctx, ln, 22, 58 + idx * 16, '#e2e8f0', 9.5);
      });
      this.drawPixelText(ctx, '点击任意处或按【确定/返回】关闭', 120, 232, '#38bdf8', 9, 'center');
      this.addTouch(10, 12, 28, 216, 224, 199);
    }
  }

  private drawGameScreen(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const isAirport = s.theme === 'airport';
    const udata = this.bundle.universalData;

    ctx.fillStyle = isAirport ? '#bfe3f7' : '#c8facc';
    ctx.fillRect(0, 0, 240, 284);
    ctx.fillStyle = isAirport ? '#5cb85c' : '#7cb342';
    ctx.fillRect(0, 34, 240, 224);

    // 1. 绘制 9x9 等轴测地面网格
    for (let gy = 0; gy < s.mapGrid.length; gy++) {
      for (let gx = 0; gx < s.mapGrid[gy].length; gx++) {
        const cell = s.mapGrid[gy][gx];
        const [sx, sy] = this.isoToScreen(gx, gy);

        let fill = isAirport ? '#689f38' : '#7cb342';
        let stroke = 'rgba(255,255,255,0.22)';
        if (cell.baseType === 'runway') {
          fill = '#475569';
          stroke = '#cbd5e1';
        } else if (cell.baseType === 'apron') {
          fill = '#64748b';
          stroke = '#94a3b8';
        } else if (cell.baseType === 'floor') {
          fill = '#dbeafe';
          stroke = '#93c5fd';
        } else if (cell.baseType === 'road') {
          fill = isAirport ? '#94a3b8' : '#d7ccc8';
          stroke = '#a1887f';
        } else if (cell.baseType === 'soil') {
          fill = '#8d6e63';
          stroke = '#5d4037';
        } else if (cell.baseType === 'ranch') {
          fill = '#aed581';
          stroke = '#fbc02d';
        }

        this.drawIsoDiamond(ctx, sx, sy, fill, stroke);

        if (cell.baseType === 'runway' && gy === 0) {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(sx - 5, sy + 8, 10, 2);
        }

        if (s.screen === 'map' || s.screen === 'build_place') {
          this.addTouch(10, sx - 15, sy + 1, 30, 16, 2000 + gx * 100 + gy);
        }

        if (gx === s.curX && gy === s.curY) {
          this.drawIsoDiamond(
            ctx,
            sx,
            sy,
            s.screen === 'build_place' ? 'rgba(56, 189, 248, 0.55)' : 'rgba(250, 204, 21, 0.45)',
            '#fef08a'
          );
        }
      }
    }

    // 2. 绘制已建成的建筑、跑道设施、花田与树木精灵
    for (let gy = 0; gy < s.mapGrid.length; gy++) {
      for (let gx = 0; gx < s.mapGrid[gy].length; gx++) {
        const cell = s.mapGrid[gy][gx];
        const [sx, sy] = this.isoToScreen(gx, gy);

        if (cell.itemIdx >= 0 && udata.buildItems[cell.itemIdx]) {
          const it = udata.buildItems[cell.itemIdx];
          const imgKey = it.imgKey;
          const imgObj = this.hal.getImageObj(imgKey);
          if (imgObj && imgObj.el && imgObj.width > 0) {
            let srcW = imgObj.width;
            let srcH = imgObj.height;
            if (srcW >= 180 && srcH >= 100) {
              srcW = 60;
              srcH = 44;
            } else if (srcW >= 120 && srcH <= 40) {
              srcW = 48;
            }
            const drawW = Math.min(34, Math.max(20, Math.round(srcW * 0.55)));
            const drawH = Math.min(36, Math.max(16, Math.round(srcH * 0.55)));
            this.drawSpriteFit(ctx, imgKey, sx - drawW / 2, sy + 11 - drawH, drawW, drawH, 0, 0, srcW, srcH);
          } else {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(sx - 8, sy - 6, 16, 14);
          }
        }
      }
    }

    if (!isAirport && Array.isArray(s.ownedSpecials)) {
      s.ownedSpecials.slice(0, 6).forEach((spIdx: number, idx: number) => {
        const sp = udata.specialItems[spIdx];
        if (sp && sp.imgKey) {
          const [sx, sy] = this.isoToScreen(1 + (idx % 3), 1 + Math.floor(idx / 3));
          this.drawSpriteFit(ctx, sp.imgKey, sx - 12, sy - 4, 24, 18);
        }
      });
    }

    // 3. 绘制移动中的访客与员工
    for (const ac of s.actors) {
      const ix = ac.gx + (ac.tx - ac.gx) * ac.progress;
      const iy = ac.gy + (ac.ty - ac.gy) * ac.progress;
      const [sx, sy] = this.isoToScreen(ix, iy);
      const charKey = isAirport ? 'chara0.png' : 'assistant00.png';
      const drawn = this.drawSpriteFit(
        ctx,
        charKey,
        sx - 7,
        sy - 8,
        14,
        18,
        (ac.frame % 3) * 50,
        0,
        50,
        isAirport ? 54 : 90
      );
      if (!drawn) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(sx - 3, sy - 5, 6, 10);
      }
    }

    // 4. 绘制起降客机或牧场车辆
    for (const v of s.vehicles) {
      if (isAirport) {
        this.drawSpriteFit(ctx, v.imgKey || 'b747_b.png', v.x - 28, v.y - 14, 56, 26);
      } else {
        this.drawSpriteFit(ctx, v.imgKey || 'hana00.png', v.x - 16, v.y - 10, 32, 22);
      }
    }

    // 5. 绘制浮动收益气泡
    for (const p of s.popups) {
      this.drawPixelText(ctx, p.text, p.x, p.y, p.color, 9, 'center');
    }

    // 6. 顶部状态栏 HUD
    this.drawKairoBox(ctx, 0, 0, 240, 34, 'rgba(15, 23, 42, 0.94)', '#f59e0b');
    const year = Math.floor(s.timeDay / 48) + 1;
    const month = (Math.floor(s.timeDay / 4) % 12) + 1;
    const week = (s.timeDay % 4) + 1;

    this.drawPixelText(ctx, s.companyName, 6, 4, '#fde047', 10);
    this.drawPixelText(ctx, `${year}年${month}月${week}周`, 108, 4, '#e2e8f0', 9.5);
    this.drawPixelText(ctx, `💰 ${s.funds.toLocaleString()}币`, 6, 18, '#4ade80', 9.5);
    this.drawPixelText(ctx, `🔬 研:${s.researchPoints}  ♥人气:${s.fame}`, 118, 18, '#38bdf8', 9);

    // 7. 底部选中地块信息栏
    const curCell = s.mapGrid[s.curY]?.[s.curX];
    const curFacility = curCell && curCell.itemIdx >= 0 ? udata.buildItems[curCell.itemIdx] : null;
    this.drawKairoBox(ctx, 0, 236, 240, 20, 'rgba(15, 23, 42, 0.88)', '#475569');
    if (s.screen === 'build_place') {
      const targetIt = udata.buildItems[s.selectedBuildIdx];
      this.drawPixelText(
        ctx,
        `🔨 选址建造【${targetIt?.name || '设施'}】(${targetIt?.price || 0}币) · 点击地块或按确定`,
        6,
        241,
        '#fde047',
        8.5
      );
    } else {
      const tileDesc = curFacility
        ? `📍 (${s.curX},${s.curY}) ${curFacility.name} · 收费:${curFacility.charge}币 人气+${curFacility.popularity}`
        : `📍 (${s.curX},${s.curY}) 空地 (${curCell?.baseType || '草地'}) · 点击建造设施`;
      this.drawPixelText(ctx, tileDesc, 6, 241, '#e2e8f0', 8.5);
    }

    // 8. 底部快捷导航栏
    const navLabels = [
      '🔨建造',
      isAirport ? '✈航线' : '🌱培育',
      isAirport ? '🏆委托' : '🏆竞赛',
      '📖辞典',
      '⚙系统'
    ];
    for (let i = 0; i < navLabels.length; i++) {
      const bx = i * 48;
      const by = 256;
      const bw = 48;
      const bh = 28;
      const active =
        (i === 0 && (s.screen === 'build_catalog' || s.screen === 'build_place')) ||
        (i === 1 && s.screen === 'special_routes') ||
        (i === 2 && s.screen === 'challenges') ||
        (i === 3 && s.screen === 'dictionary') ||
        (i === 4 && (s.screen === 'system' || s.screen === 'main_menu'));
      this.drawKairoBox(
        ctx,
        bx,
        by,
        bw,
        bh,
        active ? 'rgba(245, 158, 11, 0.95)' : 'rgba(15, 23, 42, 0.95)',
        active ? '#fef08a' : '#475569'
      );
      this.drawPixelText(
        ctx,
        navLabels[i],
        bx + 24,
        by + 8,
        active ? '#0f172a' : '#f8fafc',
        9.5,
        'center',
        !active
      );
      this.addTouch(10, bx, by, bw, bh, 300 + i);
    }

    if (s.toastTimer > 0 && s.toastText) {
      this.drawKairoBox(ctx, 16, 38, 208, 20, 'rgba(22, 101, 52, 0.95)', '#86efac');
      this.drawPixelText(ctx, s.toastText, 120, 43, '#ffffff', 9.5, 'center');
    }

    // 9. 叠加子菜单弹窗
    if (s.screen === 'tutorial') this.drawTutorialOverlay(ctx);
    else if (s.screen === 'main_menu') this.drawMainPopupMenu(ctx);
    else if (s.screen === 'build_catalog') this.drawBuildModal(ctx);
    else if (s.screen === 'special_routes') this.drawSpecialAndRoutesModal(ctx);
    else if (s.screen === 'challenges') this.drawChallengesModal(ctx);
    else if (s.screen === 'dictionary') this.drawDictionaryModal(ctx);
    else if (s.screen === 'system') this.drawSystemModal(ctx);
  }

  private drawTutorialOverlay(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const isAirport = s.theme === 'airport';
    const dialogs = this.bundle.universalData?.openingDialogs || ['欢迎来到开罗经营世界！'];
    const idx = Math.min(s.dialogIdx || 0, dialogs.length - 1);
    const secName = this.bundle.meta?.secretaryName || (isAirport ? '青空美奈子' : '牧场助手小佳');

    this.drawKairoBox(ctx, 8, 148, 224, 86, 'rgba(15, 23, 42, 0.96)', '#fbbf24');
    this.drawKairoBox(ctx, 14, 156, 46, 54, 'rgba(30, 41, 59, 0.95)', '#38bdf8');
    this.drawSpriteFit(
      ctx,
      isAirport ? 'chara0.png' : 'assistant00.png',
      17,
      160,
      40,
      48,
      0,
      0,
      50,
      isAirport ? 54 : 90
    );
    this.drawPixelText(ctx, secName, 37, 214, '#fde047', 8.5, 'center');

    const lines = this.wrapTextLines(dialogs[idx], 15).slice(0, 3);
    lines.forEach((ln, i) => {
      this.drawPixelText(ctx, ln, 68, 160 + i * 16, '#f8fafc', 9.5);
    });
    this.drawPixelText(
      ctx,
      `(${idx + 1}/${dialogs.length}) 点击或按【确定】继续 ▶`,
      144,
      216,
      '#38bdf8',
      8.5,
      'center'
    );
    this.addTouch(10, 8, 148, 224, 86, 999);
  }

  private drawMainPopupMenu(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const isAirport = s.theme === 'airport';
    const items = [
      '🔨 建造设施与环境',
      isAirport ? '✈ 客机购置与全球航线' : '🌱 品种培育与牧场特产',
      isAirport ? '🏆 机场宣传与评级委托' : '🏆 全国牧场竞赛挑战',
      '📖 相性辞典与经营指南',
      '💾 系统存档与名称修改'
    ];
    this.drawKairoBox(ctx, 24, 52, 192, 166, 'rgba(15, 23, 42, 0.96)', '#f59e0b');
    this.drawPixelText(ctx, '📋 经营管理总菜单', 120, 60, '#fde047', 11, 'center');

    for (let i = 0; i < items.length; i++) {
      const by = 80 + i * 25;
      const sel = s.menuCursor === i;
      this.drawKairoBox(
        ctx,
        34,
        by,
        172,
        21,
        sel ? 'rgba(245, 158, 11, 0.95)' : 'rgba(30, 41, 59, 0.9)',
        sel ? '#fef08a' : '#475569'
      );
      this.drawPixelText(ctx, items[i], 44, by + 5, sel ? '#0f172a' : '#f8fafc', 9.5, 'left', !sel);
      this.addTouch(10, 34, by, 172, 21, 400 + i);
    }
  }

  private drawBuildModal(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const udata = this.bundle.universalData;
    const cats = this.bundle.meta?.categoryLabels || ['环境', '设施', '店铺', '特殊'];

    this.drawKairoBox(ctx, 8, 38, 224, 196, 'rgba(15, 23, 42, 0.96)', '#f59e0b');
    for (let c = 0; c < cats.length; c++) {
      const tx = 12 + c * 54;
      const sel = s.buildCatIdx === c;
      this.drawKairoBox(ctx, tx, 43, 52, 18, sel ? '#f59e0b' : '#1e293b', sel ? '#fef08a' : '#475569');
      this.drawPixelText(ctx, cats[c], tx + 26, 47, sel ? '#0f172a' : '#cbd5e1', 8.5, 'center', !sel);
      this.addTouch(10, tx, 43, 52, 18, 500 + c);
    }

    const filtered = udata.buildItems
      .map((item, idx) => ({ item, idx }))
      .filter(x => x.item.category === s.buildCatIdx);
    const list = filtered.length > 0 ? filtered : udata.buildItems.map((item, idx) => ({ item, idx }));
    const cur = Math.min(s.buildCursor || 0, Math.max(0, list.length - 1));
    s.buildCursor = cur;

    const pageStart = Math.floor(cur / 5) * 5;
    const visible = list.slice(pageStart, pageStart + 5);

    visible.forEach((entry, i) => {
      const realIdx = pageStart + i;
      const sel = realIdx === cur;
      const ry = 65 + i * 24;
      this.drawKairoBox(
        ctx,
        14,
        ry,
        212,
        22,
        sel ? 'rgba(245, 158, 11, 0.92)' : 'rgba(30, 41, 59, 0.88)',
        sel ? '#fef08a' : '#334155'
      );
      this.drawSpriteFit(ctx, entry.item.imgKey, 18, ry + 2, 18, 18, 0, 0, 60, 44);
      this.drawPixelText(ctx, entry.item.name, 40, ry + 5, sel ? '#0f172a' : '#f8fafc', 9.5, 'left', !sel);
      this.drawPixelText(
        ctx,
        `${entry.item.price}币`,
        220,
        ry + 5,
        sel ? '#0f172a' : '#fde047',
        9,
        'right',
        !sel
      );
      this.addTouch(10, 14, ry, 212, 22, 520 + realIdx);
    });

    const selEntry = list[cur];
    if (selEntry) {
      this.drawKairoBox(ctx, 14, 188, 212, 40, 'rgba(9, 13, 22, 0.95)', '#38bdf8');
      this.drawPixelText(
        ctx,
        `人气+${selEntry.item.popularity}  景观+${selEntry.item.scenery}  使用费:${selEntry.item.charge}币`,
        20,
        192,
        '#38bdf8',
        8.5
      );
      this.drawPixelText(ctx, (selEntry.item.desc || '').slice(0, 22), 20, 208, '#cbd5e1', 8.5);
    }
  }

  private drawSpecialAndRoutesModal(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const isAirport = s.theme === 'airport';
    const udata = this.bundle.universalData;
    this.drawKairoBox(ctx, 8, 38, 224, 196, 'rgba(15, 23, 42, 0.96)', '#38bdf8');

    const tabs = isAirport ? ['✈ 购置客机', '🌍 开通航线'] : ['🌱 培育品种', '🧺 农场特产'];
    for (let t = 0; t < 2; t++) {
      const tx = 14 + t * 106;
      const sel = s.specialTab === t;
      this.drawKairoBox(ctx, tx, 43, 102, 18, sel ? '#38bdf8' : '#1e293b', sel ? '#e0f2fe' : '#475569');
      this.drawPixelText(ctx, tabs[t], tx + 51, 47, sel ? '#0f172a' : '#e2e8f0', 9, 'center', !sel);
      this.addTouch(10, tx, 43, 102, 18, 600 + t);
    }

    const items = s.specialTab === 0 ? udata.specialItems : udata.routesOrProducts;
    const cur = Math.min(s.specialCursor || 0, Math.max(0, items.length - 1));
    s.specialCursor = cur;
    const pageStart = Math.floor(cur / 5) * 5;
    const visible = items.slice(pageStart, pageStart + 5);

    visible.forEach((it: any, i: number) => {
      const idx = pageStart + i;
      const sel = idx === cur;
      const owned =
        s.specialTab === 0 ? s.ownedSpecials.includes(idx) : s.unlockedRoutes.includes(idx);
      const ry = 65 + i * 24;
      this.drawKairoBox(
        ctx,
        14,
        ry,
        212,
        22,
        sel ? 'rgba(56, 189, 248, 0.92)' : 'rgba(30, 41, 59, 0.88)',
        sel ? '#e0f2fe' : '#334155'
      );
      if (it.imgKey) {
        this.drawSpriteFit(ctx, it.imgKey, 18, ry + 2, 22, 16);
      }
      this.drawPixelText(
        ctx,
        it.name,
        it.imgKey ? 44 : 20,
        ry + 5,
        sel ? '#0f172a' : '#f8fafc',
        9.5,
        'left',
        !sel
      );
      this.drawPixelText(
        ctx,
        owned ? '✅已拥有' : `${it.cost}币`,
        220,
        ry + 5,
        owned ? (sel ? '#064e3b' : '#4ade80') : sel ? '#0f172a' : '#fde047',
        9,
        'right',
        !sel
      );
      this.addTouch(10, 14, ry, 212, 22, 620 + idx);
    });

    const curItem: any = items[cur];
    if (curItem) {
      this.drawKairoBox(ctx, 14, 188, 212, 40, 'rgba(9, 13, 22, 0.95)', '#f59e0b');
      const statLine =
        s.specialTab === 0
          ? `收益加成: +${curItem.income}币/趟 · 能力值:${curItem.power}`
          : `合作城市/评级: ${curItem.city} · 每周收益+${curItem.reward}币`;
      this.drawPixelText(ctx, statLine, 20, 192, '#fde047', 8.5);
      this.drawPixelText(ctx, (curItem.desc || '').slice(0, 22), 20, 208, '#cbd5e1', 8.5);
    }
  }

  private drawChallengesModal(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const udata = this.bundle.universalData;
    this.drawKairoBox(ctx, 8, 38, 224, 196, 'rgba(15, 23, 42, 0.96)', '#a855f7');
    this.drawPixelText(
      ctx,
      s.theme === 'airport' ? '🏆 机场委托与评级挑战' : '🏆 全国牧场竞赛挑战',
      120,
      44,
      '#e9d5ff',
      10,
      'center'
    );

    const items = udata.challenges || [];
    const cur = Math.min(s.challengeCursor || 0, Math.max(0, items.length - 1));
    s.challengeCursor = cur;
    const pageStart = Math.floor(cur / 5) * 5;
    const visible = items.slice(pageStart, pageStart + 5);

    visible.forEach((it, i) => {
      const idx = pageStart + i;
      const sel = idx === cur;
      const done = s.completedChallenges.includes(idx);
      const ry = 64 + i * 24;
      this.drawKairoBox(
        ctx,
        14,
        ry,
        212,
        22,
        sel ? 'rgba(168, 85, 247, 0.92)' : 'rgba(30, 41, 59, 0.88)',
        sel ? '#f3e8ff' : '#334155'
      );
      this.drawPixelText(ctx, it.name, 20, ry + 5, sel ? '#0f172a' : '#f8fafc', 9.5, 'left', !sel);
      this.drawPixelText(
        ctx,
        done ? '🏅已达成' : `奖金 ${it.reward}币`,
        220,
        ry + 5,
        done ? '#4ade80' : sel ? '#0f172a' : '#fde047',
        9,
        'right',
        !sel
      );
      this.addTouch(10, 14, ry, 212, 22, 720 + idx);
    });

    const curItem = items[cur];
    if (curItem) {
      this.drawKairoBox(ctx, 14, 188, 212, 40, 'rgba(9, 13, 22, 0.95)', '#a855f7');
      this.drawPixelText(
        ctx,
        `报名费: ${curItem.cost}币 · 优胜奖励: ${curItem.reward}币`,
        20,
        192,
        '#e9d5ff',
        8.5
      );
      this.drawPixelText(ctx, (curItem.desc || '').slice(0, 22), 20, 208, '#cbd5e1', 8.5);
    }
  }

  private drawDictionaryModal(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const udata = this.bundle.universalData;
    this.drawKairoBox(ctx, 8, 38, 224, 196, 'rgba(15, 23, 42, 0.96)', '#10b981');

    const tabs = ['✨ 相性组合辞典', '📘 官方玩法说明'];
    for (let t = 0; t < 2; t++) {
      const tx = 14 + t * 106;
      const sel = s.dictTab === t;
      this.drawKairoBox(ctx, tx, 43, 102, 18, sel ? '#10b981' : '#1e293b', sel ? '#a7f3d0' : '#475569');
      this.drawPixelText(ctx, tabs[t], tx + 51, 47, sel ? '#0f172a' : '#e2e8f0', 9, 'center', !sel);
      this.addTouch(10, tx, 43, 102, 18, 800 + t);
    }

    if (s.dictTab === 0) {
      const combos = udata.combos || [];
      const pageStart = ((s.dictCursor || 0) % Math.max(1, Math.ceil(combos.length / 6))) * 6;
      combos.slice(pageStart, pageStart + 6).forEach((line, i) => {
        this.drawKairoBox(ctx, 14, 66 + i * 26, 212, 23, 'rgba(30, 41, 59, 0.85)', '#334155');
        this.drawPixelText(ctx, line.slice(0, 22), 20, 72 + i * 26, '#a7f3d0', 8.5);
      });
    } else {
      const pages = udata.manualPages || [];
      const pIdx = (s.dictCursor || 0) % Math.max(1, pages.length);
      const lines = this.wrapTextLines(pages[pIdx] || '', 19).slice(0, 8);
      lines.forEach((ln, i) => {
        this.drawPixelText(ctx, ln, 18, 68 + i * 17, '#e2e8f0', 9);
      });
      this.drawPixelText(
        ctx,
        `第 ${pIdx + 1} / ${Math.max(1, pages.length)} 页 (按上下键翻页)`,
        120,
        214,
        '#38bdf8',
        8.5,
        'center'
      );
    }
  }

  private drawSystemModal(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const opts = [
      '💾 立即写入原生存档',
      '✏ 修改经营场地名称',
      '🏠 返回游戏标题画面',
      '🔙 返回继续经营'
    ];
    this.drawKairoBox(ctx, 28, 64, 184, 142, 'rgba(15, 23, 42, 0.96)', '#f59e0b');
    this.drawPixelText(ctx, '⚙ 系统与存档选项', 120, 72, '#fde047', 10.5, 'center');
    opts.forEach((label, i) => {
      const ry = 94 + i * 25;
      const sel = (s.sysCursor || 0) === i;
      this.drawKairoBox(ctx, 38, ry, 164, 21, sel ? '#f59e0b' : '#1e293b', sel ? '#fef08a' : '#475569');
      this.drawPixelText(ctx, label, 120, ry + 5, sel ? '#0f172a' : '#f8fafc', 9.5, 'center', !sel);
      this.addTouch(10, 38, ry, 164, 21, 850 + i);
    });
  }

  public handleTouch(param: number): void {
    this.handleInput(1048576, param);
  }

  public handleKey(keyBit: number): void {
    this.handleInput(keyBit, 0);
  }

  private handleInput(keyBit: number, touchP = 0): void {
    const s = this.state;
    if (!s) return;
    const udata = this.bundle.universalData;

    // 1. 标题界面交互
    if (s.screen === 'title') {
      if (s.titleShowHelp) {
        s.titleShowHelp = false;
        return;
      }
      if (touchP >= 100 && touchP <= 102) {
        s.titleMenuIdx = touchP - 100;
        keyBit = 1048576;
      }
      if (keyBit === 131072) s.titleMenuIdx = (s.titleMenuIdx + 2) % 3;
      else if (keyBit === 524288) s.titleMenuIdx = (s.titleMenuIdx + 1) % 3;
      else if (keyBit === 4194304) s.titleShowHelp = !s.titleShowHelp;
      else if (keyBit === 1048576 || keyBit === 2097152) {
        if (s.titleMenuIdx === 0) {
          s.screen = 'tutorial';
          s.dialogIdx = 0;
          this.updateSoftKeys();
        } else if (s.titleMenuIdx === 1) {
          if (!this.loadNative()) {
            s.screen = 'tutorial';
            s.dialogIdx = 0;
            this.updateSoftKeys();
          }
        } else {
          s.titleShowHelp = true;
        }
      }
      return;
    }

    // 2. 底部导航栏点击 (300..304)
    if (touchP >= 300 && touchP <= 304) {
      const navIdx = touchP - 300;
      const screens: ScreenMode[] = [
        'build_catalog',
        'special_routes',
        'challenges',
        'dictionary',
        'system'
      ];
      s.screen = screens[navIdx] || 'map';
      this.updateSoftKeys();
      return;
    }

    // 3. 开局秘书引导教程
    if (s.screen === 'tutorial') {
      const dialogs = udata.openingDialogs || [];
      if (keyBit === 4194304) {
        if (this.onOpenNamingModal) this.onOpenNamingModal();
        else this.finishNaming(true, s.companyName);
        return;
      }
      s.dialogIdx++;
      if (s.dialogIdx >= dialogs.length) {
        if (this.onOpenNamingModal) this.onOpenNamingModal();
        else this.finishNaming(true, s.companyName);
      }
      return;
    }

    // 4. 经营总菜单弹窗
    if (s.screen === 'main_menu') {
      if (touchP >= 400 && touchP <= 404) {
        s.menuCursor = touchP - 400;
        keyBit = 1048576;
      }
      if (keyBit === 131072) s.menuCursor = (s.menuCursor + 4) % 5;
      else if (keyBit === 524288) s.menuCursor = (s.menuCursor + 1) % 5;
      else if (keyBit === 4194304) {
        s.screen = 'map';
        this.updateSoftKeys();
      } else if (keyBit === 1048576) {
        const targetScreens: ScreenMode[] = [
          'build_catalog',
          'special_routes',
          'challenges',
          'dictionary',
          'system'
        ];
        s.screen = targetScreens[s.menuCursor] || 'build_catalog';
        this.updateSoftKeys();
      }
      return;
    }

    // 5. 建造目录弹窗
    if (s.screen === 'build_catalog') {
      const cats = this.bundle.meta?.categoryLabels || ['环境', '设施', '店铺', '特殊'];
      if (touchP >= 500 && touchP <= 503) {
        s.buildCatIdx = touchP - 500;
        s.buildCursor = 0;
        return;
      }
      const filtered = udata.buildItems
        .map((item, idx) => ({ item, idx }))
        .filter(x => x.item.category === s.buildCatIdx);
      const list = filtered.length > 0 ? filtered : udata.buildItems.map((item, idx) => ({ item, idx }));

      if (touchP >= 520 && touchP < 580) {
        const clickedIdx = touchP - 520;
        if (s.buildCursor === clickedIdx) keyBit = 1048576;
        else {
          s.buildCursor = clickedIdx;
          return;
        }
      }

      if (keyBit === 65536) {
        s.buildCatIdx = (s.buildCatIdx + cats.length - 1) % cats.length;
        s.buildCursor = 0;
      } else if (keyBit === 262144) {
        s.buildCatIdx = (s.buildCatIdx + 1) % cats.length;
        s.buildCursor = 0;
      } else if (keyBit === 131072) {
        s.buildCursor = (s.buildCursor + list.length - 1) % Math.max(1, list.length);
      } else if (keyBit === 524288) {
        s.buildCursor = (s.buildCursor + 1) % Math.max(1, list.length);
      } else if (keyBit === 4194304) {
        s.screen = 'map';
        this.updateSoftKeys();
      } else if (keyBit === 1048576 && list[s.buildCursor]) {
        s.selectedBuildIdx = list[s.buildCursor].idx;
        s.screen = 'build_place';
        this.updateSoftKeys();
      }
      return;
    }

    // 6. 地图选址建造模式
    if (s.screen === 'build_place') {
      if (touchP >= 2000 && touchP < 3000) {
        const code = touchP - 2000;
        s.curX = Math.floor(code / 100);
        s.curY = code % 100;
        keyBit = 1048576;
      }
      if (keyBit === 65536) s.curX = Math.max(0, s.curX - 1);
      else if (keyBit === 262144) s.curX = Math.min(8, s.curX + 1);
      else if (keyBit === 131072) s.curY = Math.max(0, s.curY - 1);
      else if (keyBit === 524288) s.curY = Math.min(8, s.curY + 1);
      else if (keyBit === 4194304) {
        s.screen = 'build_catalog';
        this.updateSoftKeys();
      } else if (keyBit === 1048576) {
        const it = udata.buildItems[s.selectedBuildIdx];
        if (it && s.funds >= it.price) {
          s.funds -= it.price;
          s.mapGrid[s.curY][s.curX].itemIdx = s.selectedBuildIdx;
          s.fame += it.popularity || 5;
          const [sx, sy] = this.isoToScreen(s.curX, s.curY);
          s.popups.push({
            x: sx,
            y: sy - 10,
            text: `✨ 建成 ${it.name} 人气+${it.popularity}`,
            color: '#fde047',
            life: 40
          });
          s.toastText = `✅ 已在 (${s.curX},${s.curY}) 建造【${it.name}】！`;
          s.toastTimer = 55;
          s.screen = 'map';
          this.updateSoftKeys();
          if (this.onStateSnapshotNeeded) {
            this.onStateSnapshotNeeded(`建造设施【${it.name}】自动快照`);
          }
        } else {
          s.toastText = '⚠️ 资金不足，无法建造该设施！';
          s.toastTimer = 45;
        }
      }
      return;
    }

    // 7. 客机/航线 或 品种/特产 菜单
    if (s.screen === 'special_routes') {
      if (touchP === 600 || touchP === 601) {
        s.specialTab = touchP - 600;
        s.specialCursor = 0;
        return;
      }
      const items: any[] = s.specialTab === 0 ? udata.specialItems : udata.routesOrProducts;
      if (touchP >= 620 && touchP < 680) {
        const idx = touchP - 620;
        if (s.specialCursor === idx) keyBit = 1048576;
        else {
          s.specialCursor = idx;
          return;
        }
      }
      if (keyBit === 65536 || keyBit === 262144) {
        s.specialTab = 1 - s.specialTab;
        s.specialCursor = 0;
      } else if (keyBit === 131072) {
        s.specialCursor = (s.specialCursor + items.length - 1) % Math.max(1, items.length);
      } else if (keyBit === 524288) {
        s.specialCursor = (s.specialCursor + 1) % Math.max(1, items.length);
      } else if (keyBit === 4194304) {
        s.screen = 'map';
        this.updateSoftKeys();
      } else if (keyBit === 1048576 && items[s.specialCursor]) {
        const it = items[s.specialCursor];
        const targetArr = s.specialTab === 0 ? s.ownedSpecials : s.unlockedRoutes;
        if (targetArr.includes(s.specialCursor)) {
          s.toastText = `✅ 【${it.name}】已在运营中！`;
          s.toastTimer = 40;
        } else if (s.funds >= it.cost) {
          s.funds -= it.cost;
          targetArr.push(s.specialCursor);
          s.fame += 12;
          s.toastText = `🎉 成功引进/开通【${it.name}】！`;
          s.toastTimer = 60;
          if (this.onStateSnapshotNeeded) {
            this.onStateSnapshotNeeded(`开通【${it.name}】自动快照`);
          }
        } else {
          s.toastText = '⚠️ 资金不足！';
          s.toastTimer = 40;
        }
      }
      return;
    }

    // 8. 委托与竞赛挑战弹窗
    if (s.screen === 'challenges') {
      const items = udata.challenges || [];
      if (touchP >= 720 && touchP < 780) {
        const idx = touchP - 720;
        if (s.challengeCursor === idx) keyBit = 1048576;
        else {
          s.challengeCursor = idx;
          return;
        }
      }
      if (keyBit === 131072) {
        s.challengeCursor = (s.challengeCursor + items.length - 1) % Math.max(1, items.length);
      } else if (keyBit === 524288) {
        s.challengeCursor = (s.challengeCursor + 1) % Math.max(1, items.length);
      } else if (keyBit === 4194304) {
        s.screen = 'map';
        this.updateSoftKeys();
      } else if (keyBit === 1048576 && items[s.challengeCursor]) {
        const it = items[s.challengeCursor];
        if (s.completedChallenges.includes(s.challengeCursor)) {
          s.toastText = `🏅 【${it.name}】已圆满达成！`;
          s.toastTimer = 40;
        } else if (s.funds >= it.cost) {
          s.funds = s.funds - it.cost + it.reward;
          s.completedChallenges.push(s.challengeCursor);
          s.fame += 20;
          s.toastText = `🏆 挑战【${it.name}】成功！赢得奖金 ${it.reward}币！`;
          s.toastTimer = 65;
          s.screen = 'map';
          this.updateSoftKeys();
          if (this.onStateSnapshotNeeded) {
            this.onStateSnapshotNeeded(`完成挑战【${it.name}】自动快照`);
          }
        } else {
          s.toastText = '⚠️ 报名经费不足！';
          s.toastTimer = 40;
        }
      }
      return;
    }

    // 9. 相性辞典与说明弹窗
    if (s.screen === 'dictionary') {
      if (touchP === 800 || touchP === 801) {
        s.dictTab = touchP - 800;
        s.dictCursor = 0;
        return;
      }
      if (keyBit === 65536 || keyBit === 262144) {
        s.dictTab = 1 - s.dictTab;
        s.dictCursor = 0;
      } else if (keyBit === 131072) {
        s.dictCursor = Math.max(0, s.dictCursor - 1);
      } else if (keyBit === 524288 || keyBit === 1048576) {
        s.dictCursor++;
      } else if (keyBit === 4194304) {
        s.screen = 'map';
        this.updateSoftKeys();
      }
      return;
    }

    // 10. 系统菜单弹窗
    if (s.screen === 'system') {
      if (touchP >= 850 && touchP <= 853) {
        s.sysCursor = touchP - 850;
        keyBit = 1048576;
      }
      if (keyBit === 131072) s.sysCursor = (s.sysCursor + 3) % 4;
      else if (keyBit === 524288) s.sysCursor = (s.sysCursor + 1) % 4;
      else if (keyBit === 4194304) {
        s.screen = 'map';
        this.updateSoftKeys();
      } else if (keyBit === 1048576) {
        if (s.sysCursor === 0) {
          this.saveNative();
          s.toastText = '💾 原生存档已保存成功！';
          s.toastTimer = 55;
          s.screen = 'map';
          this.updateSoftKeys();
        } else if (s.sysCursor === 1) {
          s.screen = 'map';
          this.updateSoftKeys();
          if (this.onOpenNamingModal) this.onOpenNamingModal();
        } else if (s.sysCursor === 2) {
          s.screen = 'title';
          this.updateSoftKeys();
        } else {
          s.screen = 'map';
          this.updateSoftKeys();
        }
      }
      return;
    }

    // 11. 主地图探索模式 (screen === 'map')
    if (touchP >= 2000 && touchP < 3000) {
      const code = touchP - 2000;
      const gx = Math.floor(code / 100);
      const gy = code % 100;
      if (s.curX === gx && s.curY === gy) {
        s.screen = 'build_catalog';
        this.updateSoftKeys();
      } else {
        s.curX = gx;
        s.curY = gy;
      }
      return;
    }

    if (keyBit === 65536) s.curX = Math.max(0, s.curX - 1);
    else if (keyBit === 262144) s.curX = Math.min(8, s.curX + 1);
    else if (keyBit === 131072) s.curY = Math.max(0, s.curY - 1);
    else if (keyBit === 524288) s.curY = Math.min(8, s.curY + 1);
    else if (keyBit === 4194304) {
      s.screen = 'main_menu';
      this.updateSoftKeys();
    } else if (keyBit === 1048576) {
      s.screen = 'build_catalog';
      this.updateSoftKeys();
    }
  }
}
