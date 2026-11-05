import React from 'react';
import { CartridgeManifestItem, FastResumeSnapshot } from '../types/kairo';

interface GameHubProps {
  cartridges: CartridgeManifestItem[];
  autoSnapshots: Record<string, FastResumeSnapshot | undefined>;
  onLaunchGame: (id: string, useFastResume: boolean) => void;
  onOpenSaveManager: (gameId: string) => void;
  onUploadCartridge: (file: File) => void;
}

export const GameHub: React.FC<GameHubProps> = ({
  cartridges,
  onLaunchGame,
  onOpenSaveManager,
  onUploadCartridge
}) => {
  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100">
      {/* Container */}
      <div className="w-full max-w-5xl mx-auto px-3.5 py-4 sm:px-5 sm:py-6">
        
        {/* Top Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800/80 mb-5">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl sm:text-3xl">🎮</span>
            <h1 className="text-xl sm:text-2xl font-black text-amber-400 tracking-tight">
              开罗游戏中心
            </h1>
          </div>

          {/* Action cluster: Mobile (2 equal columns) vs Desktop (flex row) */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3">
            <button
              onClick={() => onOpenSaveManager('game_dev_story')}
              className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-95 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs sm:text-sm shadow-lg shadow-amber-500/15 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>📂</span>
              <span>存档与快照中心</span>
            </button>
            <label className="w-full sm:w-auto cursor-pointer bg-slate-900 hover:bg-slate-850 active:scale-95 text-slate-200 border border-slate-700/80 hover:border-slate-600 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm">
              <span>➕</span>
              <span>加载本地游戏</span>
              <input
                type="file"
                accept=".bin"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onUploadCartridge(file);
                    e.target.value = '';
                  }
                }}
              />
            </label>
          </div>
        </header>

        {/* Game Cards Section: Compact natural height grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 items-start">
          {cartridges.map(cart => (
            <div
              key={cart.id}
              className="rounded-2xl border border-slate-700/80 bg-slate-900/90 p-4 sm:p-5 flex flex-col hover:border-amber-500/60 shadow-xl shadow-black/40 transition-all duration-200"
            >
              <div>
                {/* 1. 类型 */}
                {cart.category && (
                  <div className="mb-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {cart.category}
                    </span>
                  </div>
                )}

                {/* 2. 名称 */}
                <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                  {cart.title}
                </h2>

                {/* 3. 描述 */}
                {cart.description && (
                  <p className="text-xs text-slate-300/80 mt-2 leading-relaxed">
                    {cart.description}
                  </p>
                )}
              </div>

              {/* 4. 进入游戏 */}
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <button
                  onClick={() => onLaunchGame(cart.id, false)}
                  className="w-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-md shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>🎮</span>
                  <span>进入游戏</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
