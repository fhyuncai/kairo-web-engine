import React, { useState, useEffect, useRef } from 'react';
import { NamingModalState } from '../../hooks/useKairoController';

interface NamingModalProps {
  modal: NamingModalState | null | undefined;
}

export const NamingModal: React.FC<NamingModalProps> = ({ modal }) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (modal?.isOpen) {
      setInputValue(modal.defaultVal);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [modal?.isOpen, modal?.defaultVal]);

  if (!modal?.isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      modal.onConfirm(inputValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      modal.onCancel();
    }
  };

  return (
    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-3 z-20">
      <div className="bg-slate-900 border-2 border-amber-400 rounded-2xl p-4 w-full max-w-[260px] shadow-2xl flex flex-col gap-3">
        <div className="text-xs font-extrabold text-amber-300 text-center">{modal.title}</div>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={16}
          className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold outline-none"
          placeholder="请输入名称..."
        />
        {modal.presets.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {modal.presets.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setInputValue(preset)}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-600 rounded px-1.5 py-0.5 transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => modal.onConfirm(inputValue)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-1.5 rounded-lg text-xs"
          >
            确定 (Enter)
          </button>
          <button
            type="button"
            onClick={() => modal.onCancel()}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 font-bold py-1.5 rounded-lg text-xs"
          >
            取消 (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
