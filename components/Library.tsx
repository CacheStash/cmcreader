import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { extractCover, getFileExtension } from '../services/fileUtils';
import { ComicBook } from '../types';
import { Button } from './Button';
import { FiPlus, FiBookOpen, FiTrash2, FiUploadCloud, FiFileText, FiFolder, FiMenu, FiX, FiLogOut, FiUser } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';

interface LibraryProps {
  onSelectBook: (book: ComicBook) => void;
}

const CoverImage = ({ blob, title }: { blob?: Blob, title: string }) => {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
  }, [blob]);

  if (!url) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 p-4 text-center bg-gray-900">
        <FiBookOpen className="text-4xl mb-2 opacity-50" />
        <span className="text-xs opacity-50">No Cover</span>
      </div>
    );
  }
  return <img src={url} alt={title} className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-80" />;
};

export const Library: React.FC<LibraryProps> = ({ onSelectBook }) => {
  const { user, signOut } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // --- Folder Logic ---
  const folders = useLiveQuery(() => db.folders.toArray());
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);

  // --- Filter Comics ---
  const comics = useLiveQuery(async () => {
    let collection = db.comics.orderBy('dateAdded').reverse();
    if (activeFolderId !== null) {
      return (await collection.toArray()).filter(c => c.folderId === activeFolderId);
    }
    return collection.toArray();
  }, [activeFolderId]);

  const addFolder = async () => {
    if (newFolderName.trim()) {
      await db.folders.add({ name: newFolderName.trim() });
      setNewFolderName("");
      setShowFolderInput(false);
    }
  };

  const deleteFolder = async (id: number) => {
    if (confirm("Hapus folder ini? Buku tidak akan terhapus (hanya folder hilang).")) {
      // Hapus referensi folder di buku
      await db.comics.where('folderId').equals(id).modify({ folderId: undefined });
      await db.folders.delete(id);
      if (activeFolderId === id) setActiveFolderId(null);
    }
  };

  const handleDropToFolder = async (e: React.DragEvent, folderId: number | null) => {
    e.preventDefault(); e.stopPropagation();
    const bookIdString = e.dataTransfer.getData("bookId");
    if (!bookIdString) return;
    
    const bookId = parseInt(bookIdString);
    if (bookId) {
        // null = uncategorized (hapus folderId), number = pindah ke folder
        const updateData: Partial<ComicBook> = folderId === null ? { folderId: undefined } : { folderId };
        
        // Perbaiki error TypeScript dengan cast ke any untuk delete property jika undefined
        // Atau biarkan Dexie handle undefined sebagai penghapusan key
        if (folderId === null) {
             // Cara khusus dexie untuk menghapus field adalah update dengan undefined, 
             // tapi typescript strict mungkin protes. Kita gunakan approach aman:
             await db.comics.update(bookId, { folderId: undefined } as any);
        } else {
             await db.comics.update(bookId, { folderId });
        }
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    setIsProcessing(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = getFileExtension(file.name);
        
        if (['cbz', 'pdf'].includes(ext)) {
          const coverBlob = await extractCover(file, ext);
          await db.comics.add({
            title: file.name.replace(/\.(cbz|pdf)$/i, ''),
            fileHandle: file,
            coverBlob: coverBlob,
            format: ext as 'cbz' | 'pdf',
            totalPages: 0,
            lastReadPage: 0,
            dateAdded: Date.now(),
            folderId: activeFolderId || undefined // Auto masuk folder jika sedang aktif
          });
        }
      }
    } catch (error) {
      console.error("Error adding files:", error);
      alert("Gagal memproses file.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) processFiles(event.target.files);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  };

  const deleteBook = async (e: React.MouseEvent, id?: number) => {
    e.stopPropagation();
    if (id && confirm("Delete this comic?")) await db.comics.delete(id);
  };

  return (
    <div 
      className={`min-h-screen flex relative transition-colors duration-200 ${dragActive ? 'bg-blue-900/20' : 'bg-gray-900'}`}
      onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
    >
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`
        fixed md:sticky top-0 h-screen w-64 bg-black/90 border-r border-gray-800 z-40 transform transition-transform duration-300 flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
           <h2 className="font-bold text-gray-400 uppercase text-xs tracking-wider">Library</h2>
           <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400"><FiX /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button 
            onClick={() => setActiveFolderId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropToFolder(e, null)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolderId === null ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            <FiBookOpen /> All Comics
          </button>

          {folders?.map(folder => (
            <div 
              key={folder.id}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${activeFolderId === folder.id ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropToFolder(e, folder.id!)}
            >
              <button onClick={() => setActiveFolderId(folder.id!)} className="flex items-center gap-3 flex-1 text-left truncate">
                <FiFolder /> {folder.name}
              </button>
              <button onClick={() => deleteFolder(folder.id!)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400"><FiX size={12} /></button>
            </div>
          ))}

          {showFolderInput ? (
             <div className="px-3 py-2">
               <input 
                 autoFocus
                 className="w-full bg-gray-800 rounded px-2 py-1 text-sm text-white border border-blue-500 outline-none"
                 value={newFolderName}
                 onChange={(e) => setNewFolderName(e.target.value)}
                 onBlur={() => !newFolderName && setShowFolderInput(false)}
                 onKeyDown={(e) => e.key === 'Enter' && addFolder()}
                 placeholder="Folder name..."
               />
             </div>
          ) : (
            <button onClick={() => setShowFolderInput(true)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-white transition-colors">
              <FiPlus /> New Folder
            </button>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 p-6 pb-24 relative z-10 w-full overflow-hidden">
        <header className="flex justify-between items-center mb-8 sticky top-0 z-20 bg-gray-900/80 backdrop-blur-md py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-2xl text-white"><FiMenu /></button>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              {activeFolderId ? folders?.find(f => f.id === activeFolderId)?.name : 'ZenReader'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
             {/* User Login Section */}
             {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 hidden sm:block">{user.email}</span>
                <Button onClick={() => signOut()} className="!bg-red-500/10 !text-red-400 hover:!bg-red-500/20 shadow-none px-3">
                   <FiLogOut />
                </Button>
                <div className="h-6 w-px bg-gray-700 mx-2"></div>
              </div>
            ) : (
               <Button onClick={() => setShowAuthModal(true)} variant="ghost" className="mr-2">
                 <span className="flex items-center gap-2"><FiUser /> Login</span>
               </Button>
            )}

            <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
              <span className="flex items-center gap-2">
                <FiPlus className="text-xl" />
                <span className="hidden sm:inline">Add Comic</span>
              </span>
            </Button>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".cbz,.pdf,application/pdf,application/vnd.comicbook+zip,application/x-cbz,application/zip,application/x-zip-compressed,multipart/x-zip"
              multiple
            />
          </div>
        </header>

        {isProcessing && (
          <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg animate-pulse text-blue-200 flex items-center justify-center gap-3">
             <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
             Processing files...
          </div>
        )}

        {(!comics || comics.length === 0) && !isProcessing && (
          <div className="absolute inset-0 top-32 flex flex-col items-center justify-center opacity-30 pointer-events-none select-none">
            <FiUploadCloud className="text-9xl mb-6 text-gray-500" />
            <h2 className="text-4xl font-bold text-gray-400 mb-2">Drag files here</h2>
            <div className="flex items-center gap-2 text-xl text-gray-500">
               <FiFileText />
               <span>.cbz and .pdf</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {comics?.map((book) => (
            <div 
              key={book.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("bookId", book.id!.toString())}
              onClick={() => onSelectBook(book)}
              className="group relative aspect-[2/3] bg-gray-800 rounded-xl overflow-hidden cursor-pointer shadow-2xl hover:scale-[1.02] transition-all border border-gray-800 hover:border-blue-500/50"
            >
              <CoverImage blob={book.coverBlob} title={book.title} />
              
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent p-4 translate-y-10 group-hover:translate-y-0 transition-transform duration-300">
                <h3 className="font-semibold text-white truncate text-sm mb-2">{book.title}</h3>
                <div className="flex justify-between items-center text-xs text-gray-400">
                    <span className="uppercase bg-gray-700 px-1.5 py-0.5 rounded text-[10px]">{book.format}</span>
                    <span>{book.lastReadPage > 0 ? `${Math.floor((book.lastReadPage / (book.totalPages || 1)) * 100)}%` : 'NEW'}</span>
                </div>
              </div>
              <button 
                onClick={(e) => deleteBook(e, book.id)}
                className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all shadow-lg transform scale-90 hover:scale-100"
                title="Delete"
              >
                <FiTrash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
      
      {dragActive && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-blue-900/40 backdrop-blur-sm pointer-events-none border-4 border-blue-400 border-dashed m-4 rounded-3xl">
          <FiUploadCloud className="text-8xl text-white mb-4 animate-bounce" />
          <h2 className="text-4xl font-bold text-white drop-shadow-lg">Drop to Upload</h2>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};