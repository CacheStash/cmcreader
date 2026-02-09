import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComicBook, ReaderMode } from '../types';
import { parseCBZ, parsePDF } from '../services/fileUtils';
import { db } from '../db';
import { 
  FiArrowLeft, FiColumns, FiMaximize, FiArrowDown, 
  FiZoomIn, FiZoomOut, FiX, FiChevronRight, 
  FiChevronLeft, FiChevronDown 
} from 'react-icons/fi';

interface ReaderProps {
  book: ComicBook;
  onClose: () => void;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  // Tambahan Props dari App.tsx
  queue: ComicBook[];
  onJumpToBook: (book: ComicBook) => void;
}

export const Reader: React.FC<ReaderProps> = ({ 
  book, onClose, onNextChapter, onPrevChapter, 
  hasNext, hasPrev, queue, onJumpToBook 
}) => {
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(book.lastReadPage || 0);
  const [loading, setLoading] = useState(true);
  
  const [readerMode, setReaderMode] = useState<ReaderMode>(ReaderMode.SINGLE);
  const [zoom, setZoom] = useState(100);
  const [tempPageInput, setTempPageInput] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);

  // Drag Scrolling State
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  // Refs for page jumping in vertical mode
  const pageRefs = useRef<(HTMLImageElement | null)[]>([]);

  useEffect(() => {
    const loadBook = async () => {
      setLoading(true);
      setPages([]); 
      setCurrentPage(book.lastReadPage || 0); 
      try {
        let extractedPages: string[] = [];
        if (book.format === 'cbz') extractedPages = await parseCBZ(book.fileHandle!);
        else if (book.format === 'pdf') extractedPages = await parsePDF(book.fileHandle!);
        setPages(extractedPages);
      } catch (err) { console.error(err); } 
      finally { setLoading(false); }
    };
    if (book.fileHandle) loadBook();
  }, [book]);

  useEffect(() => { if (book.id) db.comics.update(book.id, { lastReadPage: currentPage }); }, [currentPage, book.id]);

  // Sync Current Page while scrolling (Vertical Mode)
  useEffect(() => {
    if (readerMode !== ReaderMode.VERTICAL || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-index'));
            setCurrentPage(index);
          }
        });
      },
      { threshold: 0.5 }
    );

    pageRefs.current.forEach((img) => {
      if (img) observer.observe(img);
    });

    return () => observer.disconnect();
  }, [pages, readerMode, loading]);

  // Navigation Logic
  const nextPage = useCallback(() => {
    if (readerMode === ReaderMode.VERTICAL) return;
    
    const increment = readerMode === ReaderMode.DOUBLE ? 2 : 1;
    
    if (currentPage + increment >= pages.length) {
       if (hasNext) onNextChapter?.();
    } else {
       setCurrentPage(p => p + increment);
    }
  }, [pages.length, readerMode, currentPage, hasNext, onNextChapter]);

  const prevPage = useCallback(() => {
    if (readerMode === ReaderMode.VERTICAL) return;

    const decrement = readerMode === ReaderMode.DOUBLE && currentPage > 1 ? 2 : 1;
    
    if (currentPage === 0) {
        if (hasPrev) onPrevChapter?.();
    } else {
        setCurrentPage(p => Math.max(p - decrement, 0));
    }
  }, [currentPage, readerMode, hasPrev, onPrevChapter]);

  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(tempPageInput);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pages.length) {
        const targetIndex = pageNum - 1;
        
        if (readerMode === ReaderMode.VERTICAL) {
            pageRefs.current[targetIndex]?.scrollIntoView({ behavior: 'smooth' });
            setCurrentPage(targetIndex);
        } else {
            setCurrentPage(targetIndex);
        }
    }
    setTempPageInput("");
  };

  // Drag Handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (readerMode !== ReaderMode.VERTICAL) return;
    setIsDragging(true);
    setStartY(e.pageY - (containerRef.current?.offsetTop || 0));
    setScrollTop(containerRef.current?.scrollTop || 0);
  };

  const onMouseLeave = () => setIsDragging(false);
  const onMouseUp = () => setIsDragging(false);

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || readerMode !== ReaderMode.VERTICAL) return;
    e.preventDefault();
    const y = e.pageY - (containerRef.current?.offsetTop || 0);
    const walk = (y - startY) * 1.5;
    if (containerRef.current) {
        containerRef.current.scrollTop = scrollTop - walk;
    }
  };

  const adjustZoom = (delta: number) => setZoom(prev => Math.max(50, Math.min(300, prev + delta)));
  
  const getVisiblePages = () => {
    if (readerMode === ReaderMode.SINGLE || currentPage === 0) return [currentPage];
    const secondPage = currentPage + 1 < pages.length ? currentPage + 1 : null;
    return secondPage ? [currentPage, secondPage] : [currentPage];
  };

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-black text-white">Loading...</div>;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <button 
        onClick={onClose} 
        className="absolute top-4 right-4 z-50 p-3 bg-black/50 hover:bg-red-600/80 text-white rounded-full transition-colors backdrop-blur-sm"
        title="Exit Reader"
      >
        <FiX size={24} />
      </button>

      <motion.div 
        animate={{ y: controlsVisible ? 0 : -100 }}
        className="absolute top-0 w-full h-16 bg-black/90 flex items-center justify-between px-4 z-30 border-b border-white/5"
      >
        <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-2 text-white hover:bg-gray-800 rounded-full transition-colors" title="Back to Library">
                <FiArrowLeft size={20} />
            </button>

            {/* Dropdown Chapter List */}
            <div className="relative group flex items-center bg-gray-800/40 border border-white/10 rounded-lg hover:border-blue-500/50 transition-all ml-1">
                <select 
                    value={book.id}
                    onChange={(e) => {
                        const targetId = Number(e.target.value);
                        const selected = queue.find(b => b.id === targetId);
                        if (selected) onJumpToBook(selected);
                    }}
                    className="appearance-none bg-transparent text-xs md:text-sm font-medium text-blue-400 pl-3 pr-9 py-1.5 cursor-pointer outline-none max-w-[150px] md:max-w-[300px] truncate"
                >
                    {queue.map((item, index) => (
                        <option key={item.id} value={item.id} className="bg-gray-900 text-white">
                            {index + 1}. {item.title}
                        </option>
                    ))}
                </select>
                <div className="absolute right-2.5 pointer-events-none text-gray-500 group-hover:text-blue-400 transition-colors">
                    <FiChevronDown size={14} />
                </div>
            </div>
        </div>

        <div className="flex gap-2 md:gap-4 items-center mr-12">
            <div className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1 border border-white/5">
                <button onClick={() => adjustZoom(-10)} className="text-white hover:text-blue-400 transition-colors"><FiZoomOut /></button>
                <span className="text-[10px] md:text-xs text-white w-8 text-center font-mono">{zoom}%</span>
                <button onClick={() => adjustZoom(10)} className="text-white hover:text-blue-400 transition-colors"><FiZoomIn /></button>
            </div>
            <div className="flex items-center bg-gray-800 rounded p-1 border border-white/5">
                <button onClick={() => setReaderMode(ReaderMode.SINGLE)} className={`p-1.5 rounded ${readerMode === ReaderMode.SINGLE ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`} title="Single Page"><FiMaximize size={18} /></button>
                <button onClick={() => setReaderMode(ReaderMode.DOUBLE)} className={`p-1.5 rounded ${readerMode === ReaderMode.DOUBLE ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`} title="Double Page"><FiColumns size={18} /></button>
                <button onClick={() => setReaderMode(ReaderMode.VERTICAL)} className={`p-1.5 rounded ${readerMode === ReaderMode.VERTICAL ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`} title="Vertical Scroll"><FiArrowDown size={18} /></button>
            </div>
        </div>
      </motion.div>

      <div 
        ref={containerRef}
        className={`flex-1 w-full relative overflow-hidden ${readerMode === ReaderMode.VERTICAL ? 'overflow-y-auto cursor-grab active:cursor-grabbing' : 'flex items-center justify-center'}`}
        onClick={() => !isDragging && setControlsVisible(!controlsVisible)}
        onMouseDown={onMouseDown}
        onMouseLeave={onMouseLeave}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
      >
        {readerMode === ReaderMode.VERTICAL ? (
          <div className="flex flex-col items-center w-full min-h-screen py-20 gap-2">
            {pages.map((src, idx) => (
              <img 
                key={idx} 
                ref={el => { pageRefs.current[idx] = el; }} 
                data-index={idx}
                src={src} 
                alt={`Page ${idx}`} 
                style={{ width: `${zoom}%`, maxWidth: 'none' }} 
                className="shadow-xl select-none"
                draggable={false}
              />
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={currentPage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-1 w-full h-full p-2">
              {getVisiblePages().map(idx => (
                <img key={idx} src={pages[idx]} className="max-h-full max-w-full object-contain shadow-2xl transition-transform duration-200" style={{ transform: `scale(${zoom / 100})` }} alt="Page" />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <div className="absolute bottom-20 w-full px-4 flex justify-between pointer-events-none z-40">
         {hasPrev && (
             <button 
                onClick={(e) => { e.stopPropagation(); onPrevChapter?.(); }} 
                className="pointer-events-auto flex items-center gap-2 px-4 py-3 bg-black/40 hover:bg-blue-600 backdrop-blur-md text-white rounded-full border border-white/10 transition-all group shadow-2xl"
             >
                <FiChevronLeft className="group-hover:-translate-x-1 transition-transform" /> Prev Chapter
             </button>
         )}
         <div className="flex-1"></div>
         {hasNext && (
             <button 
                onClick={(e) => { e.stopPropagation(); onNextChapter?.(); }} 
                className="pointer-events-auto flex items-center gap-2 px-4 py-3 bg-black/40 hover:bg-blue-600 backdrop-blur-md text-white rounded-full border border-white/10 transition-all group shadow-2xl"
             >
                Next Chapter <FiChevronRight className="group-hover:translate-x-1 transition-transform" />
             </button>
         )}
      </div>

      <motion.div 
        animate={{ y: controlsVisible ? 0 : 100 }}
        className="absolute bottom-0 w-full h-16 bg-black/90 flex items-center justify-center px-6 z-30 gap-4 border-t border-white/5"
      >
        <form onSubmit={handlePageJump} className="flex items-center gap-2">
          <input type="number" className="w-12 bg-gray-800 text-white text-center rounded border border-white/10 focus:border-blue-500 outline-none text-sm py-1" value={tempPageInput || currentPage + 1} onChange={(e) => setTempPageInput(e.target.value)} onFocus={() => setTempPageInput("")} />
          <span className="text-gray-400 text-sm font-mono">/ {pages.length}</span>
        </form>
        {readerMode !== ReaderMode.VERTICAL && (
            <input type="range" min={0} max={pages.length - 1} value={currentPage} onChange={(e) => setCurrentPage(parseInt(e.target.value))} className="w-64 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
        )}
      </motion.div>

      {readerMode !== ReaderMode.VERTICAL && (
        <>
            <div className="absolute inset-y-0 left-0 w-[15%] z-20 cursor-pointer" onClick={(e) => { e.stopPropagation(); prevPage(); }} />
            <div className="absolute inset-y-0 right-0 w-[15%] z-20 cursor-pointer" onClick={(e) => { e.stopPropagation(); nextPage(); }} />
        </>
      )}
    </div>
  );
};