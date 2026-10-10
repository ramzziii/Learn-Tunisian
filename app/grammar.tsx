import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { GRAMMAR_NOTES } from '@/constants/grammarNotes';

export default function GrammarScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(GRAMMAR_NOTES[0]?.id ?? null);

  return (
    <ScreenContainer>
      <BackButton />
      <Text style={styles.title}>Grammar Notes</Text>
      <Text style={styles.subtitle}>Tounsi patterns — tap a topic to see examples and quick forms.</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {GRAMMAR_NOTES.map((note, index) => {
          const isExpanded = expandedId === note.id;
          return (
            <Reveal key={note.id} delay={Math.min(index * 60, 400)}>
              <View style={[styles.card, shadows.card]}>
                <PressableScale
                  haptic
                  onPress={() => setExpandedId(isExpanded ? null : note.id)}
                  style={styles.headerRow}
                >
                  <Text style={styles.emoji}>{note.emoji}</Text>
                  <Text style={styles.cardTitle}>{note.title}</Text>
                  <Text style={styles.chevron}>{isExpanded ? '⌄' : '›'}</Text>
                </PressableScale>

                {isExpanded ? (
                  <View style={styles.body}>
                    <Text style={styles.explanation}>{note.explanation}</Text>

                    {note.examples.map((example) => (
                      <Text key={example.transliteration} style={styles.example}>
                        &ldquo;{example.transliteration}&rdquo; — {example.english}
                      </Text>
                    ))}

                    <View style={styles.termsBox}>
                      {note.quickTerms.map((t) => (
                        <Text key={t.term} style={styles.termLine}>
                          <Text style={styles.termLabel}>{t.term}: </Text>
                          {t.form}
                        </Text>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            </Reveal>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 20 },
  list: { gap: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emoji: { fontSize: 22 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  chevron: { fontSize: 18, color: colors.textSecondary },
  body: { marginTop: spacing.md },
  explanation: { fontSize: 14, color: colors.textPrimary, lineHeight: 20, marginBottom: spacing.md },
  example: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 19, marginBottom: spacing.xs },
  termsBox: { backgroundColor: colors.background, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm, gap: spacing.xs },
  termLine: { fontSize: 14, color: colors.textPrimary },
  termLabel: { fontWeight: '700' },
});
