import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { extractCover, getFileExtension } from '../services/fileUtils';
import { ComicBook, Folder } from '../types';
import { Button } from './Button';
import { 
  FiPlus, FiBookOpen, FiTrash2, FiUploadCloud, FiFileText, 
  FiFolder, FiMenu, FiX, FiLogOut, FiUser, FiAlertCircle, 
  FiRefreshCw, FiLock, FiGrid, FiList, FiMoreVertical, FiCheck 
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { supabase } from '../services/supabaseClient';

interface LibraryProps {
  onSelectBook: (book: ComicBook) => void;
}

// --- Komponen Cover Image (Thumbnail) ---
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

  // --- UI STATE ---
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid'); // REQ 2: View Toggle
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  // --- FOLDER STATE ---
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);

  // --- MOVE BOOK STATE (REQ 1) ---
  const [bookToMove, setBookToMove] = useState<ComicBook | null>(null); // Buku yg sedang diedit
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [quickNewFolderName, setQuickNewFolderName] = useState(""); // Buat folder baru via modal

  // --- QUERY DATA ---
  const folders = useLiveQuery(async () => {
    if (!user) return [];
    return db.folders.toArray();
  }, [user]);

  const comics = useLiveQuery(async () => {
    if (!user) return [];
    let collection = db.comics.orderBy('dateAdded').reverse();
    if (activeFolderId !== null) {
      return (await collection.toArray()).filter(c => c.folderId === activeFolderId);
    }
    return collection.toArray();
  }, [activeFolderId, user]);

  // --- SYNC LOGIC ---
  useEffect(() => {
    if (user) syncFromCloud();
  }, [user]);

  const syncFromCloud = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      // Sync Folders
      const { data: cloudFolders } = await supabase.from('folders').select('*');
      if (cloudFolders) {
        for (const cf of cloudFolders) {
           const exist = await db.folders.where('name').equals(cf.name).first();
           if (!exist) {
             await db.folders.add({ name: cf.name, supabaseId: cf.id });
           } else if (!exist.supabaseId) {
             await db.folders.update(exist.id!, { supabaseId: cf.id });
           }
        }
      }
      // Sync Comics Metadata
      const { data: cloudComics } = await supabase.from('comics').select('*');
      if (cloudComics) {
         for (const cc of cloudComics) {
            const exist = await db.comics.where('title').equals(cc.title).first();
            let localFolderId = undefined;
            if (cc.folder_id) {
               const folderLink = await db.folders.where('supabaseId').equals(cc.folder_id).first();
               if (folderLink) localFolderId = folderLink.id;
            }

            if (!exist) {
               await db.comics.add({
                 title: cc.title,
                 format: cc.format as 'pdf' | 'cbz',
                 totalPages: cc.total_pages,
                 lastReadPage: cc.last_read_page,
                 dateAdded: new Date(cc.created_at).getTime(),
                 supabaseId: cc.id,
                 folderId: localFolderId,
               });
            } else {
               const updateData: any = { supabaseId: cc.id };
               if (localFolderId) updateData.folderId = localFolderId;
               await db.comics.update(exist.id!, updateData);
            }
         }
      }
    } catch (err) {
      console.error("Sync Error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- ACTIONS ---

  // Reusable function to move book (Used by DnD and Context Menu)
  const assignBookToFolder = async (bookId: number, folderId: number | null) => {
    // Local Update
    if (folderId === null) {
         await db.comics.update(bookId, { folderId: undefined } as any);
    } else {
         await db.comics.update(bookId, { folderId });
    }

    // Cloud Update
    if (user) {
        const book = await db.comics.get(bookId);
        const targetFolder = folderId ? await db.folders.get(folderId) : null;
        if (book?.supabaseId) {
           await supabase.from('comics').update({ 
             folder_id: targetFolder?.supabaseId || null 
           }).match({ id: book.supabaseId });
        }
    }
  };

  const addFolder = async (customName?: string) => {
    const nameToUse = customName || newFolderName;
    if (nameToUse.trim()) {
      const name = nameToUse.trim();
      const id = await db.folders.add({ name });
      
      let supabaseId = undefined;
      if (user) {
        const { data, error } = await supabase.from('folders').insert({ user_id: user.id, name }).select().single();
        if (data && !error) {
           supabaseId = data.id;
           await db.folders.update(id, { supabaseId: data.id });
        }
      }
      setNewFolderName("");
      setShowFolderInput(false);
      return { id, supabaseId };
    }
    return null;
  };

  const deleteFolder = async (id: number, supabaseId?: number) => {
    if (confirm("Hapus folder ini?")) {
      await db.comics.where('folderId').equals(id).modify({ folderId: undefined });
      await db.folders.delete(id);
      if (user && supabaseId) {
        await supabase.from('folders').delete().match({ id: supabaseId });
      }
      if (activeFolderId === id) setActiveFolderId(null);
    }
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

  const processFiles = async (files: FileList | File[]) => {
    if (!user) {
        alert("Silakan Login terlebih dahulu.");
        setShowAuthModal(true);
        return;
    }
    setIsProcessing(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = getFileExtension(file.name);
        if (['cbz', 'pdf'].includes(ext)) {
          const coverBlob = await extractCover(file, ext);
          const title = file.name.replace(/\.(cbz|pdf)$/i, '');
          
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

          if (user) {
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
             if (data && !error) await db.comics.update(newId, { supabaseId: data.id });
          }
        }
      }
    } catch (error) {
      console.error("Error adding files:", error);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- EVENT HANDLERS ---
  const handleDropToFolder = (e: React.DragEvent, folderId: number | null) => {
    e.preventDefault(); e.stopPropagation();
    const bookIdString = e.dataTransfer.getData("bookId");
    if (!bookIdString) return;
    assignBookToFolder(parseInt(bookIdString), folderId);
  };

  const handleQuickCreateAndMove = async () => {
    if (quickNewFolderName && bookToMove) {
        const result = await addFolder(quickNewFolderName);
        if (result && result.id) {
            await assignBookToFolder(bookToMove.id!, result.id);
            setShowMoveModal(false);
            setQuickNewFolderName("");
            setBookToMove(null);
        }
    }
  };

  // --- RENDER ---
  if (!user) {
    // ... (Tampilan Logout tetap sama) ...
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600 rounded-full blur-[100px]"></div>
        </div>
        <div className="z-10 text-center max-w-md w-full bg-black/40 backdrop-blur-lg p-8 rounded-2xl border border-white/10 shadow-2xl">
          <div className="mb-6 flex justify-center">
             <div className="p-4 bg-blue-500/10 rounded-full border border-blue-500/20">
                <FiLock className="text-4xl text-blue-400" />
             </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">
            ZenReader Cloud
          </h1>
          <p className="text-gray-400 mb-8">
            Library kamu terkunci. Silakan login untuk mengakses koleksi komik dan folder kamu.
          </p>
          <Button onClick={() => setShowAuthModal(true)} className="w-full justify-center py-3 text-lg">
            <span className="flex items-center gap-2"><FiUser /> Login / Register</span>
          </Button>
        </div>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  return (
    <div 
      className={`min-h-screen flex relative transition-colors duration-200 ${dragActive ? 'bg-blue-900/20' : 'bg-gray-900'}`}
      onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { 
        e.preventDefault(); 
        setDragActive(false);
        if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
      }}
    >
      {/* Sidebar Overlay */}
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
             {isSyncing && <FiRefreshCw className="animate-spin text-blue-400" />}
             
             {/* REQ 2: VIEW MODE TOGGLE */}
             <div className="flex bg-gray-800 rounded-lg p-1 mr-2">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    <FiGrid />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    <FiList />
                </button>
             </div>

             <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 hidden sm:block">{user.email}</span>
                <Button onClick={() => signOut()} className="!bg-red-500/10 !text-red-400 hover:!bg-red-500/20 shadow-none px-3">
                   <FiLogOut />
                </Button>
                <div className="h-6 w-px bg-gray-700 mx-2"></div>
             </div>

            <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
              <span className="flex items-center gap-2">
                <FiPlus className="text-xl" />
                <span className="hidden sm:inline">Add Comic</span>
              </span>
            </Button>
            
            <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && processFiles(e.target.files)} className="hidden" accept=".cbz,.pdf,application/pdf,application/vnd.comicbook+zip,application/x-cbz,application/zip,application/x-zip-compressed,multipart/x-zip" multiple />
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

        {/* --- VIEW MODE SWITCHER --- */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {comics?.map((book) => {
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
                  
                  {isMissingFile && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-2 text-center">
                      <FiAlertCircle className="text-3xl text-red-400 mb-2" />
                      <span className="text-xs text-red-200 font-bold">File Not Found</span>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent p-4 pt-10">
                    <h3 className="font-semibold text-white truncate text-sm mb-1">{book.title}</h3>
                    <div className="flex justify-between items-center text-xs text-gray-400">
                        <span className="uppercase bg-gray-700 px-1.5 py-0.5 rounded text-[10px]">{book.format}</span>
                        {book.supabaseId && <span className="text-blue-400 font-bold text-[10px]">SYNCED</span>}
                    </div>
                  </div>

                  {/* REQ 1: Action Menu on Card */}
                  <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                     <button 
                        onClick={(e) => { e.stopPropagation(); setBookToMove(book); setShowMoveModal(true); }}
                        className="p-2 bg-gray-900/80 hover:bg-blue-600 rounded-full text-white shadow-lg"
                        title="Move to Folder"
                     >
                        <FiMoreVertical size={16} />
                     </button>
                     <button 
                        onClick={(e) => deleteBook(e, book)}
                        className="p-2 bg-gray-900/80 hover:bg-red-600 rounded-full text-white shadow-lg"
                        title="Delete"
                     >
                        <FiTrash2 size={16} />
                     </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // --- LIST VIEW (REQ 2) ---
          <div className="flex flex-col gap-2">
             {comics?.map((book) => {
                const isMissingFile = !book.fileHandle;
                const folderName = folders?.find(f => f.id === book.folderId)?.name || "Uncategorized";
                
                return (
                  <div 
                    key={book.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("bookId", book.id!.toString())}
                    onClick={() => !isMissingFile && onSelectBook(book)}
                    className={`group flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-800 hover:border-blue-500/50 transition-all
                        ${isMissingFile ? 'opacity-60 cursor-not-allowed grayscale' : 'cursor-pointer hover:bg-gray-800/80'}
                    `}
                  >
                     <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-14 bg-gray-900 rounded flex items-center justify-center text-gray-600 shrink-0">
                           {book.format === 'pdf' ? <FiFileText /> : <FiBookOpen />}
                        </div>
                        <div className="flex flex-col min-w-0">
                           <h3 className="font-semibold text-white truncate text-sm">{book.title}</h3>
                           <div className="flex items-center gap-2 text-xs text-gray-400">
                              <span className="uppercase bg-gray-700 px-1.5 rounded">{book.format}</span>
                              <span className="flex items-center gap-1"><FiFolder size={10} /> {folderName}</span>
                              {isMissingFile && <span className="text-red-400 font-bold flex items-center gap-1"><FiAlertCircle size={10} /> Missing File</span>}
                           </div>
                        </div>
                     </div>
                     
                     <div className="flex items-center gap-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setBookToMove(book); setShowMoveModal(true); }}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full"
                         >
                            <FiMoreVertical />
                         </button>
                        <button 
                            onClick={(e) => deleteBook(e, book)}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-full"
                         >
                            <FiTrash2 />
                         </button>
                     </div>
                  </div>
                );
             })}
          </div>
        )}
      </div>
      
      {dragActive && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-blue-900/40 backdrop-blur-sm pointer-events-none border-4 border-blue-400 border-dashed m-4 rounded-3xl">
          <FiUploadCloud className="text-8xl text-white mb-4 animate-bounce" />
          <h2 className="text-4xl font-bold text-white drop-shadow-lg">Drop to Upload</h2>
        </div>
      )}

      {/* --- MODAL: MOVE BOOK (REQ 1) --- */}
      {showMoveModal && bookToMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowMoveModal(false)}>
           <div className="bg-gray-900 border border-gray-700 p-6 rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold text-white">Move "{bookToMove.title}" to...</h3>
                 <button onClick={() => setShowMoveModal(false)}><FiX className="text-gray-400" /></button>
              </div>
              
              <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                 <button 
                    onClick={() => { assignBookToFolder(bookToMove.id!, null); setShowMoveModal(false); }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 text-gray-300 flex items-center gap-2"
                 >
                    <FiFolder className="text-gray-500" /> Uncategorized
                 </button>
                 {folders?.map(f => (
                    <button 
                        key={f.id}
                        onClick={() => { assignBookToFolder(bookToMove.id!, f.id!); setShowMoveModal(false); }}
                        className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 text-gray-300 flex items-center gap-2"
                    >
                        <FiFolder className="text-blue-500" /> {f.name}
                        {bookToMove.folderId === f.id && <FiCheck className="ml-auto text-green-500" />}
                    </button>
                 ))}
              </div>

              {/* Create New Folder inside Modal */}
              <div className="pt-4 border-t border-gray-800">
                 <div className="text-xs text-gray-500 mb-2 uppercase font-bold">Or Create New Category</div>
                 <div className="flex gap-2">
                    <input 
                       className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                       placeholder="New Category Name..."
                       value={quickNewFolderName}
                       onChange={e => setQuickNewFolderName(e.target.value)}
                       onKeyDown={e => e.key === 'Enter' && handleQuickCreateAndMove()}
                    />
                    <Button onClick={handleQuickCreateAndMove} disabled={!quickNewFolderName.trim()} className="py-1 px-3">
                       <FiPlus />
                    </Button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};