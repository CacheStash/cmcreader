export enum ReaderMode {
  SINGLE = 'single',
  DOUBLE = 'double',
  VERTICAL = 'vertical', // Request #4
}

export interface ComicBook {
  id?: number;
  title: string;
  fileHandle: File;
  coverBlob?: Blob; // Request #2: Simpan Blob fisik, bukan string URL sementara
  format: 'cbz' | 'pdf'; // Request #1: Hapus cbr
  totalPages: number;
  lastReadPage: number;
  dateAdded: number;
}