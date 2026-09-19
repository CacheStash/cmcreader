import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { extractCover, getFileExtension } from '../services/fileUtils';
import { ComicBook, Folder, AppSettings } from '../types';
import { Button } from './Button';
import { 
  FiPlus, FiBookOpen, FiTrash2, FiFileText, 
  FiFolder, FiMenu, FiX, FiRefreshCw, FiLock, FiGrid, FiList, 
  FiMoreVertical, FiCheck, FiLayers, FiCheckSquare, FiSquare, 
  FiInbox, FiSearch, FiCheckCircle, FiEye, FiCornerUpLeft, 
  FiChevronRight, FiFolderPlus, FiFolderMinus, FiHardDrive, 
  FiExternalLink, FiKey, FiLogOut
} from 'react-icons/fi';

const UNCATEGORIZED_VIEW_ID = -1;

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

interface LibraryProps {
  onSelectBook: (book: ComicBook, currentList: ComicBook[]) => void;
  onLockApp: () => void;
  pinEnabled: boolean;
  onOpenPinSettings: () => void;
  onLogout?: () => void;
  currentFolderId?: number | null;
  onFolderChange?: (folderId: number | null) => void;
}

// Cover image component supporting both disk cache URL and legacy Blob
const CoverImage: React.FC<{ 
  coverUrl?: string; 
  blob?: Blob; 
  title: string; 
  small?: boolean; 
}> = ({ coverUrl, blob, title, small = false }) => {
  const [url, setUrl] = useState<string>(coverUrl || '');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    if (coverUrl && !coverUrl.startsWith('blob:')) {
      setUrl(coverUrl);
    } else if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    } else {
      setUrl('');
    }
  }, [coverUrl, blob]);

  if (!url || hasError) {
    return (
      <div className={'flex flex-col items-center justify-center text-gray-700 bg-gray-950 border border-gray-800 ' + (small ? 'w-full h-full' : 'w-full h-full p-4')}>
        <FiRefreshCw className={(small ? 'text-xs' : 'text-3xl') + ' mb-1 opacity-40 animate-spin text-blue-500'} />
        {!small && <span className="text-[10px] opacity-40 uppercase tracking-widest text-gray-400">Loading...</span>}
      </div>
    );
  }
  return (
    <img 
      src={url} 
      alt={title} 
      onError={() => setHasError(true)} 
      className="w-full h-full object-cover transition-opacity duration-300" 
    />
  );
};

export const Library: React.FC<LibraryProps> = ({ 
  onSelectBook, 
  onLockApp, 
  pinEnabled, 
  onOpenPinSettings,
  onLogout,
  currentFolderId = null,
  onFolderChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // --- SCANNING & SETTINGS STATE ---
  const [rootFolder, setRootFolder] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // --- UI STATE ---
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showListThumbnails, setShowListThumbnails] = useState(true);

  // --- PAGINATION STATE ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(18);

  // --- FOLDER & SELECTION STATE ---
  const [activeFolderId, setActiveFolderIdState] = useState<number | null>(currentFolderId ?? null);
  
  const setActiveFolderId = useCallback((folderIdOrFn: number | null | ((prev: number | null) => number | null)) => {
    setActiveFolderIdState(prev => {
      const next = typeof folderIdOrFn === 'function' ? folderIdOrFn(prev) : folderIdOrFn;
      if (onFolderChange) {
        onFolderChange(next);
      }
      return next;
    });
  }, [onFolderChange]);

  useEffect(() => {
    if (currentFolderId !== undefined && currentFolderId !== activeFolderId) {
      setActiveFolderIdState(currentFolderId);
    }
  }, [currentFolderId]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);
  
  // Reset to page 1 whenever active folder or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFolderId, searchQuery]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<number[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<number[]>([]); 
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);

  // --- CONTEXT MENU STATE ---
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, folderId: number } | null>(null);

  // --- MOVE BOOK MODAL ---
  const [bookToMove, setBookToMove] = useState<ComicBook | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);

  // --- COVER PROCESSING QUEUE ---
  const [coverQueue, setCoverQueue] = useState<number[]>([]);

  // Load root folder from settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      if (window.electronAPI) {
        try {
          const settings = await window.electronAPI.getSettings();
          if (settings && settings.rootFolder) {
            setRootFolder(settings.rootFolder);
            // Auto scan if library is empty
            const count = await db.comics.count();
            if (count === 0) {
              triggerScan(settings.rootFolder);
            }
          }
        } catch (err) {
          console.error('Failed to load settings:', err);
        }
      }
    };
    loadSettings();
  }, []);

  // --- FOLDER SCANNER FUNCTION ---
  const triggerScan = useCallback(async (folderPathToScan?: string) => {
    const targetPath = folderPathToScan || rootFolder;
    if (!targetPath || !window.electronAPI) return;

    setIsScanning(true);
    setScanStatus('Scanning folder: ' + targetPath);

    try {
      const scannedComics = await window.electronAPI.scanFolder(targetPath);
      setScanStatus('Found ' + scannedComics.length + ' comics. Syncing database...');

      // 1. Gather all existing folders & build map by "parentId:name.toLowerCase()"
      const allFolders = await db.folders.toArray();
      const folderMap = new Map<string, number>(); // key: `${parentId ?? 'root'}:${name.toLowerCase()}`
      allFolders.forEach(f => {
        const pKey = `${f.parentId ?? 'root'}:${f.name.toLowerCase()}`;
        folderMap.set(pKey, f.id!);
      });

      // Helper to find or create folder in hierarchy
      const getOrCreateFolder = async (folderName: string, parentId?: number): Promise<number> => {
        const key = `${parentId ?? 'root'}:${folderName.toLowerCase()}`;
        if (folderMap.has(key)) {
          return folderMap.get(key)!;
        }
        const newFid = await db.folders.add({ name: folderName, parentId });
        folderMap.set(key, newFid);
        return newFid;
      };

      // 2. Map existing comics by filePath
      const existingComics = await db.comics.toArray();
      const existingPathMap = new Map<string, ComicBook>();
      existingComics.forEach(c => {
        if (c.filePath) existingPathMap.set(c.filePath.toLowerCase(), c);
      });

      const newBooksToQueueCovers: number[] = [];

      for (const item of scannedComics) {
        let assignedFolderId: number | undefined = undefined;

        // Auto-create full folder hierarchy if item is in subfolder(s)
        if (item.folderPathParts && item.folderPathParts.length > 0) {
          let currentParentId: number | undefined = undefined;
          for (const segment of item.folderPathParts) {
            currentParentId = await getOrCreateFolder(segment, currentParentId);
          }
          assignedFolderId = currentParentId;
        } else if (item.folderName) {
          // Fallback if folderPathParts is absent
          assignedFolderId = await getOrCreateFolder(item.folderName, undefined);
        }

        const existing = existingPathMap.get(item.filePath.toLowerCase());
        if (existing) {
          // Update folder or format if needed
          if (existing.folderId !== assignedFolderId) {
            await db.comics.update(existing.id!, { folderId: assignedFolderId });
          }
          if (!existing.coverUrl && !existing.coverBlob) {
            newBooksToQueueCovers.push(existing.id!);
          }
        } else {
          // Insert new comic
          const newId = await db.comics.add({
            title: item.title,
            filePath: item.filePath,
            format: item.format,
            fileSize: item.fileSize,
            folderId: assignedFolderId,
            dateAdded: Date.now(),
            totalPages: 0,
            lastReadPage: 0
          });
          newBooksToQueueCovers.push(newId);
        }
      }

      setScanStatus('Scan complete (' + scannedComics.length + ' comics found)');
    } catch (err) {
      console.error('Scan folder error:', err);
      setScanStatus('Error during scan: ' + (err as any)?.message);
    } finally {
      setIsScanning(false);
      setTimeout(() => setScanStatus(''), 4000);
    }
  }, [rootFolder]);

  // Select new Root Folder dialog
  const handleSelectRootFolder = async () => {
    if (!window.electronAPI) return;
    try {
      const selected = await window.electronAPI.selectFolder();
      if (selected) {
        setRootFolder(selected);
        const currentSettings = await window.electronAPI.getSettings();
        await window.electronAPI.saveSettings({
          ...currentSettings,
          rootFolder: selected
        });
        await triggerScan(selected);
      }
    } catch (err) {
      console.error('Failed to select root folder:', err);
    }
  };

  // --- QUERY DATA ---
  const currentFolder = useLiveQuery(async () => {
    if (activeFolderId && activeFolderId !== UNCATEGORIZED_VIEW_ID) {
      return db.folders.get(activeFolderId);
    }
    return null;
  }, [activeFolderId]);

  // Breadcrumbs trail
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

  // Subfolders in current view
  const subFolders = useLiveQuery(async () => {
    const all = await db.folders.toArray();
    return all.filter(f => {
      if (activeFolderId === null || activeFolderId === UNCATEGORIZED_VIEW_ID) return !f.parentId; 
      return f.parentId === activeFolderId;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeFolderId]);

  // Comics in current view with search filter
  const comics = useLiveQuery(async () => {
    let collection = db.comics.orderBy('title'); 
    let all = await collection.toArray();

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      all = all.filter(c => c.title.toLowerCase().includes(query));
    }

    if (activeFolderId === null) return all;
    else if (activeFolderId === UNCATEGORIZED_VIEW_ID) return all.filter(c => !c.folderId);
    else return all.filter(c => c.folderId === activeFolderId);
  }, [activeFolderId, searchQuery]);

  // --- PAGINATION COMPUTATION ---
  const totalComics = comics?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalComics / itemsPerPage));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedComics = useMemo(() => {
    if (!comics) return [];
    const start = (safeCurrentPage - 1) * itemsPerPage;
    return comics.slice(start, start + itemsPerPage);
  }, [comics, safeCurrentPage, itemsPerPage]);

  // --- COVER GENERATION BACKGROUND WORKER ---
  useEffect(() => {
    if (coverQueue.length === 0) return;
    const bookId = coverQueue[0];

    const generateCover = async () => {
      try {
        const book = await db.comics.get(bookId);
        if (book && (!book.coverUrl || book.coverUrl.startsWith('blob:')) && !book.coverBlob) {
          const coverUrl = await extractCover(book);
          if (coverUrl) {
            await db.comics.update(bookId, { coverUrl });
          }
        }
      } catch (e) {
        console.error('Error generating cover for book ' + bookId + ':', e);
      } finally {
        setCoverQueue(prev => prev.slice(1));
      }
    };

    generateCover();
  }, [coverQueue]);

  // --- PRIORITIZED COVER LOADING & BACKGROUND PRE-CACHING ---
  // 1. Prioritize visible comics on the current page (Page 1 first, items 1 to 18)
  // 2. Automatically switch priority immediately when opening subfolders
  // 3. Continue caching all remaining comics in the background so future visits are 0ms instant
  useEffect(() => {
    if (!comics || comics.length === 0) return;

    let isMounted = true;

    const updateQueue = async () => {
      // 1. Top Priority: Visible comics on the current page (items 1 to 18)
      const priorityIds: number[] = [];
      const prioritySet = new Set<number>();
      
      for (const c of paginatedComics) {
        if (c.id && (!c.coverUrl || c.coverUrl.startsWith('blob:')) && !c.coverBlob) {
          priorityIds.push(c.id);
          prioritySet.add(c.id);
        }
      }

      // 2. Secondary Priority: Remaining comics in the current active folder (Page 2, 3, etc.)
      const remainingFolderIds: number[] = [];
      for (const c of comics) {
        if (c.id && (!c.coverUrl || c.coverUrl.startsWith('blob:')) && !c.coverBlob && !prioritySet.has(c.id)) {
          remainingFolderIds.push(c.id);
          prioritySet.add(c.id);
        }
      }

      // 3. Background: Any remaining uncached comics across the entire library
      let remainingOtherIds: number[] = [];
      try {
        const allBooks = await db.comics.toArray();
        for (const c of allBooks) {
          if (c.id && (!c.coverUrl || c.coverUrl.startsWith('blob:')) && !c.coverBlob && !prioritySet.has(c.id)) {
            remainingOtherIds.push(c.id);
            prioritySet.add(c.id);
          }
        }
      } catch (err) {
        console.error('Error querying remaining comics for queue:', err);
      }

      if (isMounted) {
        const fullQueue = [...priorityIds, ...remainingFolderIds, ...remainingOtherIds];
        setCoverQueue(fullQueue);
      }
    };

    updateQueue();

    return () => {
      isMounted = false;
    };
  }, [activeFolderId, safeCurrentPage, searchQuery, itemsPerPage, comics?.length]);

  // Navigation
  const navigateToFolder = (folderId: number | null) => {
    setActiveFolderId(folderId);
    setSelectedFolderIds([]); 
  };

  const navigateUp = async () => {
    if (!currentFolder) { navigateToFolder(null); return; }
    const parentId = currentFolder.parentId || null;
    setActiveFolderId(parentId);
  };

  const assignBooksToFolder = async (bookIds: number[], folderId: number | null) => {
    if (bookIds.length === 0) return;
    for (const id of bookIds) {
      const updateData: any = folderId === null ? { folderId: undefined } : { folderId };
      await db.comics.update(id, updateData);
    }
    setSelectedBookIds([]);
  };

  // Folder actions
  const addFolder = async (customName?: string, parentIdOverride?: number) => {
    const name = customName || newFolderName;
    if (!name.trim()) return { id: undefined };
    let parentToUse = (activeFolderId && activeFolderId !== UNCATEGORIZED_VIEW_ID) ? activeFolderId : undefined;
    if (parentIdOverride !== undefined) parentToUse = parentIdOverride;
    const id = await db.folders.add({ name, parentId: parentToUse });
    setNewFolderName('');
    setShowFolderInput(false);
    setContextMenu(null);
    return { id };
  };

  const deleteFolderRecursive = async (folderId: number) => {
    const books = await db.comics.where('folderId').equals(folderId).toArray();
    const bookIds = books.map(b => b.id!);
    if (bookIds.length > 0) await db.comics.bulkDelete(bookIds);

    const sub = await db.folders.where('parentId').equals(folderId).toArray();
    for (const s of sub) await deleteFolderRecursive(s.id!);

    await db.folders.delete(folderId);
  };

  const deleteFolder = async (folderId: number) => {
    if (confirm('Delete folder and remove its comics from library?')) {
      await deleteFolderRecursive(folderId);
      if (activeFolderId === folderId) setActiveFolderId(null);
    }
  };

  const handleBulkDeleteFolders = async () => {
    if (!confirm('Remove ' + selectedFolderIds.length + ' folders and their comics from library?')) return;
    setIsProcessing(true);
    try {
      for (const fId of selectedFolderIds) {
        await deleteFolderRecursive(fId);
      }
      setSelectedFolderIds([]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDeleteBooks = async () => {
    if (!confirm('Remove ' + selectedBookIds.length + ' selected comics from library?')) return;
    setIsProcessing(true);
    try {
      await db.comics.bulkDelete(selectedBookIds);
      setSelectedBookIds([]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkEjectFiles = async () => {
    if (!confirm('Remove ' + selectedBookIds.length + ' comics from folder into Uncategorized?')) return;
    await assignBooksToFolder(selectedBookIds, null);
  };

  const handleFactoryReset = async () => {
    const confirmation = prompt("DANGER: Type 'DELETE' to clear all library data and reset folders. (Physical comic files on disk will NOT be touched).");
    if (confirmation !== 'DELETE') return;
    
    setIsProcessing(true);
    try {
      await db.comics.clear();
      await db.folders.clear();
      setActiveFolderId(null);
      alert('Library has been reset.');
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual File Drag & Drop handler
  const processFiles = async (files: FileList | File[]) => {
    setIsProcessing(true);
    try {
      const newBookIds: number[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = getFileExtension(file.name);
        if (['cbz', 'cbr', 'pdf'].includes(ext)) {
          const title = file.name.replace(/\.(cbz|cbr|pdf)$/i, '');
          const targetFolder = (activeFolderId && activeFolderId !== UNCATEGORIZED_VIEW_ID) ? activeFolderId : undefined;
          
          // In Electron, File objects have a .path property
          const filePath = (file as any).path || undefined;

          const newId = await db.comics.add({
            title,
            fileHandle: filePath ? undefined : file,
            filePath,
            format: ext as any,
            totalPages: 0,
            lastReadPage: 0,
            dateAdded: Date.now(),
            folderId: targetFolder
          });
          newBookIds.push(newId);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Selection Logic
  const toggleSelection = (id: number) => {
    setSelectedBookIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setLastSelectedId(id);
  };

  const toggleFolderSelection = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedFolderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (!comics || comics.length === 0) return;
    const allIds = comics.map(c => c.id!);
    const isAllSelected = allIds.every(id => selectedBookIds.includes(id));
    if (isAllSelected) {
      setSelectedBookIds([]);
      setSelectedFolderIds([]);
      setSelectionMode(false);
      setLastSelectedId(null);
    } else {
      setSelectedBookIds(allIds);
      setSelectionMode(true);
    }
  };

  const handleCardClick = (e: React.MouseEvent, book: ComicBook) => {
    if (e.shiftKey && lastSelectedId !== null && comics) {
      e.preventDefault();
      e.stopPropagation();
      const lastIndex = comics.findIndex(c => c.id === lastSelectedId);
      const currentIndex = comics.findIndex(c => c.id === book.id);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = comics.slice(start, end + 1).map(c => c.id!);
        setSelectedBookIds(prev => Array.from(new Set([...prev, ...rangeIds])));
        setSelectionMode(true);
      }
      return;
    }
    if (selectionMode || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (!selectionMode) setSelectionMode(true);
      toggleSelection(book.id!);
    } else {
      onSelectBook(book, comics || []);
    }
  };

  const handleOpenInExplorer = (e: React.MouseEvent, book: ComicBook) => {
    e.stopPropagation();
    if (window.electronAPI && book.filePath) {
      window.electronAPI.openPathInExplorer(book.filePath);
    }
  };

  const deleteBook = async (e: React.MouseEvent, book: ComicBook) => {
    e.stopPropagation();
    if (confirm('Remove "' + book.title + '" from your library?')) {
      if (book.id) await db.comics.delete(book.id);
    }
  };

  return (
    <div 
      className={'min-h-screen flex relative transition-colors duration-200 ' + (dragActive ? 'bg-blue-900/20' : 'bg-gray-900')}
      onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { 
        e.preventDefault(); 
        setDragActive(false); 
        if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files); 
      }}
      onClick={() => setContextMenu(null)}
    >
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* SIDEBAR */}
      <aside className={'fixed md:sticky top-0 h-screen w-64 bg-black/90 border-r border-gray-800 z-40 transform transition-transform duration-300 flex flex-col ' + (isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            <h2 className="font-bold text-gray-200 uppercase text-xs tracking-wider">ZenReader</h2>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400"><FiX /></button>
        </div>

        {/* ROOT FOLDER SELECTION BUTTON */}
        <div className="p-3 border-b border-gray-800/80 bg-gray-950/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <FiHardDrive className="text-blue-400" /> Root Folder
            </span>
            {rootFolder && (
              <button 
                onClick={() => triggerScan()} 
                disabled={isScanning}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                title="Rescan root folder for new comics"
              >
                <FiRefreshCw className={isScanning ? 'animate-spin' : ''} /> Rescan
              </button>
            )}
          </div>

          <div 
            onClick={handleSelectRootFolder}
            className="group cursor-pointer bg-gray-900 hover:bg-gray-800 border border-gray-700/70 hover:border-blue-500 rounded-lg p-2.5 transition-all"
            title={rootFolder || 'Click to choose default comic folder'}
          >
            {rootFolder ? (
              <div className="flex items-center gap-2">
                <FiCheckCircle className="text-green-400 text-lg flex-shrink-0" />
                <div className="truncate text-xs">
                  <p className="text-gray-200 font-medium truncate">{rootFolder.split(/[\\/]/).pop() || rootFolder}</p>
                  <p className="text-[10px] text-gray-500 font-mono truncate">{rootFolder}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-1 text-xs text-blue-400 group-hover:text-blue-300">
                <FiPlus /> Set Comic Folder
              </div>
            )}
          </div>
        </div>

        {/* FOLDER NAVIGATION LIST */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button 
            onClick={() => navigateToFolder(null)} 
            className={'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ' + (activeFolderId === null ? 'bg-blue-600 text-white font-medium' : 'text-gray-400 hover:bg-gray-800')}
          >
            <FiBookOpen /> All Comics
          </button>
          
          <button 
            onClick={() => navigateToFolder(UNCATEGORIZED_VIEW_ID)} 
            className={'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ' + (activeFolderId === UNCATEGORIZED_VIEW_ID ? 'bg-blue-600 text-white font-medium' : 'text-gray-400 hover:bg-gray-800')}
          >
            <FiInbox /> Uncategorized
          </button>
          
          <div className="mt-4 mb-2 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center">
            <span>Subfolders</span>
            {activeFolderId && <button onClick={navigateUp} title="Go Up" className="hover:text-white"><FiCornerUpLeft /></button>}
          </div>
          
          {subFolders?.map(folder => {
            const isFolderSelected = selectedFolderIds.includes(folder.id!);
            return (
              <div 
                key={folder.id} 
                className={'group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ' + (activeFolderId === folder.id ? 'bg-blue-600/20 text-blue-400' : isFolderSelected ? 'bg-blue-900/30' : 'text-gray-400 hover:bg-gray-800')} 
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, folderId: folder.id! }); }}
                onClick={() => !selectionMode && navigateToFolder(folder.id!)}
              >
                <div className="flex items-center gap-3 flex-1 text-left truncate cursor-pointer">
                  {selectionMode ? (
                    <div onClick={(e) => toggleFolderSelection(e, folder.id!)}>
                      {isFolderSelected ? <FiCheckSquare className="text-blue-500" /> : <FiSquare />}
                    </div>
                  ) : (
                    <FiFolder className="text-blue-400" />
                  )}
                  <span className="truncate">{folder.name}</span>
                </div>
              </div>
            );
          })}

          <div className="pt-2 border-t border-gray-800 mt-2 space-y-1">
            {showFolderInput ? (
              <div className="px-3">
                <input 
                  autoFocus 
                  className="w-full bg-gray-800 rounded px-2 py-1 text-sm text-white border border-blue-500 outline-none" 
                  value={newFolderName} 
                  onChange={(e) => setNewFolderName(e.target.value)} 
                  onBlur={() => !newFolderName && setShowFolderInput(false)} 
                  onKeyDown={(e) => e.key === 'Enter' && addFolder()} 
                  placeholder={activeFolderId ? 'Sub-folder name...' : 'Folder name...'} 
                />
              </div>
            ) : (
              <button 
                onClick={() => setShowFolderInput(true)} 
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-white transition-colors"
              >
                <FiPlus /> {activeFolderId ? 'New Sub-Folder' : 'New Folder'}
              </button>
            )}
          </div>
        </div>

        {/* BULK FOLDER CONTROLS */}
        {selectionMode && selectedFolderIds.length > 0 && (
          <div className="px-3 pb-2 flex flex-col gap-1">
            <Button onClick={handleBulkDeleteFolders} className="w-full justify-center !bg-red-600 hover:!bg-red-500 text-white text-xs py-2">
              <span className="flex items-center gap-2"><FiTrash2 /> Delete Folders</span>
            </Button>
          </div>
        )}

        {/* BOTTOM SIDEBAR FOOTER (PIN LOCK & FACTORY RESET) */}
        <div className="p-3 border-t border-gray-800 bg-gray-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenPinSettings}
              className={'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors border ' + (pinEnabled ? 'bg-blue-900/30 border-blue-500/50 text-blue-400 hover:bg-blue-900/50' : 'bg-gray-800/80 border-gray-700 text-gray-400 hover:text-white')}
              title={pinEnabled ? 'PIN Lock Enabled (Click to change/disable)' : 'Click to setup 0-9 PIN Lock'}
            >
              <FiLock className={pinEnabled ? 'text-blue-400' : ''} />
              <span>{pinEnabled ? 'PIN Active' : 'Set PIN'}</span>
            </button>

            {pinEnabled && (
              <button
                onClick={onLockApp}
                className="p-1.5 rounded text-gray-400 hover:text-yellow-400 hover:bg-gray-800 transition-colors"
                title="Lock Application Now"
              >
                <FiKey size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {onLogout && (
              <button 
                onClick={onLogout} 
                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors" 
                title="Log Out of ZenReader Web"
              >
                <FiLogOut size={16} />
              </button>
            )}

            <button 
              onClick={handleFactoryReset} 
              className="p-1.5 text-gray-600 hover:text-red-400 transition-colors" 
              title="Reset Library Cache"
            >
              <FiTrash2 size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* CONTEXT MENU */}
      {contextMenu && (
        <div 
          className="fixed bg-gray-800 border border-gray-700 rounded shadow-xl z-50 py-1 w-48" 
          style={{ top: contextMenu.y, left: contextMenu.x }} 
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center gap-2" 
            onClick={() => { const name = prompt('Name for sub-folder:'); if (name) addFolder(name, contextMenu.folderId); }}
          >
            <FiPlus /> Add Sub-folder
          </button>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2" 
            onClick={() => { deleteFolder(contextMenu.folderId); setContextMenu(null); }}
          >
            <FiTrash2 /> Delete
          </button>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 p-6 pb-24 relative z-10 w-full overflow-hidden">
        {/* HEADER BAR */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 sticky top-0 z-20 bg-gray-900/90 backdrop-blur-md py-4 gap-4 border-b border-gray-800/50">
          <div className="flex items-center gap-4 w-full md:w-auto overflow-hidden">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-2xl text-white"><FiMenu /></button>
            <div className="flex items-center gap-1 text-xl md:text-2xl font-bold truncate overflow-x-auto whitespace-nowrap">
              <span 
                onClick={() => navigateToFolder(null)} 
                className={'cursor-pointer hover:text-blue-400 flex-shrink-0 ' + (activeFolderId === null ? 'text-blue-500' : 'text-gray-500')}
              >
                Library
              </span>
              {breadcrumbs?.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  <FiChevronRight className="text-gray-600 text-lg flex-shrink-0" />
                  <span 
                    onClick={() => navigateToFolder(folder.id!)}
                    className={'cursor-pointer hover:text-blue-400 flex-shrink-0 ' + (index === breadcrumbs.length - 1 ? 'text-blue-500' : 'text-gray-500')}
                  >
                    {folder.name}
                  </span>
                </React.Fragment>
              ))}
              {activeFolderId === UNCATEGORIZED_VIEW_ID && (
                <>
                  <FiChevronRight className="text-gray-600 text-lg flex-shrink-0" />
                  <span className="text-blue-500 flex-shrink-0">Uncategorized</span>
                </>
              )}
            </div>

            {totalComics > 0 && (
              <span className="hidden sm:inline-flex items-center text-xs font-normal text-gray-400 bg-gray-800/80 px-2.5 py-1 rounded-full border border-gray-700/60 shrink-0">
                {totalComics} komik {totalPages > 1 && `· Hal ${safeCurrentPage}/${totalPages}`}
              </span>
            )}

            {/* Mobile Header Quick Actions */}
            <div className="flex md:hidden items-center gap-2 ml-auto shrink-0">
              <button
                onClick={onOpenPinSettings}
                className={'p-2 rounded-lg text-xs border transition-colors ' + (pinEnabled ? 'bg-blue-900/30 border-blue-500/50 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white')}
                title={pinEnabled ? 'PIN Aktif (Klik untuk ubah/nonaktifkan)' : 'Pasang Kunci PIN'}
              >
                <FiLock size={16} />
              </button>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-2 rounded-lg text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-800/60 transition-colors"
                  title="Logout"
                >
                  <FiLogOut size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                className="w-full bg-gray-800 border border-gray-700 rounded-full py-1.5 pl-9 pr-4 text-sm text-white focus:border-blue-500 outline-none transition-all" 
                placeholder="Search comic..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
              />
            </div>

            <div className="flex w-full md:w-auto gap-3 justify-end items-center">
              {coverQueue.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-blue-400" title="Generating cover thumbnails in background">
                  <FiRefreshCw className="animate-spin text-sm" />
                  <span className="font-mono">{coverQueue.length}</span>
                </div>
              )}

              <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700/60">
                <button 
                  onClick={handleSelectAll} 
                  className={'p-2 rounded flex items-center gap-1 border-r border-gray-700 mr-1 pr-3 ' + (selectedBookIds.length > 0 && selectedBookIds.length === comics?.length ? 'text-blue-400' : 'text-gray-400 hover:text-white')}
                  title="Select All"
                >
                  <FiCheckCircle />
                </button>
                <button 
                  onClick={() => { setSelectionMode(!selectionMode); setSelectedBookIds([]); setSelectedFolderIds([]); setLastSelectedId(null); }} 
                  className={'p-2 rounded flex items-center gap-1 border-r border-gray-700 mr-1 pr-3 ' + (selectionMode ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}
                  title="Toggle Multi-Select"
                >
                  <FiCheckSquare />
                </button>
                {viewMode === 'list' && (
                  <button 
                    onClick={() => setShowListThumbnails(!showListThumbnails)} 
                    className={'p-2 rounded border-r border-gray-700 mr-1 pr-3 ' + (showListThumbnails ? 'text-blue-400' : 'text-gray-400')} 
                    title="Toggle Thumbnails"
                  >
                    <FiEye />
                  </button>
                )}
                <button 
                  onClick={() => setViewMode('grid')} 
                  className={'p-2 rounded ' + (viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}
                  title="Grid View"
                >
                  <FiGrid />
                </button>
                <button 
                  onClick={() => setViewMode('list')} 
                  className={'p-2 rounded ' + (viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}
                  title="List View"
                >
                  <FiList />
                </button>
              </div>

              {/* Single File Picker Button */}
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-medium border border-gray-700"
                title="Add comic file manually"
              >
                <FiPlus /> Add File
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => e.target.files && processFiles(e.target.files)} 
                className="hidden" 
                accept=".cbz,.cbr,.pdf,application/pdf,application/vnd.comicbook+zip,application/x-cbz" 
                multiple 
              />
            </div>
          </div>
        </header>

        {/* STATUS BANNER */}
        {scanStatus && (
          <div className="mb-6 p-3 bg-blue-900/30 border border-blue-800/70 rounded-lg text-blue-200 text-sm flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <FiRefreshCw className={isScanning ? 'animate-spin' : ''} />
              <span>{scanStatus}</span>
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {(!comics || comics.length === 0) && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <FiBookOpen className="text-6xl text-gray-700 mb-4" />
            <h3 className="text-xl font-bold text-gray-300 mb-2">Your Comic Library is Empty</h3>
            <p className="text-gray-500 max-w-md text-sm mb-6">
              {rootFolder 
                ? 'No .cbz, .cbr, or .pdf files found in "' + rootFolder + '". Click Rescan or add files directly.' 
                : 'Select your default comics folder (e.g. H:\\cmc) to automatically load your collection.'}
            </p>
            <div className="flex gap-3">
              <Button onClick={handleSelectRootFolder} className="!bg-blue-600 hover:!bg-blue-500 text-white">
                <FiHardDrive className="mr-2" /> Select Root Folder
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} className="bg-gray-800 text-gray-300 hover:bg-gray-700">
                <FiPlus className="mr-2" /> Add Files
              </Button>
            </div>
          </div>
        )}

        {/* COMIC BOOKS GRID & LIST */}
        <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5' : 'flex flex-col gap-2'}>
          {paginatedComics.map((book) => {
            const isSelected = selectedBookIds.includes(book.id!);
            
            const GridCard = () => (
              <>
                <CoverImage coverUrl={book.coverUrl} blob={book.coverBlob} title={book.title} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent p-3 pt-8">
                  <h3 className="font-medium text-white truncate text-xs mb-1" title={book.title}>{book.title}</h3>
                  <div className="flex justify-between items-center text-[10px] text-gray-400">
                    <span className="uppercase bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded font-mono">{book.format}</span>
                    {book.lastReadPage ? (
                      <span className="text-blue-400">p. {book.lastReadPage + 1}</span>
                    ) : (
                      <span className="text-gray-500">Unread</span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <div className="absolute inset-0 border-4 border-blue-500 rounded-xl z-20 pointer-events-none bg-blue-500/20 flex items-center justify-center">
                    <FiCheck className="text-5xl text-white drop-shadow-lg" />
                  </div>
                )}
              </>
            );

            const ListRow = () => (
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {selectionMode && (
                  <div className={'w-5 h-5 border rounded flex items-center justify-center ' + (isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-600')}>
                    {isSelected && <FiCheck size={12} />}
                  </div>
                )}
                {showListThumbnails && (
                  <div className="w-10 h-14 bg-gray-950 rounded flex items-center justify-center text-gray-600 shrink-0 overflow-hidden border border-gray-800">
                    <CoverImage coverUrl={book.coverUrl} blob={book.coverBlob} title={book.title} small />
                  </div>
                )}
                {!showListThumbnails && (
                  <div className="w-10 h-14 bg-gray-900 rounded flex items-center justify-center text-gray-600 shrink-0 border border-gray-800">
                    {book.format === 'pdf' ? <FiFileText /> : <FiBookOpen />}
                  </div>
                )}
                <div className="flex flex-col min-w-0 flex-1">
                  <h3 className={'font-medium truncate text-sm ' + (isSelected ? 'text-blue-400' : 'text-white')} title={book.title}>
                    {book.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                    <span className="uppercase bg-gray-800 px-1.5 py-0.5 rounded text-[10px] font-mono">{book.format}</span>
                    {book.filePath && <span className="truncate text-gray-500 text-[11px] font-mono">{book.filePath}</span>}
                  </div>
                </div>
              </div>
            );

            return (
              <div 
                key={book.id}
                onClick={(e) => handleCardClick(e, book)}
                className={'group relative transition-all ' + (
                  viewMode === 'grid' 
                    ? 'aspect-[2/3] bg-gray-950 rounded-xl overflow-hidden shadow-xl border border-gray-800/80 ' + (isSelected ? 'ring-2 ring-blue-500 scale-95' : 'hover:scale-[1.02] hover:border-gray-700 cursor-pointer')
                    : 'flex items-center justify-between p-3 bg-gray-950 rounded-lg border border-gray-800/80 cursor-pointer ' + (isSelected ? 'bg-blue-900/20 border-blue-500/50' : 'hover:bg-gray-800/60')
                )}
              >
                {viewMode === 'grid' ? <GridCard /> : <ListRow />}

                {/* Card Quick Actions */}
                {!selectionMode && (
                  <div className={viewMode === 'grid' ? 'absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30' : 'flex items-center gap-1'}>
                    {book.filePath && window.electronAPI && (
                      <button 
                        onClick={(e) => handleOpenInExplorer(e, book)}
                        className="p-1.5 text-gray-300 hover:text-white bg-gray-900/90 hover:bg-blue-600 rounded-full shadow transition-colors"
                        title="Reveal in File Explorer"
                      >
                        <FiExternalLink size={14} />
                      </button>
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setBookToMove(book); setShowMoveModal(true); }} 
                      className="p-1.5 text-gray-300 hover:text-white bg-gray-900/90 hover:bg-blue-600 rounded-full shadow transition-colors"
                      title="Move to Folder"
                    >
                      <FiMoreVertical size={14} />
                    </button>
                    <button 
                      onClick={(e) => deleteBook(e, book)} 
                      className="p-1.5 text-gray-300 hover:text-white bg-gray-900/90 hover:bg-red-600 rounded-full shadow transition-colors"
                      title="Remove from Library"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* PAGINATION CONTROLS */}
        {totalComics > 0 && (
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 border-t border-gray-800/80 text-sm text-gray-400">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                Menampilkan <strong className="text-white">{((safeCurrentPage - 1) * itemsPerPage) + 1}</strong> - <strong className="text-white">{Math.min(safeCurrentPage * itemsPerPage, totalComics)}</strong> dari <strong className="text-blue-400">{totalComics}</strong> komik
              </span>
              <select
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-200 outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value={12}>12 / hal</option>
                <option value={18}>18 / hal (Default)</option>
                <option value={24}>24 / hal</option>
                <option value={36}>36 / hal</option>
                <option value={48}>48 / hal</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={safeCurrentPage <= 1}
                  className="px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none text-xs text-white transition-colors"
                  title="Halaman Pertama"
                >
                  &laquo;
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none text-xs text-white transition-colors"
                  title="Halaman Sebelumnya"
                >
                  &lsaquo; Prev
                </button>

                {getPageNumbers(safeCurrentPage, totalPages).map((p, idx) => (
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-1.5 text-gray-600 text-xs">...</span>
                  ) : (
                    <button
                      key={`page-${p}`}
                      onClick={() => setCurrentPage(Number(p))}
                      className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium transition-all ${
                        safeCurrentPage === p
                          ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30'
                          : 'bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      {p}
                    </button>
                  )
                ))}

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none text-xs text-white transition-colors"
                  title="Halaman Selanjutnya"
                >
                  Next &rsaquo;
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safeCurrentPage >= totalPages}
                  className="px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none text-xs text-white transition-colors"
                  title="Halaman Terakhir"
                >
                  &raquo;
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MULTI-SELECT FLOATING ACTION BAR */}
      {selectionMode && selectedBookIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 flex gap-4 bg-gray-900/95 backdrop-blur-md p-2 rounded-full border border-gray-700 shadow-2xl">
          <button 
            onClick={handleBulkDeleteBooks} 
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full font-medium shadow-lg transition-transform hover:scale-105 text-sm"
          >
            <FiTrash2 /> Remove ({selectedBookIds.length})
          </button>
          <button 
            onClick={handleBulkEjectFiles} 
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-full font-medium shadow-lg transition-transform hover:scale-105 text-sm"
          >
            <FiFolderMinus /> Eject
          </button>
        </div>
      )}

      {/* MOVE BOOK MODAL */}
      {showMoveModal && bookToMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowMoveModal(false)}>
          <div className="bg-gray-900 border border-gray-700 p-6 rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-white text-sm">Move "{bookToMove.title}"</h3>
              <button onClick={() => setShowMoveModal(false)}><FiX className="text-gray-400" /></button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              <button 
                onClick={() => { assignBooksToFolder([bookToMove.id!], null); setShowMoveModal(false); }} 
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 text-gray-300 flex items-center gap-2 text-sm"
              >
                <FiInbox className="text-gray-500" /> Uncategorized
              </button>
              {subFolders?.map(f => (
                <button 
                  key={f.id} 
                  onClick={() => { assignBooksToFolder([bookToMove.id!], f.id!); setShowMoveModal(false); }} 
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 text-gray-300 flex items-center gap-2 text-sm"
                >
                  <FiFolder className="text-blue-500" /> {f.name} {bookToMove.folderId === f.id && <FiCheck className="ml-auto text-green-500" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
