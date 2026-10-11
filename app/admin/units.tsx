import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PillSelect } from '@/components/admin/PillSelect';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { createUnit, listUnitsAdmin } from '@/data/admin/content';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Unit } from '@/types/models';

const CURRICULUM_OPTIONS = [
  { value: 'true', label: 'Curriculum' },
  { value: 'false', label: 'Phrasebook' },
];

export default function AdminUnitsList() {
  const { session } = useAuth();
  const actorAccountId = session?.user.id ?? '';

  const [units, setUnits] = useState<Unit[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isCurriculum, setIsCurriculum] = useState('true');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setUnits(await listUnitsAdmin());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setCreateError('Name is required.');
      return;
    }
    setCreateError(null);
    setIsSaving(true);
    try {
      const unit = await createUnit(
        { name: name.trim(), sortOrder: Number(sortOrder) || 0, isCurriculum: isCurriculum === 'true' },
        actorAccountId
      );
      setUnits((current) => [...(current ?? []), unit].sort((a, b) => a.sortOrder - b.sortOrder));
      setName('');
      setSortOrder('0');
      setIsCurriculum('true');
      setIsCreating(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create unit.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loadError) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load units</Text>
          <Button label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (units === null) return <LoadingScreen />;

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={styles.title}>Units</Text>
      <Text style={styles.subtitle}>{units.length} units — tap one to manage its lessons.</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {units.map((unit) => (
          <PressableScale
            key={unit.id}
            onPress={() => router.push({ pathname: '/admin/units/[unitId]', params: { unitId: unit.id } })}
            style={[styles.row, shadows.card]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{unit.name}</Text>
              <Text style={styles.rowMeta}>
                {unit.isCurriculum ? 'Curriculum' : 'Phrasebook'} · sort {unit.sortOrder}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableScale>
        ))}

        {isCreating ? (
          <View style={[styles.card, shadows.card]}>
            {createError ? <Text style={styles.errorText}>{createError}</Text> : null}
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="e.g. Greetings" />
            <Text style={styles.fieldLabel}>Sort order</Text>
            <TextInput
              value={sortOrder}
              onChangeText={setSortOrder}
              style={styles.input}
              keyboardType="number-pad"
            />
            <PillSelect label="Type" options={CURRICULUM_OPTIONS} value={isCurriculum} onChange={setIsCurriculum} />
            <View style={styles.actionsRow}>
              <Button label="Cancel" variant="secondary" onPress={() => setIsCreating(false)} style={{ flex: 1 }} />
              <Button label="Create" onPress={handleCreate} loading={isSaving} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Button label="+ New Unit" variant="secondary" onPress={() => setIsCreating(true)} />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  chevron: { fontSize: 18, color: colors.textSecondary },
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centeredTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
});
