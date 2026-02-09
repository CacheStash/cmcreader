import Dexie, { Table } from 'dexie';
import { ComicBook, Folder } from './types';

export class ZenReaderDatabase extends Dexie {
  comics!: Table<ComicBook, number>;
  folders!: Table<Folder, number>;

  constructor() {
    super('ZenReaderDB');
    
    /**
     * Versi 5: Clean Local-First Schema
     * Menghapus semua dependensi ke Supabase.
     * '++id' adalah Primary Key auto-increment.
     * Field lainnya adalah properti yang di-indeks untuk pencarian cepat.
     */
    this.version(5).stores({
      comics: '++id, title, dateAdded, lastReadPage, folderId',
      folders: '++id, name, parentId'
    });
  }
}

export const db = new ZenReaderDatabase();