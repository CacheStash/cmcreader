import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComicBook, ReaderMode } from '../types';
import { parseCBZ, parsePDF } from '../services/fileUtils';
import { db } from '../db';
import { FiArrowLeft, FiColumns, FiMaximize, FiArrowDown, FiZoomIn, FiZoomOut, FiX, FiChevronRight, FiChevronLeft } from 'react-icons/fi';

interface ReaderProps {
  book: ComicBook;
  onClose: () => void;
  // Fitur #5: Navigasi Chapter
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export const Reader: React.FC<ReaderProps> = ({ book, onClose, onNextChapter, onPrevChapter, hasNext, hasPrev }) => {
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(book.lastReadPage || 0);
  const [loading, setLoading] = useState(true);
  
  const [readerMode, setReaderMode] = useState<ReaderMode>(ReaderMode.SINGLE);
  const [zoom, setZoom] = useState(100);
  const [tempPageInput, setTempPageInput] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => {
    const loadBook = async () => {
      setLoading(true);
      setPages([]); // Reset pages saat buku ganti
      setCurrentPage(book.lastReadPage || 0); // Reset page ke last read buku baru
      try {
        let extractedPages: string[] = [];
        if (book.format === 'cbz') extractedPages = await parseCBZ(book.fileHandle!);
        else if (book.format === 'pdf') extractedPages = await parsePDF(book.fileHandle!);
        setPages(extractedPages);
      } catch (err) { console.error(err); } 
      finally { setLoading(false); }
    };
    if (book.fileHandle) loadBook();
  }, [book]); // Reload saat prop 'book' berubah

  useEffect(() => { if (book.id) db.comics.update(book.id, { lastReadPage: currentPage }); }, [currentPage, book.id]);

  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(tempPageInput);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pages.length) setCurrentPage(pageNum - 1);
    setTempPageInput("");
  };

  const nextPage = useCallback(() => {
    if (readerMode === ReaderMode.VERTICAL) return;
    const increment = readerMode === ReaderMode.DOUBLE ? 2 : 1;
    setCurrentPage(p => Math.min(p + increment, pages.length - 1));
  }, [pages.length, readerMode]);

  const prevPage = useCallback(() => {
    if (readerMode === ReaderMode.VERTICAL) return;
    const decrement = readerMode === ReaderMode.DOUBLE && currentPage > 1 ? 2 : 1;
    setCurrentPage(p => Math.max(p - decrement, 0));
  }, [currentPage, readerMode]);

  const adjustZoom = (delta: number) => setZoom(prev => Math.max(50, Math.min(300, prev + delta)));
  const getVisiblePages = () => {
    if (readerMode === ReaderMode.SINGLE || currentPage === 0) return [currentPage];
    const secondPage = currentPage + 1 < pages.length ? currentPage + 1 : null;
    return secondPage ? [currentPage, secondPage] : [currentPage];
  };

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-black text-white">Loading...</div>;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      
      {/* Fitur #4: Transparent Close Button (Top Right) */}
      <button 
        onClick={onClose} 
        className="absolute top-4 right-4 z-50 p-3 bg-black/50 hover:bg-red-600/80 text-white rounded-full transition-colors backdrop-blur-sm"
        title="Exit Reader"
      >
        <FiX size={24} />
      </button>

      {/* Top Bar */}
      <motion.div 
        animate={{ y: controlsVisible ? 0 : -100 }}
        className="absolute top-0 w-full h-16 bg-black/90 flex items-center justify-between px-4 z-30"
      >
        <button onClick={onClose} className="p-2 text-white hover:bg-gray-800 rounded-full"><FiArrowLeft /></button>
        <div className="flex gap-4 items-center mr-12"> {/* mr-12 biar ga nabrak tombol close */}
            <div className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1">
                <button onClick={() => adjustZoom(-10)} className="text-white"><FiZoomOut /></button>
                <span className="text-xs text-white w-8 text-center">{zoom}%</span>
                <button onClick={() => adjustZoom(10)} className="text-white"><FiZoomIn /></button>
            </div>
            <button onClick={() => setReaderMode(ReaderMode.SINGLE)} className={`p-2 rounded ${readerMode === ReaderMode.SINGLE ? 'text-blue-400' : 'text-white'}`}><FiMaximize /></button>
            <button onClick={() => setReaderMode(ReaderMode.DOUBLE)} className={`p-2 rounded ${readerMode === ReaderMode.DOUBLE ? 'text-blue-400' : 'text-white'}`}><FiColumns /></button>
            <button onClick={() => setReaderMode(ReaderMode.VERTICAL)} className={`p-2 rounded ${readerMode === ReaderMode.VERTICAL ? 'text-blue-400' : 'text-white'}`}><FiArrowDown /></button>
        </div>
      </motion.div>

      {/* Main Reader Area */}
      <div 
        className={`flex-1 w-full relative overflow-hidden ${readerMode === ReaderMode.VERTICAL ? 'overflow-y-auto' : 'flex items-center justify-center'}`}
        onClick={() => setControlsVisible(!controlsVisible)}
      >
        {readerMode === ReaderMode.VERTICAL ? (
          <div className="flex flex-col items-center w-full min-h-screen py-20 gap-2">
            {pages.map((src, idx) => (
              <img key={idx} src={src} alt={`Page ${idx}`} style={{ width: `${zoom}%`, maxWidth: 'none' }} className="shadow-xl" />
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={currentPage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-1 w-full h-full p-2">
              {getVisiblePages().map(idx => (
                <img key={idx} src={pages[idx]} className="max-h-full max-w-full object-contain shadow-2xl" style={{ transform: `scale(${zoom / 100})` }} alt="Page" />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Fitur #5: Next / Prev Chapter Buttons (Bottom Corners) */}
      <div className="absolute bottom-20 w-full px-4 flex justify-between pointer-events-none z-40">
         {hasPrev && (
             <button 
                onClick={(e) => { e.stopPropagation(); onPrevChapter?.(); }} 
                className="pointer-events-auto flex items-center gap-2 px-4 py-3 bg-black/40 hover:bg-black/80 backdrop-blur-md text-white rounded-full border border-white/10 transition-all group"
             >
                <FiChevronLeft className="group-hover:-translate-x-1 transition-transform" /> Prev Chapter
             </button>
         )}
         <div className="flex-1"></div> {/* Spacer */}
         {hasNext && (
             <button 
                onClick={(e) => { e.stopPropagation(); onNextChapter?.(); }} 
                className="pointer-events-auto flex items-center gap-2 px-4 py-3 bg-black/40 hover:bg-black/80 backdrop-blur-md text-white rounded-full border border-white/10 transition-all group"
             >
                Next Chapter <FiChevronRight className="group-hover:translate-x-1 transition-transform" />
             </button>
         )}
      </div>

      {/* Bottom Bar (Page Control) */}
      {readerMode !== ReaderMode.VERTICAL && (
        <motion.div 
          animate={{ y: controlsVisible ? 0 : 100 }}
          className="absolute bottom-0 w-full h-16 bg-black/90 flex items-center justify-center px-6 z-30 gap-4"
        >
          <form onSubmit={handlePageJump} className="flex items-center gap-2">
            <input type="number" className="w-12 bg-gray-800 text-white text-center rounded" value={tempPageInput || currentPage + 1} onChange={(e) => setTempPageInput(e.target.value)} onFocus={() => setTempPageInput("")} />
            <span className="text-gray-400 text-sm">/ {pages.length}</span>
          </form>
          <input type="range" min={0} max={pages.length - 1} value={currentPage} onChange={(e) => setCurrentPage(parseInt(e.target.value))} className="w-64 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
        </motion.div>
      )}

      {readerMode !== ReaderMode.VERTICAL && (
        <>
            <div className="absolute inset-y-0 left-0 w-[15%] z-20 cursor-pointer" onClick={(e) => { e.stopPropagation(); prevPage(); }} />
            <div className="absolute inset-y-0 right-0 w-[15%] z-20 cursor-pointer" onClick={(e) => { e.stopPropagation(); nextPage(); }} />
        </>
      )}
    </div>
  );
};