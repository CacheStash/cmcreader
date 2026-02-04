import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

// Setup PDF Worker
const PDFJS_VERSION = '4.0.379'; 
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

export const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

// Fungsi sort natural (halaman 1, 2, 10 urut benar)
const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

// Helper filter gambar valid untuk CBZ
const isValidImage = (filename: string) => {
  return (
    !filename.startsWith('.') &&             // Abaikan hidden file (misal .DS_Store)
    !filename.includes('__MACOSX') &&        // Abaikan folder meta Mac
    /\.(jpg|jpeg|png|gif|webp)$/i.test(filename) // Terima semua format umum
  );
};

export const parseCBZ = async (file: File): Promise<string[]> => {
  const zip = new JSZip();
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
};

export const parsePDF = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const imageUrls: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 }); // Resolusi baca lebih tinggi
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) continue;
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.8));
    if (blob) imageUrls.push(URL.createObjectURL(blob));
  }
  return imageUrls;
};

// Request #2 Fix: Perbaikan logika extractCover
export const extractCover = async (file: File, format: string): Promise<Blob | undefined> => {
  try {
    if (format === 'cbz') {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);
      
      // Filter yang lebih ketat agar tidak mengambil file non-image
      const imageFiles = Object.keys(loadedZip.files)
        .filter(filename => !loadedZip.files[filename].dir && isValidImage(filename))
        .sort(naturalSort);
      
      if (imageFiles.length > 0) {
        // Ambil halaman pertama sebagai cover
        return await loadedZip.files[imageFiles[0]].async('blob');
      }
    } else if (format === 'pdf') {
       const arrayBuffer = await file.arrayBuffer();
       const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
       const pdf = await loadingTask.promise;
       const page = await pdf.getPage(1); // Halaman 1
       
       // Render skala kecil untuk thumbnail (hemat memori)
       const viewport = page.getViewport({ scale: 0.5 }); 
       const canvas = document.createElement('canvas');
       const context = canvas.getContext('2d');
       
       if(context) {
           canvas.height = viewport.height;
           canvas.width = viewport.width;
           await page.render({ canvasContext: context, viewport }).promise;
           const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.7));
           if(blob) return blob;
       }
    }
  } catch (e) {
    console.error("Failed to extract cover for", file.name, e);
  }
  return undefined;
};