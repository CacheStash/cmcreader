export enum ReaderMode {
  SINGLE = 'single',
  DOUBLE = 'double',
  VERTICAL = 'vertical',
}

export interface Folder {
  id?: number;
  name: string;
}

export interface ComicBook {
  id?: number;
  title: string;
  fileHandle: File;
  coverBlob?: Blob;
  format: 'cbz' | 'pdf';
  totalPages: number;
  lastReadPage: number;
  dateAdded: number;
  folderId?: number; // Properti baru untuk kategori
}