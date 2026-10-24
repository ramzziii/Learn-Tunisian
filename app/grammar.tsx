import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { LayoutAnimation, Platform, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';

import { openUpgradeFlow, PremiumBadge } from '@/components/premium/Premium';
import { BackButton } from '@/components/ui/BackButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { GRAMMAR_NOTES, type GrammarNote } from '@/constants/grammarNotes';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';
import { usePremium } from '@/lib/premium/PremiumContext';
import { canAccessGrammarNote } from '@/lib/premium/access';
import { useTheme } from '@/lib/theme/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const EXPAND_ANIMATION = LayoutAnimation.create(220, 'easeInEaseOut', 'opacity');

// Grouping lives here, not in grammarNotes.ts — a UI-only hierarchy on top
// of the same flat data, so adding/reordering topics never requires
// touching this list except to slot a new id into the right bucket.
const GRAMMAR_CATEGORIES: { label: string; noteIds: string[] }[] = [
  { label: 'Sentence Basics', noteIds: ['sentence_order', 'everyday_pronouns'] },
  { label: 'Verbs & Tense', noteIds: ['present_verbs', 'past_tense', 'negation'] },
  { label: 'Everyday Speech', noteIds: ['questions', 'possession', 'small_words'] },
];

interface GroupedNote {
  note: GrammarNote;
  delay: number;
}

function groupGrammarNotes(): { label: string; notes: GroupedNote[] }[] {
  let revealIndex = 0;
  return GRAMMAR_CATEGORIES.map((category) => ({
    label: category.label,
    notes: category.noteIds
      .map((id) => GRAMMAR_NOTES.find((note) => note.id === id))
      .filter((note): note is GrammarNote => !!note)
      .map((note) => ({ note, delay: Math.min(revealIndex++ * 60, 400) })),
  })).filter((group) => group.notes.length > 0);
}

export default function GrammarScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const groupedNotes = useMemo(() => groupGrammarNotes(), []);
  const { isPremium } = usePremium();
  const [expandedId, setExpandedId] = useState<string | null>(
    GRAMMAR_NOTES.find((note) => canAccessGrammarNote(isPremium, note.id))?.id ?? null
  );
  const { speak, isSpeaking } = useLetterSpeech();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(EXPAND_ANIMATION);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const play = (key: string, text: string) => {
    Haptics.selectionAsync();
    setActiveKey(key);
    speak(text);
  };

  useEffect(() => {
    if (!isSpeaking) setActiveKey(null);
  }, [isSpeaking]);

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <Text style={styles.eyebrow}>Grammar</Text>
      <Text style={styles.title}>Tounsi Patterns</Text>
      <Text style={styles.subtitle}>Tap a topic to see examples and quick forms.</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {groupedNotes.map((group) => (
          <View key={group.label} style={styles.categorySection}>
            <Text style={styles.categoryHeading}>{group.label}</Text>
            {group.notes.map(({ note, delay }) => {
              const isLocked = !canAccessGrammarNote(isPremium, note.id);
              // A locked topic never expands — its body isn't rendered at all.
              const isExpanded = !isLocked && expandedId === note.id;
              return (
                <Reveal key={note.id} delay={delay}>
                  <View style={[styles.card, styles.shadowCard, isExpanded && styles.cardExpanded]}>
                    <PressableScale
                      haptic
                      onPress={() => (isLocked ? openUpgradeFlow() : toggle(note.id))}
                      style={styles.headerRow}
                    >
                      <View style={styles.emojiTile}>
                        <Text style={styles.emoji}>{note.emoji}</Text>
                      </View>
                      <Text style={styles.cardTitle}>{note.title}</Text>
                      {isLocked ? <PremiumBadge /> : <Text style={styles.chevron}>{isExpanded ? '⌄' : '›'}</Text>}
                    </PressableScale>

                    {isExpanded ? (
                      <View style={styles.body}>
                        <Text style={styles.explanation}>{note.explanation}</Text>

                        {note.examples.map((example) => (
                          <View key={example.transliteration} style={styles.exampleRow}>
                            <Text style={styles.quoteMark}>&ldquo;</Text>
                            <Text style={styles.example}>
                              <Text style={styles.exampleTransliteration}>{example.transliteration}</Text> —{' '}
                              {example.english}
                            </Text>
                          </View>
                        ))}

                        <View style={styles.termsBox}>
                          {note.quickTerms.map((t) => (
                            <Text key={t.term} style={styles.termLine}>
                              <Text style={styles.termLabel}>{t.term}: </Text>
                              {t.form}
                            </Text>
                          ))}
                        </View>

                        {note.conjugationTable ? (
                          <View style={styles.conjugationSection}>
                            <View style={styles.patternPill}>
                              <Text style={styles.patternPillText}>{note.conjugationTable.patternSummary}</Text>
                            </View>
                            <Text style={styles.modelLine}>
                              MODEL{'  '}
                              <Text style={styles.modelArabic}>{note.conjugationTable.modelArabic}</Text> ·{' '}
                              {note.conjugationTable.modelTransliteration} · “{note.conjugationTable.modelMeaning}”
                            </Text>
                            <View style={styles.conjugationTable}>
                              {note.conjugationTable.rows.map((row, rowIndex) => {
                                const key = `${note.id}-${row.pronounEnglish}`;
                                const isActive = activeKey === key;
                                return (
                                  <PressableScale
                                    key={row.pronounEnglish}
                                    onPress={() => play(key, row.verbArabic)}
                                    style={[styles.conjugationRow, rowIndex % 2 === 1 && styles.conjugationRowAlt]}
                                  >
                                    <View>
                                      <Text style={styles.conjugationPronounArabic}>{row.pronounArabic}</Text>
                                      <Text style={styles.conjugationPronounEnglish}>{row.pronounEnglish}</Text>
                                    </View>
                                    <View style={styles.conjugationVerb}>
                                      <Text style={styles.conjugationVerbArabic}>{row.verbArabic}</Text>
                                      <Text style={styles.conjugationVerbTranslit}>{row.verbTransliteration}</Text>
                                    </View>
                                    <Text style={styles.conjugationAudioIcon}>{isActive ? '🔊' : '🔈'}</Text>
                                  </PressableScale>
                                );
                              })}
                            </View>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </Reveal>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    shadowCard: {
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.error,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: spacing.md,
    },
    title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 20 },
    list: { gap: spacing.lg, paddingBottom: spacing.xxl },
    categorySection: { gap: spacing.md },
    categoryHeading: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
    cardExpanded: { borderWidth: 1, borderColor: `${colors.error}33` },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    emojiTile: {
      width: 36,
      height: 36,
      borderRadius: radii.sm,
      backgroundColor: `${colors.error}1F`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emoji: { fontSize: 18 },
    cardTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.error },
    chevron: { fontSize: 18, color: colors.textSecondary },
    body: { marginTop: spacing.md },
    explanation: { fontSize: 14, color: colors.textPrimary, lineHeight: 20, marginBottom: spacing.md },
    exampleRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
    quoteMark: { fontSize: 16, color: colors.textSecondary, lineHeight: 19 },
    example: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
    exampleTransliteration: { color: colors.textPrimary, fontWeight: '600' },
    termsBox: {
      backgroundColor: `${colors.error}14`,
      borderRadius: radii.md,
      padding: spacing.md,
      marginTop: spacing.sm,
      gap: spacing.xs,
    },
    termLine: { fontSize: 14, color: colors.textPrimary },
    termLabel: { fontWeight: '700', color: colors.error },
    conjugationSection: { marginTop: spacing.md },
    patternPill: {
      backgroundColor: `${colors.primary}1A`,
      borderRadius: radii.pill,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      alignSelf: 'flex-start',
      marginBottom: spacing.sm,
    },
    patternPillText: { fontSize: 12, fontWeight: '700', color: colors.primary },
    modelLine: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 },
    modelArabic: { fontSize: 14, color: colors.textPrimary, letterSpacing: 0 },
    conjugationTable: { borderRadius: radii.md, overflow: 'hidden' },
    conjugationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.surface,
    },
    conjugationRowAlt: { backgroundColor: colors.background },
    conjugationPronounArabic: { fontSize: 14, color: colors.primary, textAlign: 'right' },
    conjugationPronounEnglish: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    conjugationVerb: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    conjugationVerbArabic: { fontSize: 16, color: colors.textPrimary },
    conjugationVerbTranslit: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
    conjugationAudioIcon: { fontSize: 13, marginLeft: spacing.sm, opacity: 0.6 },
  });
