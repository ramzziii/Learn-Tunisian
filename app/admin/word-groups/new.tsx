import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, spacing } from '@/constants/theme';
import { createWordGroup } from '@/data/admin/content';
import { useAuth } from '@/lib/auth/AuthContext';

export default function AdminNewWordGroup() {
  const { unitId, lessonNumber } = useLocalSearchParams<{ unitId: string; lessonNumber: string }>();
  const { session } = useAuth();
  const actorAccountId = session?.user.id ?? '';

  const [id, setId] = useState('');
  const [englishMeaning, setEnglishMeaning] = useState('');
  const [imageKeyword, setImageKeyword] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleCreate = async () => {
    if (!id.trim() || !englishMeaning.trim()) {
      setError('ID and English meaning are required.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const group = await createWordGroup(
        {
          id: id.trim(),
          unitId,
          lessonNumber: Number(lessonNumber),
          englishMeaning: englishMeaning.trim(),
          imageKeyword: imageKeyword.trim() || null,
          imagePath: null,
          sortOrder: Number(sortOrder) || 0,
          // Stays 'draft' — the DB's primary/gender-pair constraint rejects
          // 'approved' with zero variants, and there are none yet.
          contentStatus: 'draft',
        },
        actorAccountId
      );
      router.replace({ pathname: '/admin/word-groups/[wordGroupId]', params: { wordGroupId: group.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create word group.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <BackButton />
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>New Word Group</Text>
        <Text style={styles.subtitle}>
          In lesson #{lessonNumber} of unit {unitId}. You&apos;ll add variants (and set it to approved) next.
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={styles.fieldLabel}>ID (slug)</Text>
        <TextInput
          value={id}
          onChangeText={setId}
          style={styles.input}
          placeholder="e.g. pb_greet_hello"
          autoCapitalize="none"
        />
        <Text style={styles.fieldLabel}>English meaning</Text>
        <TextInput value={englishMeaning} onChangeText={setEnglishMeaning} style={styles.input} placeholder="e.g. hello" />
        <Text style={styles.fieldLabel}>Image keyword (optional)</Text>
        <TextInput value={imageKeyword} onChangeText={setImageKeyword} style={styles.input} />
        <Text style={styles.fieldLabel}>Sort order</Text>
        <TextInput value={sortOrder} onChangeText={setSortOrder} style={styles.input} keyboardType="number-pad" />

        <Button label="Create" onPress={handleCreate} loading={isSaving} style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
  errorText: { fontSize: 13, color: colors.error, marginBottom: spacing.sm },
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
});
