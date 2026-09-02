// services/googleDriveService.ts

// Ganti dengan kredensial dari Google Cloud Console
export const GOOGLE_CLIENT_ID = "839557944575-brvkdibadkvj29sc2q8idchmj2dgl6hm.apps.googleusercontent.com";
export const GOOGLE_API_KEY = "AIzaSyDUGihYhofVIshsoOS-NRyv-yHhcuc2o6A";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

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
      callback: () => {}, // Callback default kosong, ditimpa secara dinamis saat request
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
      const view = new google.picker.View(google.picker.ViewId.DOCS);
      // Mendukung CBZ (zip format), PDF, dan octet-stream
      view.setMimeTypes("application/zip,application/x-zip-compressed,application/octet-stream,application/pdf");

      const docsView = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      const picker = new google.picker.PickerBuilder()
        .addView(docsView)
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
      if (onError) onError(err);
    }
  };

  // Minta token baru atau gunakan token yang sudah ada
  tokenClient.callback = (response: any) => {
    if (response.error) {
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
 * dan mengonversinya langsung menjadi instance `File`
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
