import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { StatusBadge } from '@/components/admin/StatusBadge';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import {
  deleteLesson,
  getLessonAdmin,
  listWordGroupsForLessonAdmin,
  updateLesson,
} from '@/data/admin/content';
import { useAuth } from '@/lib/auth/AuthContext';
import type { ContentStatus, Lesson, WordGroupWithVariants } from '@/types/models';

export default function AdminLessonDetail() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { session } = useAuth();
  const actorAccountId = session?.user.id ?? '';

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [wordGroups, setWordGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [lessonNumber, setLessonNumber] = useState('1');
  const [title, setTitle] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [lessonRow, groups] = await Promise.all([
        getLessonAdmin(lessonId),
        listWordGroupsForLessonAdmin(lessonId),
      ]);
      setLesson(lessonRow);
      setWordGroups(groups);
      if (lessonRow) {
        setLessonNumber(String(lessonRow.lessonNumber));
        setTitle(lessonRow.title ?? '');
        setSortOrder(String(lessonRow.sortOrder));
      }
    } catch {
      setLoadError(true);
    }
  }, [lessonId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    const number = Number(lessonNumber);
    if (!number || number < 1) {
      setSaveError('Lesson number must be a positive number.');
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      const updated = await updateLesson(
        lessonId,
        { lessonNumber: number, title: title.trim() || null, sortOrder: Number(sortOrder) || 0 },
        actorAccountId
      );
      setLesson(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save lesson.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if ((wordGroups?.length ?? 0) > 0) return;
    Alert.alert('Delete this lesson?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLesson(lessonId);
          router.back();
        },
      },
    ]);
  };

  if (loadError) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load this lesson</Text>
          <Button label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (lesson === null || wordGroups === null) return <LoadingScreen />;

  const blockDelete = wordGroups.length > 0;

  return (
    <ScreenContainer>
      <BackButton />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Lesson #{lesson.lessonNumber}</Text>

        <View style={[styles.card, shadows.card]}>
          {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
          <Text style={styles.fieldLabel}>Lesson number</Text>
          <TextInput value={lessonNumber} onChangeText={setLessonNumber} style={styles.input} keyboardType="number-pad" />
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput value={title} onChangeText={setTitle} style={styles.input} />
          <Text style={styles.fieldLabel}>Sort order</Text>
          <TextInput value={sortOrder} onChangeText={setSortOrder} style={styles.input} keyboardType="number-pad" />
          <Button label="Save" onPress={handleSave} loading={isSaving} style={{ marginTop: spacing.sm }} />
        </View>

        <Text style={styles.sectionTitle}>Word Groups ({wordGroups.length})</Text>
        {wordGroups.map((group) => (
          <PressableScale
            key={group.id}
            onPress={() => router.push({ pathname: '/admin/word-groups/[wordGroupId]', params: { wordGroupId: group.id } })}
            style={[styles.row, shadows.card]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{group.englishMeaning}</Text>
              <Text style={styles.rowMeta}>{group.variants.length} variant{group.variants.length === 1 ? '' : 's'}</Text>
            </View>
            <StatusBadge status={group.contentStatus as ContentStatus} />
          </PressableScale>
        ))}

        <Button
          label="+ New Word Group"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/admin/word-groups/new',
              params: { unitId: lesson.unitId, lessonNumber: String(lesson.lessonNumber) },
            })
          }
        />

        {blockDelete ? (
          <Text style={styles.blockedText}>
            Delete every word group above first — a lesson with word groups can&apos;t be deleted (they have no link
            back to clean up automatically).
          </Text>
        ) : (
          <Button label="Delete Lesson" variant="ghost" onPress={handleDelete} style={styles.deleteButton} />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.sm, paddingBottom: spacing.xl },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, gap: 4 },
  errorText: { fontSize: 13, color: colors.error, marginBottom: spacing.xs },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.sm, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  blockedText: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm, fontStyle: 'italic' },
  deleteButton: { marginTop: spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centeredTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
});
