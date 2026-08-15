/** Build-time sync configuration. Missing values keep the app fully offline. */

const rawApiUrl = process.env.EXPO_PUBLIC_KAIRO_API_URL;

export const syncConfig = {
  apiUrl: rawApiUrl ? rawApiUrl.replace(/\/$/, '') : null,
  deviceKey: process.env.EXPO_PUBLIC_KAIRO_DEVICE_KEY ?? null,
};

export type SyncConfig = typeof syncConfig;
