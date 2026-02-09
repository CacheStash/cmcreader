import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { extractCover, getFileExtension } from '../services/fileUtils';
import { ComicBook, Folder } from '../types';
import { Button } from './Button';
import { 
  FiPlus, FiBookOpen, FiTrash2, FiFileText, 
  FiFolder, FiMenu, FiX, FiAlertCircle, 
  FiRefreshCw, FiGrid, FiList, FiMoreVertical, FiCheck,
  FiLayers, FiCheckSquare, FiSquare, FiInbox, FiSearch, FiCheckCircle,
  FiEye, FiCornerUpLeft, FiChevronRight, FiFolderPlus, FiFolderMinus, FiDatabase
} from 'react-icons/fi';

const UNCATEGORIZED_VIEW_ID = -1;

interface LibraryProps {
  onSelectBook: (book: ComicBook, currentList: ComicBook[]) => void;
  // Tambahan props untuk persistensi navigasi
  activeFolderId: number | null;
  onNavigate: (id: number | null) => void;
}

// Helper untuk Cover
const CoverImage = ({ blob, title, small = false }: { blob?: Blob, title: string, small?: boolean }) => {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    } else {
      setUrl('');
    }
  }, [blob]);

  if (!blob) {
    return (
      <div className={`flex flex-col items-center justify-center text-gray-800 bg-gray-900 border border-gray-800 ${small ? 'w-full h-full' : 'w-full h-full p-4'} animate-pulse`}>
        <FiRefreshCw className={`${small ? 'text-xs' : 'text-4xl'} mb-1 opacity-30 animate-spin`} />
        {!small && <span className="text-[10px] opacity-30 uppercase tracking-widest">Wait...</span>}
      </div>
    );
  }
  return <img src={url} alt={title} className="w-full h-full object-cover transition-opacity duration-300" />;
};

export const Library: React.FC<LibraryProps> = ({ onSelectBook, activeFolderId, onNavigate }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // --- UI STATE ---
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showListThumbnails, setShowListThumbnails] = useState(true);
  
  // --- FOLDER & SELECTION STATE ---
  const [newFolderName, setNewFolderName] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);
  
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<number[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<number[]>([]); 
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);

  // --- CONTEXT MENU STATE ---
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, folderId: number } | null>(null);

  // --- MOVE BOOK STATE ---
  const [bookToMove, setBookToMove] = useState<ComicBook | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [quickNewFolderName, setQuickNewFolderName] = useState("");

  const [processingQueue, setProcessingQueue] = useState<number[]>([]);

  // --- QUERY DATA ---
  
  const currentFolder = useLiveQuery(async () => {
      if (activeFolderId && activeFolderId !== UNCATEGORIZED_VIEW_ID) {
          return db.folders.get(activeFolderId);
      }
      return null;
  }, [activeFolderId]);

  const breadcrumbs = useLiveQuery(async () => {
      if (!activeFolderId || activeFolderId === UNCATEGORIZED_VIEW_ID) return [];
      const trail: Folder[] = [];
      let curr = await db.folders.get(activeFolderId);
      while (curr) {
          trail.unshift(curr);
          if (curr.parentId) curr = await db.folders.get(curr.parentId);
          else curr = undefined;
      }
      return trail;
  }, [activeFolderId]);

  const subFolders = useLiveQuery(async () => {
    const all = await db.folders.toArray();
    return all.filter(f => {
        if (activeFolderId === null || activeFolderId === UNCATEGORIZED_VIEW_ID) return !f.parentId; 
        return f.parentId === activeFolderId;
    }).sort((a, b) => 
        // NATURAL SORT: Mengurutkan folder 1, 2, 10
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
}, [activeFolderId]);

// Library.tsx - Bagian Fetch Comics (Sekitar baris 126-139)
const comics = useLiveQuery(async () => {
  // Ambil semua data terlebih dahulu
  let all = await db.comics.toArray();

  // Filter berdasarkan Search Query
  if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      all = all.filter(c => c.title.toLowerCase().includes(query));
  }

  // Filter berdasarkan Folder
  let filtered = all;
  if (activeFolderId === UNCATEGORIZED_VIEW_ID) {
      filtered = all.filter(c => !c.folderId);
  } else if (activeFolderId !== null) {
      filtered = all.filter(c => c.folderId === activeFolderId);
  }

  // NATURAL SORT: Logika utama untuk mengurutkan Chapter 1, 2, 10
  return filtered.sort((a, b) => 
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
  );
}, [activeFolderId, searchQuery]);

  // --- LAZY COVER ---
  useEffect(() => {
    const processNextCover = async () => {
      if (processingQueue.length === 0) return;
      const bookId = processingQueue[0];
      try {
        const book = await db.comics.get(bookId);
        if (book && book.fileHandle && !book.coverBlob) {
          const coverBlob = await extractCover(book.fileHandle, book.format);
          if (coverBlob) await db.comics.update(bookId, { coverBlob });
        }
      } catch (err) { console.error(err); }
      setProcessingQueue(prev => prev.slice(1));
    };
    processNextCover();
  }, [processingQueue]);

  // --- ACTIONS ---

  const navigateToFolder = (folderId: number | null) => {
      onNavigate(folderId);
      setSelectedFolderIds([]); 
  };

  const navigateUp = async () => {
      if (!currentFolder) { navigateToFolder(null); return; }
      const parentId = currentFolder.parentId || null;
      onNavigate(parentId);
  };

  const assignBooksToFolder = async (bookIds: number[], folderId: number | null) => {
    if (bookIds.length === 0) return;
    for (const id of bookIds) {
        const updateData: any = folderId === null ? { folderId: undefined } : { folderId };
        await db.comics.update(id, updateData as any);
    }
    setSelectedBookIds([]);
  };

  const handleGroupSelectedFolders = async () => {
      if (selectedFolderIds.length < 1) return;
      const groupName = prompt("Enter name for the new Group / Parent Folder:");
      if (!groupName) return;

      try {
          const currentParent = activeFolderId === UNCATEGORIZED_VIEW_ID ? null : activeFolderId;
          const { id: newParentId } = await addFolder(groupName, currentParent || undefined); 

          if (newParentId) {
              for (const folderId of selectedFolderIds) {
                  await db.folders.update(folderId, { parentId: newParentId });
              }
              setSelectedFolderIds([]);
          }
      } catch (err) { console.error(err); alert("Failed to group folders."); }
  };

  const deleteFolderRecursive = async (folderId: number) => {
      const books = await db.comics.where('folderId').equals(folderId).toArray();
      const bookIds = books.map(b => b.id!);
      if(bookIds.length > 0) await db.comics.bulkDelete(bookIds);

      const sub = await db.folders.where('parentId').equals(folderId).toArray();
      for (const s of sub) await deleteFolderRecursive(s.id!);

      await db.folders.delete(folderId);
  };

  const deleteFolder = async (folderId: number) => {
      if(confirm("Delete folder and ALL its contents?")) {
          await deleteFolderRecursive(folderId);
          if(activeFolderId === folderId) onNavigate(null);
      }
  };

  const handleBulkDeleteFolders = async () => {
      if (!confirm(`WARNING: This will delete ${selectedFolderIds.length} folders AND ALL FILES inside them. Continue?`)) return;
      setIsProcessing(true);
      try {
          for (const fId of selectedFolderIds) {
              await deleteFolderRecursive(fId);
          }
          setSelectedFolderIds([]);
      } catch (err) { console.error(err); alert("Error deleting folders"); }
      finally { setIsProcessing(false); }
  };

  const handleBulkDeleteBooks = async () => {
      if (!confirm(`Delete ${selectedBookIds.length} selected files?`)) return;
      setIsProcessing(true);
      try {
          await db.comics.bulkDelete(selectedBookIds);
          setSelectedBookIds([]);
      } catch (err) { console.error(err); }
      finally { setIsProcessing(false); }
  };

  const handleBulkEjectFiles = async () => {
      if (!confirm(`Remove ${selectedBookIds.length} files from their folders?`)) return;
      await assignBooksToFolder(selectedBookIds, null);
  };

  const handleFactoryReset = async () => {
      const confirmation = prompt("DANGER: Type 'DELETE' to wipe your entire library. This cannot be undone.");
      if (confirmation !== 'DELETE') return;
      
      setIsProcessing(true);
      try {
          await db.comics.clear();
          await db.folders.clear();
          onNavigate(null);
          alert("Library has been reset.");
      } catch (err) { console.error(err); alert("Reset failed."); }
      finally { setIsProcessing(false); }
  };

  const addFolder = async (customName?: string, parentIdOverride?: number) => {
    const name = customName || newFolderName;
    if(!name.trim()) return { id: undefined };
    let parentToUse = (activeFolderId && activeFolderId !== UNCATEGORIZED_VIEW_ID) ? activeFolderId : undefined;
    if (parentIdOverride !== undefined) parentToUse = parentIdOverride;
    const id = await db.folders.add({ name, parentId: parentToUse });
    setNewFolderName(""); setShowFolderInput(false); setContextMenu(null);
    return { id };
  };

  const handleAutoOrganize = async () => {
    if (!confirm("Auto organize? Creates folders based on first 2 words.")) return;
    setIsProcessing(true);
    try {
        const allComics = await db.comics.toArray();
        const allFolders = await db.folders.toArray();
        let movedCount = 0;
        let createdFolders = 0;
        const groups: Record<string, number[]> = {};
        allComics.forEach(c => {
            if (!c.folderId) {
                const words = c.title.trim().split(/\s+/);
                if (words.length >= 2) {
                    const prefix = words.slice(0, 2).join(' ');
                    const cleanPrefix = prefix.replace(/[^\w\s]/gi, '');
                    if (cleanPrefix.length > 3) {
                        if (!groups[cleanPrefix]) groups[cleanPrefix] = [];
                        groups[cleanPrefix].push(c.id!);
                    }
                }
            }
        });
        for (const [name, ids] of Object.entries(groups)) {
            if (ids.length > 1) {
                let targetFolder = allFolders.find(f => f.name.toLowerCase() === name.toLowerCase());
                let targetId = targetFolder?.id;
                if (!targetFolder) {
                    targetId = await db.folders.add({ name, parentId: undefined });
                    createdFolders++;
                }
                await assignBooksToFolder(ids, targetId!);
                movedCount += ids.length;
            }
        }
        alert(`Organized ${movedCount} comics into ${createdFolders} folders.`);
    } catch (err) { console.error(err); } finally { setIsProcessing(false); }
  };

  const deleteBook = async (e: React.MouseEvent, book: ComicBook) => {
      e.stopPropagation();
      if(confirm("Delete comic?")) {
          if(book.id) await db.comics.delete(book.id);
      }
  };

  const processFiles = async (files: FileList | File[]) => {
      setIsProcessing(true);
      try {
          const newBookIds: number[] = [];
          for(let i=0; i<files.length; i++) {
              const file = files[i];
              const ext = getFileExtension(file.name);
              if(['cbz','pdf'].includes(ext)) {
                  const title = file.name.replace(/\.(cbz|pdf)$/i, '');
                  const targetFolder = (activeFolderId && activeFolderId !== UNCATEGORIZED_VIEW_ID) ? activeFolderId : undefined;
                  const newId = await db.comics.add({
                      title, fileHandle: file, coverBlob: undefined, format: ext as any,
                      totalPages: 0, lastReadPage: 0, dateAdded: Date.now(), folderId: targetFolder
                  });
                  newBookIds.push(newId);
              }
          }
          setProcessingQueue(prev => [...prev, ...newBookIds]);
      } catch(e) { console.error(e); } finally { setIsProcessing(false); if(fileInputRef.current) fileInputRef.current.value=''; }
  };

  const handleQuickCreateAndMove = async () => {
    if (quickNewFolderName && bookToMove) {
        const result = await addFolder(quickNewFolderName);
        if (result.id) {
            await assignBooksToFolder([bookToMove.id!], result.id);
            setShowMoveModal(false);
            setQuickNewFolderName("");
            setBookToMove(null);
        }
    }
  };

  // --- SELECTION Logic ---
  const toggleSelection = (id: number) => { setSelectedBookIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); setLastSelectedId(id); };
  const toggleFolderSelection = (e: React.MouseEvent, id: number) => { e.preventDefault(); e.stopPropagation(); setSelectedFolderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); };
  
  const handleSelectAll = () => {
      if (!comics || comics.length === 0) return;
      const allIds = comics.map(c => c.id!);
      const isAllSelected = allIds.every(id => selectedBookIds.includes(id));
      if (isAllSelected) { setSelectedBookIds([]); setSelectedFolderIds([]); setSelectionMode(false); setLastSelectedId(null); } 
      else { setSelectedBookIds(allIds); setSelectionMode(true); }
  };

  const handleCardClick = (e: React.MouseEvent, book: ComicBook) => {
    if (e.shiftKey && lastSelectedId !== null && comics) {
        e.preventDefault(); e.stopPropagation();
        const lastIndex = comics.findIndex(c => c.id === lastSelectedId);
        const currentIndex = comics.findIndex(c => c.id === book.id);
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex); const end = Math.max(lastIndex, currentIndex);
            const rangeIds = comics.slice(start, end + 1).map(c => c.id!);
            setSelectedBookIds(prev => Array.from(new Set([...prev, ...rangeIds])));
            setSelectionMode(true);
        }
        return;
    }
    if (selectionMode || e.ctrlKey || e.metaKey) {
        e.preventDefault(); e.stopPropagation();
        if (!selectionMode) setSelectionMode(true);
        toggleSelection(book.id!);
    } else {
        onSelectBook(book, comics || []);
    }
  };

  const handleDragStart = (e: React.DragEvent, bookId: number) => {
    let idsToDrag = [bookId]; if (selectedBookIds.includes(bookId)) { idsToDrag = selectedBookIds; }
    e.dataTransfer.setData("bookIds", JSON.stringify(idsToDrag));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDropToFolder = (e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault(); e.stopPropagation();
    const data = e.dataTransfer.getData("bookIds");
    if (!data) return;
    try { const ids = JSON.parse(data) as number[]; assignBooksToFolder(ids, targetFolderId === UNCATEGORIZED_VIEW_ID ? null : targetFolderId); } catch (err) { console.error(err); }
  };

  return (
    <div 
      className={`min-h-screen flex relative transition-colors duration-200 ${dragActive ? 'bg-blue-900/20' : 'bg-gray-900'}`}
      onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files); }}
      onClick={() => setContextMenu(null)}
    >
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed md:sticky top-0 h-screen w-64 bg-black/90 border-r border-gray-800 z-40 transform transition-transform duration-300 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between"><h2 className="font-bold text-gray-400 uppercase text-xs tracking-wider">Library</h2><button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400"><FiX /></button></div>
        <div className="p-3 pb-0"><Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="w-full justify-center !bg-blue-600 hover:!bg-blue-500 text-white"><span className="flex items-center gap-2"><FiPlus className="text-xl" /> Add Comic</span></Button></div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button onClick={() => navigateToFolder(null)} onDragOver={(e) => e.preventDefault()} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolderId === null ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}><FiBookOpen /> All Comics</button>
          <button onClick={() => navigateToFolder(UNCATEGORIZED_VIEW_ID)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDropToFolder(e, UNCATEGORIZED_VIEW_ID)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolderId === UNCATEGORIZED_VIEW_ID ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}><FiInbox /> Uncategorized</button>
          
          <div className="mt-4 mb-2 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center">
              <span>Folders</span>
              {activeFolderId && <button onClick={navigateUp} title="Go Up" className="hover:text-white"><FiCornerUpLeft /></button>}
          </div>
          
          {subFolders?.map(folder => {
            const isFolderSelected = selectedFolderIds.includes(folder.id!);
            return (
              <div 
                  key={folder.id} 
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${activeFolderId === folder.id ? 'bg-blue-600/20 text-blue-400' : isFolderSelected ? 'bg-blue-900/30' : 'text-gray-400 hover:bg-gray-800'}`} 
                  onDragOver={(e) => e.preventDefault()} 
                  onDrop={(e) => handleDropToFolder(e, folder.id!)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, folderId: folder.id! }); }}
                  onClick={() => !selectionMode && navigateToFolder(folder.id!)}
              >
                <div className="flex items-center gap-3 flex-1 text-left truncate cursor-pointer">
                    {selectionMode ? (
                        <div onClick={(e) => toggleFolderSelection(e, folder.id!)}>
                            {isFolderSelected ? <FiCheckSquare className="text-blue-500" /> : <FiSquare />}
                        </div>
                    ) : (
                        <FiFolder className="text-gray-500" />
                    )}
                    {folder.name}
                </div>
              </div>
            );
          })}

          <div className="pt-2 border-t border-gray-800 mt-2 space-y-1">
              <button onClick={handleAutoOrganize} disabled={isProcessing} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-gray-800/50 transition-colors rounded-lg"><FiLayers /> Auto Organize</button>
              {showFolderInput ? (
                 <div className="px-3"><input autoFocus className="w-full bg-gray-800 rounded px-2 py-1 text-sm text-white border border-blue-500 outline-none" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onBlur={() => !newFolderName && setShowFolderInput(false)} onKeyDown={(e) => e.key === 'Enter' && addFolder()} placeholder={activeFolderId ? "Sub-folder name..." : "Folder name..."} /></div>
              ) : (
                <button onClick={() => setShowFolderInput(true)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-white transition-colors"><FiPlus /> {activeFolderId ? "New Sub-Folder" : "New Folder"}</button>
              )}
          </div>
        </div>

        {selectionMode && selectedFolderIds.length > 0 && (
            <div className="px-3 pb-2 flex flex-col gap-1">
                <Button onClick={handleGroupSelectedFolders} className="w-full justify-center !bg-green-600 hover:!bg-green-500 text-white text-xs py-2">
                    <span className="flex items-center gap-2"><FiFolderPlus /> Group Folders</span>
                </Button>
                <Button onClick={handleBulkDeleteFolders} className="w-full justify-center !bg-red-600 hover:!bg-red-500 text-white text-xs py-2">
                    <span className="flex items-center gap-2"><FiTrash2 /> Delete Folders</span>
                </Button>
            </div>
        )}

        <div className="p-4 border-t border-gray-800 bg-gray-900/50 mt-auto flex justify-between items-center">
           <div className="flex-1">
                <div className="flex items-center gap-3 px-1">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">L</div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-300">Local Mode</p>
                        <p className="text-[10px] text-gray-600 uppercase tracking-tighter">Offline Database</p>
                    </div>
                </div>
           </div>
           
           <button onClick={handleFactoryReset} className="ml-2 p-2 text-gray-600 hover:text-red-500 transition-colors" title="Factory Reset (Wipe All Data)">
               <FiDatabase size={16} />
           </button>
        </div>
      </aside>

      {contextMenu && (
          <div className="fixed bg-gray-800 border border-gray-700 rounded shadow-xl z-50 py-1 w-48" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
              <button className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center gap-2" onClick={() => { const name = prompt("Name for sub-folder:"); if (name) addFolder(name, contextMenu.folderId); }}><FiPlus /> Add Sub-folder</button>
              <button className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2" onClick={() => { deleteFolder(contextMenu.folderId); setContextMenu(null); }}><FiTrash2 /> Delete</button>
          </div>
      )}

      <div className="flex-1 p-6 pb-24 relative z-10 w-full overflow-hidden">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 sticky top-0 z-20 bg-gray-900/80 backdrop-blur-md py-4 gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto overflow-hidden">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-2xl text-white"><FiMenu /></button>
            <div className="flex items-center gap-1 text-xl md:text-3xl font-bold truncate overflow-x-auto no-scrollbar whitespace-nowrap">
               <span onClick={() => navigateToFolder(null)} className={`cursor-pointer hover:text-blue-400 flex-shrink-0 ${activeFolderId === null ? 'text-blue-500' : 'text-gray-500'}`}>Library</span>
               {breadcrumbs?.map((folder, index) => (
                   <React.Fragment key={folder.id}>
                       <FiChevronRight className="text-gray-600 text-lg flex-shrink-0" />
                       <span onClick={() => navigateToFolder(folder.id!)} className={`cursor-pointer hover:text-blue-400 flex-shrink-0 ${index === breadcrumbs.length - 1 ? 'text-blue-500' : 'text-gray-500'}`}>{folder.name}</span>
                   </React.Fragment>
               ))}
               {activeFolderId === UNCATEGORIZED_VIEW_ID && (<><FiChevronRight className="text-gray-600 text-lg flex-shrink-0" /><span className="text-blue-500 flex-shrink-0">Uncategorized</span></>)}
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
             <div className="relative w-full md:w-64"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" /><input className="w-full bg-gray-800 border border-gray-700 rounded-full py-1.5 pl-9 pr-4 text-sm text-white focus:border-blue-500 outline-none transition-all focus:bg-gray-800/80" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>

             <div className="flex w-full md:w-auto gap-3 justify-end">
                <div className="flex bg-gray-800 rounded-lg p-1">
                    <button onClick={handleSelectAll} className={`p-2 rounded flex items-center gap-1 border-r border-gray-700 mr-1 pr-3 ${selectedBookIds.length > 0 && selectedBookIds.length === comics?.length ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}><FiCheckCircle /></button>
                    <button onClick={() => { setSelectionMode(!selectionMode); setSelectedBookIds([]); setSelectedFolderIds([]); setLastSelectedId(null); }} className={`p-2 rounded flex items-center gap-1 border-r border-gray-700 mr-1 pr-3 ${selectionMode ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><FiCheckSquare /></button>
                    {viewMode === 'list' && (<button onClick={() => setShowListThumbnails(!showListThumbnails)} className={`p-2 rounded border-r border-gray-700 mr-1 pr-3 ${showListThumbnails ? 'text-blue-400' : 'text-gray-400'}`} title="Toggle Thumbnails"><FiEye /></button>)}
                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><FiGrid /></button>
                    <button onClick={() => setViewMode('list')} className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><FiList /></button>
                </div>
             </div>
             <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && processFiles(e.target.files)} className="hidden" accept=".cbz,.pdf" multiple />
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
                    <div className="flex justify-between items-center text-xs text-gray-400"><span className="uppercase bg-gray-700 px-1.5 py-0.5 rounded text-[10px]">{book.format}</span></div>
                  </div>
                  {isSelected && <div className="absolute inset-0 border-4 border-blue-500 rounded-xl z-20 pointer-events-none bg-blue-500/20 flex items-center justify-center"><FiCheck className="text-6xl text-white drop-shadow-lg" /></div>}
                </>
              );

              const ListContent = () => (
                 <div className="flex items-center gap-4 flex-1 min-w-0">
                    {selectionMode && <div className={`w-5 h-5 border rounded flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}`}>{isSelected && <FiCheck size={12} />}</div>}
                    {showListThumbnails && <div className="w-10 h-14 bg-gray-900 rounded flex items-center justify-center text-gray-600 shrink-0 overflow-hidden"><CoverImage blob={book.coverBlob} title={book.title} small /></div>}
                    {!showListThumbnails && <div className="w-10 h-14 bg-gray-900 rounded flex items-center justify-center text-gray-600 shrink-0">{book.format === 'pdf' ? <FiFileText /> : <FiBookOpen />}</div>}
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
                        ? `group relative aspect-[2/3] bg-gray-800 rounded-xl overflow-hidden transition-all border border-gray-800 ${isSelected ? 'ring-2 ring-blue-500 transform scale-95' : 'hover:scale-[1.02]'}`
                        : `group flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-800 transition-all ${isSelected ? 'bg-blue-900/20 border-blue-500/50' : 'hover:bg-gray-800/80'}`
                    }
                    ${isMissingFile ? 'opacity-60 cursor-not-allowed grayscale' : 'cursor-pointer'}
                  `}
                >
                  {viewMode === 'grid' ? <GridContent /> : <ListContent />}
                  {!selectionMode ? (
                      <div className={viewMode === 'grid' ? "absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-all z-30" : "flex items-center gap-2"}>
                         <button onClick={(e) => { e.stopPropagation(); setBookToMove(book); setShowMoveModal(true); }} className="p-2 text-white bg-gray-900/80 hover:bg-blue-600 rounded-full"><FiMoreVertical size={16} /></button>
                         <button onClick={(e) => deleteBook(e, book)} className="p-2 text-white bg-gray-900/80 hover:bg-red-600 rounded-full"><FiTrash2 size={16} /></button>
                      </div>
                  ) : null}
                </div>
              );
            })}
        </div>
      </div>
      
      {selectionMode && selectedBookIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 flex gap-4 bg-gray-900/90 backdrop-blur-md p-2 rounded-full border border-gray-700 shadow-2xl">
              <button onClick={handleBulkDeleteBooks} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold transition-transform hover:scale-105">
                  <FiTrash2 /> Delete ({selectedBookIds.length})
              </button>
              <button onClick={handleBulkEjectFiles} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full font-bold transition-transform hover:scale-105">
                  <FiFolderMinus /> Eject
              </button>
          </div>
      )}
      
      {showMoveModal && bookToMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowMoveModal(false)}>
           <div className="bg-gray-900 border border-gray-700 p-6 rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-white">Move to...</h3><button onClick={() => setShowMoveModal(false)}><FiX className="text-gray-400" /></button></div>
              <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                 <button onClick={() => { assignBooksToFolder([bookToMove.id!], null); setShowMoveModal(false); }} className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 text-gray-300 flex items-center gap-2"><FiInbox className="text-gray-500" /> Uncategorized</button>
                 {subFolders?.map(f => (<button key={f.id} onClick={() => { assignBooksToFolder([bookToMove.id!], f.id!); setShowMoveModal(false); }} className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 text-gray-300 flex items-center gap-2"><FiFolder className="text-blue-500" /> {f.name} {bookToMove.folderId === f.id && <FiCheck className="ml-auto text-green-500" />}</button>))}
              </div>
              <div className="pt-4 border-t border-gray-800">
                <input className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-white border border-gray-700 outline-none focus:border-blue-500" placeholder="Create new folder & move..." value={quickNewFolderName} onChange={(e) => setQuickNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleQuickCreateAndMove()} />
              </div>
           </div>
        </div>
      )}
    </div>
  );
};