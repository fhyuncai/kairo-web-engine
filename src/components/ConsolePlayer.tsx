import React, { useState, useEffect, useRef } from 'react';
import { GameRuntimeMetadata, FastResumeSnapshot } from '../types/kairo';

export interface NamingModalState {
  isOpen: boolean;
  title: string;
  defaultVal: string;
  presets: string[];
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

interface ConsolePlayerProps {
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  loading?: boolean;
  loadingText?: string;
  gameTitle: string;
  meta: GameRuntimeMetadata;
  latestAutoSnap: FastResumeSnapshot | null;
  simSpeed: number;
  useOriginalFund: boolean;
  audioEnabled: boolean;
  softLeftLabel: string;
  softRightLabel: string;
  namingModal?: NamingModalState | null;
  onCanvasPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onTriggerKey: (keyBit: number) => void;
  onSetSpeed: (speed: number) => void;
  onToggleFund: () => void;
  onToggleAudio: () => void;
  onQuickSnapshot: () => void;
  onQuickRestore: () => void;
  onOpenSaveManager: () => void;
  onReturnToHub: () => void;
  onRestartGame: () => void;
  isPlaying?: boolean;
  onStartGame?: () => void;
  onEndGame?: () => void;
  onSaveInGame?: () => void;
  onLoadNativeSave?: () => void;
}

export const ConsolePlayer: React.FC<ConsolePlayerProps> = ({
  canvasRef,
  loading = false,
  loadingText,
  gameTitle,
  meta,
  latestAutoSnap,
  simSpeed,
  useOriginalFund,
  audioEnabled,
  softLeftLabel,
  softRightLabel,
  namingModal,
  onCanvasPointerDown,
  onTriggerKey,
  onSetSpeed,
  onToggleFund,
  onToggleAudio,
  onQuickSnapshot,
  onQuickRestore,
  onOpenSaveManager,
  onReturnToHub,
  onRestartGame,
  isPlaying = false,
  onStartGame,
  onEndGame,
  onSaveInGame,
  onLoadNativeSave
}) => {
  const [inputValue, setInputValue] = useState('');
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (namingModal?.isOpen) {
      setInputValue(namingModal.defaultVal);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [namingModal?.isOpen, namingModal?.defaultVal]);

  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      namingModal?.onConfirm(inputValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      namingModal?.onCancel();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-6 w-full max-w-5xl mx-auto p-2 sm:p-4">
      {/* Handheld Console Unit */}
      <div className="flex flex-col items-center bg-slate-900 border-2 border-slate-700 rounded-3xl p-3 sm:p-4 shadow-2xl w-full max-w-[440px]">
        {/* Row 1: Left: 游戏大厅, Right: 游戏功能 */}
        <div className="w-full flex items-center justify-between gap-2 mb-2">
          <button
            onClick={onReturnToHub}
            className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-100 border border-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow"
          >
            ⬅ 游戏大厅
          </button>
          <button
            onClick={() => setGameMenuOpen(true)}
            className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold px-3.5 py-1.5 rounded-xl text-xs transition-all shadow flex items-center gap-1.5"
          >
            🎮 游戏
          </button>
        </div>

        {/* Row 2: 音效 */}
        <div className="w-full mb-3">
          <button
            onClick={onToggleAudio}
            className={`w-full py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
              audioEnabled
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-600 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-700/80 line-through decoration-red-400'
            }`}
          >
            {audioEnabled ? '🔊 声音音效 (已开启)' : '🔇 声音音效 (已静音)'}
          </button>
        </div>

        {/* 240x284 Native Aspect Screen */}
        <div className="relative w-full aspect-[240/284] max-w-[390px] bg-black rounded-xl overflow-hidden border-2 border-slate-950 shadow-inner">
          <canvas
            ref={canvasRef}
            id="kairo-canvas"
            width={480}
            height={568}
            onPointerDown={onCanvasPointerDown}
            className="w-full h-full block cursor-pointer select-none touch-none"
          />

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 text-amber-400 p-4 text-center z-20">
              <div className="w-9 h-9 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <div className="text-sm font-bold tracking-wide">
                {loadingText || '正在载入并解压开罗游戏卡带...'}
              </div>
              <div className="text-xs text-slate-400">正在初始化 CIL 虚拟机与 1:1 图像管线</div>
            </div>
          )}

          {/* Standby / Center Start Game Screen */}
          {!isPlaying && !loading && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-between p-5 text-center z-20 select-none">
              {/* Header / Brand */}
              <div className="flex flex-col items-center gap-1.5 mt-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  掌机硬件系统 · 待命状态
                </div>
                <h2 className="text-xl font-extrabold text-white tracking-wide mt-1">
                  {gameTitle}
                </h2>
                <div className="text-[11px] text-slate-400">
                  Game Dev Story · 开罗经典模拟经营
                </div>
              </div>

              {/* Center Action Buttons */}
              <div className="w-full flex flex-col gap-3 max-w-[260px] my-auto">
                {/* 1. Main Start Game Button */}
                <button
                  onClick={onStartGame}
                  className="w-full group relative overflow-hidden bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 active:scale-95 text-slate-950 font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-amber-500/20 text-sm flex items-center justify-center gap-2 transition-all transform duration-150 cursor-pointer"
                >
                  <span className="text-base">▶</span>
                  <span>启动游戏</span>
                </button>

                {/* 2. Fast Resume / Quick Restore Button (if latest snapshot exists) */}
                {latestAutoSnap && (
                  <button
                    onClick={onQuickRestore}
                    className="w-full bg-slate-800/90 hover:bg-slate-750 active:scale-95 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400/80 font-bold py-2.5 px-3 rounded-xl text-xs flex flex-col items-center justify-center gap-0.5 shadow transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>⚡</span>
                      <span>快速恢复现场</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      {latestAutoSnap.meta.dateLabel} · {latestAutoSnap.meta.fundsLabel}
                    </div>
                  </button>
                )}

                {/* 3. Load Native Save Button */}
                {onLoadNativeSave && (
                  <button
                    onClick={onLoadNativeSave}
                    className="w-full bg-slate-900/90 hover:bg-slate-800 active:scale-95 text-slate-300 border border-slate-700/80 font-semibold py-2 px-3 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>💾</span>
                    <span>载入游戏原生存档</span>
                  </button>
                )}
              </div>

              {/* Footer specs / status */}
              <div className="text-[10px] text-slate-500 flex items-center justify-center gap-2 pb-1">
                <span>CIL 堆栈虚拟机</span>
                <span>•</span>
                <span>240×284 1:1 双倍管线</span>
              </div>
            </div>
          )}

          {/* In-Game Naming Modal Overlay (SetPanel) */}
          {namingModal?.isOpen && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-30">
              <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-4 w-full max-w-[320px] shadow-2xl flex flex-col gap-3">
                <div className="text-sm font-bold text-amber-300 text-center">
                  📝 {namingModal.title}
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  maxLength={16}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleModalKeyDown}
                  className="w-full bg-slate-950 border border-slate-600 rounded-lg px-3 py-2 text-white font-bold text-center text-sm focus:outline-none focus:border-amber-400"
                  placeholder="请输入名称..."
                />

                {/* Presets chips */}
                {namingModal.presets && namingModal.presets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center max-h-24 overflow-y-auto">
                    {namingModal.presets.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setInputValue(p);
                          inputRef.current?.focus();
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-[11px] px-2 py-0.5 rounded-full transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => namingModal.onConfirm(inputValue)}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-1.5 rounded-lg text-xs"
                  >
                    确定 (Enter)
                  </button>
                  <button
                    onClick={() => namingModal.onCancel()}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 font-bold py-1.5 rounded-lg text-xs"
                  >
                    取消 (Esc)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SoftKey Bar (2 Columns: Left Softkey, Right Softkey) */}
        <div className="w-full grid grid-cols-2 gap-2 mt-2 items-center">
          <button
            onClick={() => onTriggerKey(2097152)}
            className="bg-slate-800 active:bg-slate-950 hover:bg-slate-750 text-amber-300 border border-slate-600 py-2 rounded-xl text-xs font-bold shadow-sm transition-all text-center"
          >
            {softLeftLabel || '存档'}
          </button>
          <button
            onClick={() => onTriggerKey(4194304)}
            className="bg-slate-800 active:bg-slate-950 hover:bg-slate-750 text-amber-300 border border-slate-600 py-2 rounded-xl text-xs font-bold shadow-sm transition-all text-center"
          >
            {softRightLabel || '菜单 / 返回'}
          </button>
        </div>

        {/* All-Chinese D-Pad & Action Buttons */}
        <div className="w-full flex items-center justify-between gap-3 mt-3">
          {/* Chinese D-Pad */}
          <div className="grid grid-cols-3 gap-1.5 w-36 h-36">
            <div />
            <button
              onClick={() => onTriggerKey(131072)}
              className="bg-slate-800 active:bg-amber-500 active:text-slate-950 border border-slate-600 rounded-lg font-extrabold text-xs shadow-sm"
            >
              上
            </button>
            <div />
            <button
              onClick={() => onTriggerKey(65536)}
              className="bg-slate-800 active:bg-amber-500 active:text-slate-950 border border-slate-600 rounded-lg font-extrabold text-xs shadow-sm"
            >
              左
            </button>
            <button
              onClick={() => (isPlaying ? onTriggerKey(1048576) : onStartGame?.())}
              className="bg-amber-500 active:bg-amber-400 text-slate-950 rounded-lg font-extrabold text-xs shadow"
            >
              确定
            </button>
            <button
              onClick={() => onTriggerKey(262144)}
              className="bg-slate-800 active:bg-amber-500 active:text-slate-950 border border-slate-600 rounded-lg font-extrabold text-xs shadow-sm"
            >
              右
            </button>
            <div />
            <button
              onClick={() => onTriggerKey(524288)}
              className="bg-slate-800 active:bg-amber-500 active:text-slate-950 border border-slate-600 rounded-lg font-extrabold text-xs shadow-sm"
            >
              下
            </button>
            <div />
          </div>

          {/* Right Action Cluster (2 rows: 确定 / 返回·菜单, ◀ 上一页 / 下一页 ▶) */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => (isPlaying ? onTriggerKey(1048576) : onStartGame?.())}
                className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold py-3.5 rounded-2xl text-sm shadow-md"
              >
                确定
              </button>
              <button
                onClick={() => onTriggerKey(4194304)}
                className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-100 border border-slate-600 font-extrabold py-3.5 rounded-2xl text-sm shadow-sm"
              >
                返回 / 菜单
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onTriggerKey(65536)}
                className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 border border-slate-600 font-bold py-2.5 rounded-xl text-xs shadow-sm"
              >
                ◀ 上一页
              </button>
              <button
                onClick={() => onTriggerKey(262144)}
                className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 border border-slate-600 font-bold py-2.5 rounded-xl text-xs shadow-sm"
              >
                下一页 ▶
              </button>
            </div>
          </div>
        </div>

        {/* Top-Right "🎮 游戏" Modal Dialog (倍速、金币、快速快照、恢复快照、存档管理) */}
        {gameMenuOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-5 w-full max-w-sm shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="text-sm font-extrabold text-amber-300 flex items-center gap-2">
                  🎮 游戏功能与管理
                </div>
                <button
                  onClick={() => setGameMenuOpen(false)}
                  className="text-slate-400 hover:text-white text-base font-bold px-2 py-0.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* 1. 运行倍速 */}
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-bold text-slate-400">⚡ 游戏运行倍速</div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 4].map(sp => (
                    <button
                      key={sp}
                      onClick={() => onSetSpeed(sp)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        simSpeed === sp
                          ? 'bg-amber-500 text-slate-950 border-amber-300 font-extrabold shadow-md'
                          : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {sp}倍速
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. 资金模式 */}
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-bold text-slate-400">💰 初始资金设定</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (!useOriginalFund) onToggleFund();
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      useOriginalFund
                        ? 'bg-amber-500 text-slate-950 border-amber-300 font-extrabold shadow-md'
                        : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    💰 原版 5,000币
                  </button>
                  <button
                    onClick={() => {
                      if (useOriginalFund) onToggleFund();
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      !useOriginalFund
                        ? 'bg-amber-500 text-slate-950 border-amber-300 font-extrabold shadow-md'
                        : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    💎 无限资金 (9999万)
                  </button>
                </div>
              </div>

              {/* 3. FastResume 快捷现场 (快照/恢复) */}
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-bold text-slate-400">⚡ 瞬时现场暂存 (FastResume)</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setGameMenuOpen(false);
                      onQuickSnapshot();
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition-colors"
                  >
                    ⚡ 快速快照现场
                  </button>
                  <button
                    onClick={() => {
                      setGameMenuOpen(false);
                      onQuickRestore();
                    }}
                    className="bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-600/50 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    ↺ 恢复最近快照
                  </button>
                </div>
              </div>

              {/* 4. 原生存档操作 */}
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-bold text-slate-400">💾 游戏内置原生存档</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setGameMenuOpen(false);
                      onSaveInGame?.();
                    }}
                    className="bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-slate-950 font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition-colors"
                  >
                    💾 写入当前存档
                  </button>
                  <button
                    onClick={() => {
                      setGameMenuOpen(false);
                      onLoadNativeSave?.();
                    }}
                    className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-amber-300 border border-amber-500/50 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    ⚡ 读取原生存档
                  </button>
                </div>
              </div>

              {/* 5. 存档管理与导入导出 */}
              <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800">
                <button
                  onClick={() => {
                    setGameMenuOpen(false);
                    onOpenSaveManager();
                  }}
                  className="w-full bg-indigo-900/80 hover:bg-indigo-800 active:bg-indigo-950 text-indigo-100 border border-indigo-500/50 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition-colors"
                >
                  📂 打开存档管理器 (导出/导入/快照列表)
                </button>
              </div>

              {/* 6. 重新启动游戏 */}
              <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800">
                <button
                  onClick={() => {
                    setGameMenuOpen(false);
                    onRestartGame();
                  }}
                  className="w-full bg-rose-950/70 hover:bg-rose-900 active:bg-rose-950 text-rose-200 border border-rose-700/60 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition-colors cursor-pointer"
                >
                  🔄 完整重启虚拟机 (重置内存并重新运行)
                </button>
              </div>

              {/* 7. 结束游戏回到启动屏 */}
              {onEndGame && (
                <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setGameMenuOpen(false);
                      onEndGame();
                    }}
                    className="w-full bg-amber-950/70 hover:bg-amber-900 active:bg-amber-950 text-amber-200 border border-amber-600/50 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition-colors cursor-pointer"
                  >
                    🛑 结束当前游戏 (停机待命回到启动界面)
                  </button>
                </div>
              )}

              <button
                onClick={() => setGameMenuOpen(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs mt-1 transition-colors"
              >
                关闭菜单
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
