import Dexie, { Table } from 'dexie';
import { ComicBook, Folder } from './types';

export class ZenReaderDatabase extends Dexie {
  comics!: Table<ComicBook, number>;
  folders!: Table<Folder, number>;

  constructor() {
    super('ZenReaderDB');
    // Version 3: Update schema untuk support Sync
    this.version(3).stores({
      comics: '++id, title, dateAdded, lastReadPage, folderId, supabaseId',
      folders: '++id, name, supabaseId'
    });
  }
}

export const db = new ZenReaderDatabase();