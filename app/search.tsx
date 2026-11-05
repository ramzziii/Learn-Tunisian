import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

import { TunisianText } from '@/components/tunisian/TunisianText';
import { AudioPlayButton } from '@/components/ui/AudioPlayButton';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { useAccess } from '@/lib/access/AccessContext';
import { preferredVariant } from '@/lib/display/displayRules';
import { useDisplayPreferences } from '@/lib/display/useDisplayPreferences';
import { isListenableVariant } from '@/lib/listening';
import { searchWords, type SearchResult } from '@/lib/search/searchIndex';
import { useSearchIndex } from '@/lib/search/useSearchIndex';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { VariantLabel } from '@/types/models';

const DEBOUNCE_MS = 150;
const MATCHED_NOTE: Partial<Record<VariantLabel, string>> = {
  also_heard: 'matched: also heard',
  masculine: 'matched: masculine',
  feminine: 'matched: feminine',
};

/**
 * Dictionary / Search. Searches an in-memory index of only the words this
 * learner can open (src/lib/search) — in English, Arabic script or Latin
 * letters with chat digits. Typing never touches the network, is never
 * logged and never counts; opening a result counts for guests only (2).
 * The empty state is the same static text whatever was typed, so it can't
 * reveal that a locked word exists.
 */
export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { tier, open } = useAccess();
  const { status, index, retry } = useSearchIndex();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const results = useMemo(() => (index && query.trim() ? searchWords(index, query) : []), [index, query]);

  const openResult = async (wordGroupId: string) => {
    // Free / Premium: always allowed, nothing counted. Guests: 2, on the device.
    const allowed = await open('dictionary_result', wordGroupId).catch(() => false);
    if (allowed) router.push(`/word/${wordGroupId}`);
    else router.push({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });
  };

  const askForWord = () => {
    if (tier === 'guest') router.push({ pathname: '/guest/create-account', params: { reason: 'account' } });
    else router.push({ pathname: '/translation-requests', params: { text: query.trim() } });
  };

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <Text style={styles.title} accessibilityRole="header">
        Dictionary
      </Text>
      <TextInput
        accessibilityLabel="Search words"
        placeholder="English, عربي or Latin letters (3, 7, 9…)"
        placeholderTextColor={colors.textSecondary}
        value={text}
        onChangeText={setText}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.input}
      />

      {status === 'offline' ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Search needs a connection</Text>
          <Text style={styles.emptyBody}>Connect to the internet and try again.</Text>
          <Button themed label="Try again" variant="secondary" onPress={retry} />
        </View>
      ) : status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !query.trim() ? (
        <Text style={styles.hint}>Search the words you can open, in English, Arabic script or Latin letters.</Text>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No matching words you can open yet.</Text>
          <Button themed label="Ask for this word" variant="secondary" onPress={askForWord} />
          {tier === 'free' ? <Text style={styles.emptyBody}>More words are included with Premium.</Text> : null}
          {tier === 'guest' ? <Text style={styles.emptyBody}>Create a free account to search more words.</Text> : null}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => r.group.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ResultRow result={item} onOpen={() => openResult(item.group.id)} />}
        />
      )}
    </ScreenContainer>
  );
}

function ResultRow({ result, onOpen }: { result: SearchResult; onOpen: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { preferences } = useDisplayPreferences();
  const { group, matchedLabel } = result;
  // The primary form (falling back to the preferred form for words without one).
  const shown =
    group.variants.find((v) => v.variantLabel === 'primary') ?? preferredVariant(group, preferences.form) ?? group.variants[0] ?? null;
  const nativeRecording = shown && isListenableVariant(shown) ? shown : null;
  const audio = useWordAudioPlayer(nativeRecording);
  const label = preferences.script === 'arabic' ? shown?.wordArabic : shown?.transliteration;
  const note = matchedLabel ? MATCHED_NOTE[matchedLabel] : undefined;

  return (
    <View style={[styles.row, shadows.card]}>
      <PressableScale
        haptic
        accessibilityRole="button"
        accessibilityLabel={`${label ?? ''} — ${group.englishMeaning}`}
        onPress={onOpen}
        style={styles.rowText}
      >
        <TunisianText arabic={shown?.wordArabic} latin={shown?.transliteration} layout="inline" />
        <Text style={styles.meaning}>{group.englishMeaning}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </PressableScale>
      {nativeRecording ? (
        <View accessible accessibilityRole="button" accessibilityLabel={`Hear ${group.englishMeaning}`}>
          <AudioPlayButton
            size={40}
            onPress={audio.play}
            hasAudio={audio.hasAudio}
            isResolving={audio.isResolving}
            hasError={audio.hasError}
            onRetry={audio.retry}
          />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.sm },
    input: {
      marginTop: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 17,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    hint: { marginTop: spacing.lg, fontSize: 15, color: colors.textSecondary, lineHeight: 21 },
    center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    emptyBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    list: { gap: spacing.sm, paddingVertical: spacing.lg },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    rowText: { flex: 1 },
    meaning: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
    note: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  });
