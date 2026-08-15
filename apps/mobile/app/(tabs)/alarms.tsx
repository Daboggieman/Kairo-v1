import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Button, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LOCAL_USER_ID } from '@/constants';
import { createAlarm, deleteAlarm, listAlarms, updateAlarm, type Alarm } from '@/db/alarms';

export default function AlarmsScreen() {
  const db = useSQLiteContext();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [label, setLabel] = useState('Workout reminder');
  const [time, setTime] = useState('07:00');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [editing, setEditing] = useState<Alarm | null>(null);
  const load = useCallback(() => { listAlarms(db, LOCAL_USER_ID).then(setAlarms); }, [db]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function add() {
    const [hour, minute] = time.split(':').map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) { Alert.alert('Use HH:MM time'); return; }
    const input = { label, hour, minute, repeatDays, isActive: true };
    if (editing) await updateAlarm(db, editing, input);
    else await createAlarm(db, LOCAL_USER_ID, input);
    setEditing(null);
    load();
  }
  return <View style={styles.screen}><Text style={styles.title}>Reminders</Text><TextInput value={label} onChangeText={setLabel} style={styles.input} placeholder="Label" /><TextInput value={time} onChangeText={setTime} style={styles.input} keyboardType="numbers-and-punctuation" /><View style={styles.days}>{['S','M','T','W','T','F','S'].map((day, index) => { const value = index + 1; const selected = repeatDays.includes(value); return <Pressable key={value} onPress={() => setRepeatDays(selected ? repeatDays.filter((entry) => entry !== value) : [...repeatDays, value])} style={[styles.day, selected && styles.daySelected]}><Text style={selected && styles.dayTextSelected}>{day}</Text></Pressable>; })}</View><Button title={editing ? 'Save reminder' : 'Add reminder'} onPress={add} /><FlatList data={alarms} keyExtractor={(item) => item.id} renderItem={({ item }) => <Pressable onPress={() => { setEditing(item); setLabel(item.label); setTime(`${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`); setRepeatDays(item.repeatDays); }} style={styles.row}><View><Text style={styles.label}>{item.label}</Text><Text>{String(item.hour).padStart(2, '0')}:{String(item.minute).padStart(2, '0')}</Text></View><Pressable accessibilityLabel="Delete reminder" onPress={async () => { await deleteAlarm(db, item); load(); }}><MaterialCommunityIcons name="trash-can-outline" size={22} color="#DC2626" /></Pressable></Pressable>} /></View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 24, gap: 12 }, title: { fontSize: 28, fontWeight: '700' }, input: { borderWidth: 1, borderColor: '#CBD5E1', padding: 12, borderRadius: 6 }, days: { flexDirection: 'row', justifyContent: 'space-between' }, day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1' }, daySelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' }, dayTextSelected: { color: '#FFFFFF' }, row: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, label: { fontWeight: '600' } });
