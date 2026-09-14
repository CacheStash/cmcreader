export enum ReaderMode {
  SINGLE = 'single',
  DOUBLE = 'double',
  VERTICAL = 'vertical',
}

export interface Folder {
  id?: number;         // ID Lokal (Dexie)
  name: string;
  parentId?: number;   // Untuk Sub-Folder
}

export interface ComicBook {
  id?: number;         // ID Lokal (Dexie)
  title: string;
  filePath?: string;   // Path lokal di hard drive (e.g. H:\cmc\Chapter1.cbz)
  fileHandle?: File;   // Fallback untuk drag & drop
  coverBlob?: Blob;
  coverUrl?: string;   // Thumbnail URL dari disk cache
  
  format: 'cbz' | 'cbr' | 'pdf';
  totalPages: number;
  lastReadPage: number;
  dateAdded: number;
  folderId?: number;   // Referensi ke ID Folder Lokal
  fileSize?: number;
}

export interface AppSettings {
  rootFolder?: string;
  pinEnabled?: boolean;
  pin?: string;
}