import React, { useState, useEffect } from 'react';
import { Library } from './components/Library';
import { Reader } from './components/Reader';
import { PinLockModal } from './components/PinLockModal';
import { LoginModal } from './components/LoginModal';
import { ComicBook, AppSettings } from './types';
import { authApi, isElectron } from './services/webApi';
import { FiLoader } from 'react-icons/fi';

function App() {
  const [activeBook, setActiveBook] = useState<ComicBook | null>(null);
  const [readingQueue, setReadingQueue] = useState<ComicBook[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(() => {
    try {
      const saved = sessionStorage.getItem('zen_active_folder_id');
      return saved !== null ? (saved === 'null' ? null : Number(saved)) : null;
    } catch {
      return null;
    }
  });

  const handleFolderChange = (folderId: number | null) => {
    setActiveFolderId(folderId);
    try {
      if (folderId === null) {
        sessionStorage.setItem('zen_active_folder_id', 'null');
      } else {
        sessionStorage.setItem('zen_active_folder_id', String(folderId));
      }
    } catch {}
  };
  
  // Auth state for Web Mode (Desktop Electron automatically authenticated)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(isElectron);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(!isElectron);

  // App Settings & PIN Lock State
  const [settings, setSettings] = useState<AppSettings>({ pinEnabled: false, pin: '' });
  const [isLocked, setIsLocked] = useState(false);
  const [showPinSettings, setShowPinSettings] = useState(false);

  // Check auth state on mount if running in browser / web mode
  useEffect(() => {
    if (!isElectron) {
      authApi.checkAuth().then(res => {
        setIsAuthenticated(res.authenticated);
        setCheckingAuth(false);
      }).catch(() => {
        setIsAuthenticated(false);
        setCheckingAuth(false);
      });

      const handleUnauthorized = () => {
        setIsAuthenticated(false);
      };
      window.addEventListener('zen:unauthorized', handleUnauthorized);
      return () => window.removeEventListener('zen:unauthorized', handleUnauthorized);
    }
  }, []);

  // Check if PIN has already been unlocked in this browser session
  const isUnlockedThisSession = () => {
    try {
      return sessionStorage.getItem('zen_pin_unlocked') === 'true';
    } catch {
      return false;
    }
  };

  // Load settings on startup once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const initSettings = async () => {
      if (window.electronAPI) {
        try {
          const loaded = await window.electronAPI.getSettings();
          if (loaded) {
            setSettings(loaded);
            if (loaded.pinEnabled && loaded.pin) {
              if (!isUnlockedThisSession()) {
                setIsLocked(true);
              } else {
                setIsLocked(false);
              }
            }
          }
        } catch (e) {
          console.error('Error loading app settings:', e);
        }
      }
    };
    initSettings();
  }, [isAuthenticated]);

  const handleOpenBook = (book: ComicBook, currentList: ComicBook[]) => {
    setActiveBook(book);
    setReadingQueue(currentList);
    // Keep track of folder so closing reader returns to the exact folder
    if (book.folderId !== undefined) {
      handleFolderChange(book.folderId);
    }
  };

  const handleNextChapter = () => {
    if (!activeBook || readingQueue.length === 0) return;
    const currentIndex = readingQueue.findIndex(b => b.id === activeBook.id);
    if (currentIndex >= 0 && currentIndex < readingQueue.length - 1) {
      setActiveBook(readingQueue[currentIndex + 1]);
    }
  };

  const handlePrevChapter = () => {
    if (!activeBook || readingQueue.length === 0) return;
    const currentIndex = readingQueue.findIndex(b => b.id === activeBook.id);
    if (currentIndex > 0) {
      setActiveBook(readingQueue[currentIndex - 1]);
    }
  };

  const handleUnlockPin = () => {
    try {
      sessionStorage.setItem('zen_pin_unlocked', 'true');
    } catch {}
    setIsLocked(false);
  };

  const handleManualLock = () => {
    try {
      sessionStorage.removeItem('zen_pin_unlocked');
    } catch {}
    setIsLocked(true);
  };

  const handleSavePinSettings = async (newPin: string, enabled: boolean) => {
    const updatedSettings: AppSettings = {
      ...settings,
      pin: newPin,
      pinEnabled: enabled
    };
    setSettings(updatedSettings);
    setShowPinSettings(false);

    if (enabled && newPin) {
      try {
        sessionStorage.setItem('zen_pin_unlocked', 'true');
      } catch {}
    } else {
      try {
        sessionStorage.removeItem('zen_pin_unlocked');
      } catch {}
      setIsLocked(false);
    }

    if (window.electronAPI) {
      try {
        await window.electronAPI.saveSettings(updatedSettings);
      } catch (err) {
        console.error('Failed to save PIN settings to disk:', err);
      }
    }
  };

  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('zen_pin_unlocked');
    } catch {}
    await authApi.logout();
    setIsAuthenticated(false);
  };

  // 1. Loading screen while verifying auth token
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white gap-3">
        <FiLoader className="text-4xl text-indigo-500 animate-spin" />
        <p className="text-zinc-500 text-xs tracking-wider uppercase">Memuat ZenReader...</p>
      </div>
    );
  }

  // 2. Login screen if running in Web Mode and unauthenticated
  if (!isAuthenticated && !isElectron) {
    return <LoginModal onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Full-screen PIN Lock Screen */}
      {isLocked && settings.pinEnabled && settings.pin ? (
        <PinLockModal
          mode="lockscreen"
          savedPin={settings.pin}
          pinEnabled={settings.pinEnabled}
          onUnlock={handleUnlockPin}
        />
      ) : activeBook ? (
        <Reader 
          book={activeBook} 
          chapterList={readingQueue}
          onSelectChapter={(b) => setActiveBook(b)}
          onClose={() => setActiveBook(null)}
          onNextChapter={handleNextChapter}
          onPrevChapter={handlePrevChapter}
          hasNext={readingQueue.findIndex(b => b.id === activeBook.id) < readingQueue.length - 1}
          hasPrev={readingQueue.findIndex(b => b.id === activeBook.id) > 0}
        />
      ) : (
        <Library 
          onSelectBook={handleOpenBook}
          onLockApp={handleManualLock}
          pinEnabled={!!settings.pinEnabled && !!settings.pin}
          onOpenPinSettings={() => setShowPinSettings(true)}
          onLogout={!isElectron ? handleLogout : undefined}
          currentFolderId={activeFolderId}
          onFolderChange={handleFolderChange}
        />
      )}

      {/* PIN Settings Modal */}
      {showPinSettings && (
        <PinLockModal
          mode="settings"
          savedPin={settings.pin || ''}
          pinEnabled={!!settings.pinEnabled}
          onSaveSettings={handleSavePinSettings}
          onClose={() => setShowPinSettings(false)}
        />
      )}
    </div>
  );
}

export default App;
