import React, { useState } from 'react';
import { Library } from './components/Library';
import { Reader } from './components/Reader';
import { ComicBook } from './types';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  const [activeBook, setActiveBook] = useState<ComicBook | null>(null);
  const [readingQueue, setReadingQueue] = useState<ComicBook[]>([]); // Antrian untuk Next/Prev

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

  return (
    <AuthProvider>
      <div className="min-h-screen bg-black text-gray-100 font-sans selection:bg-blue-500/30">
        {activeBook ? (
          <Reader 
            book={activeBook} 
            onClose={() => setActiveBook(null)}
            onNextChapter={handleNextChapter}
            onPrevChapter={handlePrevChapter}
            hasNext={readingQueue.findIndex(b => b.id === activeBook.id) < readingQueue.length - 1}
            hasPrev={readingQueue.findIndex(b => b.id === activeBook.id) > 0}
          />
        ) : (
          <Library onSelectBook={handleOpenBook} />
        )}
      </div>
    </AuthProvider>
  );
}

export default App;