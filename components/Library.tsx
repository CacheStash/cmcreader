import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { extractCover, getFileExtension } from '../services/fileUtils';
import { ComicBook, Folder } from '../types';
import { Button } from './Button';
import { 
  FiPlus, FiBookOpen, FiTrash2, FiUploadCloud, FiFileText, 
  FiFolder, FiMenu, FiX, FiLogOut, FiUser, FiAlertCircle, 
  FiRefreshCw, FiLock, FiGrid, FiList, FiMoreVertical, FiCheck,
  FiCalendar, FiType, FiLayers, FiCheckSquare, FiSquare, FiInbox, FiLogIn, FiSearch, FiCheckCircle
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { supabase } from '../services/supabaseClient';

const UNCATEGORIZED_VIEW_ID = -1;

interface LibraryProps {
  onSelectBook: (book: ComicBook, currentList: ComicBook[]) => void;
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

  // --- UI STATE ---
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // --- FOLDER & SELECTION STATE ---
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);
  
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<number[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null); // NEW: Track last click for Shift key

  // --- MOVE BOOK STATE ---
  const [bookToMove, setBookToMove] = useState<ComicBook | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [quickNewFolderName, setQuickNewFolderName] = useState("");

  // --- QUERY DATA ---
  const folders = useLiveQuery(async () => {
    return db.folders.toArray();
  }, []);

  const comics = useLiveQuery(async () => {
    let collection;
    if (sortBy === 'name') {
        collection = db.comics.orderBy('title');
    } else {
        collection = db.comics.orderBy('dateAdded').reverse();
    }

    let all = await collection.toArray();

    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        all = all.filter(c => c.title.toLowerCase().includes(query));
    }

    if (activeFolderId === null) {
        return all;
    } else if (activeFolderId === UNCATEGORIZED_VIEW_ID) {
        return all.filter(c => !c.folderId);
    } else {
        return all.filter(c => c.folderId === activeFolderId);
    }
  }, [activeFolderId, sortBy, searchQuery]);

  // --- SYNC LOGIC ---
  useEffect(() => {
    if (user) syncFromCloud();
  }, [user]);

  const syncFromCloud = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const { data: cloudFolders } = await supabase.from('folders').select('*');
      if (cloudFolders) {
        for (const cf of cloudFolders) {
           const exist = await db.folders.where('name').equals(cf.name).first();
           if (!exist) await db.folders.add({ name: cf.name, supabaseId: cf.id });
           else if (!exist.supabaseId) await db.folders.update(exist.id!, { supabaseId: cf.id });
        }
      }
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
                 title: cc.title, format: cc.format as 'pdf'|'cbz', totalPages: cc.total_pages,
                 lastReadPage: cc.last_read_page, dateAdded: new Date(cc.created_at).getTime(),
                 supabaseId: cc.id, folderId: localFolderId,
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

  const assignBooksToFolder = async (bookIds: number[], folderId: number | null) => {
    if (bookIds.length === 0) return;

    for (const id of bookIds) {
        const updateData: any = folderId === null ? { folderId: undefined } : { folderId };
        await db.comics.update(id, updateData as any);
    }

    if (user) {
        const targetFolder = folderId ? await db.folders.get(folderId) : null;
        const books = await db.comics.where('id').anyOf(bookIds).toArray();
        const validBooks = books.filter(b => b.supabaseId);

        for (const book of validBooks) {
             await supabase.from('comics').update({ 
               folder_id: targetFolder?.supabaseId || null 
             }).match({ id: book.supabaseId });
        }
    }
    
    setSelectedBookIds([]);
    setSelectionMode(false);
    setLastSelectedId(null);
  };

  const handleAutoOrganize = async () => {
    if (!confirm("Auto organize? Only uncategorized files matching folder names will be moved.")) return;
    setIsProcessing(true);
    try {
        const allFolders = await db.folders.toArray();
        const allComics = await db.comics.toArray();
        let movedCount = 0;
        for (const folder of allFolders) {
            const folderNameLower = folder.name.toLowerCase();
            const matches = allComics.filter(c => !c.folderId && c.title.toLowerCase().includes(folderNameLower));
            if (matches.length > 0) {
                const ids = matches.map(c => c.id!);
                await assignBooksToFolder(ids, folder.id!);
                movedCount += ids.length;
            }
        }
        alert(movedCount > 0 ? `Organized ${movedCount} comics.` : "No matching comics found.");
    } catch (err) { console.error("Auto organize error:", err); } finally { setIsProcessing(false); }
  };

  // --- SELECTION LOGIC ---

  // 1. Toggle Single
  const toggleSelection = (id: number) => {
    setSelectedBookIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setLastSelectedId(id);
  };

  // 2. Select All
  const handleSelectAll = () => {
      if (!comics || comics.length === 0) return;
      
      const allIds = comics.map(c => c.id!);
      // Jika semua sudah terpilih -> Deselect All, jika belum -> Select All
      const isAllSelected = allIds.every(id => selectedBookIds.includes(id));
      
      if (isAllSelected) {
          setSelectedBookIds([]);
          setSelectionMode(false);
          setLastSelectedId(null);
      } else {
          setSelectedBookIds(allIds);
          setSelectionMode(true);
      }
  };

  // 3. Handle Card Click (Support Shift + Ctrl)
  const handleCardClick = (e: React.MouseEvent, book: ComicBook) => {
    // A. Shift Click (Range Select)
    if (e.shiftKey && lastSelectedId !== null && comics) {
        e.preventDefault(); e.stopPropagation();
        
        const lastIndex = comics.findIndex(c => c.id === lastSelectedId);
        const currentIndex = comics.findIndex(c => c.id === book.id);
        
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const rangeIds = comics.slice(start, end + 1).map(c => c.id!);
            
            // Gabungkan dengan seleksi yang sudah ada (Unik)
            setSelectedBookIds(prev => Array.from(new Set([...prev, ...rangeIds])));
            setSelectionMode(true);
        }
        return;
    }

    // B. Ctrl/Meta or Selection Mode (Toggle Single)
    if (selectionMode || e.ctrlKey || e.metaKey) {
        e.preventDefault(); e.stopPropagation();
        if (!selectionMode) setSelectionMode(true);
        toggleSelection(book.id!);
    } else {
        // C. Normal Click (Open)
        onSelectBook(book, comics || []);
    }
  };

  // ... (Drag Handler Logic sama) ...
  const handleDragStart = (e: React.DragEvent, bookId: number) => {
    let idsToDrag = [bookId];
    if (selectedBookIds.includes(bookId)) { idsToDrag = selectedBookIds; }
    e.dataTransfer.setData("bookIds", JSON.stringify(idsToDrag));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDropToFolder = (e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault(); e.stopPropagation();
    const data = e.dataTransfer.getData("bookIds");
    if (!data) return;
    try {
        const ids = JSON.parse(data) as number[];
        assignBooksToFolder(ids, targetFolderId === UNCATEGORIZED_VIEW_ID ? null : targetFolderId);
    } catch (err) { console.error("Invalid drag data", err); }
  };

  // ... (Folder & File CRUD sama) ...
  const addFolder = async (customName?: string) => {
    const name = customName || newFolderName;
    if(!name.trim()) return null;
    const id = await db.folders.add({ name });
    let supabaseId;
    if(user) {
        const {data} = await supabase.from('folders').insert({user_id:user.id, name}).select().single();
        if(data) { supabaseId = data.id; await db.folders.update(id, {supabaseId: data.id}); }
    }
    setNewFolderName(""); setShowFolderInput(false);
    return {id, supabaseId};
  };

  const deleteFolder = async (id: number, supabaseId?: number) => {
      if(confirm("Delete folder?")) {
          await db.comics.where('folderId').equals(id).modify({folderId: undefined});
          await db.folders.delete(id);
          if(user && supabaseId) await supabase.from('folders').delete().match({id: supabaseId});
          if(activeFolderId===id) setActiveFolderId(null);
      }
  };

  const deleteBook = async (e: React.MouseEvent, book: ComicBook) => {
      e.stopPropagation();
      if(confirm("Delete comic?")) {
          if(book.id) await db.comics.delete(book.id);
          if(user && book.supabaseId) await supabase.from('comics').delete().match({id: book.supabaseId});
      }
  };

  const processFiles = async (files: FileList | File[]) => {
      setIsProcessing(true);
      try {
          for(let i=0; i<files.length; i++) {
              const file = files[i];
              const ext = getFileExtension(file.name);
              if(['cbz','pdf'].includes(ext)) {
                  const cover = await extractCover(file, ext);
                  const title = file.name.replace(/\.(cbz|pdf)$/i, '');
                  const targetFolder = (activeFolderId && activeFolderId !== UNCATEGORIZED_VIEW_ID) ? activeFolderId : undefined;
                  const newId = await db.comics.add({
                      title, fileHandle: file, coverBlob: cover, format: ext as any,
                      totalPages: 0, lastReadPage: 0, dateAdded: Date.now(), 
                      folderId: targetFolder
                  });
                  if(user) {
                      let cfId = null; 
                      if(targetFolder) { const f = await db.folders.get(targetFolder); cfId = f?.supabaseId; }
                      const {data} = await supabase.from('comics').insert({
                          user_id: user.id, title, original_filename: file.name, format: ext, folder_id: cfId
                      }).select().single();
                      if(data) await db.comics.update(newId, {supabaseId: data.id});
                  }
              }
          }
      } catch(e) { console.error(e); } finally { setIsProcessing(false); if(fileInputRef.current) fileInputRef.current.value=''; }
  };

  const handleQuickCreateAndMove = async () => {
    if (quickNewFolderName && bookToMove) {
        const result = await addFolder(quickNewFolderName);
        if (result && result.id) {
            await assignBooksToFolder([bookToMove.id!], result.id);
            setShowMoveModal(false);
            setQuickNewFolderName("");
            setBookToMove(null);
        }
    }
  };

  // --- RENDER LOGIN ---
  if (!user && !isGuestMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600 rounded-full blur-[100px]"></div></div>
        <div className="z-10 text-center max-w-md w-full bg-black/40 backdrop-blur-lg p-8 rounded-2xl border border-white/10 shadow-2xl">
          <div className="mb-6 flex justify-center"><div className="p-4 bg-blue-500/10 rounded-full border border-blue-500/20"><FiLock className="text-4xl text-blue-400" /></div></div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">ZenReader</h1>
          <p className="text-gray-400 mb-8">Login to sync your library across devices, or continue locally as a guest.</p>
          <div className="space-y-3">
            <Button onClick={() => setShowAuthModal(true)} className="w-full justify-center py-3 text-lg"><span className="flex items-center gap-2"><FiUser /> Login / Register</span></Button>
            <button onClick={() => setIsGuestMode(true)} className="w-full py-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm">Continue as Guest (Local Only)</button>
          </div>
        </div>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  // --- MAIN RENDER ---
  return (
    <div 
      className={`min-h-screen flex relative transition-colors duration-200 ${dragActive ? 'bg-blue-900/20' : 'bg-gray-900'}`}
      onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files); }}
    >
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed md:sticky top-0 h-screen w-64 bg-black/90 border-r border-gray-800 z-40 transform transition-transform duration-300 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between"><h2 className="font-bold text-gray-400 uppercase text-xs tracking-wider">Library</h2><button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400"><FiX /></button></div>
        <div className="p-3 pb-0"><Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="w-full justify-center !bg-blue-600 hover:!bg-blue-500 text-white"><span className="flex items-center gap-2"><FiPlus className="text-xl" /> Add Comic</span></Button></div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button onClick={() => setActiveFolderId(null)} onDragOver={(e) => e.preventDefault()} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolderId === null ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}><FiBookOpen /> All Comics</button>
          <button onClick={() => setActiveFolderId(UNCATEGORIZED_VIEW_ID)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDropToFolder(e, UNCATEGORIZED_VIEW_ID)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolderId === UNCATEGORIZED_VIEW_ID ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}><FiInbox /> Uncategorized</button>
          
          <div className="mt-4 mb-2 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Folders</div>
          {folders?.map(folder => (
            <div key={folder.id} className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${activeFolderId === folder.id ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800'}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDropToFolder(e, folder.id!)}>
              <button onClick={() => setActiveFolderId(folder.id!)} className="flex items-center gap-3 flex-1 text-left truncate"><FiFolder className={folder.supabaseId ? "text-blue-400" : "text-gray-500"} /> {folder.name}</button>
              <button onClick={() => deleteFolder(folder.id!, folder.supabaseId)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400"><FiX size={12} /></button>
            </div>
          ))}

          <div className="pt-2 border-t border-gray-800 mt-2 space-y-1">
              <button onClick={handleAutoOrganize} disabled={isProcessing} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-gray-800/50 transition-colors rounded-lg"><FiLayers /> Auto Organize</button>
              {showFolderInput ? (
                 <div className="px-3"><input autoFocus className="w-full bg-gray-800 rounded px-2 py-1 text-sm text-white border border-blue-500 outline-none" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onBlur={() => !newFolderName && setShowFolderInput(false)} onKeyDown={(e) => e.key === 'Enter' && addFolder()} placeholder="Folder name..." /></div>
              ) : (
                <button onClick={() => setShowFolderInput(true)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-white transition-colors"><FiPlus /> New Folder</button>
              )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-800 bg-gray-900/50 mt-auto">
           {user ? (
               <><div className="flex items-center gap-3 mb-3 px-1"><div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold">{user.email?.charAt(0).toUpperCase()}</div><div className="flex-1 min-w-0"><p className="text-sm font-medium text-white truncate">{user.email}</p></div></div><Button onClick={() => signOut()} className="w-full justify-center !bg-red-500/10 !text-red-400 hover:!bg-red-500/20 border border-red-500/20 text-sm py-1.5"><span className="flex items-center gap-2"><FiLogOut /> Logout</span></Button></>
           ) : (
               <><div className="flex items-center gap-3 mb-3 px-1"><div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">G</div><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-300">Guest Mode</p><p className="text-xs text-gray-600">Local Storage Only</p></div></div><Button onClick={() => setShowAuthModal(true)} className="w-full justify-center !bg-blue-600/10 !text-blue-400 hover:!bg-blue-600/20 border border-blue-500/20 text-sm py-1.5"><span className="flex items-center gap-2"><FiLogIn /> Login to Sync</span></Button></>
           )}
        </div>
      </aside>

      <div className="flex-1 p-6 pb-24 relative z-10 w-full overflow-hidden">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 sticky top-0 z-20 bg-gray-900/80 backdrop-blur-md py-4 gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-2xl text-white"><FiMenu /></button>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent truncate max-w-[150px] md:max-w-none">
              {activeFolderId === null ? 'All Comics' : activeFolderId === UNCATEGORIZED_VIEW_ID ? 'Uncategorized' : folders?.find(f => f.id === activeFolderId)?.name || 'Library'}
            </h1>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
             <div className="relative w-full md:w-64"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" /><input className="w-full bg-gray-800 border border-gray-700 rounded-full py-1.5 pl-9 pr-4 text-sm text-white focus:border-blue-500 outline-none transition-all focus:bg-gray-800/80" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>

             <div className="flex w-full md:w-auto gap-3 justify-end">
                {isSyncing && <FiRefreshCw className="animate-spin text-blue-400" />}
                <div className="flex bg-gray-800 rounded-lg p-1">
                    {/* NEW: Select All Button */}
                    <button 
                        onClick={handleSelectAll}
                        className={`p-2 rounded flex items-center gap-1 border-r border-gray-700 mr-1 pr-3 ${selectedBookIds.length > 0 && selectedBookIds.length === comics?.length ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}
                        title="Select All"
                    >
                        <FiCheckCircle />
                    </button>

                    <button 
                        onClick={() => { setSelectionMode(!selectionMode); setSelectedBookIds([]); setLastSelectedId(null); }}
                        className={`p-2 rounded flex items-center gap-1 border-r border-gray-700 mr-1 pr-3 ${selectionMode ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        title="Multi Select Mode"
                    >
                        {selectionMode ? <FiCheckSquare /> : <FiSquare />}
                        {selectionMode && <span className="text-xs font-bold ml-1">{selectedBookIds.length}</span>}
                    </button>

                    <button onClick={() => setSortBy(prev => prev === 'date' ? 'name' : 'date')} className="p-2 rounded text-gray-400 hover:text-white flex items-center gap-1 border-r border-gray-700 mr-1 pr-3">{sortBy === 'date' ? <FiCalendar /> : <FiType />}<span className="text-xs font-bold hidden sm:inline">{sortBy === 'date' ? 'Date' : 'A-Z'}</span></button>
                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><FiGrid /></button>
                    <button onClick={() => setViewMode('list')} className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><FiList /></button>
                </div>
             </div>
             <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && processFiles(e.target.files)} className="hidden" accept=".cbz,.pdf,application/pdf,application/vnd.comicbook+zip,application/x-cbz,application/zip,application/x-zip-compressed,multipart/x-zip" multiple />
          </div>
        </header>

        {isProcessing && <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg animate-pulse text-blue-200 flex items-center justify-center gap-3">Processing...</div>}

        <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" : "flex flex-col gap-2"}>
            {comics?.map((book) => {
              const isMissingFile = !book.fileHandle;
              const isSelected = selectedBookIds.includes(book.id!);
              
              const GridContent = () => (
                <>
                  <CoverImage blob={book.coverBlob} title={book.title} />
                  {isMissingFile && <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-2 text-center"><FiAlertCircle className="text-3xl text-red-400 mb-2" /><span className="text-xs text-red-200 font-bold">Missing</span></div>}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent p-4 pt-10">
                    <h3 className="font-semibold text-white truncate text-sm mb-1">{book.title}</h3>
                    <div className="flex justify-between items-center text-xs text-gray-400"><span className="uppercase bg-gray-700 px-1.5 py-0.5 rounded text-[10px]">{book.format}</span>{book.supabaseId && <span className="text-blue-400 font-bold text-[10px]">SYNCED</span>}</div>
                  </div>
                  {isSelected && <div className="absolute inset-0 border-4 border-blue-500 rounded-xl z-20 pointer-events-none bg-blue-500/20 flex items-center justify-center"><FiCheck className="text-6xl text-white drop-shadow-lg" /></div>}
                </>
              );

              const ListContent = () => (
                 <div className="flex items-center gap-4 flex-1 min-w-0">
                    {selectionMode && <div className={`w-5 h-5 border rounded flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}`}>{isSelected && <FiCheck size={12} />}</div>}
                    <div className="w-10 h-14 bg-gray-900 rounded flex items-center justify-center text-gray-600 shrink-0">{book.format === 'pdf' ? <FiFileText /> : <FiBookOpen />}</div>
                    <div className="flex flex-col min-w-0">
                       <h3 className={`font-semibold truncate text-sm ${isSelected ? 'text-blue-400' : 'text-white'}`}>{book.title}</h3>
                       <div className="flex items-center gap-2 text-xs text-gray-400"><span className="uppercase bg-gray-700 px-1.5 rounded">{book.format}</span>{isMissingFile && <span className="text-red-400 font-bold flex items-center gap-1"><FiAlertCircle size={10} /> Missing File</span>}</div>
                    </div>
                 </div>
              );

              return (
                <div 
                  key={book.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, book.id!)}
                  onClick={(e) => !isMissingFile && handleCardClick(e, book)}
                  className={`
                    ${viewMode === 'grid' 
                        ? `group relative aspect-[2/3] bg-gray-800 rounded-xl overflow-hidden shadow-2xl transition-all border border-gray-800 ${isSelected ? 'ring-2 ring-blue-500 transform scale-95' : 'hover:scale-[1.02]'}`
                        : `group flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-800 transition-all ${isSelected ? 'bg-blue-900/20 border-blue-500/50' : 'hover:bg-gray-800/80'}`
                    }
                    ${isMissingFile ? 'opacity-60 cursor-not-allowed grayscale' : 'cursor-pointer'}
                  `}
                >
                  {viewMode === 'grid' ? <GridContent /> : <ListContent />}
                  {!selectionMode && (<div className={viewMode === 'grid' ? "absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-all z-30" : "flex items-center gap-2"}><button onClick={(e) => { e.stopPropagation(); setBookToMove(book); setShowMoveModal(true); }} className="p-2 text-white bg-gray-900/80 hover:bg-blue-600 rounded-full shadow-lg"><FiMoreVertical size={16} /></button><button onClick={(e) => deleteBook(e, book)} className="p-2 text-white bg-gray-900/80 hover:bg-red-600 rounded-full shadow-lg"><FiTrash2 size={16} /></button></div>)}
                </div>
              );
            })}
        </div>
      </div>
      
      {dragActive && <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-blue-900/40 backdrop-blur-sm pointer-events-none border-4 border-blue-400 border-dashed m-4 rounded-3xl"><FiUploadCloud className="text-8xl text-white mb-4 animate-bounce" /><h2 className="text-4xl font-bold text-white drop-shadow-lg">Drop to Upload</h2></div>}

      {showMoveModal && bookToMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowMoveModal(false)}>
           <div className="bg-gray-900 border border-gray-700 p-6 rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-white">Move "{bookToMove.title}" to...</h3><button onClick={() => setShowMoveModal(false)}><FiX className="text-gray-400" /></button></div>
              <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                 <button onClick={() => { assignBooksToFolder([bookToMove.id!], null); setShowMoveModal(false); }} className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 text-gray-300 flex items-center gap-2"><FiInbox className="text-gray-500" /> Uncategorized</button>
                 {folders?.map(f => (<button key={f.id} onClick={() => { assignBooksToFolder([bookToMove.id!], f.id!); setShowMoveModal(false); }} className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 text-gray-300 flex items-center gap-2"><FiFolder className="text-blue-500" /> {f.name} {bookToMove.folderId === f.id && <FiCheck className="ml-auto text-green-500" />}</button>))}
              </div>
              <div className="pt-4 border-t border-gray-800">
                 <div className="text-xs text-gray-500 mb-2 uppercase font-bold">Or Create New Category</div>
                 <div className="flex gap-2"><input className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" placeholder="New Category Name..." value={quickNewFolderName} onChange={e => setQuickNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleQuickCreateAndMove()} /><Button onClick={handleQuickCreateAndMove} disabled={!quickNewFolderName.trim()} className="py-1 px-3"><FiPlus /></Button></div>
              </div>
           </div>
        </div>
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};