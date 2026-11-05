import React from 'react';
import { CartridgeManifestItem, FastResumeSnapshot } from '../../types/kairo';

interface CartridgeCardProps {
  cartridge: CartridgeManifestItem;
  latestSnapshot?: FastResumeSnapshot;
  onLaunchGame: (id: string, useFastResume: boolean) => void;
  onOpenSaveManager: (gameId: string) => void;
}

export const CartridgeCard: React.FC<CartridgeCardProps> = ({
  cartridge,
  latestSnapshot,
  onLaunchGame,
  onOpenSaveManager
}) => {
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/90 p-4 sm:p-5 flex flex-col justify-between hover:border-amber-500/60 shadow-xl shadow-black/40 transition-all duration-200">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          {cartridge.category && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {cartridge.category}
            </span>
          )}
          {latestSnapshot && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              ⚡ 有快照现场 ({latestSnapshot.meta.dateLabel})
            </span>
          )}
        </div>

        <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
          {cartridge.title}
        </h2>

        {cartridge.description && (
          <p className="text-xs text-slate-300/80 mt-2 leading-relaxed">
            {cartridge.description}
          </p>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onLaunchGame(cartridge.id, false)}
            className="flex-1 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black py-2.5 px-3 rounded-xl text-xs sm:text-sm shadow-md shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>🎮</span>
            <span>进入游戏</span>
          </button>
          <button
            onClick={() => onOpenSaveManager(cartridge.id)}
            className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 font-bold py-2.5 px-3 rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
            title="查看该游戏存档与快照"
          >
            📂
          </button>
        </div>

        {latestSnapshot && (
          <button
            onClick={() => onLaunchGame(cartridge.id, true)}
            className="w-full bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 font-bold py-2 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>⚡</span>
            <span>秒速恢复：{latestSnapshot.meta.companyName} · {latestSnapshot.meta.sceneLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};
