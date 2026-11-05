import React from 'react';

interface VirtualKeypadProps {
  isPlaying?: boolean;
  softLeftLabel: string;
  softRightLabel: string;
  onTriggerKey: (keyBit: number) => void;
}

export const VirtualKeypad: React.FC<VirtualKeypadProps> = ({
  isPlaying = false,
  softLeftLabel,
  softRightLabel,
  onTriggerKey
}) => {
  return (
    <>
      {/* SoftKey Bar */}
      <div className="w-full grid grid-cols-2 gap-2 mt-2 items-center">
        <button
          onClick={() => isPlaying && onTriggerKey(2097152)}
          className="bg-slate-800 active:bg-slate-950 hover:bg-slate-750 text-amber-300 border border-slate-600 py-2 rounded-xl text-xs font-bold shadow-sm transition-all text-center"
        >
          {softLeftLabel || '存档'}
        </button>
        <button
          onClick={() => isPlaying && onTriggerKey(4194304)}
          className="bg-slate-800 active:bg-slate-950 hover:bg-slate-750 text-amber-300 border border-slate-600 py-2 rounded-xl text-xs font-bold shadow-sm transition-all text-center"
        >
          {softRightLabel || '菜单 / 返回'}
        </button>
      </div>

      {/* All-Chinese D-Pad & Action Buttons */}
      <div className="w-full flex items-center justify-between gap-3 mt-3">
        <div className="grid grid-cols-3 gap-1.5 w-36 h-36">
          <div />
          <button
            onClick={() => isPlaying && onTriggerKey(131072)}
            className="bg-slate-800 active:bg-amber-500 active:text-slate-950 border border-slate-600 rounded-lg font-extrabold text-xs shadow-sm"
          >
            上
          </button>
          <div />
          <button
            onClick={() => isPlaying && onTriggerKey(65536)}
            className="bg-slate-800 active:bg-amber-500 active:text-slate-950 border border-slate-600 rounded-lg font-extrabold text-xs shadow-sm"
          >
            左
          </button>
          <button
            onClick={() => isPlaying && onTriggerKey(1048576)}
            className="bg-amber-500 active:bg-amber-400 text-slate-950 rounded-lg font-extrabold text-xs shadow"
          >
            确定
          </button>
          <button
            onClick={() => isPlaying && onTriggerKey(262144)}
            className="bg-slate-800 active:bg-amber-500 active:text-slate-950 border border-slate-600 rounded-lg font-extrabold text-xs shadow-sm"
          >
            右
          </button>
          <div />
          <button
            onClick={() => isPlaying && onTriggerKey(524288)}
            className="bg-slate-800 active:bg-amber-500 active:text-slate-950 border border-slate-600 rounded-lg font-extrabold text-xs shadow-sm"
          >
            下
          </button>
          <div />
        </div>

        <div className="flex-1 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => isPlaying && onTriggerKey(1048576)}
              className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold py-3.5 rounded-2xl text-sm shadow-md"
            >
              确定
            </button>
            <button
              onClick={() => isPlaying && onTriggerKey(4194304)}
              className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-100 border border-slate-600 font-extrabold py-3.5 rounded-2xl text-sm shadow-sm"
            >
              返回 / 菜单
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => isPlaying && onTriggerKey(65536)}
              className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 border border-slate-600 font-bold py-2.5 rounded-xl text-xs shadow-sm"
            >
              ◀ 上一页
            </button>
            <button
              onClick={() => isPlaying && onTriggerKey(262144)}
              className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 border border-slate-600 font-bold py-2.5 rounded-xl text-xs shadow-sm"
            >
              下一页 ▶
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
