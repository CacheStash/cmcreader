import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { extractCover, getFileExtension } from '../services/fileUtils';
import { ComicBook } from '../types';
import { Button } from './Button';
import { FiPlus, FiBookOpen, FiTrash2, FiUploadCloud, FiFileText } from 'react-icons/fi';

interface LibraryProps {
  onSelectBook: (book: ComicBook) => void;
}

// ... (Bagian CoverImage biarkan sama, tidak ada perubahan) ...
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const comics = useLiveQuery(() => db.comics.orderBy('dateAdded').reverse().toArray());
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const processFiles = async (files: FileList | File[]) => {
    setIsProcessing(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = getFileExtension(file.name);
        
        // Terima file valid saja
        if (['cbz', 'pdf'].includes(ext)) {
          const coverBlob = await extractCover(file, ext);
          
          await db.comics.add({
            title: file.name.replace(/\.(cbz|pdf)$/i, ''),
            fileHandle: file,
            coverBlob: coverBlob,
            format: ext as 'cbz' | 'pdf',
            totalPages: 0,
            lastReadPage: 0,
            dateAdded: Date.now()
          });
        }
      }
    } catch (error) {
      console.error("Error adding files:", error);
      alert("Gagal memproses file. Pastikan file tidak rusak.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) processFiles(event.target.files);
  };

  // ... (Event handlers drag & drop biarkan sama) ...
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

  const isEmpty = !comics || comics.length === 0;

  return (
    <div 
      className={`min-h-screen p-6 pb-24 relative transition-colors duration-200 ${dragActive ? 'bg-blue-900/20' : ''}`}
      onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
    >
      <div className="max-w-7xl mx-auto relative z-10">
        <header className="flex justify-between items-center mb-8 sticky top-0 z-20 bg-black/80 backdrop-blur-md py-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            ZenReader
          </h1>
          <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
            <span className="flex items-center gap-2">
              <FiPlus className="text-xl" />
              <span className="hidden sm:inline">Add Comic</span>
            </span>
          </Button>
          
          {/* PERBAIKAN UTAMA DI SINI: MIME TYPES LENGKAP */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            // Tambahkan MIME types ZIP agar Android mengenali .cbz
            accept=".cbz,.pdf,application/pdf,application/vnd.comicbook+zip,application/x-cbz,application/zip,application/x-zip-compressed,multipart/x-zip"
            multiple
          />
        </header>

        {isProcessing && (
          <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg animate-pulse text-blue-200 flex items-center justify-center gap-3">
             <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
             Processing files...
          </div>
        )}

        {isEmpty && !isProcessing && (
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
    </div>
  );
};