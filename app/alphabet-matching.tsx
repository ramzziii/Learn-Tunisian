import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedAnswerCard, type AnswerCardState } from '@/components/alphabet/AnimatedAnswerCard';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { buildMatchingGrid, getLetterById, type MatchingTile } from '@/lib/alphabet';
import { markLettersPracticed } from '@/lib/alphabetProgress';
import { useAnswerFeedback } from '@/hooks/useAnswerFeedback';
import { useColumnWidth } from '@/hooks/useColumnWidth';

const PAIR_COUNT = 6;
const MISMATCH_FLASH_MS = 500;
const GRID_COLUMNS = 3;

export default function AlphabetMatchingScreen() {
  const { activeProfile } = useActiveProfile();
  const { playCorrect, playIncorrect } = useAnswerFeedback();
  const tileWidth = useColumnWidth(GRID_COLUMNS, spacing.lg, spacing.sm);
  const [tiles, setTiles] = useState<MatchingTile[]>(() => buildMatchingGrid(PAIR_COUNT));
  const [selectedTileIds, setSelectedTileIds] = useState<string[]>([]);
  const [matchedTileIds, setMatchedTileIds] = useState<string[]>([]);
  const [wrongTileIds, setWrongTileIds] = useState<string[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef(Date.now());
  const persistedRef = useRef(false);

  const matchedPairCount = matchedTileIds.length / 2;
  const isComplete = matchedPairCount === PAIR_COUNT;

  useEffect(() => {
    if (isComplete) return;
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
    return () => clearInterval(interval);
  }, [isComplete]);

  useEffect(() => {
    if (!isComplete || persistedRef.current || !activeProfile) return;
    persistedRef.current = true;
    const letterIds = Array.from(new Set(tiles.map((tile) => tile.letterId)));
    markLettersPracticed(activeProfile.id, letterIds);
  }, [isComplete, activeProfile, tiles]);

  const handleReset = () => {
    setTiles(buildMatchingGrid(PAIR_COUNT));
    setSelectedTileIds([]);
    setMatchedTileIds([]);
    setWrongTileIds([]);
    setIsLocked(false);
    setElapsedMs(0);
    startedAtRef.current = Date.now();
    persistedRef.current = false;
  };

  const handleTilePress = (tile: MatchingTile) => {
    if (isLocked || matchedTileIds.includes(tile.tileId) || selectedTileIds.includes(tile.tileId)) return;

    const nextSelected = [...selectedTileIds, tile.tileId];
    setSelectedTileIds(nextSelected);

    if (nextSelected.length < 2) return;

    const [firstId, secondId] = nextSelected;
    const first = tiles.find((t) => t.tileId === firstId)!;
    const second = tiles.find((t) => t.tileId === secondId)!;
    const isMatch = first.letterId === second.letterId && first.kind !== second.kind;

    setIsLocked(true);
    if (isMatch) {
      playCorrect();
      setTimeout(() => {
        setMatchedTileIds((prev) => [...prev, firstId, secondId]);
        setSelectedTileIds([]);
        setIsLocked(false);
      }, 150);
    } else {
      playIncorrect();
      setWrongTileIds([firstId, secondId]);
      setTimeout(() => {
        setWrongTileIds([]);
        setSelectedTileIds([]);
        setIsLocked(false);
      }, MISMATCH_FLASH_MS);
    }
  };

  return (
    <ScreenContainer style={styles.screen}>
      <View style={styles.topbar}>
        <Text style={styles.timer}>⏱ {(elapsedMs / 1000).toFixed(1)} seconds</Text>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.progressTrack}>
        <ProgressBar progress={matchedPairCount / PAIR_COUNT} gradientColors={['#7ED99A', colors.success]} />
      </View>

      <View style={styles.grid}>
        {tiles.map((tile) => {
          const letter = getLetterById(tile.letterId)!;
          const isMatched = matchedTileIds.includes(tile.tileId);
          const isSelected = selectedTileIds.includes(tile.tileId);
          const isWrong = wrongTileIds.includes(tile.tileId);
          const state: AnswerCardState = isMatched ? 'correct' : isWrong ? 'wrong' : isSelected ? 'selected' : 'idle';

          return (
            <AnimatedAnswerCard
              key={tile.tileId}
              state={state}
              onPress={() => handleTilePress(tile)}
              disabled={isLocked || isMatched}
              style={[
                styles.tile,
                { width: tileWidth },
                isSelected && !isWrong && styles.tileSelected,
                isMatched && styles.tileMatched,
                isWrong && styles.tileWrong,
              ]}
            >
              <Text style={tile.kind === 'glyph' ? styles.tileGlyph : styles.tileName}>
                {tile.kind === 'glyph' ? letter.label : letter.name}
              </Text>
            </AnimatedAnswerCard>
          );
        })}
      </View>

      {isComplete ? (
        <CompleteCard seconds={elapsedMs / 1000} onPlayAgain={handleReset} onDone={() => router.back()} />
      ) : null}
    </ScreenContainer>
  );
}

function CompleteCard({
  seconds,
  onPlayAgain,
  onDone,
}: {
  seconds: number;
  onPlayAgain: () => void;
  onDone: () => void;
}) {
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
  }, [pop]);

  return (
    <Animated.View
      style={[
        styles.completeCard,
        shadows.raised,
        {
          opacity: pop,
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
        },
      ]}
    >
      <Text style={styles.completeEmoji}>🎉</Text>
      <Text style={styles.completeTitle}>Well done!</Text>
      <Text style={styles.completeBody}>Matched {PAIR_COUNT} pairs in {seconds.toFixed(1)} seconds.</Text>
      <View style={styles.completeActions}>
        <Button label="Play again" variant="secondary" onPress={onPlayAgain} style={styles.completeButton} />
        <Button label="Done" onPress={onDone} style={styles.completeButton} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F5F2', paddingHorizontal: spacing.lg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  timer: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 22, color: colors.textPrimary },
  progressTrack: { marginTop: spacing.sm, marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    minHeight: 84,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSelected: { borderColor: colors.accent, backgroundColor: '#FDF3E4' },
  tileMatched: { borderColor: '#4FBF76', backgroundColor: '#DFF4E7' },
  tileWrong: { borderColor: '#E76B60', backgroundColor: '#F9E0DD' },
  tileGlyph: { fontSize: 30, color: colors.textPrimary },
  tileName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  completeCard: {
    marginTop: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  completeEmoji: { fontSize: 40, marginBottom: spacing.xs },
  completeTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  completeBody: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  completeActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, width: '100%' },
  completeButton: { flex: 1 },
});
