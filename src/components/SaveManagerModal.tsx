import React from 'react';
import { FastResumeSnapshot, NativeSavePackage } from '../types/kairo';

interface SaveManagerModalProps {
  isOpen: boolean;
  gameId: string;
  gameTitle: string;
  snapshots: FastResumeSnapshot[];
  onClose: () => void;
  onCaptureManualSnapshot: () => void;
  onRestoreSnapshot: (snap: FastResumeSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
  onDownloadSnapshot: (snap: FastResumeSnapshot) => void;
  onUploadSnapshotFile: (file: File) => void;
  onDownloadNativeSaves: () => void;
  onUploadNativeSaveFile: (file: File) => void;
  onLoadNativeSave?: () => void;
}

export const SaveManagerModal: React.FC<SaveManagerModalProps> = ({
  isOpen,
  gameTitle,
  snapshots,
  onClose,
  onCaptureManualSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onDownloadSnapshot,
  onUploadSnapshotFile,
  onDownloadNativeSaves,
  onUploadNativeSaveFile,
  onLoadNativeSave
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-amber-400">📂 存档管理</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              当前游戏：{gameTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold"
          >
            关闭
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Action Toolbar */}
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={onCaptureManualSnapshot}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold px-3.5 py-2 rounded-lg text-xs"
            >
              新建快照
            </button>
            <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-bold px-3.5 py-2 rounded-lg text-xs">
              导入快照 (.kresume)
              <input
                type="file"
                accept=".kresume,.json"
                className="hidden"
                onChange={e => e.target.files?.[0] && onUploadSnapshotFile(e.target.files[0])}
              />
            </label>
            <button
              onClick={onDownloadNativeSaves}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-3.5 py-2 rounded-lg text-xs"
            >
              导出游戏存档 (.ksave)
            </button>
            <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-bold px-3.5 py-2 rounded-lg text-xs">
              导入游戏存档 (.ksave)
              <input
                type="file"
                accept=".ksave,.json"
                className="hidden"
                onChange={e => e.target.files?.[0] && onUploadNativeSaveFile(e.target.files[0])}
              />
            </label>
            {onLoadNativeSave && (
              <button
                onClick={() => {
                  onClose();
                  onLoadNativeSave();
                }}
                className="bg-amber-600/90 hover:bg-amber-500 text-slate-950 font-extrabold px-3.5 py-2 rounded-lg text-xs"
              >
                读取游戏存档
              </button>
            )}
          </div>

          {/* Snapshot List */}
          <div className="space-y-3">
            {snapshots.length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                暂无已保存的快照记录，可在游戏中点击「保存快照」创建
              </div>
            )}
            {snapshots.map(snap => (
              <div
                key={snap.id}
                className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-3 transition-colors hover:border-slate-700"
              >
                {/* Item Top: Thumbnail + Info */}
                <div className="flex items-center gap-3 w-full">
                  {snap.thumbnailDataUrl && (
                    <img
                      src={snap.thumbnailDataUrl}
                      alt={snap.label}
                      className="w-12 h-14 rounded-lg border border-slate-700 object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                      <span className="truncate">{snap.label}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          snap.slotType === 'auto'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {snap.slotType === 'auto' ? '事件自动快照' : '手动快照'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1 truncate">
                      {snap.meta.companyName} · {snap.meta.dateLabel} · 资金 {snap.meta.fundsLabel} · {snap.meta.sceneLabel}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      触发事件：{snap.triggerReason} · {new Date(snap.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Item Bottom: 3 Action Buttons in a Single Row */}
                <div className="grid grid-cols-3 gap-2 w-full pt-1">
                  <button
                    type="button"
                    onClick={() => onRestoreSnapshot(snap)}
                    className="bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-extrabold py-2 rounded-lg text-xs flex items-center justify-center gap-1 shadow transition-colors cursor-pointer"
                  >
                    <span>恢复</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownloadSnapshot(snap)}
                    className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 border border-slate-700 font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>下载</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSnapshot(snap.id)}
                    className="bg-rose-950/60 hover:bg-rose-900 active:bg-rose-950 text-rose-300 border border-rose-800/50 font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>删除</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
