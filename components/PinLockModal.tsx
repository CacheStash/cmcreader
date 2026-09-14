import React, { useState, useEffect, useCallback } from 'react';
import { FiLock, FiUnlock, FiShield, FiX, FiCheck, FiKey } from 'react-icons/fi';

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

  // Settings Mode state
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

  const handleDigit = useCallback((digit: string) => {
    setErrorMsg('');
    setPinInput(prev => (prev.length < 8 ? prev + digit : prev));
  }, []);

  const handleBackspace = useCallback(() => {
    setErrorMsg('');
    setPinInput(prev => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setErrorMsg('');
    setPinInput('');
  }, []);

  // Keyboard support
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
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, handleClear, pinInput]);

  const handleSubmit = () => {
    if (mode === 'lockscreen') {
      if (pinInput === savedPin) {
        if (onUnlock) onUnlock();
      } else {
        triggerShake('Incorrect PIN, please try again.');
      }
      return;
    }

    // Mode: Settings
    if (settingStep === 'current') {
      if (pinInput === savedPin) {
        setSettingStep('new');
        setPinInput('');
      } else {
        triggerShake('Current PIN does not match.');
      }
    } else if (settingStep === 'new') {
      if (pinInput.length < 4) {
        triggerShake('PIN must be at least 4 digits.');
        return;
      }
      setTempNewPin(pinInput);
      setSettingStep('confirm');
      setPinInput('');
    } else if (settingStep === 'confirm') {
      if (pinInput === tempNewPin) {
        if (onSaveSettings) {
          onSaveSettings(pinInput, true);
        }
        if (onClose) onClose();
      } else {
        triggerShake('PIN confirmation does not match.');
      }
    }
  };

  const handleDisablePin = () => {
    if (confirm('Are you sure you want to disable the PIN lock? Anyone can open your library.')) {
      if (onSaveSettings) {
        onSaveSettings('', false);
      }
      if (onClose) onClose();
    }
  };

  const getSubtitle = () => {
    if (mode === 'lockscreen') return 'Enter PIN to unlock your library';
    if (settingStep === 'current') return 'Enter your current PIN';
    if (settingStep === 'new') return 'Enter new 4-8 digit PIN';
    return 'Confirm your new PIN';
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${mode === 'lockscreen' ? 'bg-black' : 'bg-black/80 backdrop-blur-sm'}`}>
      <div className={`w-full max-w-sm mx-4 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center ${shake ? 'animate-shake' : ''}`}>
        
        {/* Header Icon */}
        <div className="relative mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            {mode === 'lockscreen' ? <FiLock className="w-8 h-8" /> : <FiShield className="w-8 h-8" />}
          </div>
          {mode === 'settings' && onClose && (
            <button 
              onClick={onClose}
              className="absolute -top-2 -right-24 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-white tracking-wide">
          {mode === 'lockscreen' ? 'ZenReader Security' : 'PIN Security Settings'}
        </h2>
        <p className="text-xs text-zinc-400 mt-1 mb-6 text-center">
          {getSubtitle()}
        </p>

        {/* PIN Indicators */}
        <div className="flex items-center justify-center gap-3 mb-6 h-8">
          {[...Array(Math.max(4, pinInput.length))].map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border transition-all duration-200 ${
                i < pinInput.length
                  ? 'bg-indigo-500 border-indigo-400 shadow-md shadow-indigo-500/50 scale-110'
                  : 'bg-zinc-800 border-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Error Message */}
        <div className="h-5 mb-3 text-center">
          {errorMsg && <p className="text-xs text-red-400 font-medium">{errorMsg}</p>}
        </div>

        {/* 3x4 Numpad Grid */}
        <div className="grid grid-cols-3 gap-3 w-full mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              onClick={() => handleDigit(num)}
              className="h-14 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700 text-white font-semibold text-xl border border-zinc-700/50 hover:border-indigo-500/50 transition-all active:scale-95 shadow-sm"
            >
              {num}
            </button>
          ))}
          
          <button
            onClick={handleClear}
            className="h-14 rounded-2xl bg-zinc-800/40 hover:bg-zinc-800 text-zinc-400 hover:text-white font-medium text-sm transition-all active:scale-95"
          >
            Clear
          </button>
          
          <button
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700 text-white font-semibold text-xl border border-zinc-700/50 hover:border-indigo-500/50 transition-all active:scale-95 shadow-sm"
          >
            0
          </button>
          
          <button
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-zinc-800/40 hover:bg-zinc-800 text-zinc-400 hover:text-white font-medium text-lg transition-all active:scale-95 flex items-center justify-center"
          >
            ⌫
          </button>
        </div>

        {/* Action Button */}
        <button
          onClick={handleSubmit}
          disabled={pinInput.length === 0}
          className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
        >
          <FiKey className="w-4 h-4" />
          {mode === 'lockscreen' ? 'Unlock Library' : settingStep === 'confirm' ? 'Save & Enable PIN' : 'Continue'}
        </button>

        {/* Option to Disable PIN in Settings Mode */}
        {mode === 'settings' && pinEnabled && (
          <button
            onClick={handleDisablePin}
            className="mt-4 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Turn Off PIN Lock (No Security)
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
