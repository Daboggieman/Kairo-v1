type SharingApi = { isAvailableAsync?: () => Promise<boolean>; shareAsync: (uri: string, options?: { mimeType?: string; dialogTitle?: string }) => Promise<void> };
let cached: SharingApi | null | undefined;
function load(): SharingApi | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const candidate = require('expo-sharing') as Record<string, unknown>;
    cached = typeof candidate.shareAsync === 'function' ? candidate as unknown as SharingApi : null;
  } catch { cached = null; }
  return cached;
}
export function sharingAvailable(): boolean { return load() !== null; }
export async function shareFile(uri: string): Promise<boolean> {
  const api = load();
  if (!api) return false;
  if (api.isAvailableAsync && !(await api.isAvailableAsync())) return false;
  await api.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Export Kairo data' });
  return true;
}
