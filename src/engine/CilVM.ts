/**
 * CilVM.ts — 通用 .NET CIL 栈式字节码虚拟机 + FastResume 内存图序列化引擎
 * 采用 1:1 动态虚表查找 (vtable + baseTypeMap)、宿主精准拦截、Offscreen 2x 离线渲染及实时快照
 */
import { KairoHAL } from './KairoHAL';
import { CartridgeBundle, GameRuntimeMetadata } from '../types/kairo';

export class JVector {
  public _vec: any[] = [];
  public AddElement(el: any) { this._vec.push(el); }
  public Add(el: any) { this._vec.push(el); }
  public RemoveElement(el: any) {
    const idx = this._vec.indexOf(el);
    if (idx >= 0) this._vec.splice(idx, 1);
  }
  public RemoveElementAt(idx: number) { this._vec.splice(idx, 1); }
  public RemoveAllElements() { this._vec.length = 0; }
  public ElementAt(idx: number) { return this._vec[idx]; }
  public Size(): number { return this._vec.length; }
  public IndexOf(el: any): number { return this._vec.indexOf(el); }
  public LastElement(): any { return this._vec[this._vec.length - 1]; }
  public Contains(el: any): boolean { return this._vec.includes(el); }
  public GetEnumerator() {
    let i = 0;
    const v = this._vec;
    return {
      MoveNext() { i++; return i <= v.length; },
      get_Current() { return v[i - 1]; }
    };
  }
}

export const baseTypeMap: Record<string, string> = {
  'form.BootForm': 'form.MyFormBase',
  'form.GameForm': 'form.MyFormBase',
  'form.SubForm': 'form.MyFormBase',
  'form.TitleForm': 'form.MyFormBase',
  'form.RankForm': 'form.MyFormBase',
  'form.SpForm': 'form.MyFormBase',
  'form.MyFormBase': 'kairo.unity.form.FormBase',
  'form.FormManager': 'kairo.unity.form.FormManagerBase',
  'surface.GameView': 'kairo.unity.surface.SurfaceBase'
};

export const extraTranslations: Record<string, string> = {
  'メニュー': '菜单',
  '戻る': '返回',
  'もどる': '返回',
  '決定': '确定',
  'けってい': '确定',
  '終了': '结束',
  '確認': '确认',
  'セーブ': '存档',
  'ロード': '读档',
  'はい': '是',
  'いいえ': '否',
  '切替': '切换',
  '上位': '上一级',
  '自分': '本公司',
  '中止': '取消',
  '次へ': '下一页',
  '前へ': '上一页',
  'スキップ': '跳过',
  '閉じる': '关闭',
  '機能': '功能',
  '消去': '清除',
  '詳細': '详细',
  'システム': '系统',
  'ｻｲﾄ': '官网',
  'サイト': '官网',
  'ヘルプ': '帮助',
  '自社': '自营',
  'カイロソフト': '开罗游戏社',
  'Kairosoft': '开罗游戏社',
  'ゲームを終了します': '结束游戏',
  '会社名を入力してください': '请输入公司名称',
  'ゲームのタイトルを入力してください': '请输入新游戏作品名称',
  'ハード名を入力してください': '请输入自主研发主机名称'
};

function makeNDArray(dims: number[], fillVal: any = 0): any {
  if (dims.length === 1) return new Array(dims[0]).fill(fillVal);
  const res: any = new Array(dims[0]);
  for (let i = 0; i < dims[0]; i++) res[i] = makeNDArray(dims.slice(1), fillVal);
  res.__nd = dims;
  return res;
}

export interface TouchRegion {
  type: number;
  x: number;
  y: number;
  w: number;
  h: number;
  param: number;
  opt: any;
}

export class CilVM {
  public hal: KairoHAL;
  public bundle!: CartridgeBundle;
  public methods: Record<string, any> = {};
  public methodSigs: Record<string, any> = {};
  public fields: Record<string, any> = {};
  public strings: Record<string, string> = {};
  public jpToSc: Record<string, string> = {};
  public rvaBytes: Record<string, number[]> = {};

  public vtable: Record<string, number> = {};
  public staticFields: Record<string, any> = { 'System.String::Empty': '' };
  public singletons: Record<string, any> = {};
  public touchRegions: TouchRegion[] = [];
  public queuedKeys: number[] = [];

  public appData: any = null;
  public fm: any = null;
  public gv: any = null;
  public gf: any = null;
  public tf: any = null;
  public initialized = false;
  public useOriginalFund = true;

  // UI callbacks
  public onOpenSetPanel?: () => void;
  public onUpdateSoftKeys?: (left: string, right: string) => void;
  public onStateSnapshotNeeded?: (reason: string) => void;
  public onGameExit?: () => void;

  constructor(hal: KairoHAL, useOriginalFund = true) {
    this.hal = hal;
    this.useOriginalFund = useOriginalFund;
  }

  public init(bundle: CartridgeBundle): void {
    this.bundle = bundle;
    this.methods = { ...bundle.methods };
    this.methodSigs = { ...(bundle.methodSigs || {}) };
    this.fields = bundle.fields || {};
    this.strings = bundle.strings || {};
    this.jpToSc = bundle.jpToSc || {};
    this.rvaBytes = bundle.rvaBytes || {};

    // Patch external Util signatures (0x2b0000xx)
    const patchSig = (tok: number, sig: any) => {
      this.methodSigs[String(tok)] = sig;
      this.methodSigs[tok] = sig;
    };
    patchSig(0x2b000009, { type: 'Util', name: 'Check', full: 'Util::Check', hasThis: false, params: 2, hasRet: true });
    patchSig(0x2b00000f, { type: 'Util', name: 'NewND', full: 'Util::NewND', hasThis: false, params: 1, hasRet: true });
    patchSig(0x2b00001e, { type: 'Util', name: 'NewND', full: 'Util::NewND', hasThis: false, params: 1, hasRet: true });
    patchSig(0x2b00001f, { type: 'Util', name: 'NewND', full: 'Util::NewND', hasThis: false, params: 1, hasRet: true });
    patchSig(0x2b000028, { type: 'Util', name: 'NewNDStr', full: 'Util::NewNDStr', hasThis: false, params: 1, hasRet: true });
    patchSig(0x2b00005b, { type: 'Util', name: 'NewND3', full: 'Util::NewND3', hasThis: false, params: 1, hasRet: true });
    patchSig(0x2b00005c, { type: 'Util', name: 'NewNDByte', full: 'Util::NewNDByte', hasThis: false, params: 1, hasRet: true });

    // 1. Preheat textures in HAL
    this.hal.loadBundleTextures(bundle);

    // 2. Build full vtable for polymorphic virtual dispatch
    this.vtable = {};
    for (const [tokStr, m] of Object.entries(this.methods)) {
      const key = `${m.type}::${m.name}/${m.params}`;
      this.vtable[key] = parseInt(tokStr, 10);
    }

    // 3. Delete overridden CIL methods so they get handled by host interception
    for (const [tokStr, m] of Object.entries(this.methods)) {
      if (
        m.type === 'kairo.unity.form.FormManagerBase' &&
        ['Push', 'Pop', 'ChangeCurrentForm', 'RemoveAllForms'].includes(m.name)
      ) {
        delete this.methods[tokStr];
      }
      if (
        m.full === 'kairo.unity.form.FormBase::CheckUsable' ||
        m.full === 'main.AppData::GetImage' ||
        m.full === 'form.GameForm::SetPanel'
      ) {
        delete this.methods[tokStr];
      }
      if (
        m.type === 'main.AppData' &&
        ['SaveSystem', 'LoadSystem', 'SaveGame', 'LoadGame'].includes(m.name)
      ) {
        delete this.methods[tokStr];
      }
      if (
        ['GetGameWidth', 'GetGameHeight', 'GetWidth', 'GetHeight', 'GetScaleRatio'].includes(m.name) &&
        (m.type === 'surface.GameView' || m.type === 'kairo.unity.surface.SurfaceBase')
      ) {
        delete this.methods[tokStr];
      }
    }

    // 4. Run .cctor static constructors
    for (const [tokStr, m] of Object.entries(this.methods)) {
      if (m.name === '.cctor') {
        this.execMethod(parseInt(tokStr, 10), null, []);
      }
    }
    if (this.useOriginalFund) {
      this.staticFields['form.GameForm::Shikin'] = 5000;
    }

    this.singletons = {
      'kairo.unity.ui.Canvas': {
        __type: 'kairo.unity.ui.Canvas',
        keyState: 0,
        keyPulse: 0,
        keyRepeat: 0,
        softL: '',
        softR: ''
      },
      'kairo.unity.ui.SoundPlayer': { __type: 'kairo.unity.ui.SoundPlayer' },
      'surface.TouchEffectManager': { __type: 'surface.TouchEffectManager' }
    };

    // 5. Initialize FormManager, GameView, AppData
    this.fm = this.execMethod(this.vtable['form.FormManager::GetInstance/0'], null, []);
    this.gv = this.execMethod(this.vtable['surface.GameView::GetInstance/0'], null, []);
    this.appData = this.execMethod(this.vtable['main.AppData::GetInstance/0'], null, []);
    this.execMethod(this.vtable['main.AppData::Init/0'], this.appData, []);

    this.staticFields['surface.GameView::images_'] = [
      this.hal.getImageObj('buttoneffect.png'),
      this.hal.getImageObj('buttoneffect.png')
    ];

    const parseSeb = (name: string) => {
      const sObj = { __type: 'kairo.unity.ui.Seb' };
      if (this.bundle.sebBytes && this.bundle.sebBytes[name]) {
        this.execMethod(100666011, sObj, [this.bundle.sebBytes[name]]);
      }
      return sObj;
    };

    this.appData.resCom_ = {
      __type: 'kairo.unity.ui.ResourceManager',
      img: (this.bundle.comImgList || []).map(fn => this.hal.getImageObj(fn)),
      seb: [
        parseSeb('saveload.seb'),
        parseSeb('back00_240.seb'),
        parseSeb('back00_240.seb'),
        parseSeb('back00_240.seb')
      ],
      sound: []
    };

    this.appData.resGame_ = {
      __type: 'kairo.unity.ui.ResourceManager',
      img: (this.bundle.gameImgList || []).map(fn => this.hal.getImageObj(fn)),
      seb: [parseSeb('cameraman.seb'), parseSeb('backlight.seb')],
      sound: []
    };

    this.gf = this.appData.frmGame_;
    this.tf = this.appData.frmTitle_;
    const bf = this.appData.frmBoot_;

    this.execMethod(this.vtable['form.BootForm::Init/0'], bf, []);
    this.staticFields['form.GameForm::GameInstall'] = 0;
    this.execMethod(this.vtable['form.BootForm::GraphicLoad/0'], bf, []);
    if (this.useOriginalFund) {
      this.staticFields['form.GameForm::Shikin'] = 5000;
    }

    const hasAnySave = !!(
      this.hal.getStorageItem('sysSave') ||
      this.hal.getStorageItem('save_0') ||
      this.hal.getStorageItem('save_1')
    );
    if (hasAnySave) {
      this.staticFields['form.GameForm::KirokuLoadGame'] = 1;
    }

    if (Array.isArray(this.staticFields['main.AppData::softLabels_'])) {
      this.staticFields['main.AppData::softLabels_'] = this.staticFields['main.AppData::softLabels_'].map((s: string) => this.translateLT(s));
    }
    if (this.appData && Array.isArray(this.appData.softLabels_)) {
      this.appData.softLabels_ = this.appData.softLabels_.map((s: string) => this.translateLT(s));
    }

    // Change current form to TitleForm (100663765: ChangeCurrentForm)
    this.execMethod(100663765, this.fm, [this.tf, 0]);

    this.initialized = true;
  }

  public resolveVirtual(
    objType: string,
    methodName: string,
    paramCount: number,
    fallbackTok: number | string
  ): number {
    let cur: string | undefined = objType;
    while (cur) {
      const k = `${cur}::${methodName}/${paramCount}`;
      if (this.vtable[k] !== undefined) return this.vtable[k];
      cur = baseTypeMap[cur];
    }
    return typeof fallbackTok === 'string' ? parseInt(fallbackTok, 10) : fallbackTok;
  }

  public translateLT(str: any): any {
    if (typeof str !== 'string') return str;
    const trimmed = str.trim();
    if (extraTranslations[str] !== undefined) return extraTranslations[str];
    if (extraTranslations[trimmed] !== undefined) return extraTranslations[trimmed];
    if (this.jpToSc[str] !== undefined) return this.jpToSc[str];
    if (this.jpToSc[trimmed] !== undefined) return this.jpToSc[trimmed];
    const sNorm = str.replace(/\n/g, '\\n');
    if (extraTranslations[sNorm] !== undefined) return extraTranslations[sNorm];
    if (this.jpToSc[sNorm] !== undefined) return this.jpToSc[sNorm];
    return str;
  }

  public getTopForm(): any {
    if (this.fm && this.fm.formStack_ && this.fm.formStack_._vec) {
      const v = this.fm.formStack_._vec;
      return v.length > 0 ? v[v.length - 1] : null;
    }
    return null;
  }

  public updateSoftKeys(): void {
    const top = this.getTopForm();
    const c = this.singletons['kairo.unity.ui.Canvas'] || {};
    let lText =
      top && top.leftSoftLabel_ !== undefined
        ? this.translateLT(top.leftSoftLabel_)
        : c.softL || '';
    let rText =
      top && top.rightSoftLabel_ !== undefined
        ? this.translateLT(top.rightSoftLabel_)
        : c.softR || '';
    lText = this.translateLT(lText);
    rText = this.translateLT(rText);
    if (this.onUpdateSoftKeys) {
      this.onUpdateSoftKeys(lText || '存档', rText || '菜单 / 返回');
    }
  }

  public finishSetPanel(ok: boolean, text?: string): void {
    const pm = this.staticFields['form.GameForm::PanelMode'] || 1;
    const val =
      (text || '').trim() || (pm === 1 ? '开罗游戏社' : pm === 2 ? '游戏发展国' : '开罗主机');
    const callerForm = this.getTopForm() || this.gf;
    const storey = {
      __type: '<SetPanel>c__AnonStorey7B',
      '<>f__this': callerForm,
      panel: { result_: val }
    };
    this.execMethod(100669211, storey, [ok ? 1 : 0]);
    if (ok && pm === 1) {
      this.staticFields['form.GameForm::Shikin'] = this.useOriginalFund ? 5000 : 99999999;
      this.staticFields['form.GameForm::pushIntro_'] = 0;
    }
    this.hal.playTone(ok ? 720 : 340, 0.06);
    this.updateSoftKeys();
    this.onStateSnapshotNeeded?.('完成名称设定自动快照');
  }

  public derefVal(v: any, locals: any[], allArgs: any[]): any {
    if (v && v.__ref === 'loc') return locals[v.idx];
    if (v && v.__ref === 'arg') return allArgs[v.idx];
    if (v && v.__ref === 'arr') return v.arr[v.idx];
    return v;
  }

  public handleExternalCall(sig: any, obj: any, args: any[], locals: any[], allArgs: any[]): any {
    const full = sig.full;
    if (
      full === 'Util::NewND' ||
      full === 'Util::NewND3' ||
      full === 'Util::NewNDByte' ||
      full === 'java.util.JTool::MakeArray'
    ) {
      return makeNDArray(args[0], 0);
    }
    if (full === 'Util::NewNDStr') return makeNDArray(args[0], null);
    if (full === 'Util::Check') return 0;
    if (full === 'kairo.unity.util.Log::Info' || full === 'Debug::LogError') return;
    if (
      full === 'TalkingDataGA::DoSDKCallQuit' ||
      full === 'System.Environment::Exit' ||
      full === 'UnityEngine.Application::Quit' ||
      full === 'kairo.unity.ui.IApplication::Terminate' ||
      full === 'kairo.unity.ui.IApplication::Exit' ||
      full === 'kairo.unity.form.FormManagerBase::DoTerminationDialog' ||
      full === 'form.FormManager::DoTerminationDialog' ||
      full.endsWith('::Terminate') ||
      full.endsWith('::Quit')
    ) {
      if (this.onGameExit) this.onGameExit();
      return;
    }

    if (full === 'System.Runtime.CompilerServices.RuntimeHelpers::InitializeArray') {
      const arr = args[0], fTok = args[1];
      let bytes = this.rvaBytes[fTok];
      if (
        (!bytes || bytes.length === 0) &&
        (fTok === 67115105 || fTok === 67115106 || fTok === 67115107 || fTok === 67115108)
      ) {
        bytes = this.rvaBytes[67115109];
      }
      if ((!bytes || bytes.length === 0) && fTok === 67115125) {
        bytes = this.rvaBytes[67115124];
      }
      if ((!bytes || bytes.length === 0) && fTok === 67115116) {
        bytes = this.rvaBytes[67115115];
      }
      if ((!bytes || bytes.length === 0) && fTok === 67115118) {
        bytes = this.rvaBytes[67115117];
      }
      if (arr && bytes && bytes.length > 0) {
        if (arr.__nd && arr.__nd.length === 2) {
          const [r, c] = arr.__nd;
          let idx = 0;
          for (let i = 0; i < r; i++) {
            for (let j = 0; j < c; j++) {
              if (idx + 4 <= bytes.length) {
                arr[i][j] =
                  bytes[idx] | (bytes[idx + 1] << 8) | (bytes[idx + 2] << 16) | (bytes[idx + 3] << 24);
                idx += 4;
              }
            }
          }
        } else {
          for (let i = 0; i < arr.length; i++) {
            const idx = i * 4;
            if (idx + 4 <= bytes.length) {
              arr[i] =
                bytes[idx] | (bytes[idx + 1] << 8) | (bytes[idx + 2] << 16) | (bytes[idx + 3] << 24);
            }
          }
        }
      }
      return;
    }

    if (
      full === 'kairo.unity.util.Language::LT' ||
      full === 'kairo.unity.util.Language::TranslateText' ||
      full === 'kairo.unity.util.Language::TranslateSoftLabel'
    ) {
      return this.translateLT(args[0]);
    }
    if (full === 'kairo.unity.util.Language::Japanese' || full === 'kairo.unity.util.Language::English') return 0;
    if (full === 'kairo.unity.util.Language::GetLanguageCode') return 'zh-CN';

    if (full === 'System.String::Concat') {
      const list = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return list.map(x => (x === null || x === undefined ? '' : String(x))).join('');
    }
    if (full === 'System.String::op_Equality' || full === 'System.String::Equals') {
      return (obj !== null && obj !== undefined ? obj === args[0] : args[0] === args[1]) ? 1 : 0;
    }
    if (full === 'System.String::op_Inequality') return args[0] !== args[1] ? 1 : 0;
    if (full === 'System.String::StartsWith') return String(obj || '').startsWith(String(args[0])) ? 1 : 0;
    if (full === 'System.String::Contains') return String(obj || '').includes(String(args[0])) ? 1 : 0;
    if (full === 'System.String::Substring') {
      return args.length === 2
        ? String(obj || '').substr(args[0], args[1])
        : String(obj || '').substring(args[0]);
    }
    if (full === 'System.String::get_Length' || full === 'java.lang.StringEx::Length') {
      const s = obj !== null && obj !== undefined ? obj : args[0];
      return s ? s.length : 0;
    }
    if (full === 'java.lang.StringEx::SubstringJ') {
      return args.length >= 3
        ? String(args[0] || '').substring(args[1], args[2])
        : String(args[0] || '').substring(args[1]);
    }
    if (full === 'java.lang.StringEx::EqualsIgnoreCase') {
      return String(args[0] || '').toLowerCase() === String(args[1] || '').toLowerCase() ? 1 : 0;
    }
    if (full === 'java.lang.StringEx::CharAt') return String(args[0] || '').charCodeAt(args[1]) || 0;
    if (full === 'System.String::IndexOf') return String(obj || '').indexOf(String(args[0]), args[1] || 0);
    if (full === 'System.String::LastIndexOf') return String(obj || '').lastIndexOf(String(args[0]));
    if (full === 'System.String::Trim') return String(obj || '').trim();
    if (full === 'System.String::Replace' || full === 'kairo.unity.util.StringUtil::Replace') {
      if (obj !== null && obj !== undefined) {
        return String(obj).split(String(args[0])).join(String(args[1]));
      }
      if (args.length === 2) {
        let res = String(args[0] || '');
        const parts = String(args[1] !== null && args[1] !== undefined ? args[1] : '').split('\t');
        for (let i = 0; i < parts.length; i++) {
          res = res.split(`<${i}>`).join(this.translateLT(parts[i]));
        }
        return res;
      }
      return String(args[0] || '').split(String(args[1])).join(String(args[2]));
    }
    if (full === 'System.String::Split' || full === 'kairo.unity.util.StringUtil::Split') {
      const s = obj !== null && obj !== undefined ? obj : args[0];
      const sep = obj !== null && obj !== undefined ? args[0] : args[1];
      const sepStr = Array.isArray(sep) ? String.fromCharCode(sep[0]) : String(sep);
      return String(s || '').split(sepStr);
    }
    if (full === 'kairo.unity.util.StringUtil::FormatString') {
      let s = String(args[0] || '');
      const arr = Array.isArray(args[1]) ? args[1] : args.slice(1);
      for (let i = 0; i < arr.length; i++) s = s.split(`<${i}>`).join(String(arr[i]));
      return s;
    }
    if (
      full === 'System.Int32::ToString' ||
      full === 'System.Int64::ToString' ||
      full === 'System.Object::ToString'
    ) {
      return String(this.derefVal(obj, locals, allArgs) ?? '');
    }
    if (
      full === 'System.Int32::Parse' ||
      full === 'java.lang.JInteger::ParseInt' ||
      full === 'System.Convert::ToInt32' ||
      full === 'java.lang.JByte::ParseByte' ||
      full === 'java.lang.JInteger::ValueOf' ||
      full === 'java.lang.JLong::ParseLong'
    ) {
      return parseInt(args[0], 10) || 0;
    }
    if (full === 'java.lang.JInteger::IntValue' || full === 'java.lang.JShort::ShortValue') return obj | 0;
    if (full === 'java.lang.JString::ValueOf' || full === 'java.lang.JString::New') return String(args[0]);
    if (full === 'java.lang.JMath::Abs') return Math.abs(args[0]);
    if (full === 'java.lang.JMath::Sin') return Math.sin(args[0]);
    if (full === 'java.lang.JMath::Sqrt') return Math.sqrt(args[0]) | 0;
    if (full === 'java.lang.JMath::ToRadians') return (args[0] * Math.PI) / 180;
    if (full === 'java.util.JRandom::NextInt') return Math.floor(Math.random() * 0x7fffffff);

    if (full === 'tag4_337::.ctor') return makeNDArray([args[0], args[1]], 0);
    if (full === 'tag4_337::Get') return obj[args[0]][args[1]];
    if (full === 'tag4_335::.ctor') return makeNDArray([args[0], args[1]], null);
    if (full === 'tag4_335::Get') return obj[args[0]][args[1]];
    if (full === 'tag4_335::Set') { obj[args[0]][args[1]] = args[2]; return; }

    if (full.startsWith('tag4_') || full.startsWith('java.util.Vector::')) {
      const m = sig.name;
      if (m === 'op_Equality') return args[0] === args[1] ? 1 : 0;
      if (m === 'op_Inequality') return args[0] !== args[1] ? 1 : 0;
      if (m === '.ctor') { obj._vec = []; return; }
      if (!obj) return 0;
      if (!obj._vec) obj._vec = [];
      if (m === 'Add' || m === 'AddElement') { obj._vec.push(args[0]); return 1; }
      if (m === 'AddRange' && args[0] && args[0]._vec) { obj._vec.push(...args[0]._vec); return; }
      if (m === 'ElementAt' || m === 'get_Item' || m === 'Get') return obj._vec[args[0]];
      if (m === 'SetElementAt' || m === 'set_Item') { obj._vec[args[0]] = args[1]; return; }
      if (m === 'InsertElementAt') { obj._vec.splice(args[1], 0, args[0]); return; }
      if (m === 'LastElement') return obj._vec.length ? obj._vec[obj._vec.length - 1] : null;
      if (m === 'FirstElement') return obj._vec.length ? obj._vec[0] : null;
      if (m === 'Size' || m === 'get_Count') return obj._vec.length;
      if (m === 'RemoveAllElements' || m === 'Clear') { obj._vec.length = 0; return; }
      if (m === 'RemoveElementAt' || m === 'RemoveAt') { obj._vec.splice(args[0], 1); return; }
      if (m === 'RemoveElement') {
        const idx = obj._vec.indexOf(args[0]);
        if (idx >= 0) { obj._vec.splice(idx, 1); return 1; }
        return 0;
      }
      if (m === 'IndexOf') return obj._vec.indexOf(args[0]);
      if (m === 'Contains') return obj._vec.includes(args[0]) ? 1 : 0;
      if (m === 'ToArray') return obj._vec.slice();
      return 0;
    }

    if (full === 'kairo.unity.form.FormBase::CheckUsable') return 1;

    if (full === 'kairo.unity.form.FormManagerBase::ChangeCurrentForm') {
      const f = args[0];
      if (!obj.formStack_._vec) obj.formStack_._vec = [];
      obj.formStack_._vec = [f];
      obj.currentForm_ = f;
      f.formManager_ = obj;
      f.formProcMode_ = 2;
      this.execMethod(this.resolveVirtual(f.__type, 'Init', 0, 0), f, []);
      this.updateSoftKeys();
      return 0;
    }
    if (full === 'kairo.unity.form.FormManagerBase::Push') {
      const f = args.length === 1 ? args[0] : args[1];
      if (!obj.formStack_._vec) obj.formStack_._vec = [];
      if (f && !obj.formStack_._vec.includes(f)) {
        obj.formStack_._vec.push(f);
        obj.currentForm_ = f;
        f.formManager_ = obj;
        f.formProcMode_ = 2;
        this.execMethod(this.resolveVirtual(f.__type, 'Init', 0, 0), f, []);
        this.updateSoftKeys();
      }
      return 0;
    }
    if (full === 'kairo.unity.form.FormManagerBase::Pop') {
      const vec = obj.formStack_._vec || [];
      if (vec.length > 1) {
        const old = vec.pop();
        this.execMethod(this.resolveVirtual(old.__type, 'Finish', 0, 0), old, []);
        const top = vec[vec.length - 1];
        obj.currentForm_ = top;
        this.execMethod(this.resolveVirtual(top.__type, 'Resume', 0, 0), top, []);
        this.updateSoftKeys();
      }
      return 0;
    }
    if (full === 'kairo.unity.form.FormManagerBase::RemoveAllForms') {
      if (obj && obj.formStack_ && obj.formStack_._vec) {
        obj.formStack_._vec.length = 0;
      }
      if (obj) obj.currentForm_ = null;
      if (this.onGameExit) this.onGameExit();
      return 0;
    }

    if (full === 'form.GameForm::SetPanel') {
      if (this.onOpenSetPanel) this.onOpenSetPanel();
      return;
    }

    if (full === 'kairo.unity.ui.Canvas::GetInstance') return this.singletons['kairo.unity.ui.Canvas'];
    if (full === 'kairo.unity.ui.Canvas::SetSoftLabel') {
      this.singletons['kairo.unity.ui.Canvas'].softL = this.translateLT(args[0] || '');
      this.singletons['kairo.unity.ui.Canvas'].softR = this.translateLT(args[1] || '');
      this.updateSoftKeys();
      return;
    }
    if (full === 'kairo.unity.ui.Canvas::GetSoftLabelL') return this.singletons['kairo.unity.ui.Canvas'].softL || '';
    if (full === 'kairo.unity.ui.Canvas::GetSoftLabelR') return this.singletons['kairo.unity.ui.Canvas'].softR || '';
    if (full === 'kairo.unity.ui.Canvas::KeyClick') {
      this.queuedKeys.push(args[0]);
      return;
    }
    if (
      full === 'kairo.unity.ui.Canvas::GetWidth' ||
      full === 'kairo.unity.ui.IApplication::GetWidth' ||
      full.endsWith('::GetGameWidth') ||
      full.endsWith('SurfaceBase::GetWidth')
    ) {
      return 240;
    }
    if (
      full === 'kairo.unity.ui.Canvas::GetHeight' ||
      full === 'kairo.unity.ui.IApplication::GetHeight' ||
      full.endsWith('::GetGameHeight') ||
      full.endsWith('SurfaceBase::GetHeight')
    ) {
      return 284;
    }
    if (full.endsWith('::GetScaleRatio')) return 100;
    if (full === 'kairo.unity.ui.IApplication::GetViewport') return [240, 284];
    if (full === 'kairo.unity.ui.IApplication::Focus') return 1;
    if (full === 'kairo.unity.ui.SoundPlayer::GetInstance') return this.singletons['kairo.unity.ui.SoundPlayer'];
    if (full === 'kairo.unity.ui.SoundPlayer::Play') {
      this.hal.playTone(580, 0.04, 'square', 0.04);
      return;
    }
    if (full === 'surface.TouchEffectManager::GetInstance') return this.singletons['surface.TouchEffectManager'];
    if (full === 'kairo.unity.ui.IApplication::GetCurrentApp') return { __type: 'IApplication' };
    if (full === 'kairo.unity.ui.IApplication::Terminate') {
      if (this.onGameExit) this.onGameExit();
      return;
    }
    if (full === 'main.AppData::GetImage') return this.hal.getImageObj(args[0]);
    if (full === 'kairo.unity.ui.Image::CreateImage') return this.hal.getImageObj('__temp__', args[0] || 240, args[1] || 240);
    if (full === 'kairo.unity.ui.Image::GetWidth') return obj ? obj.width || 240 : 240;
    if (full === 'kairo.unity.ui.Image::GetHeight') return obj ? obj.height || 240 : 240;
    if (full === 'kairo.unity.ui.Image::GetGraphics') return this.hal.offG;

    if (full === 'kairo.unity.graphics.Offscreen::CreateOffscreen') {
      return { __type: 'Offscreen', Image: this.hal.offImageObj, IsEmpty: 0 };
    }
    if (full === 'kairo.unity.graphics.Offscreen::get_Image') {
      this.hal.offCtx.setTransform(2, 0, 0, 2, 0, 0);
      this.hal.offCtx.clearRect(0, 0, 240, 284);
      this.hal.offCtx.save();
      this.hal.offG.ox = 0;
      this.hal.offG.oy = 0;
      this.hal.offG.mode = 0;
      this.hal.offG.alpha = 1.0;
      this.hal.offG.flipMode = 0;
      this.execMethod(100669071, this.appData.frmGame_, [this.hal.offG, obj]);
      this.hal.offCtx.restore();
      return this.hal.offImageObj;
    }
    if (full === 'kairo.unity.graphics.Offscreen::get_IsEmpty') return 0;

    if (full === 'kairo.unity.ui.Balloon::.ctor') {
      obj.text_ = this.translateLT(args[0] || '');
      obj.color_ = args[1] || 0;
      return;
    }
    if (full === 'kairo.unity.ui.Balloon::Draw') {
      const [g, bx, by] = args;
      const s = String(obj.text_ || '').trim();
      if (!s || !g) return;
      const ctx: CanvasRenderingContext2D = g.ctx;
      const w = Math.max(28, this.hal.measureKairoText(s, 10) + 10);
      const h = 15;
      const rx = Math.max(2, Math.min(238 - w, bx + g.ox - w / 2));
      const ry = by + g.oy - h - 18;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.strokeStyle = '#2a3529';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(rx, ry, w, h, 4);
      } else {
        ctx.rect(rx, ry, w, h);
      }
      ctx.fill();
      ctx.stroke();
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#0c4a0b';
      ctx.fillText(s, rx + 5, ry + 2);
      ctx.restore();
      return;
    }

    if (full === 'kairo.unity.ui.Font::.ctor') { obj.size = 11; return; }
    if (full === 'kairo.unity.ui.Font::GetSize') return obj && obj.size ? obj.size : 11;
    if (full === 'kairo.unity.ui.Font::SetSize') { if (obj) obj.size = args[0] || 11; return; }
    if (
      full === 'kairo.unity.ui.Font::StringWidth' ||
      full === 'kairo.unity.ui.Font::StringWidthF' ||
      full === 'kairo.unity.ui.Graphics::StringWidth'
    ) {
      return this.hal.measureKairoText(args[0], obj && obj.size ? obj.size : 11);
    }

    if (full.startsWith('kairo.unity.ui.Graphics::')) {
      const g = obj || this.hal.mainG;
      const m = sig.name;
      if (m === 'GetColorOfRGB') return ((args[0] & 0xff) << 16) | ((args[1] & 0xff) << 8) | (args[2] & 0xff);
      if (m === 'GetColor') return g.color;
      if (m === 'SetColor') {
        if (args.length >= 3) {
          g.color = ((args[0] & 0xff) << 16) | ((args[1] & 0xff) << 8) | (args[2] & 0xff);
        } else {
          g.color = args[0] & 0xffffff;
        }
        g.cssColor = `rgb(${(g.color >> 16) & 0xff},${(g.color >> 8) & 0xff},${g.color & 0xff})`;
        return;
      }
      if (m === 'GetOriginX') return g.ox;
      if (m === 'GetOriginY') return g.oy;
      if (m === 'SetOrigin') { g.ox = args[0] | 0; g.oy = args[1] | 0; return; }
      if (m === 'SetFlipMode') { g.flipMode = args[0] | 0; return; }
      if (m === 'SetRenderMode') {
        if (args.length === 0) { g.mode = 0; g.alpha = 1.0; }
        else { g.mode = args[0] | 0; g.alpha = ((args[1] ?? 255) & 0xff) / 255; }
        return;
      }
      if (m === 'PushRenderMode') {
        g.modeStack.push([g.mode, g.alpha]);
        if (args.length >= 2) { g.mode = args[0] | 0; g.alpha = (args[1] & 0xff) / 255; }
        return;
      }
      if (m === 'PopRenderMode') {
        if (g.modeStack.length) { const [pm, pa] = g.modeStack.pop(); g.mode = pm; g.alpha = pa; }
        return;
      }
      if (m === 'SetClip') {
        const [cx, cy, cw, ch] = args;
        g.ctx.restore();
        g.ctx.save();
        g.ctx.beginPath();
        g.ctx.rect(cx + g.ox, cy + g.oy, cw, ch);
        g.ctx.clip();
        return;
      }
      if (m === 'ClearClip') {
        g.ctx.restore();
        g.ctx.save();
        return;
      }
      if (m === 'FillRect') {
        const [rx, ry, rw, rh] = args;
        if (rw <= 0 || rh <= 0) return;
        this.hal.applyGraphicsMode(g);
        g.ctx.fillStyle = g.cssColor;
        g.ctx.fillRect(rx + g.ox, ry + g.oy, rw, rh);
        return;
      }
      if (m === 'DrawRect') {
        const [rx, ry, rw, rh] = args;
        if (rw <= 0 || rh <= 0) return;
        this.hal.applyGraphicsMode(g);
        g.ctx.strokeStyle = g.cssColor;
        g.ctx.lineWidth = 1;
        g.ctx.strokeRect(rx + g.ox + 0.5, ry + g.oy + 0.5, rw, rh);
        return;
      }
      if (m === 'DrawLine') {
        const [x1, y1, x2, y2] = args;
        this.hal.applyGraphicsMode(g);
        g.ctx.strokeStyle = g.cssColor;
        g.ctx.lineWidth = 1;
        g.ctx.beginPath();
        g.ctx.moveTo(x1 + g.ox + 0.5, y1 + g.oy + 0.5);
        g.ctx.lineTo(x2 + g.ox + 0.5, y2 + g.oy + 0.5);
        g.ctx.stroke();
        return;
      }
      if (m === 'DrawImage') {
        if (args.length === 3) {
          const [img, dx, dy] = args;
          if (img) this.hal.drawImageRegion(g, img, dx, dy, img.width, img.height, 0, 0, img.width, img.height);
        } else {
          const [img, dx, dy, sx, sy, sw, sh] = args;
          this.hal.drawImageRegion(g, img, dx, dy, sw, sh, sx, sy, sw, sh);
        }
        return;
      }
      if (m === 'DrawScaledImage') {
        const [img, dx, dy, dw, dh, sx, sy, sw, sh] = args;
        this.hal.drawImageRegion(g, img, dx, dy, dw, dh, sx, sy, sw, sh);
        return;
      }
      if (m === 'DrawString' || m === 'DrawString2' || m === 'DrawStringBold' || m === 'DrawStringBold2') {
        this.hal.drawKairoString(g, args[0], args[1], args[2], typeof args[3] === 'number' ? args[3] : 0);
        return;
      }
      if (m === 'GetScale') return 100;
      if (m === 'GetRenderRect') return [0, 0, 240, 284];
      if (m === 'GetFont') return g.font;
      return 0;
    }

    if (full === 'kairo.unity.ui.ResourceManager::.ctor') {
      obj.img = [];
      obj.seb = [];
      obj.sound = new Array(40).fill(null).map(() => ({ __type: 'kairo.unity.ui.SoundBase' }));
      return;
    }
    if (full === 'kairo.unity.ui.ResourceManager::DrawSeb') {
      const [g, sebIdx, frame, x, y] = args;
      if (obj && obj.seb && obj.seb[sebIdx]) {
        const sebObj = obj.seb[sebIdx];
        const maxF = this.execMethod(100666026, sebObj, []) || 1;
        const sprites = this.execMethod(100666028, sebObj, [((frame % maxF) + maxF) % maxF]) || [];
        for (const s of sprites) {
          if (!s || s[1] < 0) continue;
          const img = obj.img[s[1]];
          if (img) this.hal.drawImageRegion(g, img, x + s[6], y + s[7], s[4], s[5], s[2], s[3], s[4], s[5]);
        }
      }
      return;
    }

    if (full === 'kairo.unity.ui.Seb::WorkStaticValue::.ctor' || full === 'WorkStaticValue::.ctor') {
      obj.getBoundingRectI_result = [0, 0, 0, 0];
      obj.getBoundingRect_result = [0, 0, 0, 0];
      obj.works_ = [];
      obj.result_ = null;
      return;
    }
    if (full === 'WorkValue::.ctor') {
      obj.works_ = null;
      obj.result_ = null;
      return;
    }

    if (full === 'java.io.ByteArrayInputStream::.ctor') {
      if (obj) { obj._buf = args[0] || []; obj._pos = args[1] || 0; }
      return;
    }
    if (full === 'java.io.DataInputStream::.ctor') {
      if (obj) { obj._in = args[0] || { _buf: [], _pos: 0 }; }
      return;
    }
    if (full === 'java.io.DataInputStream::ReadByte' || full === 'java.io.DataInputStream::ReadBoolean') {
      if (!obj || !obj._in || !obj._in._buf) return 0;
      const b = obj._in._buf[obj._in._pos++] || 0;
      return (b << 24) >> 24;
    }
    if (full === 'java.io.DataInputStream::ReadUnsignedByte') {
      if (!obj || !obj._in || !obj._in._buf) return 0;
      return (obj._in._buf[obj._in._pos++] || 0) & 0xff;
    }
    if (full === 'java.io.DataInputStream::ReadShort') {
      if (!obj || !obj._in || !obj._in._buf) return 0;
      const b0 = (obj._in._buf[obj._in._pos++] || 0) & 0xff, b1 = (obj._in._buf[obj._in._pos++] || 0) & 0xff;
      return (((b0 << 8) | b1) << 16) >> 16;
    }
    if (full === 'java.io.DataInputStream::ReadUnsignedShort' || full === 'java.io.DataInputStream::ReadChar') {
      if (!obj || !obj._in || !obj._in._buf) return 0;
      const b0 = (obj._in._buf[obj._in._pos++] || 0) & 0xff, b1 = (obj._in._buf[obj._in._pos++] || 0) & 0xff;
      return (b0 << 8) | b1;
    }
    if (full === 'java.io.DataInputStream::ReadInt') {
      if (!obj || !obj._in || !obj._in._buf) return 0;
      const b = obj._in._buf;
      let p = obj._in._pos || 0;
      obj._in._pos = p + 4;
      return ((b[p] & 0xff) << 24) | ((b[p + 1] & 0xff) << 16) | ((b[p + 2] & 0xff) << 8) | (b[p + 3] & 0xff);
    }
    if (full === 'java.io.DataInputStream::ReadLong') {
      if (!obj || !obj._in || !obj._in._buf) return 0;
      const b = obj._in._buf;
      let p = obj._in._pos || 0;
      obj._in._pos = p + 8;
      const hi = ((b[p] & 0xff) << 24) | ((b[p + 1] & 0xff) << 16) | ((b[p + 2] & 0xff) << 8) | (b[p + 3] & 0xff);
      const lo =
        (((b[p + 4] & 0xff) << 24) |
          ((b[p + 5] & 0xff) << 16) |
          ((b[p + 6] & 0xff) << 8) |
          (b[p + 7] & 0xff)) >>>
        0;
      return hi * 4294967296 + lo;
    }
    if (full === 'java.io.DataInputStream::ReadUTF') {
      if (!obj || !obj._in || !obj._in._buf) return '';
      const b = obj._in._buf;
      let p = obj._in._pos || 0;
      const utflen = ((b[p] & 0xff) << 8) | (b[p + 1] & 0xff);
      p += 2;
      const sub = new Uint8Array(b.slice(p, p + utflen));
      obj._in._pos = p + utflen;
      return new TextDecoder('utf-8').decode(sub);
    }
    if (full === 'java.io.DataInputStream::Close' || full === 'java.io.InputStream::Close') return;

    if (full === 'java.io.ByteArrayOutputStream::.ctor') { if (obj) obj._buf = []; return; }
    if (full === 'java.io.ByteArrayOutputStream::ToByteArray') return obj && obj._buf ? obj._buf.slice() : [];
    if (full === 'java.io.DataOutputStream::.ctor') { if (obj) obj._out = args[0] || { _buf: [] }; return; }
    if (full === 'java.io.DataOutputStream::WriteByte' || full === 'java.io.DataOutputStream::WriteBoolean') {
      if (obj && obj._out && obj._out._buf) obj._out._buf.push(args[0] & 0xff);
      return;
    }
    if (full === 'java.io.DataOutputStream::WriteShort' || full === 'java.io.DataOutputStream::WriteChar') {
      const v = args[0];
      if (obj && obj._out && obj._out._buf) obj._out._buf.push((v >> 8) & 0xff, v & 0xff);
      return;
    }
    if (full === 'java.io.DataOutputStream::WriteInt') {
      const v = args[0];
      if (obj && obj._out && obj._out._buf) obj._out._buf.push((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
      return;
    }
    if (full === 'java.io.DataOutputStream::WriteLong') {
      const v = Number(args[0] || 0), hi = Math.floor(v / 4294967296), lo = v >>> 0;
      if (obj && obj._out && obj._out._buf) {
        obj._out._buf.push(
          (hi >> 24) & 0xff, (hi >> 16) & 0xff, (hi >> 8) & 0xff, hi & 0xff,
          (lo >> 24) & 0xff, (lo >> 16) & 0xff, (lo >> 8) & 0xff, lo & 0xff
        );
      }
      return;
    }
    if (full === 'java.io.DataOutputStream::WriteUTF') {
      const bytes = Array.from(new TextEncoder().encode(String(args[0] || '')));
      const len = bytes.length;
      if (obj && obj._out && obj._out._buf) obj._out._buf.push((len >> 8) & 0xff, len & 0xff, ...bytes);
      return;
    }
    if (full === 'java.io.DataOutputStream::Close' || full === 'java.io.ByteArrayOutputStream::Close') return;

    if (full.startsWith('kairo.unity.io.RecordStore::')) {
      if (full === 'kairo.unity.io.RecordStore::GetNumRecords') {
        const hasSave = !!(
          this.hal.getStorageItem('sysSave') ||
          this.hal.getStorageItem('save_0') ||
          this.hal.getStorageItem('save_1')
        );
        return hasSave ? 6 : 0;
      }
      return 1;
    }

    if (full === 'kairo.unity.util.Property::.ctor') {
      obj.pros = []; obj.ints = new Array(32).fill(0); obj.lngs = new Array(32).fill(0);
      obj.strs = new Array(32).fill(''); obj.bins = [null, null, null, null];
      return;
    }

    if (full === 'main.AppData::SaveSystem') {
      if (obj && obj.sysSave_) {
        this.hal.setStorageItem('sysSave', JSON.stringify(obj.sysSave_));
      }
      this.onStateSnapshotNeeded?.('游戏系统存档写入 (SaveSystem)');
      return 1;
    }
    if (full === 'main.AppData::LoadSystem') {
      if (!obj.sysSave_) {
        obj.sysSave_ = { pros: [], ints: new Array(32).fill(0), lngs: new Array(32).fill(0), strs: new Array(32).fill(''), bins: [null, null] };
      }
      const saved = this.hal.getStorageItem('sysSave');
      const hasGameSave = !!(this.hal.getStorageItem('save_0') || this.hal.getStorageItem('save_1'));
      if (saved) {
        try {
          obj.sysSave_ = JSON.parse(saved);
          if (hasGameSave) {
            this.staticFields['form.GameForm::KirokuLoadGame'] = 1;
          }
          return 1;
        } catch (e) {
          console.error('Failed to parse sysSave', e);
        }
      }
      if (hasGameSave) {
        this.staticFields['form.GameForm::KirokuLoadGame'] = 1;
        return 1;
      }
      return 0;
    }
    if (full === 'main.AppData::SaveGame') {
      const slot = args.length === 1 ? args[0] : (args[1] ?? args[0] ?? 0);
      if (obj && obj.save_) {
        const str = JSON.stringify(obj.save_);
        this.hal.setStorageItem('save_' + slot, str);
        this.hal.setStorageItem('save_0', str);
      }
      this.onStateSnapshotNeeded?.(`游戏原生存档写入 (槽位 ${slot})`);
      return 1;
    }
    if (full === 'main.AppData::LoadGame') {
      const slot = args.length === 1 ? args[0] : (args[1] ?? args[0] ?? 0);
      const saved = this.hal.getStorageItem('save_' + slot) || this.hal.getStorageItem('save_0');
      if (saved) {
        try {
          obj.save_ = JSON.parse(saved);
          return 1;
        } catch (e) {
          console.error('Failed to parse save_' + slot, e);
        }
      }
      return 0;
    }

    if (full === 'kairo.unity.util.BitUtil::Check') return (args[0] & (1 << args[1])) !== 0 ? 1 : 0;
    if (full === 'kairo.unity.util.BitUtil::Split') return [(args[0] >> 16) & 0xffff, (args[0] << 16) >> 16];
    if (full === 'kairo.unity.util.BitUtil::Join') return ((args[0] & 0xffff) << 16) | (args[1] & 0xffff);
    if (full === 'java.lang.JSystem::CurrentTimeMillis') return Date.now();
    if (full === 'java.lang.JSystem::GetProperty') return '';
    if (full === 'java.lang.JSystem::Arraycopy') {
      const [src, srcPos, dst, dstPos, len] = args;
      if (src && dst) for (let i = 0; i < len; i++) dst[dstPos + i] = src[srcPos + i];
      return;
    }
    if (full === 'Assets.Scripts.data.MonkeyGaojiChange::GetChangeToStr') return args[0];

    return sig.hasRet ? 0 : undefined;
  }

  public execMethod(tok: number | string, thisObj: any, args: any[] = []): any {
    const numTok = typeof tok === 'string' ? parseInt(tok, 10) : tok;
    const m = this.methods[String(numTok)];

    if (m && m.full === 'surface.GameView::_addTouch') {
      const [g, type, x, y, w, h, param, opt] = args;
      const ox = g ? g.ox || 0 : 0;
      const oy = g ? g.oy || 0 : 0;
      this.touchRegions.push({ type, x: x + ox, y: y + oy, w, h, param, opt });
    }

    if (!m) {
      const sig = this.methodSigs[String(numTok)];
      if (sig) return this.handleExternalCall(sig, thisObj, args, [], []);
      return 0;
    }

    const insns = m.insns;
    const locals = new Array(m.locals).fill(0);
    const allArgs = m.hasThis ? [thisObj, ...args] : [...args];
    const stack: any[] = [];
    const finallyStack: number[] = [];
    let pc = 0;

    while (pc < insns.length) {
      const curPc = pc;
      const insn = insns[pc++];
      const op = insn[0], arg = insn[1];

      try {
        switch (op) {
          case 0x00: case 0x01: break;
          case 0x02: stack.push(allArgs[0]); break;
          case 0x03: stack.push(allArgs[1]); break;
          case 0x04: stack.push(allArgs[2]); break;
          case 0x05: stack.push(allArgs[3]); break;
          case 0x0e: case 0xfe09: stack.push(allArgs[arg]); break;
          case 0x0f: case 0xfe0a: stack.push({ __ref: 'arg', idx: arg }); break;
          case 0x10: case 0xfe0b: allArgs[arg] = stack.pop(); break;

          case 0x06: stack.push(locals[0]); break;
          case 0x07: stack.push(locals[1]); break;
          case 0x08: stack.push(locals[2]); break;
          case 0x09: stack.push(locals[3]); break;
          case 0x11: case 0xfe0c: stack.push(locals[arg]); break;
          case 0x12: case 0xfe0d: stack.push({ __ref: 'loc', idx: arg }); break;
          case 0x0a: locals[0] = stack.pop(); break;
          case 0x0b: locals[1] = stack.pop(); break;
          case 0x0c: locals[2] = stack.pop(); break;
          case 0x0d: locals[3] = stack.pop(); break;
          case 0x13: case 0xfe0e: locals[arg] = stack.pop(); break;

          case 0x14: stack.push(null); break;
          case 0x15: stack.push(-1); break;
          case 0x16: stack.push(0); break;
          case 0x17: stack.push(1); break;
          case 0x18: stack.push(2); break;
          case 0x19: stack.push(3); break;
          case 0x1a: stack.push(4); break;
          case 0x1b: stack.push(5); break;
          case 0x1c: stack.push(6); break;
          case 0x1d: stack.push(7); break;
          case 0x1e: stack.push(8); break;
          case 0x1f: case 0x20: case 0x21: case 0x22: case 0x23: stack.push(arg); break;
          case 0x25: stack.push(stack[stack.length - 1]); break;
          case 0x26: stack.pop(); break;
          case 0x2a: return m.hasRet ? stack.pop() : undefined;

          case 0x2b: case 0x38: pc = arg; break;
          case 0xdd: case 0xde: {
            let jumpedFinally = false;
            if (m.eh && m.eh.length) {
              for (const [cf, ts, te, hs] of m.eh) {
                if (cf === 2 && curPc >= ts && curPc < te && arg >= te) {
                  finallyStack.push(arg);
                  pc = hs;
                  jumpedFinally = true;
                  break;
                }
              }
            }
            if (!jumpedFinally) pc = arg;
            break;
          }
          case 0x2c: case 0x39: { const v = stack.pop(); if (!v) pc = arg; break; }
          case 0x2d: case 0x3a: { const v = stack.pop(); if (v) pc = arg; break; }
          case 0x2e: case 0x3b: { const b = stack.pop(), a = stack.pop(); if (a === b) pc = arg; break; }
          case 0x2f: case 0x3c: { const b = stack.pop(), a = stack.pop(); if (a >= b) pc = arg; break; }
          case 0x30: case 0x3d: { const b = stack.pop(), a = stack.pop(); if (a > b) pc = arg; break; }
          case 0x31: case 0x3e: { const b = stack.pop(), a = stack.pop(); if (a <= b) pc = arg; break; }
          case 0x32: case 0x3f: { const b = stack.pop(), a = stack.pop(); if (a < b) pc = arg; break; }
          case 0x33: case 0x40: { const b = stack.pop(), a = stack.pop(); if (a !== b) pc = arg; break; }
          case 0x34: case 0x41: { const b = stack.pop(), a = stack.pop(); if ((a >>> 0) >= (b >>> 0)) pc = arg; break; }
          case 0x35: case 0x42: { const b = stack.pop(), a = stack.pop(); if ((a >>> 0) > (b >>> 0)) pc = arg; break; }
          case 0x36: case 0x43: { const b = stack.pop(), a = stack.pop(); if ((a >>> 0) <= (b >>> 0)) pc = arg; break; }
          case 0x37: case 0x44: { const b = stack.pop(), a = stack.pop(); if ((a >>> 0) < (b >>> 0)) pc = arg; break; }
          case 0x45: { const v = stack.pop(); if (v >= 0 && v < arg.length) pc = arg[v]; break; }

          case 0x58: { const b = stack.pop(), a = stack.pop(); stack.push((a + b) | 0); break; }
          case 0x59: { const b = stack.pop(), a = stack.pop(); stack.push((a - b) | 0); break; }
          case 0x5a: { const b = stack.pop(), a = stack.pop(); stack.push(Math.imul(a, b)); break; }
          case 0x5b: case 0x5c: { const b = stack.pop(), a = stack.pop(); stack.push(b === 0 ? 0 : (a / b) | 0); break; }
          case 0x5d: case 0x5e: { const b = stack.pop(), a = stack.pop(); stack.push(b === 0 ? 0 : (a % b) | 0); break; }
          case 0x5f: { const b = stack.pop(), a = stack.pop(); stack.push(a & b); break; }
          case 0x60: { const b = stack.pop(), a = stack.pop(); stack.push(a | b); break; }
          case 0x61: { const b = stack.pop(), a = stack.pop(); stack.push(a ^ b); break; }
          case 0x62: { const b = stack.pop(), a = stack.pop(); stack.push(a << b); break; }
          case 0x63: { const b = stack.pop(), a = stack.pop(); stack.push(a >> b); break; }
          case 0x64: { const b = stack.pop(), a = stack.pop(); stack.push(a >>> b); break; }
          case 0x65: stack.push((-stack.pop()) | 0); break;
          case 0x66: stack.push(~stack.pop()); break;
          case 0x67: stack.push((stack.pop() << 24) >> 24); break;
          case 0x68: stack.push((stack.pop() << 16) >> 16); break;
          case 0x69: case 0x6a: case 0x6d: case 0x6e: stack.push(stack.pop() | 0); break;
          case 0x6b: case 0x6c: stack.push(Number(stack.pop())); break;
          case 0xd2: stack.push(stack.pop() & 0xff); break;
          case 0xd1: stack.push(stack.pop() & 0xffff); break;

          case 0xfe01: { const b = stack.pop(), a = stack.pop(); stack.push(a === b ? 1 : 0); break; }
          case 0xfe02: case 0xfe03: { const b = stack.pop(), a = stack.pop(); stack.push(a > b ? 1 : 0); break; }
          case 0xfe04: case 0xfe05: { const b = stack.pop(), a = stack.pop(); stack.push(a < b ? 1 : 0); break; }
          case 0xfe06: stack.push(arg); break;

          case 0x72: stack.push(this.strings[arg]); break;
          case 0x7b: {
            const f = this.fields[arg], o = stack.pop();
            stack.push(o && f && o[f.shortName] !== undefined ? o[f.shortName] : 0);
            break;
          }
          case 0x7d: {
            const f = this.fields[arg], v = stack.pop(), o = stack.pop();
            if (o && f) o[f.shortName] = v;
            break;
          }
          case 0x7e: {
            const f = this.fields[arg];
            stack.push(f && this.staticFields[f.name] !== undefined ? this.staticFields[f.name] : 0);
            break;
          }
          case 0x80: {
            const f = this.fields[arg], v = stack.pop();
            if (f) this.staticFields[f.name] = v;
            break;
          }
          case 0x8d: {
            const len = stack.pop() | 0;
            stack.push(new Array(Math.max(0, len)).fill(0));
            break;
          }
          case 0x8e: {
            const arr = stack.pop();
            stack.push(arr ? arr.length : 0);
            break;
          }
          case 0x8f: {
            const idx = stack.pop(), arr = stack.pop();
            stack.push({ __ref: 'arr', arr, idx });
            break;
          }
          case 0x46: case 0x47: case 0x48: case 0x49: case 0x4a: case 0x4b:
          case 0x4c: case 0x4d: case 0x4e: case 0x4f: case 0x50: {
            const r = stack.pop();
            if (r && r.__ref === 'arr') stack.push(r.arr[r.idx] || 0);
            else if (r && r.__ref === 'loc') stack.push(locals[r.idx] || 0);
            else if (r && r.__ref === 'arg') stack.push(allArgs[r.idx] || 0);
            else stack.push(0);
            break;
          }
          case 0x52: case 0x53: case 0x54: case 0x55: case 0x56: case 0x57: {
            const val = stack.pop(), r = stack.pop();
            if (r && r.__ref === 'arr') r.arr[r.idx] = val;
            else if (r && r.__ref === 'loc') locals[r.idx] = val;
            else if (r && r.__ref === 'arg') allArgs[r.idx] = val;
            break;
          }
          case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95:
          case 0x96: case 0x97: case 0x98: case 0x99: case 0x9a: {
            const idx = stack.pop(), arr = stack.pop();
            stack.push(arr && arr[idx] !== undefined ? arr[idx] : 0);
            break;
          }
          case 0x9c: case 0x9d: case 0x9e: case 0x9f: case 0xa0: case 0xa1: case 0xa2: {
            const val = stack.pop(), idx = stack.pop(), arr = stack.pop();
            if (arr && idx >= 0 && idx < arr.length) arr[idx] = val;
            break;
          }
          case 0x73: {
            const sig = this.methodSigs[String(arg)];
            const cargs = [];
            for (let i = 0; i < (sig ? sig.params : 0); i++) cargs.unshift(stack.pop());
            if (this.methods[String(arg)]) {
              const newObj = { __type: sig.type };
              this.execMethod(arg, newObj, cargs);
              stack.push(newObj);
            } else if (sig) {
              const newObj = { __type: sig.type };
              const custom = this.handleExternalCall(sig, newObj, cargs, locals, allArgs);
              stack.push(custom !== undefined ? custom : newObj);
            } else stack.push({});
            break;
          }
          case 0x28: case 0x6f: {
            const sig = this.methodSigs[String(arg)];
            if (!sig) throw new Error(`Missing sig for 0x${arg.toString(16)}`);
            const cargs = [];
            for (let i = 0; i < sig.params; i++) cargs.unshift(stack.pop());
            const targetObj = sig.hasThis ? stack.pop() : null;
            let targetTok = arg;
            if (op === 0x6f && targetObj && targetObj.__type) {
              targetTok = this.resolveVirtual(targetObj.__type, sig.name, sig.params, arg);
            }
            if (this.methods[String(targetTok)]) {
              const ret = this.execMethod(targetTok, targetObj, cargs);
              if (sig.hasRet) stack.push(ret === undefined ? 0 : ret);
            } else {
              const ret = this.handleExternalCall(
                this.methodSigs[String(targetTok)] || sig,
                targetObj,
                cargs,
                locals,
                allArgs
              );
              if (sig.hasRet) stack.push(ret === undefined ? 0 : ret);
            }
            break;
          }
          case 0x8c: {
            if (arg === 16777370) stack.push(String.fromCharCode(stack.pop()));
            break;
          }
          case 0x74: case 0x75: case 0xa5: break;
          case 0xdc: {
            if (finallyStack.length > 0) pc = finallyStack.pop()!;
            break;
          }
          case 0xd0: stack.push(arg); break;
          case 0x7a: throw new Error('CIL throw: ' + stack.pop());
          default: break;
        }
      } catch (err) {
        let caught = false;
        if (m.eh && m.eh.length) {
          for (const [cf, ts, te, hs] of m.eh) {
            if (curPc >= ts && curPc < te && cf === 0) {
              stack.length = 0;
              stack.push(err);
              pc = hs;
              caught = true;
              break;
            }
          }
        }
        if (!caught) throw err;
      }
    }
    return m.hasRet ? stack.pop() : undefined;
  }

  // --- FastResume Heap Serialization & Restoration ---

  public serializeVMHeap(): any {
    const objToId = new Map();
    const heap: any[] = [];

    const encodeVal = (val: any): any => {
      if (val === null) return null;
      if (val === undefined) return { $und: 1 };
      if (typeof val === 'number') {
        if (Number.isNaN(val)) return { $nan: 1 };
        if (!Number.isFinite(val)) return { $inf: val > 0 ? 1 : -1 };
        return val;
      }
      if (typeof val === 'string' || typeof val === 'boolean') {
        return val;
      }
      if (typeof val !== 'object') return null;

      if (val instanceof Uint8Array) {
        return { $t: 'u8', bytes: Array.from(val) };
      }
      if (val instanceof Int32Array) {
        return { $t: 'i32', ints: Array.from(val) };
      }

      if (val === this.hal.mainG) return { $sp: 'mainG' };
      if (val === this.hal.offG) return { $sp: 'offG' };
      if (val === this.hal.offImageObj) return { $sp: 'offImg' };
      if (val === this.appData?.resCom_) return { $sp: 'resCom' };
      if (val === this.appData?.resGame_) return { $sp: 'resGame' };
      if (val.__type === 'kairo.unity.ui.Image') {
        return { $sp: 'img', name: val.name, w: val.width, h: val.height };
      }
      if (objToId.has(val)) return { $ref: objToId.get(val) };
      const id = heap.length;
      objToId.set(val, id);
      heap.push(null);

      if (Array.isArray(val)) {
        const items = new Array(val.length);
        for (let i = 0; i < val.length; i++) {
          items[i] = encodeVal(val[i]);
        }
        const node: any = { $t: 'a', items };
        if ((val as any).__nd) node.nd = (val as any).__nd;
        const extra: Record<string, any> = {};
        for (const k of Object.keys(val)) {
          if (/^\d+$/.test(k) || k === 'length' || k === '__nd') continue;
          extra[k] = encodeVal((val as any)[k]);
        }
        if (Object.keys(extra).length > 0) node.extra = extra;
        heap[id] = node;
      } else {
        const props: Record<string, any> = {};
        for (const k of Object.keys(val)) {
          if (k === 'el' || k === 'ctx') continue;
          props[k] = encodeVal(val[k]);
        }
        heap[id] = { $t: 'o', props };
      }
      return { $ref: id };
    };

    return {
      version: 1,
      roots: {
        staticFields: encodeVal(this.staticFields),
        singletons: encodeVal(this.singletons),
        appData: encodeVal(this.appData),
        fm: encodeVal(this.fm),
        gv: encodeVal(this.gv),
        gf: encodeVal(this.gf),
        tf: encodeVal(this.tf)
      },
      heap
    };
  }

  public deserializeVMHeap(vmState: any): boolean {
    if (!vmState || !vmState.heap || !vmState.roots) return false;
    const restored = new Array(vmState.heap.length);
    const oldResCom = this.appData?.resCom_;
    const oldResGame = this.appData?.resGame_;

    for (let i = 0; i < vmState.heap.length; i++) {
      const node = vmState.heap[i];
      if (node.$t === 'a') {
        const arr: any = new Array(node.items.length);
        if (node.nd) arr.__nd = node.nd;
        restored[i] = arr;
      } else {
        restored[i] = {};
      }
    }

    const decodeVal = (val: any): any => {
      if (val === null || val === undefined) return val;
      if (typeof val === 'object') {
        if (val.$und) return undefined;
        if (val.$nan) return NaN;
        if (val.$inf) return val.$inf > 0 ? Infinity : -Infinity;
        if (val.$t === 'u8') return new Uint8Array(val.bytes);
        if (val.$t === 'i32') return new Int32Array(val.ints);
        if (val.$sp) {
          if (val.$sp === 'mainG') return this.hal.mainG;
          if (val.$sp === 'offG') return this.hal.offG;
          if (val.$sp === 'offImg') return this.hal.offImageObj;
          if (val.$sp === 'resCom') return oldResCom;
          if (val.$sp === 'resGame') return oldResGame;
          if (val.$sp === 'img') return this.hal.getImageObj(val.name, val.w, val.h);
        }
        if (val.$ref !== undefined) return restored[val.$ref];
      }
      return val;
    };

    for (let i = 0; i < vmState.heap.length; i++) {
      const node = vmState.heap[i];
      const target = restored[i];
      if (node.$t === 'a') {
        for (let j = 0; j < node.items.length; j++) {
          target[j] = decodeVal(node.items[j]);
        }
        if (node.extra) {
          for (const [k, v] of Object.entries(node.extra)) {
            target[k] = decodeVal(v);
          }
        }
      } else {
        for (const [k, v] of Object.entries(node.props)) {
          target[k] = decodeVal(v);
        }
        if (Array.isArray(target._vec)) {
          Object.setPrototypeOf(target, JVector.prototype);
        }
      }
    }

    const newStatic = decodeVal(vmState.roots.staticFields);
    for (const k of Object.keys(this.staticFields)) delete this.staticFields[k];
    if (newStatic) Object.assign(this.staticFields, newStatic);

    const newSingletons = decodeVal(vmState.roots.singletons);
    for (const k of Object.keys(this.singletons)) delete this.singletons[k];
    if (newSingletons) Object.assign(this.singletons, newSingletons);

    this.appData = decodeVal(vmState.roots.appData);
    if (this.appData) {
      if (oldResCom) this.appData.resCom_ = oldResCom;
      if (oldResGame) this.appData.resGame_ = oldResGame;
    }
    this.fm = decodeVal(vmState.roots.fm);
    this.gv = decodeVal(vmState.roots.gv);
    this.gf = decodeVal(vmState.roots.gf);
    this.tf = decodeVal(vmState.roots.tf);

    this.queuedKeys.length = 0;
    this.touchRegions.length = 0;
    this.updateSoftKeys();
    return true;
  }
}
