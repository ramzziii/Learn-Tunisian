import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchFavoriteWordGroups } from '@/data/favorites';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { getPromptVariant } from '@/lib/wordVariants';
import type { WordGroupWithVariants } from '@/types/models';

export default function Favorites() {
  const { activeProfile } = useActiveProfile();
  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);

  useEffect(() => {
    if (!activeProfile) return;
    fetchFavoriteWordGroups(activeProfile.id).then(setGroups);
  }, [activeProfile]);

  if (!groups) return <LoadingScreen />;

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={styles.title}>Favorites</Text>

      {groups.length === 0 ? (
        <Reveal style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>☆</Text>
          <Text style={styles.emptyTitle}>No favorites yet</Text>
          <Text style={styles.emptyBody}>Tap the star on any word to save it here.</Text>
        </Reveal>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.lg }}
          renderItem={({ item, index }) => {
            const display = getPromptVariant(item, 0);
            return (
              <Reveal delay={Math.min(index * 40, 320)}>
                <PressableScale
                  haptic
                  style={[styles.row, shadows.card]}
                  onPress={() => router.push(`/word/${item.id}`)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.arabic}>{display.wordArabic}</Text>
                    <Text style={styles.meaning}>{item.englishMeaning}</Text>
                  </View>
                  <Text style={styles.star}>⭐</Text>
                </PressableScale>
              </Reveal>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  arabic: { fontSize: 20, color: colors.textPrimary, fontWeight: '600' },
  meaning: { fontSize: 13, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  star: { fontSize: 18 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.sm, color: colors.textSecondary },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptyBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
