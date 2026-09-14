import Dexie, { Table } from 'dexie';
import { ComicBook, Folder } from './types';

export class ZenReaderDatabase extends Dexie {
  comics!: Table<ComicBook, number>;
  folders!: Table<Folder, number>;

  constructor() {
    super('ZenReaderDB');
    
    // Version 3 & 4 (migration history)
    this.version(3).stores({
      comics: '++id, title, dateAdded, lastReadPage, folderId, supabaseId',
      folders: '++id, name, supabaseId'
    });

    this.version(4).stores({
      comics: '++id, title, dateAdded, lastReadPage, folderId, supabaseId',
      folders: '++id, name, parentId, supabaseId'
    });

    // Version 5: Clean Local-First with filePath index
    this.version(5).stores({
      comics: '++id, title, filePath, dateAdded, lastReadPage, folderId',
      folders: '++id, name, parentId'
    });
  }
}

export const db = new ZenReaderDatabase();