/// <reference types="vite/client" />

interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  getSettings: () => Promise<{ rootFolder?: string; pinEnabled?: boolean; pin?: string }>;
  saveSettings: (settings: any) => Promise<any>;
  scanFolder: (rootPath: string) => Promise<Array<{
    title: string;
    filePath: string;
    relativePath: string;
    folderName: string;
    format: 'cbz' | 'cbr' | 'pdf';
    fileSize: number;
    mtime: number;
  }>>;
  getCover: (filePath: string, format: string) => Promise<string | { isPdf: boolean; filePath: string } | null>;
  getPageList: (filePath: string, format: string) => Promise<string[]>;
  getPageData: (filePath: string, format: string, pageName: string) => Promise<string | null>;
  readFileBuffer: (filePath: string) => Promise<ArrayBuffer | null>;
  openPathInExplorer: (filePath: string) => Promise<boolean>;
}

interface Window {
  electronAPI?: ElectronAPI;
}