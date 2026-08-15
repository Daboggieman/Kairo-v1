import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Button, Image, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { quoteForDate } from '@/domain/motivation';
import { syncConfig } from '@/sync/config';

export default function WallpaperScreen() {
  const quote = useMemo(() => quoteForDate(new Date()), []);
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (!syncConfig.apiUrl || !syncConfig.deviceKey) return;
      const tokenResponse = await fetch(`${syncConfig.apiUrl}/api/v1/auth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_key: syncConfig.deviceKey }) });
      if (!tokenResponse.ok) return;
      const token = (await tokenResponse.json()) as { access_token: string };
      const response = await fetch(`${syncConfig.apiUrl}/api/v1/wallpapers/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.access_token}` }, body: JSON.stringify(quote) });
      if (!response.ok) return;
      const body = (await response.json()) as { image_base64: string };
      const path = `${FileSystem.cacheDirectory}kairo-wallpaper.png`;
      await FileSystem.writeAsStringAsync(path, body.image_base64, { encoding: FileSystem.EncodingType.Base64 });
      setUri(path);
    })().catch(() => undefined);
  }, [quote]);
  async function save() {
    if (!uri) return;
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) { Alert.alert('Photos permission is required to save wallpapers.'); return; }
    await MediaLibrary.saveToLibraryAsync(uri);
    Alert.alert('Wallpaper saved');
  }
  return <View style={styles.screen}><Text style={styles.title}>Today&apos;s wallpaper</Text>{uri ? <Image source={{ uri }} style={styles.preview} /> : <ActivityIndicator />}{uri ? <Button title="Save to Photos" onPress={save} /> : <Text style={styles.muted}>Connect sync settings to generate a wallpaper.</Text>}</View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 24, gap: 16 }, title: { fontSize: 24, fontWeight: '700' }, preview: { width: '100%', aspectRatio: 9 / 16, borderRadius: 8 }, muted: { color: '#64748B' } });
