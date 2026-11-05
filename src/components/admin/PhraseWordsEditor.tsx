import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { fetchLinkCandidatesAdmin, fetchPhraseWordLinksAdmin, savePhraseWordLinks } from '@/data/admin/phraseWords';
import { suggestWordLinks } from '@/lib/phraseWords/suggestWordLinks';
import { buildSearchIndex, searchWords } from '@/lib/search/searchIndex';
import type { WordGroupWithVariants } from '@/types/models';
import { useTheme } from '@/lib/theme/ThemeContext';

type ItemKind = 'linked' | 'match' | 'possible' | 'added';
interface Item {
  wordId: string;
  kind: ItemKind;
  ticked: boolean;
  shownArabic: string;
  shownLatin: string;
}

const KIND_LABEL: Record<ItemKind, string> = { linked: 'linked', match: 'match', possible: 'possible match', added: 'added' };
const EMPTY_SHOWN = 'Each ticked word needs its Arabic and Latin as they appear in the phrase.';
const SEARCH_RESULTS = 8;

const primaryForm = (w: WordGroupWithVariants) => w.variants.find((v) => v.variantLabel === 'primary') ?? w.variants[0];

/**
 * Admin → word group → "Words used". Suggests the existing words found in
 * the phrase (matches start ticked; possible matches are labelled and never
 * ticked); the admin ticks, unticks, reorders, edits how each word appears in
 * the phrase, or searches and adds a word by hand. Nothing is linked until
 * "Save words used", which replaces the phrase's whole list at once.
 */
export function PhraseWordsEditor({ phrase }: { phrase: WordGroupWithVariants }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [candidates, setCandidates] = useState<WordGroupWithVariants[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLinkCandidatesAdmin(), fetchPhraseWordLinksAdmin(phrase.id)])
      .then(([words, saved]) => {
        if (cancelled) return;
        const savedIds = new Set(saved.map((s) => s.wordId));
        setCandidates(words);
        setItems([
          ...saved.map((s) => ({ ...s, kind: 'linked' as const, ticked: true })),
          ...suggestWordLinks(phrase, words)
            .filter((s) => !savedIds.has(s.wordId))
            .map((s) => ({ wordId: s.wordId, kind: s.kind, ticked: s.ticked, shownArabic: s.shownArabic, shownLatin: s.shownLatin })),
        ]);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
    // Suggestions are made once per phrase opened; re-suggesting on every edit would lose the admin's choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase.id]);

  const byId = useMemo(() => new Map((candidates ?? []).map((w) => [w.id, w])), [candidates]);
  const index = useMemo(() => buildSearchIndex((candidates ?? []).filter((w) => w.id !== phrase.id)), [candidates, phrase.id]);
  const listed = new Set(items.map((i) => i.wordId));
  const results = query.trim() ? searchWords(index, query, SEARCH_RESULTS * 2).filter((r) => !listed.has(r.group.id)).slice(0, SEARCH_RESULTS) : [];

  const update = (wordId: string, patch: Partial<Item>) => {
    setMessage(null);
    setItems((prev) => prev.map((i) => (i.wordId === wordId ? { ...i, ...patch } : i)));
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    setMessage(null);
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const add = (word: WordGroupWithVariants) => {
    const form = primaryForm(word);
    setItems((prev) => [...prev, { wordId: word.id, kind: 'added', ticked: true, shownArabic: form?.wordArabic ?? '', shownLatin: form?.transliteration ?? '' }]);
    setQuery('');
  };
  const save = async () => {
    const links = items.filter((i) => i.ticked);
    if (links.some((l) => !l.shownArabic.trim() || !l.shownLatin.trim())) {
      setMessage(EMPTY_SHOWN);
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      await savePhraseWordLinks(phrase.id, links.map(({ wordId, shownArabic, shownLatin }) => ({ wordId, shownArabic, shownLatin })));
      setItems((prev) => prev.map((i) => (i.ticked ? { ...i, kind: 'linked' } : i)));
      setMessage(`Saved ${links.length} word${links.length === 1 ? '' : 's'} used.`);
    } catch (e) {
      setMessage(`Couldn’t save: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (loadError) return <Text style={styles.error}>Couldn&apos;t load the words for suggestions.</Text>;
  if (!candidates) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />;

  return (
    <View style={[styles.card, shadows.card]}>
      <Text style={styles.help}>
        Words from the app found in this phrase. Matches start ticked; a possible match (a changed form) is never ticked
        for you. Nothing is linked until you press Save.
      </Text>
      {items.length === 0 ? <Text style={styles.help}>No words found in this phrase yet — search below to add one.</Text> : null}

      {items.map((item, i) => {
        const word = byId.get(item.wordId);
        const meaning = word?.englishMeaning ?? item.wordId;
        return (
          <View key={item.wordId} style={styles.row}>
            <View style={styles.rowHeader}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={`${meaning} — ${KIND_LABEL[item.kind]}`}
                accessibilityState={{ checked: item.ticked }}
                onPress={() => update(item.wordId, { ticked: !item.ticked })}
                style={styles.tick}
                hitSlop={8}
              >
                <Text style={styles.tickBox}>{item.ticked ? '☑' : '☐'}</Text>
                <Text style={styles.meaning}>{meaning}</Text>
              </Pressable>
              {item.kind === 'possible' ? <Text style={styles.possible}>Possible match</Text> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`Move ${meaning} up`} onPress={() => move(i, i - 1)} style={styles.arrow} hitSlop={8}>
                <Text>↑</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Move ${meaning} down`} onPress={() => move(i, i + 1)} style={styles.arrow} hitSlop={8}>
                <Text>↓</Text>
              </Pressable>
            </View>
            {word ? <Text style={styles.wordForm}>{`${primaryForm(word)?.transliteration ?? ''} · ${primaryForm(word)?.wordArabic ?? ''}`}</Text> : null}
            <View style={styles.shownRow}>
              <TextInput
                accessibilityLabel={`${meaning}: Arabic as in the phrase`}
                value={item.shownArabic}
                onChangeText={(t) => update(item.wordId, { shownArabic: t })}
                style={[styles.input, styles.arabicInput]}
              />
              <TextInput
                accessibilityLabel={`${meaning}: Latin as in the phrase`}
                value={item.shownLatin}
                onChangeText={(t) => update(item.wordId, { shownLatin: t })}
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
          </View>
        );
      })}

      <TextInput
        accessibilityLabel="Search words to add"
        placeholder="Search words to add (English, عربي or Latin)"
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { marginTop: spacing.md }]}
      />
      {results.map((r) => (
        <Pressable key={r.group.id} accessibilityRole="button" accessibilityLabel={`Add ${r.group.englishMeaning}`} onPress={() => add(r.group)} style={styles.result}>
          <Text style={styles.meaning}>{`+ ${r.group.englishMeaning}`}</Text>
          <Text style={styles.wordForm}>{`${primaryForm(r.group)?.transliteration ?? ''} · ${primaryForm(r.group)?.wordArabic ?? ''}`}</Text>
        </Pressable>
      ))}

      {message ? <Text style={message.startsWith('Saved') ? styles.saved : styles.error}>{message}</Text> : null}
      <Button themed label="Save words used" onPress={save} loading={isSaving} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm, gap: spacing.xs },
    help: { fontSize: 12, color: colors.textSecondary },
    row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
    rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    tick: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1, minHeight: 44 },
    tickBox: { fontSize: 20, color: colors.primary },
    meaning: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    possible: { fontSize: 11, fontWeight: '700', color: colors.accent, textTransform: 'uppercase' },
    arrow: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    wordForm: { fontSize: 12, color: colors.textSecondary },
    shownRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      fontSize: 14,
      color: colors.textPrimary,
    },
    arabicInput: { textAlign: 'right' },
    result: { paddingVertical: spacing.xs, minHeight: 44, justifyContent: 'center' },
    saved: { fontSize: 13, color: colors.success },
    error: { fontSize: 13, color: colors.error },
  });
