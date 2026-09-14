import React, { useState, useEffect } from 'react';
import { Library } from './components/Library';
import { Reader } from './components/Reader';
import { PinLockModal } from './components/PinLockModal';
import { ComicBook, AppSettings } from './types';

function App() {
  const [activeBook, setActiveBook] = useState<ComicBook | null>(null);
  const [readingQueue, setReadingQueue] = useState<ComicBook[]>([]);
  
  // App Settings & PIN Lock State
  const [settings, setSettings] = useState<AppSettings>({ pinEnabled: false, pin: '' });
  const [isLocked, setIsLocked] = useState(false);
  const [showPinSettings, setShowPinSettings] = useState(false);

  // Load settings on startup
  useEffect(() => {
    const initSettings = async () => {
      if (window.electronAPI) {
        try {
          const loaded = await window.electronAPI.getSettings();
          if (loaded) {
            setSettings(loaded);
            if (loaded.pinEnabled && loaded.pin) {
              setIsLocked(true);
            }
          }
        } catch (e) {
          console.error('Error loading app settings:', e);
        }
      }
    };
    initSettings();
  }, []);

  const handleOpenBook = (book: ComicBook, currentList: ComicBook[]) => {
    setActiveBook(book);
    setReadingQueue(currentList);
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

  const handleSavePinSettings = async (newPin: string, enabled: boolean) => {
    const updatedSettings: AppSettings = {
      ...settings,
      pin: newPin,
      pinEnabled: enabled
    };
    setSettings(updatedSettings);
    setShowPinSettings(false);

    if (window.electronAPI) {
      try {
        await window.electronAPI.saveSettings(updatedSettings);
      } catch (err) {
        console.error('Failed to save PIN settings to disk:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Full-screen PIN Lock Screen */}
      {isLocked && settings.pinEnabled && settings.pin ? (
        <PinLockModal
          mode="lockscreen"
          savedPin={settings.pin}
          pinEnabled={settings.pinEnabled}
          onUnlock={() => setIsLocked(false)}
        />
      ) : activeBook ? (
        <Reader 
          book={activeBook} 
          onClose={() => setActiveBook(null)}
          onNextChapter={handleNextChapter}
          onPrevChapter={handlePrevChapter}
          hasNext={readingQueue.findIndex(b => b.id === activeBook.id) < readingQueue.length - 1}
          hasPrev={readingQueue.findIndex(b => b.id === activeBook.id) > 0}
        />
      ) : (
        <Library 
          onSelectBook={handleOpenBook}
          onLockApp={() => setIsLocked(true)}
          pinEnabled={!!settings.pinEnabled && !!settings.pin}
          onOpenPinSettings={() => setShowPinSettings(true)}
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
