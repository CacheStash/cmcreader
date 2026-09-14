import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import { ComicBook } from '../types';

// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

export const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

export const isValidImage = (filename: string) => {
  return (
    !filename.startsWith('.') &&
    !filename.includes('__MACOSX') &&
    /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(filename)
  );
};

// Cached PDF Documents to prevent re-parsing large PDFs
const pdfDocCache = new Map<string, pdfjsLib.PDFDocumentProxy>();

async function getPdfDocument(book: ComicBook): Promise<pdfjsLib.PDFDocumentProxy> {
  const key = book.filePath || (book.id ? String(book.id) : book.title);
  if (pdfDocCache.has(key)) {
    return pdfDocCache.get(key)!;
  }

  let data: ArrayBuffer | Uint8Array;
  if (window.electronAPI && book.filePath) {
    const buf = await window.electronAPI.readFileBuffer(book.filePath);
    if (!buf) throw new Error('Could not read PDF file buffer from disk');
    data = buf;
  } else if (book.fileHandle) {
    data = await book.fileHandle.arrayBuffer();
  } else {
    throw new Error('No valid file source for PDF');
  }

  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  pdfDocCache.set(key, pdf);
  return pdf;
}

/**
 * Get list of page identifiers (filenames for CBZ/CBR, or page number strings "1", "2" for PDF)
 * Without loading all page images into memory!
 */
export const getPageList = async (book: ComicBook): Promise<string[]> => {
  // 1. Electron Native Path
  if (window.electronAPI && book.filePath) {
    if (book.format === 'cbz' || book.format === 'cbr') {
      return await window.electronAPI.getPageList(book.filePath, book.format);
    } else if (book.format === 'pdf') {
      try {
        const pdf = await getPdfDocument(book);
        return Array.from({ length: pdf.numPages }, (_, i) => String(i + 1));
      } catch (e) {
        console.error('Failed to get PDF page list:', e);
        return [];
      }
    }
  }

  // 2. Web / Drag-and-Drop Fallback with fileHandle
  if (book.fileHandle) {
    if (book.format === 'cbz') {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(book.fileHandle);
      return Object.keys(loadedZip.files)
        .filter(filename => !loadedZip.files[filename].dir && isValidImage(filename))
        .sort(naturalSort);
    } else if (book.format === 'pdf') {
      const pdf = await getPdfDocument(book);
      return Array.from({ length: pdf.numPages }, (_, i) => String(i + 1));
    }
  }

  return [];
};

/**
 * Load a SINGLE page image on-demand (streaming)
 */
export const loadSinglePage = async (
  book: ComicBook,
  pageIdentifier: string
): Promise<string | null> => {
  // 1. Electron Native Path
  if (window.electronAPI && book.filePath) {
    if (book.format === 'cbz' || book.format === 'cbr') {
      return await window.electronAPI.getPageData(book.filePath, book.format, pageIdentifier);
    } else if (book.format === 'pdf') {
      return await renderPdfPage(book, parseInt(pageIdentifier, 10));
    }
  }

  // 2. Web File Handle Fallback
  if (book.fileHandle) {
    if (book.format === 'cbz') {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(book.fileHandle);
      const fileEntry = loadedZip.files[pageIdentifier];
      if (fileEntry) {
        const blob = await fileEntry.async('blob');
        return URL.createObjectURL(blob);
      }
    } else if (book.format === 'pdf') {
      return await renderPdfPage(book, parseInt(pageIdentifier, 10));
    }
  }

  return null;
};

/**
 * Render single PDF page to an optimized data/blob URL
 */
async function renderPdfPage(book: ComicBook, pageNum: number): Promise<string | null> {
  try {
    const pdf = await getPdfDocument(book);
    const page = await pdf.getPage(pageNum);
    
    // Scale 1.5 for sharp readable text on desktop
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    await page.render(renderContext as any).promise;

    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    canvas.width = 0;
    canvas.height = 0;

    if (blob) return URL.createObjectURL(blob);
  } catch (err) {
    console.error(`Failed to render PDF page ${pageNum}:`, err);
  }
  return null;
}

/**
 * Extract cover thumbnail for Library view
 */
export const extractCover = async (book: ComicBook): Promise<string | undefined> => {
  // 1. Electron Native Path with disk cache
  if (window.electronAPI && book.filePath) {
    const result = await window.electronAPI.getCover(book.filePath, book.format);
    if (typeof result === 'string') {
      return result; // data:image/jpeg;base64,...
    }
    // If result is object { isPdf: true }
    if (result && typeof result === 'object' && result.isPdf) {
      const pdfCover = await renderPdfPage(book, 1);
      return pdfCover || undefined;
    }
  }

  // 2. Fallback using fileHandle
  if (book.fileHandle) {
    if (book.format === 'cbz') {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(book.fileHandle);
      const imageFiles = Object.keys(loadedZip.files)
        .filter(filename => !loadedZip.files[filename].dir && isValidImage(filename))
        .sort(naturalSort);
      
      if (imageFiles.length > 0) {
        const blob = await loadedZip.files[imageFiles[0]].async('blob');
        return URL.createObjectURL(blob);
      }
    } else if (book.format === 'pdf') {
      const pdfCover = await renderPdfPage(book, 1);
      return pdfCover || undefined;
    }
  }

  return undefined;
};