import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComicBook, ReaderMode } from '../types';
import { getPageList, loadSinglePage } from '../services/fileUtils';
import { db } from '../db';
import { 
  FiArrowLeft, FiColumns, FiMaximize, FiArrowDown, 
  FiZoomIn, FiZoomOut, FiX, FiChevronRight, FiChevronLeft, FiLoader 
} from 'react-icons/fi';

interface ReaderProps {
  book: ComicBook;
  onClose: () => void;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

// Individual Vertical Page component for lazy-loading on scroll
const VerticalPageItem: React.FC<{
  book: ComicBook;
  pageId: string;
  index: number;
  zoom: number;
  onVisible: (index: number) => void;
}> = ({ book, pageId, index, zoom, onVisible }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onVisible(index);
            if (!src && !loading) {
              setLoading(true);
              loadSinglePage(book, pageId)
                .then((url) => {
                  if (url) setSrc(url);
                })
                .catch((e) => console.error('Error loading page ' + pageId + ':', e))
                .finally(() => setLoading(false));
            }
          }
        });
      },
      { rootMargin: '600px 0px 600px 0px', threshold: 0.1 }
    );

    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [book, pageId, index, src, loading, onVisible]);

  return (
    <div
      ref={imgRef}
      data-index={index}
      style={{ width: zoom + '%', minHeight: '400px' }}
      className="flex items-center justify-center bg-gray-950/40 rounded shadow-xl overflow-hidden my-1 relative"
    >
      {src ? (
        <img
          src={src}
          alt={'Page ' + (index + 1)}
          className="w-full h-auto object-contain select-none"
          draggable={false}
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-gray-600 py-24 gap-2">
          <FiLoader className="animate-spin text-2xl text-blue-500" />
          <span className="text-xs tracking-wider uppercase text-gray-500">Loading page {index + 1}...</span>
        </div>
      )}
    </div>
  );
};

export const Reader: React.FC<ReaderProps> = ({ 
  book, 
  onClose, 
  onNextChapter, 
  onPrevChapter, 
  hasNext, 
  hasPrev 
}) => {
  const [pageIds, setPageIds] = useState<string[]>([]);
  const [pageCache, setPageCache] = useState<Record<number, string>>({});
  const [currentPage, setCurrentPage] = useState(book.lastReadPage || 0);
  const [loading, setLoading] = useState(true);
  
  const [readerMode, setReaderMode] = useState<ReaderMode>(ReaderMode.SINGLE);
  const [zoom, setZoom] = useState(100);
  const [tempPageInput, setTempPageInput] = useState('');
  const [controlsVisible, setControlsVisible] = useState(true);

  // Drag Scrolling State
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  // Initial load of page list
  useEffect(() => {
    let isMounted = true;
    const initPageList = async () => {
      setLoading(true);
      setPageIds([]);
      setPageCache({});
      setCurrentPage(book.lastReadPage || 0);
      try {
        const list = await getPageList(book);
        if (isMounted) {
          setPageIds(list);
          if (book.id) {
            db.comics.update(book.id, { totalPages: list.length });
          }
        }
      } catch (err) {
        console.error('Failed to get comic pages:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initPageList();
    return () => {
      isMounted = false;
    };
  }, [book]);

  // Update last read page in Dexie
  useEffect(() => {
    if (book.id) {
      db.comics.update(book.id, { lastReadPage: currentPage });
    }
  }, [currentPage, book.id]);

  // Fetch page image on demand for active and adjacent pages (Single/Double mode)
  useEffect(() => {
    if (pageIds.length === 0 || readerMode === ReaderMode.VERTICAL) return;

    const pagesToFetch = [
      currentPage,
      currentPage + 1,
      currentPage - 1,
      currentPage + 2
    ].filter(idx => idx >= 0 && idx < pageIds.length);

    pagesToFetch.forEach(async (idx) => {
      if (!pageCache[idx]) {
        try {
          const url = await loadSinglePage(book, pageIds[idx]);
          if (url) {
            setPageCache(prev => ({ ...prev, [idx]: url }));
          }
        } catch (err) {
          console.error('Failed to load page ' + idx + ':', err);
        }
      }
    });
  }, [book, currentPage, pageIds, readerMode, pageCache]);

  // Navigation Logic
  const nextPage = useCallback(() => {
    if (readerMode === ReaderMode.VERTICAL) return;
    
    const increment = readerMode === ReaderMode.DOUBLE ? 2 : 1;
    
    if (currentPage + increment >= pageIds.length) {
       if (hasNext) onNextChapter?.();
    } else {
       setCurrentPage(p => p + increment);
    }
  }, [pageIds.length, readerMode, currentPage, hasNext, onNextChapter]);

  const prevPage = useCallback(() => {
    if (readerMode === ReaderMode.VERTICAL) return;

    const decrement = readerMode === ReaderMode.DOUBLE && currentPage > 1 ? 2 : 1;
    
    if (currentPage === 0) {
        if (hasPrev) onPrevChapter?.();
    } else {
        setCurrentPage(p => Math.max(p - decrement, 0));
    }
  }, [currentPage, readerMode, hasPrev, onPrevChapter]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') nextPage();
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') prevPage();
      else if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, onClose]);

  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(tempPageInput);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pageIds.length) {
        const targetIndex = pageNum - 1;
        setCurrentPage(targetIndex);
    }
    setTempPageInput('');
  };

  // Drag Handlers for vertical mode
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
  
  const getVisiblePageIndices = () => {
    if (readerMode === ReaderMode.SINGLE || currentPage === 0) return [currentPage];
    const secondPage = currentPage + 1 < pageIds.length ? currentPage + 1 : null;
    return secondPage !== null ? [currentPage, secondPage] : [currentPage];
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white gap-3 z-50">
        <FiLoader className="text-4xl text-blue-500 animate-spin" />
        <p className="text-gray-400 text-sm font-medium">Opening {book.title}...</p>
      </div>
    );
  }

  if (pageIds.length === 0) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white gap-4 z-50 p-6 text-center">
        <h2 className="text-xl font-bold text-red-400">No Pages Found</h2>
        <p className="text-gray-400 max-w-md text-sm">
          Could not extract comic pages from this archive or PDF. Please check if the file format is supported or corrupt.
        </p>
        <button 
          onClick={onClose}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium"
        >
          Return to Library
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col select-none">
      {/* Top Exit button */}
      <button 
        onClick={onClose} 
        className="absolute top-4 right-4 z-50 p-3 bg-black/60 hover:bg-red-600/90 text-white rounded-full transition-colors backdrop-blur-md shadow-lg"
        title="Exit Reader (Esc)"
      >
        <FiX size={22} />
      </button>

      {/* Top Controls Bar */}
      <motion.div 
        animate={{ y: controlsVisible ? 0 : -100 }}
        transition={{ duration: 0.2 }}
        className="absolute top-0 w-full h-16 bg-black/90 backdrop-blur-md flex items-center justify-between px-6 z-30 border-b border-gray-800/60"
      >
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
            <FiArrowLeft size={20} />
          </button>
          <div className="truncate max-w-md">
            <h1 className="text-sm font-semibold text-white truncate">{book.title}</h1>
            <span className="text-[11px] text-gray-400 uppercase tracking-wider">{book.format}</span>
          </div>
        </div>

        <div className="flex gap-3 items-center mr-14">
          <div className="flex items-center gap-1 bg-gray-800/80 rounded-lg px-2 py-1 border border-gray-700/60">
            <button onClick={() => adjustZoom(-10)} className="text-gray-300 hover:text-white p-1"><FiZoomOut size={16} /></button>
            <span className="text-xs text-white font-mono w-10 text-center">{zoom}%</span>
            <button onClick={() => adjustZoom(10)} className="text-gray-300 hover:text-white p-1"><FiZoomIn size={16} /></button>
          </div>

          <div className="flex bg-gray-800/80 rounded-lg p-1 border border-gray-700/60">
            <button 
              onClick={() => setReaderMode(ReaderMode.SINGLE)} 
              title="Single Page"
              className={'p-1.5 rounded ' + (readerMode === ReaderMode.SINGLE ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}
            >
              <FiMaximize size={16} />
            </button>
            <button 
              onClick={() => setReaderMode(ReaderMode.DOUBLE)} 
              title="Double Page (Book View)"
              className={'p-1.5 rounded ' + (readerMode === ReaderMode.DOUBLE ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}
            >
              <FiColumns size={16} />
            </button>
            <button 
              onClick={() => setReaderMode(ReaderMode.VERTICAL)} 
              title="Webtoon / Vertical Scroll"
              className={'p-1.5 rounded ' + (readerMode === ReaderMode.VERTICAL ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}
            >
              <FiArrowDown size={16} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Reading Viewport */}
      <div 
        ref={containerRef}
        className={'flex-1 w-full relative overflow-hidden ' + (readerMode === ReaderMode.VERTICAL ? 'overflow-y-auto cursor-grab active:cursor-grabbing' : 'flex items-center justify-center')}
        onClick={() => !isDragging && setControlsVisible(!controlsVisible)}
        onMouseDown={onMouseDown}
        onMouseLeave={onMouseLeave}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
      >
        {readerMode === ReaderMode.VERTICAL ? (
          <div className="flex flex-col items-center w-full min-h-screen py-20 px-2 gap-2">
            {pageIds.map((pageId, idx) => (
              <VerticalPageItem
                key={pageId}
                book={book}
                pageId={pageId}
                index={idx}
                zoom={zoom}
                onVisible={setCurrentPage}
              />
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div 
              key={currentPage} 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center gap-3 w-full h-full p-4 select-none"
            >
              {getVisiblePageIndices().map((idx) => {
                const pageSrc = pageCache[idx];
                return (
                  <div key={idx} className="flex items-center justify-center max-h-full max-w-full">
                    {pageSrc ? (
                      <img 
                        src={pageSrc} 
                        className="max-h-[92vh] max-w-full object-contain shadow-2xl rounded" 
                        style={{ transform: 'scale(' + (zoom / 100) + ')' }} 
                        alt={'Page ' + (idx + 1)} 
                        draggable={false}
                      />
                    ) : (
                      <div className="w-80 h-96 flex flex-col items-center justify-center bg-gray-900 rounded-lg text-gray-500 gap-2">
                        <FiLoader className="animate-spin text-2xl text-blue-500" />
                        <span className="text-xs">Loading page {idx + 1}...</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Chapter Next / Prev floating overlays */}
      <div className="absolute bottom-20 w-full px-6 flex justify-between pointer-events-none z-40">
         {hasPrev && (
             <button 
                onClick={(e) => { e.stopPropagation(); onPrevChapter?.(); }} 
                className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 bg-black/60 hover:bg-black/90 backdrop-blur-md text-white text-sm font-medium rounded-full border border-white/10 transition-all group shadow-xl"
             >
                <FiChevronLeft className="group-hover:-translate-x-1 transition-transform" /> Prev Chapter
             </button>
         )}
         <div className="flex-1"></div>
         {hasNext && (
             <button 
                onClick={(e) => { e.stopPropagation(); onNextChapter?.(); }} 
                className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 bg-black/60 hover:bg-black/90 backdrop-blur-md text-white text-sm font-medium rounded-full border border-white/10 transition-all group shadow-xl"
             >
                Next Chapter <FiChevronRight className="group-hover:translate-x-1 transition-transform" />
             </button>
         )}
      </div>

      {/* Bottom Controls Bar */}
      <motion.div 
        animate={{ y: controlsVisible ? 0 : 100 }}
        transition={{ duration: 0.2 }}
        className="absolute bottom-0 w-full h-16 bg-black/90 backdrop-blur-md flex items-center justify-center px-6 z-30 gap-4 border-t border-gray-800/60"
      >
        <form onSubmit={handlePageJump} className="flex items-center gap-2">
          <input 
            type="number" 
            className="w-14 bg-gray-800 border border-gray-700 text-white text-center rounded py-1 text-sm font-mono focus:border-blue-500 outline-none" 
            value={tempPageInput !== '' ? tempPageInput : currentPage + 1} 
            onChange={(e) => setTempPageInput(e.target.value)} 
            onFocus={() => setTempPageInput('')} 
          />
          <span className="text-gray-400 text-sm font-mono">/ {pageIds.length}</span>
        </form>

        {readerMode !== ReaderMode.VERTICAL && (
            <input 
              type="range" 
              min={0} 
              max={Math.max(0, pageIds.length - 1)} 
              value={currentPage} 
              onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))} 
              className="w-72 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
            />
        )}
      </motion.div>

      {/* Side Click Zones for fast page flipping */}
      {readerMode !== ReaderMode.VERTICAL && (
        <>
            <div 
              className="absolute inset-y-0 left-0 w-[15%] z-20 cursor-pointer hover:bg-white/[0.02] transition-colors" 
              onClick={(e) => { e.stopPropagation(); prevPage(); }} 
              title="Previous Page (Left Arrow)"
            />
            <div 
              className="absolute inset-y-0 right-0 w-[15%] z-20 cursor-pointer hover:bg-white/[0.02] transition-colors" 
              onClick={(e) => { e.stopPropagation(); nextPage(); }} 
              title="Next Page (Right Arrow)"
            />
        </>
      )}
    </div>
  );
};
