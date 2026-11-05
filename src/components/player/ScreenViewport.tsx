import React from 'react';
import { FastResumeSnapshot } from '../../types/kairo';
import { NamingModalState } from '../../hooks/useKairoController';
import { NamingModal } from '../modals/NamingModal';

interface ScreenViewportProps {
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  loading?: boolean;
  loadingText?: string;
  gameTitle: string;
  isPlaying?: boolean;
  latestAutoSnap: FastResumeSnapshot | null;
  namingModal?: NamingModalState | null;
  onCanvasPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onStartGame?: () => void;
  onQuickRestore: () => void;
}

export const ScreenViewport: React.FC<ScreenViewportProps> = ({
  canvasRef,
  loading = false,
  loadingText,
  gameTitle,
  isPlaying = false,
  latestAutoSnap,
  namingModal,
  onCanvasPointerDown,
  onStartGame,
  onQuickRestore
}) => {
  return (
    <div className="relative w-full aspect-[240/284] bg-black rounded-2xl overflow-hidden border-2 border-slate-700 shadow-inner">
      <canvas
        id="kairo-canvas"
        ref={canvasRef}
        width={480}
        height={568}
        onPointerDown={onCanvasPointerDown}
        className="w-full h-full block touch-none select-none cursor-pointer"
        style={{ imageRendering: 'pixelated' }}
      />

      {loading && (
        <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-4 text-center z-30">
          <div className="w-9 h-9 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
          <div className="text-xs font-bold text-amber-300">
            {loadingText || '正在加载开罗游戏卡带...'}
          </div>
        </div>
      )}

      {!loading && !isPlaying && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-5 text-center z-20">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-3xl mb-3 shadow-inner">
            🎮
          </div>
          <h3 className="text-base font-extrabold text-white tracking-wide">{gameTitle}</h3>
          <p className="text-[11px] text-slate-400 mt-1 mb-5">卡带已就绪，点击下方按钮启动运行</p>

          <div className="w-full max-w-[210px] flex flex-col gap-2.5">
            <button
              onClick={onStartGame}
              className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold py-2.5 px-4 rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>▶</span>
              <span>启动游戏</span>
            </button>

            {latestAutoSnap && (
              <button
                onClick={onQuickRestore}
                className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>⚡</span>
                <span>恢复上次快照 ({latestAutoSnap.meta.dateLabel})</span>
              </button>
            )}
          </div>
        </div>
      )}

      <NamingModal modal={namingModal} />
    </div>
  );
};
