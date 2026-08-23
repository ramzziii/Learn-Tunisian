import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { UnitSection } from '@/components/lesson-map/UnitSection';
import { colors, spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { fetchLessonMap, type UnitWithLessons } from '@/data/content';

export default function Home() {
  const { activeProfile, profiles } = useActiveProfile();
  const [unitsWithLessons, setUnitsWithLessons] = useState<UnitWithLessons[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    const data = await fetchLessonMap(activeProfile.id);
    setUnitsWithLessons(data);
  }, [activeProfile]);

  useEffect(() => {
    setUnitsWithLessons(null);
    load();
  }, [load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  if (!activeProfile) return <LoadingScreen />;

  return (
    <ScreenContainer style={{ padding: 0 }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Ahla, {activeProfile.name}!</Text>
          <Text style={styles.subGreeting}>Ready for today&apos;s lesson?</Text>
        </View>
        <View style={styles.headerActions}>
          {profiles.length > 1 ? (
            <Pressable onPress={() => router.push('/profiles')} style={styles.iconButton}>
              <Text style={styles.icon}>👥</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.push('/settings')} style={styles.iconButton}>
            <Text style={styles.icon}>⚙️</Text>
          </Pressable>
        </View>
      </View>

      {unitsWithLessons === null ? (
        <LoadingScreen />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        >
          {unitsWithLessons.map((unitWithLessons) => (
            <UnitSection
              key={unitWithLessons.unit.id}
              unitWithLessons={unitWithLessons}
              track={activeProfile.track}
              onSelectLesson={(lessonId) => router.push(`/lesson/${lessonId}`)}
            />
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  greeting: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  subGreeting: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
});
