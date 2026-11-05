import React, { useState } from 'react';
import { GameRuntimeMetadata, FastResumeSnapshot } from '../../types/kairo';
import { NamingModalState } from '../../hooks/useKairoController';
import { ScreenViewport } from './ScreenViewport';
import { VirtualKeypad } from './VirtualKeypad';
import { GameControlModal } from '../modals/GameControlModal';

interface ConsolePlayerProps {
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  loading?: boolean;
  loadingText?: string;
  gameTitle: string;
  meta: GameRuntimeMetadata;
  latestAutoSnap: FastResumeSnapshot | null;
  simSpeed: number;
  isInfiniteFunds: boolean;
  onToggleInfiniteFunds: () => void;
  onOneTimeModifyFunds: (amountOrDelta: number, isDelta?: boolean) => void;
  audioEnabled: boolean;
  softLeftLabel: string;
  softRightLabel: string;
  namingModal?: NamingModalState | null;
  onCanvasPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onTriggerKey: (keyBit: number) => void;
  onSetSpeed: (speed: number) => void;
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
  isInfiniteFunds,
  onToggleInfiniteFunds,
  onOneTimeModifyFunds,
  audioEnabled,
  softLeftLabel,
  softRightLabel,
  namingModal,
  onCanvasPointerDown,
  onTriggerKey,
  onSetSpeed,
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
  const [gameMenuOpen, setGameMenuOpen] = useState(false);

  return (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-6 w-full max-w-5xl mx-auto p-2 sm:p-4">
      <div className="flex flex-col items-center bg-slate-900 border-2 border-slate-700 rounded-3xl p-3 sm:p-4 shadow-2xl w-full max-w-[440px]">
        {/* Top Bar */}
        <div className="w-full flex items-center justify-between gap-2 mb-3">
          <button
            onClick={onReturnToHub}
            className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-100 border border-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1 cursor-pointer"
          >
            <span>⬅</span>
            <span>游戏大厅</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleAudio}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow cursor-pointer ${
                audioEnabled
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-600'
                  : 'bg-slate-900 text-slate-400 border-slate-700/80 line-through decoration-red-400'
              }`}
              title={audioEnabled ? '点击静音' : '点击开启声音'}
            >
              <span>{audioEnabled ? '🔊' : '🔇'}</span>
              <span>{audioEnabled ? '音效' : '静音'}</span>
            </button>
            <button
              onClick={() => setGameMenuOpen(true)}
              className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold px-3.5 py-1.5 rounded-xl text-xs transition-all shadow flex items-center gap-1.5 cursor-pointer"
            >
              <span>🎮</span>
              <span>游戏</span>
            </button>
          </div>
        </div>

        {/* 240x284 Native Aspect Screen */}
        <ScreenViewport
          canvasRef={canvasRef}
          loading={loading}
          loadingText={loadingText}
          gameTitle={gameTitle}
          isPlaying={isPlaying}
          latestAutoSnap={latestAutoSnap}
          namingModal={namingModal}
          onCanvasPointerDown={onCanvasPointerDown}
          onStartGame={onStartGame}
          onQuickRestore={onQuickRestore}
        />

        {/* SoftKey Bar + D-Pad & Action Cluster */}
        <VirtualKeypad
          isPlaying={isPlaying}
          softLeftLabel={softLeftLabel}
          softRightLabel={softRightLabel}
          onTriggerKey={onTriggerKey}
        />

        {/* Game Control Modal */}
        <GameControlModal
          isOpen={gameMenuOpen}
          meta={meta}
          simSpeed={simSpeed}
          isInfiniteFunds={isInfiniteFunds}
          onClose={() => setGameMenuOpen(false)}
          onSetSpeed={onSetSpeed}
          onToggleInfiniteFunds={onToggleInfiniteFunds}
          onOneTimeModifyFunds={onOneTimeModifyFunds}
          onQuickSnapshot={onQuickSnapshot}
          onQuickRestore={onQuickRestore}
          onSaveInGame={onSaveInGame}
          onLoadNativeSave={onLoadNativeSave}
          onOpenSaveManager={onOpenSaveManager}
          onRestartGame={onRestartGame}
          onEndGame={onEndGame}
        />
      </div>
    </div>
  );
};
