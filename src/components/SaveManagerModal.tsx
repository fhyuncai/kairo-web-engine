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
            <h3 className="text-lg font-extrabold text-amber-400">📂 存档与 FastResume 快照管理中心</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              当前游戏：{gameTitle} · 支持事件触发快照秒开、手动多槽位快照与本地文件导入导出
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
              📸 立即新建当前状态快照
            </button>
            <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-bold px-3.5 py-2 rounded-lg text-xs">
              📤 上传导入快照 (.kresume)
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
              💾 下载导出游戏原生存档 (.ksave)
            </button>
            <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-bold px-3.5 py-2 rounded-lg text-xs">
              📥 上传恢复游戏原生存档 (.ksave)
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
                ⚡ 直接读取原生存档
              </button>
            )}
          </div>

          {/* Snapshot List */}
          <div className="space-y-3">
            {snapshots.map(snap => (
              <div
                key={snap.id}
                className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  {snap.thumbnailDataUrl && (
                    <img
                      src={snap.thumbnailDataUrl}
                      alt={snap.label}
                      className="w-12 h-14 rounded border border-slate-700 object-cover"
                    />
                  )}
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>{snap.label}</span>
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
                    <div className="text-xs text-slate-300 mt-0.5">
                      {snap.meta.companyName} · {snap.meta.dateLabel} · 资金 {snap.meta.fundsLabel} · {snap.meta.sceneLabel}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      触发事件：{snap.triggerReason} · {new Date(snap.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onRestoreSnapshot(snap)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold px-3 py-1.5 rounded-lg text-xs"
                  >
                    恢复此现场
                  </button>
                  <button
                    onClick={() => onDownloadSnapshot(snap)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs"
                  >
                    下载
                  </button>
                  <button
                    onClick={() => onDeleteSnapshot(snap.id)}
                    className="bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/50 font-bold px-2.5 py-1.5 rounded-lg text-xs"
                  >
                    删除
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
