// services/googleDriveService.ts

export const GOOGLE_CLIENT_ID = "839557944575-brvkdibadkvj29sc2q8idchmj2dgl6hm.apps.googleusercontent.com";
export const GOOGLE_API_KEY = "AIzaSyDUGihYhofVIshsoOS-NRyv-yHhcuc2o6A";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

declare const google: any;
declare const gapi: any;

let tokenClient: any = null;
let currentAccessToken: string | null = null;
let isGapiPickerLoaded = false;

/**
 * Inisialisasi Google Token Client dan memuat modul Google Picker API
 */
export function initGoogleDrive(onInitialized?: () => void) {
  if (typeof google !== "undefined" && google.accounts?.oauth2) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: () => {},
    });
  }

  if (typeof gapi !== "undefined") {
    gapi.load("picker", () => {
      isGapiPickerLoaded = true;
      if (onInitialized) onInitialized();
    });
  }
}

/**
 * Membuka Google Picker untuk memilih file komik (.cbz / .zip / .pdf)
 */
export function openDrivePicker(
  onFilePicked: (fileInfo: { id: string; name: string }) => void,
  onError?: (err: any) => void
) {
  if (!tokenClient || !isGapiPickerLoaded) {
    if (onError) onError(new Error("Google Drive SDK belum siap. Periksa koneksi internet atau script di index.html."));
    return;
  }

  const showPicker = () => {
    try {
      // 1. Tampilan My Drive (Menampilkan seluruh folder dan semua jenis file biner)
      const myDriveView = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setParent('root');

      // 2. Tampilan Semua File (Universal Search untuk menemukan .cbz)
      const allFilesView = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      const picker = new google.picker.PickerBuilder()
        .setAppId(GOOGLE_CLIENT_ID.split('-')[0])
        .setTitle("Pilih File Komik (.cbz, .zip, .pdf)")
        .addView(myDriveView)
        .addView(allFilesView)
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .setOAuthToken(currentAccessToken)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs[0];
            onFilePicked({
              id: doc.id,
              name: doc.name,
            });
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      console.error("Internal Picker Exception:", err);
      if (onError) onError(err);
    }
  };

  tokenClient.callback = (response: any) => {
    if (response.error) {
      console.error("Token Client Error:", response);
      if (onError) onError(response);
      return;
    }
    currentAccessToken = response.access_token;
    showPicker();
  };

  if (!currentAccessToken) {
    tokenClient.requestAccessToken({ prompt: "" });
  } else {
    showPicker();
  }
}

/**
 * Mengunduh file dari Google Drive menggunakan endpoint REST v3 alt=media
 */
export async function downloadDriveComicAsFile(fileId: string, fileName: string): Promise<File> {
  if (!currentAccessToken) {
    throw new Error("Token otorisasi Google tidak ditemukan. Silakan login kembali.");
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${currentAccessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Gagal mengunduh file dari Google Drive (${res.status}: ${res.statusText})`);
  }

  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type || "application/octet-stream" });
}
