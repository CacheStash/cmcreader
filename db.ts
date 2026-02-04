import Dexie, { Table } from 'dexie';
import { ComicBook } from './types';

export class ZenReaderDatabase extends Dexie {
  comics!: Table<ComicBook, number>;

  constructor() {
    super('ZenReaderDB');
    (this as any).version(1).stores({
      comics: '++id, title, dateAdded, lastReadPage'
    });
  }
}

export const db = new ZenReaderDatabase();