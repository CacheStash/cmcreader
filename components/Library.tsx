import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { extractCover, getFileExtension } from '../services/fileUtils';
import { ComicBook } from '../types';
import { Button } from './Button';
import { FiPlus, FiBookOpen, FiTrash2, FiUploadCloud, FiFileText, FiFolder, FiMenu, FiX, FiLogOut, FiUser, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { supabase } from '../services/supabaseClient';

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
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-800 p-4 text-center bg-gray-900 border border-gray-800">
        <FiBookOpen className="text-4xl mb-2 opacity-30" />
        <span className="text-[10px] opacity-30 uppercase tracking-widest">No Cover</span>
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
  const [isSyncing, setIsSyncing] = useState(false);

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

  // --- SYNC LOGIC (The Brain) ---
  // 1. Sync Down (Cloud -> Local) saat User Login
  useEffect(() => {
    if (user) syncFromCloud();
  }, [user]);

  const syncFromCloud = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      // A. Ambil Folders
      const { data: cloudFolders } = await supabase.from('folders').select('*');
      if (cloudFolders) {
        for (const cf of cloudFolders) {
           // Cek apakah folder sudah ada di lokal (by name)
           const exist = await db.folders.where('name').equals(cf.name).first();
           if (!exist) {
             await db.folders.add({ name: cf.name, supabaseId: cf.id });
           } else if (!exist.supabaseId) {
             await db.folders.update(exist.id!, { supabaseId: cf.id });
           }
        }
      }

      // B. Ambil Metadata Komik
      const { data: cloudComics } = await supabase.from('comics').select('*');
      if (cloudComics) {
         for (const cc of cloudComics) {
            // Cek apakah komik sudah ada di lokal (by title/filename)
            const exist = await db.comics.where('title').equals(cc.title).first();
            
            // Cari Local Folder ID berdasarkan Cloud Folder ID
            let localFolderId = undefined;
            if (cc.folder_id) {
               const folderLink = await db.folders.where('supabaseId').equals(cc.folder_id).first();
               if (folderLink) localFolderId = folderLink.id;
            }

            if (!exist) {
               // INSERT CLOUD ONLY ITEM (Tanpa File Handle)
               await db.comics.add({
                 title: cc.title,
                 format: cc.format as 'pdf' | 'cbz',
                 totalPages: cc.total_pages,
                 lastReadPage: cc.last_read_page,
                 dateAdded: new Date(cc.created_at).getTime(),
                 supabaseId: cc.id,
                 folderId: localFolderId,
                 // File Handle & Blob Kosong karena belum didownload/matched
               });
            } else if (!exist.supabaseId) {
               await db.comics.update(exist.id!, { supabaseId: cc.id });
            }
         }
      }
    } catch (err) {
      console.error("Sync Error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const addFolder = async () => {
    if (newFolderName.trim()) {
      const name = newFolderName.trim();
      // 1. Simpan Lokal
      const id = await db.folders.add({ name });
      
      // 2. Simpan ke Supabase (Jika Login)
      if (user) {
        const { data, error } = await supabase.from('folders').insert({ user_id: user.id, name }).select().single();
        if (data && !error) {
           await db.folders.update(id, { supabaseId: data.id });
        }
      }

      setNewFolderName("");
      setShowFolderInput(false);
    }
  };

  const deleteFolder = async (id: number, supabaseId?: number) => {
    if (confirm("Hapus folder ini?")) {
      await db.comics.where('folderId').equals(id).modify({ folderId: undefined });
      await db.folders.delete(id);
      
      // Hapus di Cloud juga
      if (user && supabaseId) {
        await supabase.from('folders').delete().match({ id: supabaseId });
      }

      if (activeFolderId === id) setActiveFolderId(null);
    }
  };

  const handleDropToFolder = async (e: React.DragEvent, folderId: number | null) => {
    e.preventDefault(); e.stopPropagation();
    const bookIdString = e.dataTransfer.getData("bookId");
    if (!bookIdString) return;
    
    const bookId = parseInt(bookIdString);
    if (bookId) {
        // Update Lokal
        if (folderId === null) {
             await db.comics.update(bookId, { folderId: undefined } as any);
        } else {
             await db.comics.update(bookId, { folderId });
        }

        // Update Cloud (Jika Item & Folder sudah tersinkron)
        if (user) {
            const book = await db.comics.get(bookId);
            const targetFolder = folderId ? await db.folders.get(folderId) : null;
            
            if (book?.supabaseId) {
               await supabase.from('comics').update({ 
                 folder_id: targetFolder?.supabaseId || null 
               }).match({ id: book.supabaseId });
            }
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
          const title = file.name.replace(/\.(cbz|pdf)$/i, '');
          
          // 1. Simpan Lokal
          const newId = await db.comics.add({
            title: title,
            fileHandle: file,
            coverBlob: coverBlob,
            format: ext as 'cbz' | 'pdf',
            totalPages: 0,
            lastReadPage: 0,
            dateAdded: Date.now(),
            folderId: activeFolderId || undefined
          });

          // 2. Simpan Metadata ke Supabase (Tanpa File)
          if (user) {
             // Cari Cloud Folder ID kalau sedang di dalam folder
             let cloudFolderId = null;
             if (activeFolderId) {
                const f = await db.folders.get(activeFolderId);
                cloudFolderId = f?.supabaseId || null;
             }

             const { data, error } = await supabase.from('comics').insert({
                user_id: user.id,
                title: title,
                original_filename: file.name,
                format: ext,
                folder_id: cloudFolderId
             }).select().single();

             if (data && !error) {
                await db.comics.update(newId, { supabaseId: data.id });
             }
          }
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

  const deleteBook = async (e: React.MouseEvent, book: ComicBook) => {
    e.stopPropagation();
    if (confirm("Hapus komik ini?")) {
      if (book.id) await db.comics.delete(book.id);
      if (user && book.supabaseId) {
         await supabase.from('comics').delete().match({ id: book.supabaseId });
      }
    }
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
                <FiFolder className={folder.supabaseId ? "text-blue-400" : "text-gray-500"} /> 
                {folder.name}
              </button>
              <button onClick={() => deleteFolder(folder.id!, folder.supabaseId)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400"><FiX size={12} /></button>
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
             {/* Sync Indicator */}
             {isSyncing && <FiRefreshCw className="animate-spin text-blue-400" />}

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
          {comics?.map((book) => {
            // Cek apakah file fisik tersedia
            const isMissingFile = !book.fileHandle;
            
            return (
              <div 
                key={book.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("bookId", book.id!.toString())}
                onClick={() => !isMissingFile && onSelectBook(book)}
                className={`group relative aspect-[2/3] bg-gray-800 rounded-xl overflow-hidden shadow-2xl transition-all border border-gray-800 
                  ${isMissingFile ? 'opacity-60 cursor-not-allowed grayscale' : 'cursor-pointer hover:scale-[1.02] hover:border-blue-500/50'}
                `}
              >
                <CoverImage blob={book.coverBlob} title={book.title} />
                
                {/* Overlay jika file hilang */}
                {isMissingFile && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-2 text-center">
                    <FiAlertCircle className="text-3xl text-red-400 mb-2" />
                    <span className="text-xs text-red-200 font-bold">File Not Found</span>
                    <span className="text-[10px] text-gray-400 mt-1">Available in Cloud</span>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent p-4 translate-y-10 group-hover:translate-y-0 transition-transform duration-300">
                  <h3 className="font-semibold text-white truncate text-sm mb-2">{book.title}</h3>
                  <div className="flex justify-between items-center text-xs text-gray-400">
                      <span className="uppercase bg-gray-700 px-1.5 py-0.5 rounded text-[10px]">{book.format}</span>
                      {book.supabaseId && <span className="text-blue-400 font-bold text-[10px]">SYNCED</span>}
                  </div>
                </div>
                <button 
                  onClick={(e) => deleteBook(e, book)}
                  className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all shadow-lg transform scale-90 hover:scale-100"
                  title="Delete"
                >
                  <FiTrash2 size={16} />
                </button>
              </div>
            );
          })}
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