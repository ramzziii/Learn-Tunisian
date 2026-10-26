import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AudioRecorderField } from '@/components/admin/AudioRecorderField';
import { PillSelect } from '@/components/admin/PillSelect';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import {
  createWordVariant,
  deleteWordVariant,
  getWordGroupAdmin,
  updateWordGroup,
  updateWordVariant,
} from '@/data/admin/content';
import { setRepeatAfterMeInclusion } from '@/data/repeatAfterMe';
import { hasApprovedPrimaryOrGenderPair } from '@/lib/admin/wordGroupValidation';
import { useAuth } from '@/lib/auth/AuthContext';
import type { ContentStatus, VariantLabel, WordGroupWithVariants, WordVariant } from '@/types/models';

const CONTENT_STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
];

const VARIANT_LABEL_OPTIONS: { value: VariantLabel; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'also_heard', label: 'Also heard' },
  { value: 'masculine', label: 'Masculine' },
  { value: 'feminine', label: 'Feminine' },
];

export default function AdminWordGroupDetail() {
  const { wordGroupId } = useLocalSearchParams<{ wordGroupId: string }>();
  const { session } = useAuth();
  const actorAccountId = session?.user.id ?? '';

  const [group, setGroup] = useState<WordGroupWithVariants | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [englishMeaning, setEnglishMeaning] = useState('');
  const [imageKeyword, setImageKeyword] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [contentStatus, setContentStatus] = useState<ContentStatus>('draft');
  const [groupError, setGroupError] = useState<string | null>(null);
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const found = await getWordGroupAdmin(wordGroupId);
      setGroup(found);
      if (found) {
        setEnglishMeaning(found.englishMeaning);
        setImageKeyword(found.imageKeyword ?? '');
        setSortOrder(String(found.sortOrder));
        setContentStatus(found.contentStatus);
      }
    } catch {
      setLoadError(true);
    }
  }, [wordGroupId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveGroup = async () => {
    if (!englishMeaning.trim()) {
      setGroupError('English meaning is required.');
      return;
    }
    if (
      contentStatus === 'approved' &&
      !hasApprovedPrimaryOrGenderPair(group?.variants.map((v) => ({ variantLabel: v.variantLabel, contentStatus: v.contentStatus })) ?? [])
    ) {
      setGroupError(
        'Can\'t approve this group yet — it needs an approved "primary" variant, or both an approved "masculine" and "feminine" variant.'
      );
      return;
    }
    setGroupError(null);
    setIsSavingGroup(true);
    try {
      const updated = await updateWordGroup(
        wordGroupId,
        { englishMeaning: englishMeaning.trim(), imageKeyword: imageKeyword.trim() || null, sortOrder: Number(sortOrder) || 0, contentStatus },
        actorAccountId
      );
      setGroup((current) => (current ? { ...current, ...updated } : current));
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Could not save word group.');
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleVariantSaved = (variant: WordVariant) => {
    setGroup((current) =>
      current ? { ...current, variants: current.variants.map((v) => (v.id === variant.id ? variant : v)) } : current
    );
  };

  const handleVariantDeleted = (variantId: string) => {
    setGroup((current) => (current ? { ...current, variants: current.variants.filter((v) => v.id !== variantId) } : current));
  };

  const handleVariantCreated = (variant: WordVariant) => {
    setGroup((current) => (current ? { ...current, variants: [...current.variants, variant] } : current));
  };

  if (loadError) {
    return (
      <ScreenContainer>
        <BackButton />
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Couldn&apos;t load this word group</Text>
          <Button label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }

  if (group === null) return <LoadingScreen />;

  return (
    <ScreenContainer>
      <BackButton />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{group.englishMeaning}</Text>

        <View style={[styles.card, shadows.card]}>
          {groupError ? <Text style={styles.errorText}>{groupError}</Text> : null}
          <Text style={styles.fieldLabel}>English meaning</Text>
          <TextInput value={englishMeaning} onChangeText={setEnglishMeaning} style={styles.input} />
          <Text style={styles.fieldLabel}>Image keyword</Text>
          <TextInput value={imageKeyword} onChangeText={setImageKeyword} style={styles.input} />
          <Text style={styles.fieldLabel}>Sort order</Text>
          <TextInput value={sortOrder} onChangeText={setSortOrder} style={styles.input} keyboardType="number-pad" />
          <PillSelect
            label="Status"
            options={CONTENT_STATUS_OPTIONS}
            value={contentStatus}
            onChange={(v) => setContentStatus(v as ContentStatus)}
          />
          <Button label="Save" onPress={handleSaveGroup} loading={isSavingGroup} style={{ marginTop: spacing.sm }} />
        </View>

        <Text style={styles.sectionTitle}>Variants ({group.variants.length})</Text>
        {!group.variants.some((v) => v.variantLabel === 'primary') ? (
          <Text style={styles.noPrimaryWarning}>
            ⚠️ No variant here is labeled &quot;Primary&quot; — the Phrasebook always reads the Primary variant
            specifically, so nothing will show there until one exists. (A Masculine/Feminine pair still works fine
            for lesson exercises — just not the Phrasebook.)
          </Text>
        ) : null}
        {group.variants.map((variant) => (
          <VariantRow
            key={variant.id}
            variant={variant}
            actorAccountId={actorAccountId}
            onSaved={handleVariantSaved}
            onDeleted={handleVariantDeleted}
          />
        ))}

        <NewVariantForm
          wordGroupId={group.id}
          actorAccountId={actorAccountId}
          onCreated={handleVariantCreated}
          onSaved={handleVariantSaved}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

function VariantRow({
  variant,
  actorAccountId,
  onSaved,
  onDeleted,
}: {
  variant: WordVariant;
  actorAccountId: string;
  onSaved: (variant: WordVariant) => void;
  onDeleted: (variantId: string) => void;
}) {
  const [variantLabel, setVariantLabel] = useState<VariantLabel>(variant.variantLabel);
  const [wordArabic, setWordArabic] = useState(variant.wordArabic);
  const [transliteration, setTransliteration] = useState(variant.transliteration);
  const [notes, setNotes] = useState(variant.notes ?? '');
  const [sortOrder, setSortOrder] = useState(String(variant.sortOrder));
  const [status, setStatus] = useState<ContentStatus>(variant.contentStatus);
  const [speakerName, setSpeakerName] = useState(variant.speakerName ?? '');
  const [dialectNotes, setDialectNotes] = useState(variant.dialectNotes ?? '');
  const [isNativeVoice, setIsNativeVoice] = useState(variant.isNativeVoice);
  const [nativeVerified, setNativeVerified] = useState(variant.nativeVerified);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const updated = await updateWordVariant(
        variant.id,
        {
          variantLabel,
          wordArabic: wordArabic.trim(),
          transliteration: transliteration.trim(),
          notes: notes.trim() || null,
          sortOrder: Number(sortOrder) || 0,
          contentStatus: status,
          speakerName: speakerName.trim() || null,
          dialectNotes: dialectNotes.trim() || null,
          isNativeVoice,
          nativeVerified,
        },
        actorAccountId
      );
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save variant.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      await deleteWordVariant(variant.id);
      onDeleted(variant.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete variant.');
      setIsDeleting(false);
    }
  };

  return (
    <View style={[styles.card, shadows.card]}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {variant.variantLabel === 'primary' ? (
        <View style={styles.shownBadge}>
          <Text style={styles.shownBadgeText}>✅ Shown to learners (Primary)</Text>
        </View>
      ) : (
        <Text style={styles.notShownHint}>
          Not shown in the Phrasebook — only the &quot;Primary&quot; variant is. (Used by lesson exercises if
          paired with a matching Masculine/Feminine, or as an alternate pronunciation.)
        </Text>
      )}
      <View style={styles.variantHeaderRow}>
        <PillSelect label="Label" options={VARIANT_LABEL_OPTIONS} value={variantLabel} onChange={(v) => setVariantLabel(v as VariantLabel)} />
        <View style={styles.verifiedBox}>
          <Text style={styles.fieldLabel}>Native verified</Text>
          <Switch value={nativeVerified} onValueChange={setNativeVerified} trackColor={{ true: colors.success }} />
        </View>
      </View>
      <Text style={styles.fieldLabel}>Arabic</Text>
      <TextInput value={wordArabic} onChangeText={setWordArabic} style={styles.input} />
      <Text style={styles.fieldLabel}>Transliteration</Text>
      <TextInput value={transliteration} onChangeText={setTransliteration} style={styles.input} />
      <Text style={styles.fieldLabel}>Notes</Text>
      <TextInput value={notes} onChangeText={setNotes} style={styles.input} />
      <Text style={styles.fieldLabel}>Sort order</Text>
      <TextInput value={sortOrder} onChangeText={setSortOrder} style={styles.input} keyboardType="number-pad" />
      <PillSelect label="Status" options={CONTENT_STATUS_OPTIONS} value={status} onChange={(v) => setStatus(v as ContentStatus)} />

      <Text style={styles.fieldLabel}>Pronunciation recording</Text>
      <AudioRecorderField
        wordGroupId={variant.wordGroupId}
        variantId={variant.id}
        currentAudioPath={variant.audioPath}
        updatedAt={variant.updatedAt}
        onUploaded={async (path) => {
          // Deliberately not caught: a failure here must propagate back to
          // AudioRecorderField so it shows the error and keeps the previous
          // file, rather than reporting success and deleting it.
          const updated = await updateWordVariant(variant.id, { audioPath: path }, actorAccountId);
          onSaved(updated);
          return updated.audioPath;
        }}
        repeatAfterMe={repeatAfterMeOptions(variant, actorAccountId, onSaved)}
      />

      {/* A separate file and column from the pronunciation above, and never
          part of Repeat After Me (so no repeatAfterMe prop here). */}
      <Text style={styles.fieldLabel}>Explanation recording (optional)</Text>
      <Text style={styles.helperText}>
        A native speaker explaining it — in English, Arabic, or both.
        {variant.explanationAudioPath ? '' : ' No explanation yet.'}
      </Text>
      <AudioRecorderField
        wordGroupId={variant.wordGroupId}
        variantId={`${variant.id}-explanation`}
        currentAudioPath={variant.explanationAudioPath}
        updatedAt={variant.updatedAt}
        onUploaded={async (path) => {
          // Not caught, for the same reason as above.
          const updated = await updateWordVariant(variant.id, { explanationAudioPath: path }, actorAccountId);
          onSaved(updated);
          return updated.explanationAudioPath;
        }}
      />

      <View style={styles.variantHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Speaker name</Text>
          <TextInput value={speakerName} onChangeText={setSpeakerName} style={styles.input} />
        </View>
        <View style={styles.verifiedBox}>
          <Text style={styles.fieldLabel}>Native voice</Text>
          <Switch value={isNativeVoice} onValueChange={setIsNativeVoice} trackColor={{ true: colors.success }} />
        </View>
      </View>
      <Text style={styles.fieldLabel}>Dialect / regional notes</Text>
      <TextInput value={dialectNotes} onChangeText={setDialectNotes} style={styles.input} />

      <View style={styles.actionsRow}>
        <Button label="Delete" variant="ghost" onPress={handleDelete} loading={isDeleting} style={{ flex: 1 }} />
        <Button label="Save" onPress={handleSave} loading={isSaving} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/**
 * The recorder's "Add this recording to Repeat After Me?" answer. Declining
 * something that isn't included writes nothing; anything else is persisted
 * (admin-only by RLS) and must succeed before the recorder confirms it.
 */
function repeatAfterMeOptions(variant: WordVariant, actorAccountId: string, onSaved: (variant: WordVariant) => void) {
  return {
    isIncluded: variant.inRepeatAfterMe,
    onDecide: async (include: boolean) => {
      if (!include && !variant.inRepeatAfterMe) return;
      onSaved(await setRepeatAfterMeInclusion(variant.id, include, actorAccountId));
    },
  };
}

function NewVariantForm({
  wordGroupId,
  actorAccountId,
  onCreated,
  onSaved,
}: {
  wordGroupId: string;
  actorAccountId: string;
  onCreated: (variant: WordVariant) => void;
  onSaved: (variant: WordVariant) => void;
}) {
  const [variantLabel, setVariantLabel] = useState<VariantLabel>('primary');
  const [wordArabic, setWordArabic] = useState('');
  const [transliteration, setTransliteration] = useState('');
  const [notes, setNotes] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // The variant just added here — offered an "Add recording" step right away.
  const [createdVariant, setCreatedVariant] = useState<WordVariant | null>(null);
  const [isRecordingCreated, setIsRecordingCreated] = useState(false);

  const handleCreatedSaved = (variant: WordVariant) => {
    setCreatedVariant(variant);
    onSaved(variant);
  };

  const handleCreate = async () => {
    if (!wordArabic.trim() || !transliteration.trim()) {
      setError('Arabic and transliteration are required.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const created = await createWordVariant(
        {
          wordGroupId,
          variantLabel,
          wordArabic: wordArabic.trim(),
          transliteration: transliteration.trim(),
          audioPath: null,
          notes: notes.trim() || null,
          sortOrder: Number(sortOrder) || 0,
          contentStatus: 'draft',
        },
        actorAccountId
      );
      onCreated(created);
      setCreatedVariant(created);
      setIsRecordingCreated(false);
      setWordArabic('');
      setTransliteration('');
      setNotes('');
      setSortOrder('0');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create variant.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.card, shadows.card]}>
      <Text style={styles.sectionTitle}>Add variant</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <PillSelect label="Label" options={VARIANT_LABEL_OPTIONS} value={variantLabel} onChange={(v) => setVariantLabel(v as VariantLabel)} />
      <Text style={styles.fieldLabel}>Arabic</Text>
      <TextInput value={wordArabic} onChangeText={setWordArabic} style={styles.input} placeholder="Arabic" />
      <Text style={styles.fieldLabel}>Transliteration</Text>
      <TextInput value={transliteration} onChangeText={setTransliteration} style={styles.input} placeholder="Transliteration" />
      <Text style={styles.fieldLabel}>Notes</Text>
      <TextInput value={notes} onChangeText={setNotes} style={styles.input} />
      <Text style={styles.fieldLabel}>Sort order</Text>
      <TextInput value={sortOrder} onChangeText={setSortOrder} style={styles.input} keyboardType="number-pad" />
      <Button label="+ Add Variant" variant="secondary" onPress={handleCreate} loading={isSaving} style={{ marginTop: spacing.sm }} />

      {createdVariant ? (
        <View style={styles.addRecordingBox}>
          <Text style={styles.addRecordingText}>
            Added &ldquo;{createdVariant.transliteration}&rdquo;.
            {createdVariant.audioPath ? '' : ' It has no recording yet.'}
          </Text>
          {isRecordingCreated ? (
            <AudioRecorderField
              wordGroupId={createdVariant.wordGroupId}
              variantId={createdVariant.id}
              currentAudioPath={createdVariant.audioPath}
              updatedAt={createdVariant.updatedAt}
              onUploaded={async (path) => {
                const updated = await updateWordVariant(createdVariant.id, { audioPath: path }, actorAccountId);
                handleCreatedSaved(updated);
                return updated.audioPath;
              }}
              repeatAfterMe={repeatAfterMeOptions(createdVariant, actorAccountId, handleCreatedSaved)}
            />
          ) : (
            <Button label="Add recording" onPress={() => setIsRecordingCreated(true)} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.sm, paddingBottom: spacing.xl },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, gap: 4 },
  errorText: { fontSize: 13, color: colors.error, marginBottom: spacing.xs },
  helperText: { fontSize: 12, color: colors.textSecondary },
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
  addRecordingBox: { marginTop: spacing.md, gap: spacing.sm, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: `${colors.primary}14` },
  addRecordingText: { fontSize: 13, color: colors.textPrimary },
  noPrimaryWarning: {
    fontSize: 12,
    color: colors.error,
    backgroundColor: `${colors.error}14`,
    borderRadius: radii.sm,
    padding: spacing.sm,
    lineHeight: 17,
  },
  shownBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${colors.success}1F`,
    borderRadius: radii.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  shownBadgeText: { fontSize: 11, fontWeight: '700', color: colors.success },
  notShownHint: { fontSize: 11, color: colors.textSecondary, lineHeight: 15, marginBottom: spacing.xs },
  variantHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  verifiedBox: { alignItems: 'flex-start', marginTop: spacing.sm },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centeredTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
});
