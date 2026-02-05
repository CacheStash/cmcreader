export enum ReaderMode {
  SINGLE = 'single',
  DOUBLE = 'double',
  VERTICAL = 'vertical',
}

export interface Folder {
  id?: number;         // ID Lokal (Dexie)
  supabaseId?: number; // ID Cloud (Supabase)
  name: string;
  parentId?: number;   // NEW: Untuk Sub-Folder
}

export interface ComicBook {
  id?: number;         // ID Lokal (Dexie)
  supabaseId?: number; // ID Cloud (Supabase)
  
  title: string;
  fileHandle?: File;   
  coverBlob?: Blob;
  
  format: 'cbz' | 'pdf';
  totalPages: number;
  lastReadPage: number;
  dateAdded: number;
  folderId?: number;   // Referensi ke ID Folder Lokal
}