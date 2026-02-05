import Dexie, { Table } from 'dexie';
import { ComicBook, Folder } from './types';

export class ZenReaderDatabase extends Dexie {
  comics!: Table<ComicBook, number>;
  folders!: Table<Folder, number>; // Tabel baru

  constructor() {
    super('ZenReaderDB');
    // Version 2: Menambahkan support folder/kategori
    this.version(2).stores({
      comics: '++id, title, dateAdded, lastReadPage, folderId',
      folders: '++id, name'
    });
  }
}

export const db = new ZenReaderDatabase();