import React, { useState } from 'react';
import { Library } from './components/Library';
import { Reader } from './components/Reader';
import { ComicBook } from './types';
import { AuthProvider } from './contexts/AuthContext';

// FIX: Pastikan tulisannya 'function' (bukan ffunction)
function App() {
  const [activeBook, setActiveBook] = useState<ComicBook | null>(null);

  return (
    <AuthProvider>
      <div className="min-h-screen bg-black text-gray-100 font-sans selection:bg-blue-500/30">
        {activeBook ? (
          <Reader 
            book={activeBook} 
            onClose={() => setActiveBook(null)} 
          />
        ) : (
          <Library onSelectBook={setActiveBook} />
        )}
      </div>
    </AuthProvider>
  );
}

export default App;