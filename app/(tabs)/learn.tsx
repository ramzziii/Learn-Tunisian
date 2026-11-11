import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ExploreSection, PageHeader, SearchBar } from '@/components/learn/LearnView';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { translationReadyText, useNewTranslationAnswers } from '@/components/translation/TranslationRequestsEntry';
import { spacing } from '@/constants/theme';

/**
 * Learn — the dictionary and the reference features (Explore Tunisian:
 * Alphabet, Phrasebook, Grammar Notes, Culture Corner, Ask for a
 * translation). The lesson path (progress, Continue, Your units) lives on
 * Home, under Review.
 */
export default function LearnScreen() {
  // The "your translation is ready" notice sits on its Explore tile.
  const translationNotice = translationReadyText(useNewTranslationAnswers());
  const styles = useMemo(() => makeStyles(), []);

  return (
    <ScreenContainer themed style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <PageHeader eyebrow="Explore" title="Learn">
          <SearchBar />
        </PageHeader>
        <View style={styles.body}>
          <ExploreSection translationNotice={translationNotice} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    scrollContent: { paddingBottom: spacing.xxl },
    body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  });
