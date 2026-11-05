import React from 'react';
import { GameRuntimeMetadata } from '../../types/kairo';

interface GameControlModalProps {
  isOpen: boolean;
  meta: GameRuntimeMetadata;
  simSpeed: number;
  isInfiniteFunds: boolean;
  onClose: () => void;
  onSetSpeed: (speed: number) => void;
  onToggleInfiniteFunds: () => void;
  onOneTimeModifyFunds: (amountOrDelta: number, isDelta?: boolean) => void;
  onQuickSnapshot: () => void;
  onQuickRestore: () => void;
  onSaveInGame?: () => void;
  onLoadNativeSave?: () => void;
  onOpenSaveManager: () => void;
  onRestartGame: () => void;
  onEndGame?: () => void;
}

export const GameControlModal: React.FC<GameControlModalProps> = ({
  isOpen,
  meta,
  simSpeed,
  isInfiniteFunds,
  onClose,
  onSetSpeed,
  onToggleInfiniteFunds,
  onOneTimeModifyFunds,
  onQuickSnapshot,
  onQuickRestore,
  onSaveInGame,
  onLoadNativeSave,
  onOpenSaveManager,
  onRestartGame,
  onEndGame
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-5 w-full max-w-sm shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="text-sm font-extrabold text-amber-300 flex items-center gap-2">
            🎮 游戏功能与管理
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-base font-bold px-2 py-0.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 1. 运行倍速 */}
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-bold text-slate-400">运行倍速</div>
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

        {/* 2. 资金修改 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-400">资金修改</span>
            <span className="text-amber-400 font-extrabold">{meta.fundsLabel || '12,000币'}</span>
          </div>

          <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
              <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <span>💎</span>
                <span>无限资金</span>
              </div>
              <div className="text-[10px] text-slate-400">持续锁定 9999万</div>
            </div>
            <button
              type="button"
              onClick={onToggleInfiniteFunds}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                isInfiniteFunds
                  ? 'bg-slate-800 text-emerald-400 border-emerald-500/60 hover:bg-slate-750'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-750'
              }`}
            >
              {isInfiniteFunds ? '已开启' : '已关闭'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOneTimeModifyFunds(10000, true)}
              className="bg-slate-800 hover:bg-slate-750 active:bg-slate-900 text-slate-200 border border-slate-700 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>+1万</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const input = prompt('请输入想要修改的目标资金数额（单位：币）：', String(meta.funds || 12000));
                if (input !== null && input.trim() !== '') {
                  const val = parseInt(input.replace(/[^0-9]/g, ''), 10);
                  if (!isNaN(val)) {
                    onOneTimeModifyFunds(val, false);
                  }
                }
              }}
              className="bg-slate-800 hover:bg-slate-750 active:bg-slate-900 text-slate-200 border border-slate-700 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>自定义</span>
            </button>
          </div>
        </div>

        {/* 3. FastResume 快捷现场 */}
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-bold text-slate-400">游戏快照</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onClose();
                onQuickSnapshot();
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition-colors"
            >
              保存快照
            </button>
            <button
              onClick={() => {
                onClose();
                onQuickRestore();
              }}
              className="bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-600/50 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              恢复快照
            </button>
          </div>
        </div>

        {/* 4. 原生存档操作 */}
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-bold text-slate-400">游戏内置存档</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onClose();
                onSaveInGame?.();
              }}
              className="bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-slate-950 font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition-colors"
            >
              保存游戏
            </button>
            <button
              onClick={() => {
                onClose();
                onLoadNativeSave?.();
              }}
              className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-amber-300 border border-amber-500/50 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              读取存档
            </button>
          </div>
        </div>

        {/* 5. 存档管理器 */}
        <button
          onClick={() => {
            onClose();
            onOpenSaveManager();
          }}
          className="w-full bg-indigo-900/80 hover:bg-indigo-800 active:bg-indigo-950 text-indigo-100 border border-indigo-500/50 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition-colors"
        >
          存档管理器
        </button>

        {/* 6. 重启游戏 */}
        <button
          onClick={() => {
            onClose();
            onRestartGame();
          }}
          className="w-full bg-rose-950/70 hover:bg-rose-900 active:bg-rose-950 text-rose-200 border border-rose-700/60 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition-colors cursor-pointer"
        >
          重启游戏
        </button>

        {/* 7. 结束游戏 */}
        {onEndGame && (
          <button
            onClick={() => {
              onClose();
              onEndGame();
            }}
            className="w-full bg-amber-950/70 hover:bg-amber-900 active:bg-amber-950 text-amber-200 border border-amber-600/50 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition-colors cursor-pointer"
          >
            结束游戏
          </button>
        )}
      </div>
    </div>
  );
};
