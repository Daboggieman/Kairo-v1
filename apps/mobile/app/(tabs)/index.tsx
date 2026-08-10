/**
 * Home tab — deliberately a placeholder this pass.
 *
 * `04-feature-specs.md` describes the dashboard as an aggregate of the other modules
 * (today's tasks, macro rings, weight trend, quote). Building it before those modules
 * exist would mean building it twice, so it links into what does work and states plainly
 * what is coming.
 */

import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontSize, radius, spacing } from '@/theme';

const UPCOMING = [
  'Weight & progress charts',
  'Daily tasks & streaks',
  'Macro tracking',
  'Motivational quotes',
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <Text style={styles.greeting}>Kairo</Text>
      <Text style={styles.subtitle}>Your day, in one place.</Text>

      <Link href="/workouts" style={styles.card}>
        <View>
          <Text style={styles.cardTitle}>Workouts</Text>
          <Text style={styles.cardBody}>Log a session, review your history.</Text>
        </View>
      </Link>

      <Text style={styles.sectionTitle}>Coming next</Text>
      {UPCOMING.map((item) => (
        <View key={item} style={styles.upcomingRow}>
          <Text style={styles.upcomingText}>{item}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  greeting: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  cardTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  cardBody: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  upcomingRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  upcomingText: { color: colors.textMuted, fontSize: fontSize.md },
});
