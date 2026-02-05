import Dexie, { Table } from 'dexie';
import { ComicBook, Folder } from './types';

export class ZenReaderDatabase extends Dexie {
  comics!: Table<ComicBook, number>;
  folders!: Table<Folder, number>;

  constructor() {
    super('ZenReaderDB');
    
    // Versi lama (biarkan untuk history migrasi jika perlu, atau timpa jika development)
    this.version(3).stores({
      comics: '++id, title, dateAdded, lastReadPage, folderId, supabaseId',
      folders: '++id, name, supabaseId'
    });

    // NEW: Version 4 adding parentId
    this.version(4).stores({
      comics: '++id, title, dateAdded, lastReadPage, folderId, supabaseId',
      folders: '++id, name, parentId, supabaseId' // Added parentId
    });
  }
}

export const db = new ZenReaderDatabase();