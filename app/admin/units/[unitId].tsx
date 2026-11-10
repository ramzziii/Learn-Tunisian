import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FieldHelp } from '@/components/admin/FieldHelp';
import { PillSelect } from '@/components/admin/PillSelect';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import {
  createLesson,
  deleteUnit,
  listLessonsForUnit,
  listUnitsAdmin,
  updateUnit,
} from '@/data/admin/content';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Lesson, Unit } from '@/types/models';
import { useTheme } from '@/lib/theme/ThemeContext';
import { confirmAction } from '@/lib/confirmAction';

const CURRICULUM_OPTIONS = [
  { value: 'true', label: 'Curriculum' },
  { value: 'false', label: 'Phrasebook' },
];

export default function AdminUnitDetail() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { unitId } = useLocalSearchParams<{ unitId: string }>();
  const { session } = useAuth();
  const actorAccountId = session?.user.id ?? '';

  const [unit, setUnit] = useState<Unit | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isCurriculum, setIsCurriculum] = useState('true');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isAddingLesson, setIsAddingLesson] = useState(false);
  const [lessonNumber, setLessonNumber] = useState('1');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonSortOrder, setLessonSortOrder] = useState('0');
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [isSavingLesson, setIsSavingLesson] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [allUnits, lessonList] = await Promise.all([listUnitsAdmin(), listLessonsForUnit(unitId)]);
      const found = allUnits.find((u) => u.id === unitId) ?? null;
      setUnit(found);
      setLessons(lessonList);
      if (found) {
        setName(found.name);
        setSortOrder(String(found.sortOrder));
        setIsCurriculum(String(found.isCurriculum));
      }
    } catch {
      setLoadError(true);
    }
  }, [unitId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveError('Name is required.');
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      const updated = await updateUnit(
        unitId,
        { name: name.trim(), sortOrder: Number(sortOrder) || 0, isCurriculum: isCurriculum === 'true' },
        actorAccountId
      );
      setUnit(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save unit.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    confirmAction({
      title: 'Delete this unit?',
      message:
        'This cascades to its lessons, word groups, variants, and any learner progress/favorites referencing them. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        await deleteUnit(unitId);
        router.back();
      },
    });
  };

  const handleAddLesson = async () => {
    const number = Number(lessonNumber);
    if (!number || number < 1) {
      setLessonError('Lesson number must be a positive number.');
      return;
    }
    setLessonError(null);
    setIsSavingLesson(true);
    try {
      const lesson = await createLesson(
        { unitId, lessonNumber: number, title: lessonTitle.trim() || null, sortOrder: Number(lessonSortOrder) || 0 },
        actorAccountId
      );
      setLessons((current) => [...(current ?? []), lesson].sort((a, b) => a.sortOrder - b.sortOrder));
      setLessonNumber(String(number + 1));
      setLessonTitle('');
      setLessonSortOrder('0');
      setIsAddingLesson(false);
    } catch (err) {
      setLessonError(err instanceof Error ? err.message : 'Could not create lesson.');
    } finally {
      setIsSavingLesson(false);
    }
  };

  if (loadError) {
    return (
      <ScreenContainer themed>
        <BackButton themed />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load this unit</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (unit === null || lessons === null) return <LoadingScreen themed />;

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{unit.name}</Text>

        <View style={[styles.card, shadows.card]}>
          {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
          <FieldHelp label="Name" help="unitName" labelStyle={styles.fieldLabel} />
          <TextInput accessibilityLabel="Name" value={name} onChangeText={setName} style={styles.input} />
          <FieldHelp label="Sort order" help="unitSortOrder" labelStyle={styles.fieldLabel} />
          <TextInput accessibilityLabel="Sort order" value={sortOrder} onChangeText={setSortOrder} style={styles.input} keyboardType="number-pad" />
          <PillSelect label="Type" help="unitType" options={CURRICULUM_OPTIONS} value={isCurriculum} onChange={setIsCurriculum} />
          <Button themed label="Save" onPress={handleSave} loading={isSaving} style={{ marginTop: spacing.sm }} />
        </View>

        <Text style={styles.sectionTitle}>Lessons</Text>
        {lessons.map((lesson) => (
          <PressableScale
            key={lesson.id}
            onPress={() => router.push({ pathname: '/admin/lessons/[lessonId]', params: { lessonId: lesson.id } })}
            style={[styles.row, shadows.card]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                #{lesson.lessonNumber}{lesson.title ? ` — ${lesson.title}` : ''}
              </Text>
              <Text style={styles.rowMeta}>sort {lesson.sortOrder}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableScale>
        ))}

        {isAddingLesson ? (
          <View style={[styles.card, shadows.card]}>
            {lessonError ? <Text style={styles.errorText}>{lessonError}</Text> : null}
            <FieldHelp label="Lesson number" help="lessonNumber" labelStyle={styles.fieldLabel} />
            <TextInput accessibilityLabel="Lesson number"
              value={lessonNumber}
              onChangeText={setLessonNumber}
              style={styles.input}
              keyboardType="number-pad"
            />
            <FieldHelp label="Title (optional)" help="lessonTitle" labelStyle={styles.fieldLabel} />
            <TextInput accessibilityLabel="Title (optional)" value={lessonTitle} onChangeText={setLessonTitle} style={styles.input} />
            <FieldHelp label="Sort order" help="lessonSortOrder" labelStyle={styles.fieldLabel} />
            <TextInput accessibilityLabel="Sort order"
              value={lessonSortOrder}
              onChangeText={setLessonSortOrder}
              style={styles.input}
              keyboardType="number-pad"
            />
            <View style={styles.actionsRow}>
              <Button themed label="Cancel" variant="secondary" onPress={() => setIsAddingLesson(false)} style={{ flex: 1 }} />
              <Button themed label="Create" onPress={handleAddLesson} loading={isSavingLesson} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Button themed label="+ New Lesson" variant="secondary" onPress={() => setIsAddingLesson(true)} />
        )}

        <Button themed label="Delete Unit" variant="ghost" onPress={handleDelete} style={styles.deleteButton} />
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    chevron: { fontSize: 18, color: colors.textSecondary },
    deleteButton: { marginTop: spacing.lg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    centeredTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  });
