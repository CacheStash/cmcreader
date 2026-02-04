import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComicBook, ReaderMode } from '../types';
import { parseCBZ, parsePDF } from '../services/fileUtils';
import { db } from '../db';
import { FiArrowLeft, FiColumns, FiMaximize, FiArrowDown, FiZoomIn, FiZoomOut } from 'react-icons/fi';

interface ReaderProps {
  book: ComicBook;
  onClose: () => void;
}

export const Reader: React.FC<ReaderProps> = ({ book, onClose }) => {
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(book.lastReadPage || 0);
  const [loading, setLoading] = useState(true);
  
  // Request #4 & #7: State baru untuk mode dan zoom
  const [readerMode, setReaderMode] = useState<ReaderMode>(ReaderMode.SINGLE);
  const [zoom, setZoom] = useState(100); // Persentase Zoom
  const [tempPageInput, setTempPageInput] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);

  // Load Book
  useEffect(() => {
    const loadBook = async () => {
      setLoading(true);
      try {
        let extractedPages: string[] = [];
        if (book.format === 'cbz') extractedPages = await parseCBZ(book.fileHandle);
        else if (book.format === 'pdf') extractedPages = await parsePDF(book.fileHandle);
        
        setPages(extractedPages);
        if (book.id) await db.comics.update(book.id, { totalPages: extractedPages.length });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadBook();
    return () => pages.forEach(url => URL.revokeObjectURL(url));
  }, [book]);

  // Save Progress
  useEffect(() => {
    if (book.id) db.comics.update(book.id, { lastReadPage: currentPage });
  }, [currentPage, book.id]);

  // Request #6: Jump to Page Logic
  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(tempPageInput);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pages.length) {
      setCurrentPage(pageNum - 1);
      // Scroll to element in vertical mode
      if (readerMode === ReaderMode.VERTICAL) {
        document.getElementById(`page-${pageNum - 1}`)?.scrollIntoView();
      }
    }
    setTempPageInput("");
  };

  // Navigation Logic (Horizontal)
  const nextPage = useCallback(() => {
    if (readerMode === ReaderMode.VERTICAL) return; // Vertical handles scroll
    const increment = readerMode === ReaderMode.DOUBLE ? 2 : 1;
    setCurrentPage(p => Math.min(p + increment, pages.length - 1));
  }, [pages.length, readerMode]);

  const prevPage = useCallback(() => {
    if (readerMode === ReaderMode.VERTICAL) return;
    const decrement = readerMode === ReaderMode.DOUBLE && currentPage > 1 ? 2 : 1;
    setCurrentPage(p => Math.max(p - decrement, 0));
  }, [currentPage, readerMode]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (readerMode !== ReaderMode.VERTICAL) {
        if (e.key === 'ArrowRight') nextPage();
        if (e.key === 'ArrowLeft') prevPage();
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [nextPage, prevPage, onClose, readerMode]);

  // Request #7: Zoom Handlers
  const adjustZoom = (delta: number) => {
    setZoom(prev => Math.max(50, Math.min(300, prev + delta)));
  };

  // Helper untuk mendapatkan halaman yang tampil
  const getVisiblePages = () => {
    if (readerMode === ReaderMode.SINGLE || currentPage === 0) return [currentPage];
    const secondPage = currentPage + 1 < pages.length ? currentPage + 1 : null;
    return secondPage ? [currentPage, secondPage] : [currentPage];
  };

  if (loading) return <div className="h-screen w-full flex items-center justify-center bg-black text-white">Loading...</div>;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      
      {/* Top Bar */}
      <motion.div 
        animate={{ y: controlsVisible ? 0 : -100 }}
        className="absolute top-0 w-full h-16 bg-black/90 flex items-center justify-between px-4 z-30"
      >
        <button onClick={onClose} className="p-2 text-white hover:bg-gray-800 rounded-full"><FiArrowLeft /></button>
        <div className="flex gap-4 items-center">
            {/* Request #7: Zoom Controls */}
            <div className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1">
                <button onClick={() => adjustZoom(-10)} className="text-white"><FiZoomOut /></button>
                <span className="text-xs text-white w-8 text-center">{zoom}%</span>
                <button onClick={() => adjustZoom(10)} className="text-white"><FiZoomIn /></button>
            </div>

            {/* Mode Switcher */}
            <button onClick={() => setReaderMode(ReaderMode.SINGLE)} className={`p-2 rounded ${readerMode === ReaderMode.SINGLE ? 'text-blue-400' : 'text-white'}`}><FiMaximize title="Single" /></button>
            <button onClick={() => setReaderMode(ReaderMode.DOUBLE)} className={`p-2 rounded ${readerMode === ReaderMode.DOUBLE ? 'text-blue-400' : 'text-white'}`}><FiColumns title="Double" /></button>
            {/* Request #4: Vertical Mode Toggle */}
            <button onClick={() => setReaderMode(ReaderMode.VERTICAL)} className={`p-2 rounded ${readerMode === ReaderMode.VERTICAL ? 'text-blue-400' : 'text-white'}`}><FiArrowDown title="Vertical" /></button>
        </div>
      </motion.div>

      {/* Main Reader Area */}
      <div 
        className={`flex-1 w-full relative overflow-hidden ${readerMode === ReaderMode.VERTICAL ? 'overflow-y-auto' : 'flex items-center justify-center'}`}
        onClick={() => setControlsVisible(!controlsVisible)}
      >
        {/* Request #4: Vertical Mode Rendering */}
        {readerMode === ReaderMode.VERTICAL ? (
          <div className="flex flex-col items-center w-full min-h-screen py-20 gap-2">
            {pages.map((src, idx) => (
              <img 
                key={idx} 
                id={`page-${idx}`}
                src={src} 
                alt={`Page ${idx}`}
                style={{ width: `${zoom}%`, maxWidth: 'none' }} // Zoom logic
                className="shadow-xl"
              />
            ))}
          </div>
        ) : (
          /* Request #5: Single/Double Mode (Auto Full Screen logic via h-full w-full object-contain) */
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-1 w-full h-full p-2"
            >
              {getVisiblePages().map(idx => (
                <img 
                    key={idx}
                    src={pages[idx]} 
                    className="max-h-full max-w-full object-contain shadow-2xl transition-transform duration-200" 
                    style={{ transform: `scale(${zoom / 100})` }} // Request #7: Apply Zoom
                    alt="Page"
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Bottom Bar */}
      {readerMode !== ReaderMode.VERTICAL && (
        <motion.div 
          animate={{ y: controlsVisible ? 0 : 100 }}
          className="absolute bottom-0 w-full h-16 bg-black/90 flex items-center justify-center px-6 z-30 gap-4"
        >
          {/* Request #6: Page Jump Form */}
          <form onSubmit={handlePageJump} className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">Page</span>
            <input 
              type="number" 
              className="w-12 bg-gray-800 text-white text-center rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={tempPageInput || currentPage + 1}
              onChange={(e) => setTempPageInput(e.target.value)}
              onFocus={() => setTempPageInput("")}
            />
            <span className="text-gray-400 text-sm">/ {pages.length}</span>
          </form>

          <input
            type="range"
            min={0}
            max={pages.length - 1}
            value={currentPage}
            onChange={(e) => setCurrentPage(parseInt(e.target.value))}
            className="w-64 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </motion.div>
      )}

      {/* Touch Zones for Next/Prev (Hidden on Vertical) */}
      {readerMode !== ReaderMode.VERTICAL && (
        <>
            <div className="absolute inset-y-0 left-0 w-[15%] z-20 cursor-pointer" onClick={(e) => { e.stopPropagation(); prevPage(); }} />
            <div className="absolute inset-y-0 right-0 w-[15%] z-20 cursor-pointer" onClick={(e) => { e.stopPropagation(); nextPage(); }} />
        </>
      )}
    </div>
  );
};