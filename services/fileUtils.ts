import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

// FIX ERROR 1: Tambahkan @ts-ignore karena TypeScript tidak mengenali syntax '?url' milik Vite
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

const isValidImage = (filename: string) => {
  return (
    !filename.startsWith('.') &&
    !filename.includes('__MACOSX') &&
    /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)
  );
};

export const parseCBZ = async (file: File): Promise<string[]> => {
  const zip = new JSZip();
  try {
    const loadedZip = await zip.loadAsync(file);
    const imageFiles = Object.keys(loadedZip.files)
      .filter(filename => !loadedZip.files[filename].dir && isValidImage(filename))
      .sort(naturalSort);

    const imageUrls: string[] = [];
    for (const filename of imageFiles) {
      const blob = await loadedZip.files[filename].async('blob');
      imageUrls.push(URL.createObjectURL(blob));
    }
    return imageUrls;
  } catch (err) {
    console.error("CBZ Parse Error:", err);
    return [];
  }
};

export const parsePDF = async (file: File): Promise<string[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const imageUrls: string[] = [];

    // Deteksi Mobile untuk efisiensi RAM
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const scale = isMobile ? 1.0 : 1.5;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) continue;
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // FIX ERROR 2: Gunakan 'as any' pada parameter render
      // Definisi tipe data PDF.js terkadang meminta properti 'canvas' wrapper yang tidak wajib
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      await page.render(renderContext as any).promise;
      
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.7));
      
      canvas.width = 0; 
      canvas.height = 0;

      if (blob) imageUrls.push(URL.createObjectURL(blob));
    }
    return imageUrls;
  } catch (error) {
    console.error("PDF Parse Error:", error);
    return [];
  }
};

export const extractCover = async (file: File, format: string): Promise<Blob | undefined> => {
  try {
    if (format === 'cbz') {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);
      const imageFiles = Object.keys(loadedZip.files)
        .filter(filename => !loadedZip.files[filename].dir && isValidImage(filename))
        .sort(naturalSort);
      
      if (imageFiles.length > 0) {
        return await loadedZip.files[imageFiles[0]].async('blob');
      }
    } else if (format === 'pdf') {
       const arrayBuffer = await file.arrayBuffer();
       const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
       const pdf = await loadingTask.promise;
       const page = await pdf.getPage(1);
       
       const viewport = page.getViewport({ scale: 0.5 }); 
       const canvas = document.createElement('canvas');
       const context = canvas.getContext('2d');
       
       if(context) {
           canvas.height = viewport.height;
           canvas.width = viewport.width;

           // FIX ERROR 3: Sama seperti di atas, gunakan 'as any'
           const renderContext = {
             canvasContext: context,
             viewport: viewport
           };
           await page.render(renderContext as any).promise;

           const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.7));
           canvas.width = 0; canvas.height = 0;
           if(blob) return blob;
       }
    }
  } catch (e) {
    console.error("Failed to extract cover", e);
  }
  return undefined;
};