import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FiLock, FiShield, FiX, FiKey, FiCheck } from 'react-icons/fi';

interface PinLockModalProps {
  mode: 'lockscreen' | 'settings';
  savedPin: string;
  pinEnabled: boolean;
  onUnlock?: () => void;
  onSaveSettings?: (newPin: string, enabled: boolean) => void;
  onClose?: () => void;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({
  mode,
  savedPin,
  pinEnabled,
  onUnlock,
  onSaveSettings,
  onClose
}) => {
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [shake, setShake] = useState(false);

  // Settings Mode step: 'current' (verify old PIN) -> 'new' (enter 6 digits) -> 'confirm' (re-enter 6 digits)
  const [settingStep, setSettingStep] = useState<'current' | 'new' | 'confirm'>(
    pinEnabled && savedPin ? 'current' : 'new'
  );
  const [tempNewPin, setTempNewPin] = useState('');

  const triggerShake = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setPinInput('');
    }, 600);
  };

  const validateCode = useCallback((code: string) => {
    if (mode === 'lockscreen') {
      if (code === savedPin) {
        if (onUnlock) onUnlock();
      } else {
        triggerShake('PIN salah, silakan coba lagi.');
      }
      return;
    }

    // Mode: Settings
    if (settingStep === 'current') {
      if (code === savedPin) {
        setSettingStep('new');
        setPinInput('');
        setErrorMsg('');
      } else {
        triggerShake('PIN saat ini salah.');
      }
    } else if (settingStep === 'new') {
      if (code.length !== 6) {
        triggerShake('PIN harus tepat 6 digit angka.');
        return;
      }
      setTempNewPin(code);
      setSettingStep('confirm');
      setPinInput('');
      setErrorMsg('');
    } else if (settingStep === 'confirm') {
      if (code === tempNewPin) {
        if (onSaveSettings) {
          onSaveSettings(code, true);
        }
        if (onClose) onClose();
      } else {
        triggerShake('Konfirmasi PIN tidak cocok.');
      }
    }
  }, [mode, savedPin, settingStep, tempNewPin, onUnlock, onSaveSettings, onClose]);

  const handleDigit = useCallback((digit: string) => {
    setErrorMsg('');
    setPinInput(prev => {
      if (prev.length >= 6) return prev;
      const next = prev + digit;
      if (next.length === 6) {
        setTimeout(() => {
          validateCode(next);
        }, 120);
      }
      return next;
    });
  }, [validateCode]);

  const handleBackspace = useCallback(() => {
    setErrorMsg('');
    setPinInput(prev => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setErrorMsg('');
    setPinInput('');
  }, []);

  // Keyboard support for desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        if (mode === 'settings' && onClose) {
          onClose();
        } else {
          handleClear();
        }
      } else if (e.key === 'Enter') {
        if (pinInput.length === 6) {
          validateCode(pinInput);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, handleClear, pinInput, mode, onClose, validateCode]);

  const handleDisablePin = () => {
    if (confirm('Yakin ingin menonaktifkan proteksi PIN? Perpustakaan komik Anda akan bisa dibuka tanpa PIN.')) {
      if (onSaveSettings) {
        onSaveSettings('', false);
      }
      if (onClose) onClose();
    }
  };

  const getSubtitle = () => {
    if (mode === 'lockscreen') return 'Masukkan 6 digit PIN untuk membuka library';
    if (settingStep === 'current') return 'Masukkan 6 digit PIN lama Anda';
    if (settingStep === 'new') return 'Buat 6 digit PIN angka baru';
    return 'Ketik ulang 6 digit PIN untuk konfirmasi';
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${mode === 'lockscreen' ? 'bg-black' : 'bg-black/85 backdrop-blur-md'}`}>
      <div className={`w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center select-none ${shake ? 'animate-shake' : ''}`}>
        
        {/* Header Icon */}
        <div className="relative mb-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            {mode === 'lockscreen' ? <FiLock className="w-8 h-8" /> : <FiShield className="w-8 h-8" />}
          </div>
          {mode === 'settings' && onClose && (
            <button 
              onClick={onClose}
              className="absolute -top-2 -right-20 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
              title="Tutup"
            >
              <FiX className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-white tracking-wide">
          {mode === 'lockscreen' ? 'ZenReader Security' : 'Pengaturan Kunci PIN'}
        </h2>
        <p className="text-xs text-zinc-400 mt-1 mb-5 text-center">
          {getSubtitle()}
        </p>

        {/* 6 Digit PIN Indicators */}
        <div className="flex items-center justify-center gap-3.5 mb-6 h-8">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border transition-all duration-200 ${
                i < pinInput.length
                  ? 'bg-indigo-500 border-indigo-400 shadow-md shadow-indigo-500/60 scale-125'
                  : 'bg-zinc-800 border-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Error Message */}
        <div className="h-5 mb-2 text-center">
          {errorMsg && <p className="text-xs text-red-400 font-medium">{errorMsg}</p>}
        </div>

        {/* 3x4 Numpad Grid */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 w-full mb-5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              className="h-13 sm:h-14 py-3 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700 text-white font-semibold text-2xl border border-zinc-700/60 hover:border-indigo-500/50 transition-all active:scale-95 shadow-sm"
            >
              {num}
            </button>
          ))}
          
          <button
            type="button"
            onClick={handleClear}
            className="h-13 sm:h-14 py-3 rounded-2xl bg-zinc-800/40 hover:bg-zinc-800 text-zinc-400 hover:text-white font-medium text-xs uppercase tracking-wider transition-all active:scale-95"
          >
            Clear
          </button>
          
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-13 sm:h-14 py-3 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700 text-white font-semibold text-2xl border border-zinc-700/60 hover:border-indigo-500/50 transition-all active:scale-95 shadow-sm"
          >
            0
          </button>
          
          <button
            type="button"
            onClick={handleBackspace}
            className="h-13 sm:h-14 py-3 rounded-2xl bg-zinc-800/40 hover:bg-zinc-800 text-zinc-400 hover:text-white font-medium text-lg transition-all active:scale-95 flex items-center justify-center"
            title="Hapus digit terakhir"
          >
            ⌫
          </button>
        </div>

        {/* Manual Submit Button fallback */}
        <button
          type="button"
          onClick={() => validateCode(pinInput)}
          disabled={pinInput.length !== 6}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 text-sm"
        >
          <FiKey className="w-4 h-4" />
          {mode === 'lockscreen' ? 'Buka Library' : settingStep === 'confirm' ? 'Simpan & Aktifkan PIN' : 'Lanjutkan'}
        </button>

        {/* Option to Disable PIN in Settings Mode */}
        {mode === 'settings' && pinEnabled && (
          <button
            type="button"
            onClick={handleDisablePin}
            className="mt-4 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Nonaktifkan Kunci PIN
          </button>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>
    </div>
  );
};
