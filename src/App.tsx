import React from 'react';
import { GameHub } from './components/hub/GameHub';
import { ConsolePlayer } from './components/player/ConsolePlayer';
import { SaveManagerModal } from './components/modals/SaveManagerModal';
import { useKairoController } from './hooks/useKairoController';

export default function App() {
  const ctrl = useKairoController();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div style={{ display: ctrl.view === 'hub' ? 'block' : 'none' }}>
        <GameHub
          cartridges={ctrl.cartridges}
          autoSnapshots={ctrl.autoSnapshotsMap}
          onLaunchGame={ctrl.handleLaunchFromHub}
          onOpenSaveManager={ctrl.openSaveManagerForGame}
          onUploadCartridge={ctrl.handleUploadCartridge}
        />
      </div>

      <div style={{ display: ctrl.view === 'player' ? 'block' : 'none' }}>
        <ConsolePlayer
          canvasRef={ctrl.canvasRef}
          loading={ctrl.loading}
          loadingText={ctrl.loadingText}
          gameTitle={ctrl.currentGameTitle}
          meta={ctrl.meta}
          latestAutoSnap={ctrl.snapshots[0] || null}
          simSpeed={ctrl.simSpeed}
          isInfiniteFunds={ctrl.isInfiniteFunds}
          onToggleInfiniteFunds={ctrl.handleToggleInfiniteFunds}
          onOneTimeModifyFunds={ctrl.handleOneTimeModifyFunds}
          audioEnabled={ctrl.audioEnabled}
          softLeftLabel={ctrl.softLeftLabel}
          softRightLabel={ctrl.softRightLabel}
          namingModal={ctrl.namingModal}
          onCanvasPointerDown={ctrl.handleCanvasPointerDown}
          onTriggerKey={ctrl.handleTriggerKey}
          onSetSpeed={ctrl.handleSetSpeed}
          onToggleAudio={ctrl.handleToggleAudio}
          onQuickSnapshot={ctrl.handleQuickSnapshot}
          onQuickRestore={ctrl.handleQuickRestore}
          onOpenSaveManager={() => ctrl.setSaveModalOpen(true)}
          onReturnToHub={ctrl.handleReturnToHub}
          onRestartGame={ctrl.handleRestartGame}
          isPlaying={ctrl.isPlaying}
          onStartGame={ctrl.handleStartGame}
          onEndGame={ctrl.handleEndGame}
          onSaveInGame={ctrl.handleSaveInGame}
          onLoadNativeSave={ctrl.handleLoadNativeSave}
        />
      </div>

      <SaveManagerModal
        isOpen={ctrl.saveModalOpen}
        gameId={ctrl.currentGameId}
        gameTitle={ctrl.currentGameTitle}
        snapshots={ctrl.snapshots}
        onClose={() => ctrl.setSaveModalOpen(false)}
        onCaptureManualSnapshot={ctrl.handleCaptureManualSnapshot}
        onRestoreSnapshot={ctrl.handleRestoreSnapshot}
        onDeleteSnapshot={ctrl.handleDeleteSnapshot}
        onDownloadSnapshot={ctrl.handleDownloadSnapshot}
        onUploadSnapshotFile={ctrl.handleUploadSnapshotFile}
        onDownloadNativeSaves={ctrl.handleDownloadNativeSaves}
        onUploadNativeSaveFile={ctrl.handleUploadNativeSaveFile}
        onLoadNativeSave={ctrl.handleLoadNativeSave}
      />
    </div>
  );
}
