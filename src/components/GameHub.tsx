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
  autoSnapshots,
  onLaunchGame,
  onOpenSaveManager,
  onUploadCartridge
}) => {
  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Container: Mobile (p-3 sm:p-4) vs Desktop (md:max-w-6xl md:mx-auto md:px-6 md:py-8) */}
      <div className="w-full max-w-6xl mx-auto px-3.5 py-4 sm:px-5 sm:py-6 md:px-6 md:py-8 flex flex-col flex-1">
        
        {/* Top Header Bar */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 sm:pb-6 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl sm:text-3xl">🎮</span>
              <h1 className="text-xl sm:text-2xl font-black text-amber-400 tracking-tight">
                开罗游戏中心
              </h1>
              <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                Web 虚拟机
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
              开罗经典像素模拟经营 · 虚拟硬件层 1:1 双倍管线渲染 · 支持 FastResume 瞬时现场
            </p>
          </div>

          {/* Action cluster: Mobile (2 equal columns) vs Desktop (flex row) */}
          <div className="grid grid-cols-2 md:flex md:items-center gap-2 sm:gap-3">
            <button
              onClick={() => onOpenSaveManager('game_dev_story')}
              className="w-full md:w-auto bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-95 text-slate-950 font-black px-3.5 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg shadow-amber-500/15 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>📂</span>
              <span>存档与快照中心</span>
            </button>
            <label className="w-full md:w-auto cursor-pointer bg-slate-900 hover:bg-slate-850 active:scale-95 text-slate-200 border border-slate-700/80 hover:border-slate-600 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm">
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

        {/* Feature Badges Bar */}
        <div className="flex flex-wrap items-center gap-2 my-4 sm:my-5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>.NET CIL 栈式虚拟机</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>秒级 FastResume 现场</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span>240×284 原生像素双倍管线</span>
          </div>
        </div>

        {/* Game Cards Section: Mobile (single column space-y-4) vs Desktop (grid md:grid-cols-2 lg:grid-cols-3 gap-6) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6 flex-1">
          {cartridges.map(cart => {
            const snap = autoSnapshots[cart.id];
            const isReady = !!cart.hasBin;

            return (
              <div
                key={cart.id}
                className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 ${
                  isReady
                    ? 'bg-slate-900/90 border-slate-700/80 hover:border-amber-500/60 shadow-xl shadow-black/40 hover:-translate-y-0.5'
                    : 'bg-slate-900/40 border-slate-800/80 opacity-75'
                }`}
              >
                <div>
                  {/* Card Header: Category & Resolution */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {cart.category || '模拟经营'} · {cart.resolution ? `${cart.resolution[0]}×${cart.resolution[1]}` : '240×284'}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
                    {cart.title}
                  </h2>

                  {/* Description */}
                  {cart.description && (
                    <p className="text-xs text-slate-300/90 mt-2.5 leading-relaxed">
                      {cart.description}
                    </p>
                  )}

                  {/* FastResume Snapshot Preview Card */}
                  {snap && (
                    <div className="mt-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center gap-3">
                      {snap.thumbnailDataUrl ? (
                        <img
                          src={snap.thumbnailDataUrl}
                          alt="现场缩略图"
                          className="w-12 h-14 rounded-lg border border-emerald-400/40 object-cover shrink-0 shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-14 rounded-lg bg-emerald-900/40 border border-emerald-500/30 flex items-center justify-center text-lg shrink-0">
                          ⚡
                        </div>
                      )}
                      <div className="text-xs overflow-hidden flex-1">
                        <div className="font-extrabold text-emerald-300 flex items-center gap-1">
                          <span>⚡</span>
                          <span>FastResume 已就绪</span>
                        </div>
                        <div className="text-slate-200 font-bold mt-0.5 truncate">
                          {snap.meta.companyName} · {snap.meta.dateLabel}
                        </div>
                        <div className="text-slate-400 text-[11px] truncate">
                          资金：{snap.meta.fundsLabel}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions: Mobile (full width touch buttons) vs Desktop */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row gap-2">
                  {isReady ? (
                    <>
                      {/* Main Enter Game Button (Enters player in standby mode, does NOT auto run!) */}
                      <button
                        onClick={() => onLaunchGame(cart.id, false)}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-md shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>🎮</span>
                        <span>进入游戏</span>
                      </button>

                      {/* Optional 1-Click Fast Resume button if snapshot exists */}
                      {snap && (
                        <button
                          onClick={() => onLaunchGame(cart.id, true)}
                          className="bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-500/50 active:scale-95 font-bold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>⚡</span>
                          <span>恢复现场</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="w-full py-2 px-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-500">
                      待放入对应游戏卡带
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile & Desktop Bottom Bar */}
        <footer className="mt-8 pt-4 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
          <div>KairoWeb 游戏引擎平台 · 适配移动端与大屏设备</div>
          <div className="flex items-center gap-3">
            <span>双倍像素渲染</span>
            <span>•</span>
            <span>无损快照管理</span>
            <span>•</span>
            <span>CIL 字节码</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
