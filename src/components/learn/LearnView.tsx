import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TabTopRow } from '@/components/account/AccountButton';
import { GrowingBar } from '@/components/lesson-map/GrowingBar';
import { PulseRing } from '@/components/lesson-map/PulseRing';
import { UnitSection } from '@/components/lesson-map/UnitSection';
import { PremiumBadge } from '@/components/premium/Premium';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import type { UnitWithLessons } from '@/data/content';
import type { ProfileProgressSummary } from '@/data/progress';
import { hasOwnLessonTitle, lessonDisplayTitle, lessonPositions } from '@/lib/lessonTitle';
import type { ProgressInsights } from '@/lib/progressInsights';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { LessonWithState } from '@/types/models';

/**
 * The pieces of the Home and Learn tabs, in one visual style:
 * - PageHeader: small coloured eyebrow, big bold title, optional badge.
 * - LearnPath (Home, under Review): overall progress, the gradient Continue
 *   card for the lesson that's up next, "Start here" before any lesson is
 *   done, and the units with each lesson on a path (UnitSection).
 * - SearchBar + ExploreSection (Learn): the dictionary and the reference
 *   features (Alphabet, Phrasebook, Grammar, Culture, translations).
 * Lesson order and unlock rules come from the data; the allowance lock from
 * the caller (src/lib/access). Entrances are staggered, bars fill in and the
 * next lesson ripples; loops stop when the OS asks to reduce motion.
 */

/** Reference features to explore alongside the curriculum. */
const EXPLORE_LINKS: {
  emoji: string;
  /** Fixed identity accent, same approach as the Practice and Phrasebook tiles. */
  color: string;
  title: string;
  description: string;
  href: Parameters<typeof router.push>[0];
}[] = [
  { emoji: '🅰️', color: '#D9A441', title: 'Alphabet', description: 'Arabic letters and their sounds', href: '/alphabet' },
  { emoji: '📖', color: '#3E7CB1', title: 'Phrasebook', description: 'Ready-made phrases for everyday situations', href: '/phrasebook' },
  { emoji: '📝', color: '#8B6BAE', title: 'Grammar Notes', description: 'How Tunisian sentences fit together, explained simply', href: '/grammar' },
  { emoji: '📜', color: '#B15C4A', title: 'Culture Corner', description: 'Tunisian proverbs and sayings, and what they mean', href: '/culture' },
  { emoji: '💬', color: '#4CA771', title: 'Ask for a translation', description: 'Send a phrase you want to say in Tunisian', href: '/translation-requests' },
];

export interface LearnPathData {
  unitsWithLessons: UnitWithLessons[];
  progressSummary: ProfileProgressSummary;
  progressInsights: ProgressInsights;
}

/** A tab's header: small coloured eyebrow with the account button beside
 * it (top right), then the big page title. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.header}>
      <TabTopRow eyebrow={eyebrow} eyebrowStyle={styles.eyebrow} />
      <View style={styles.headerTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** The round gold badge next to a page title ("40% done", "3/5 min"). */
export function HeaderBadge({ value, label, success = false }: { value: string; label: string; success?: boolean }) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <LinearGradient
      colors={success ? gradients.success : gradients.celebration}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.percentBadge}
    >
      <Text style={[styles.percentValue, success && { color: colors.textOnPrimary }]}>{value}</Text>
      <Text style={[styles.percentLabel, success && { color: colors.textOnPrimary }]}>{label}</Text>
    </LinearGradient>
  );
}

/** Dictionary / Search: words the learner can open (app/search.tsx). */
export function SearchBar() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Search words"
      onPress={() => router.push('/search')}
      style={styles.searchBar}
    >
      <Text style={styles.searchIcon}>🔍</Text>
      <Text style={styles.searchPlaceholder}>Search words — English, عربي</Text>
    </PressableScale>
  );
}

interface LearnPathProps {
  data: LearnPathData;
  /** True once the lesson is past the learner's allowance (guest / free). */
  isLessonLocked: (lesson: LessonWithState) => boolean;
  /** Tapping a locked lesson: create-account prompt (guest) or upgrade flow (free). */
  onLockedPress: () => void;
  /** Delay before the first entrance, so it follows what's above it. */
  baseDelay?: number;
}

/** "Your path": progress, the Continue card, Start here, and Your units. */
export function LearnPath({ data, isLessonLocked, onLockedPress, baseDelay = 0 }: LearnPathProps) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const allLessons = data.unitsWithLessons.flatMap(({ lessons }) => lessons);
  const lessonById = new Map(allLessons.map((l) => [l.id, l]));
  const completedCount = allLessons.filter((l) => l.state === 'completed').length;
  const hasCompletedALesson = completedCount > 0;
  // Lessons unlock in order, so at most one is "up next".
  const nextLesson = allLessons.find((l) => l.state === 'unlocked') ?? null;
  const allDone = allLessons.length > 0 && completedCount === allLessons.length;
  // "Lesson N" = position within the unit, not the course-wide lesson_number.
  const nextPosition = nextLesson ? lessonPositions(data.unitsWithLessons).get(nextLesson.id) ?? 1 : 1;
  const percent = allLessons.length > 0 ? Math.round((completedCount / allLessons.length) * 100) : 0;
  const { wordsLearning, wordsMastered } = data.progressSummary;

  return (
    <View>
      <Reveal delay={baseDelay}>
        <View style={styles.pathHeader}>
          <Text style={[styles.sectionHeading, { flex: 1 }]} accessibilityRole="header">
            Your path
          </Text>
          <HeaderBadge value={`${percent}%`} label="done" />
        </View>
        <Text style={styles.progressText}>
          {completedCount} of {allLessons.length} {allLessons.length === 1 ? 'lesson' : 'lessons'} complete
        </Text>
        <GrowingBar
          progress={allLessons.length > 0 ? completedCount / allLessons.length : 0}
          colors={gradients.celebration}
          trackColor={colors.border}
          height={8}
          delay={baseDelay + 200}
          style={{ marginTop: spacing.sm }}
        />
        <View style={styles.statRow}>
          <View style={[styles.statPill, { backgroundColor: `${colors.success}1F` }]}>
            <Text style={styles.statText}>
              🌱 <Text style={styles.statValue}>{wordsLearning}</Text> learning
            </Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: `${colors.accent}24` }]}>
            <Text style={styles.statText}>
              ⭐ <Text style={styles.statValue}>{wordsMastered}</Text> mastered
            </Text>
          </View>
          {data.progressInsights.strongArea ? (
            <View style={[styles.statPill, { backgroundColor: `${colors.primary}1A` }]}>
              <Text style={styles.statText}>
                💪 Strong: <Text style={styles.statValue}>{data.progressInsights.strongArea.unitName}</Text>
              </Text>
            </View>
          ) : null}
          {data.progressInsights.focusArea ? (
            <View style={[styles.statPill, { backgroundColor: `${colors.error}1A` }]}>
              <Text style={styles.statText}>
                🎯 Practise: <Text style={styles.statValue}>{data.progressInsights.focusArea.unitName}</Text>
              </Text>
            </View>
          ) : null}
        </View>
      </Reveal>

      {nextLesson ? (
        <Reveal delay={baseDelay + 90}>
          <ContinueCard
            heading={hasCompletedALesson ? 'Continue' : 'Start your first lesson'}
            // A lesson titled after its unit shows the unit name once.
            lessonTitle={hasOwnLessonTitle(nextLesson) ? lessonDisplayTitle(nextLesson, nextPosition) : nextLesson.unitName}
            meta={hasOwnLessonTitle(nextLesson) ? `${nextLesson.unitName} · Lesson ${nextPosition}` : `Lesson ${nextPosition}`}
            masteredCount={nextLesson.masteredCount}
            wordCount={nextLesson.wordCount}
            premiumLocked={isLessonLocked(nextLesson)}
            onPress={() => (isLessonLocked(nextLesson) ? onLockedPress() : router.push(`/lesson/${nextLesson.id}`))}
          />
        </Reveal>
      ) : allDone ? (
        <Reveal delay={baseDelay + 90}>
          <LinearGradient colors={gradients.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.doneCard}>
            <Text style={styles.doneTitle}>Every lesson complete 🎉</Text>
            <Text style={styles.doneBody}>Keep it fresh with Review and Flashcards on the Practice tab.</Text>
          </LinearGradient>
        </Reveal>
      ) : null}

      {/* Before any lesson is completed, the letters are a gentle first step. */}
      {!hasCompletedALesson ? (
        <Reveal delay={baseDelay + 150}>
          <PressableScale
            haptic
            accessibilityRole="button"
            accessibilityLabel="Start here: Alphabet. Get to know the Arabic letters and their sounds"
            onPress={() => router.push('/alphabet')}
            style={[styles.startHere, shadows.card]}
          >
            <View style={[styles.tileIcon, { backgroundColor: `${colors.accent}2E` }]}>
              <Text style={styles.tileEmoji}>🅰️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.startHereEyebrow}>Start here</Text>
              <Text style={styles.cardTitle}>Alphabet</Text>
              <Text style={styles.cardBody}>Get to know the Arabic letters and their sounds.</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableScale>
        </Reveal>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeading} accessibilityRole="header">
          Your units
        </Text>
        <Text style={styles.sectionCount}>
          {data.unitsWithLessons.length} {data.unitsWithLessons.length === 1 ? 'unit' : 'units'}
        </Text>
      </View>
      {data.unitsWithLessons.length === 0 ? (
        <Text style={styles.emptyText}>No lessons yet — check back soon!</Text>
      ) : (
        data.unitsWithLessons.map((unitWithLessons, index) => (
          <Reveal key={unitWithLessons.unit.id} delay={Math.min(baseDelay + 220 + index * 80, 700)}>
            <UnitSection
              unitWithLessons={unitWithLessons}
              unitNumber={index + 1}
              onSelectLesson={(lessonId) => router.push(`/lesson/${lessonId}`)}
              onBrowseWords={(lessonId) => router.push(`/words/${lessonId}`)}
              isPremiumLocked={(lessonId) => {
                const lesson = lessonById.get(lessonId);
                return lesson ? isLessonLocked(lesson) : false;
              }}
              onPremiumLockedPress={onLockedPress}
            />
          </Reveal>
        ))
      )}
    </View>
  );
}

/** Explore Tunisian: the reference features as tiles, two per row. */
export function ExploreSection({ translationNotice }: { translationNotice: string | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View>
      <Text style={styles.sectionHeading} accessibilityRole="header">
        Explore Tunisian
      </Text>
      <Text style={styles.exploreIntro}>Learn more about the language, at your own pace.</Text>
      <View style={styles.tileGrid}>
        {EXPLORE_LINKS.map((link, index) => (
          <Reveal key={link.title} delay={Math.min(index * 60, 400)} style={styles.tileCell}>
            <PressableScale
              haptic
              accessibilityRole="button"
              accessibilityLabel={`${link.title}. ${link.description}`}
              onPress={() => router.push(link.href)}
              style={[styles.tile, shadows.card]}
            >
              <View style={[styles.tileIcon, { backgroundColor: `${link.color}26` }]}>
                <Text style={styles.tileEmoji}>{link.emoji}</Text>
              </View>
              <Text style={styles.cardTitle}>{link.title}</Text>
              <Text style={styles.cardBody}>{link.description}</Text>
              {link.href === '/translation-requests' && translationNotice ? (
                <Text style={styles.exploreNotice}>{translationNotice}</Text>
              ) : null}
            </PressableScale>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

const PLAY_SIZE = 60;

/** The path's focal point: the one lesson that's up next, on a bold gradient
 * card with a white play button that ripples. */
function ContinueCard({
  heading,
  lessonTitle,
  meta,
  masteredCount,
  wordCount,
  premiumLocked,
  onPress,
}: {
  heading: string;
  lessonTitle: string;
  meta: string;
  masteredCount: number;
  wordCount: number;
  premiumLocked: boolean;
  onPress: () => void;
}) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <PressableScale
      haptic
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${heading}: ${lessonTitle}. ${meta}${premiumLocked ? '. Premium' : ''}`}
      onPress={onPress}
      style={[styles.continueShadow, shadows.raised]}
    >
      <LinearGradient colors={[colors.primaryLight, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.continueCard}>
        {/* Soft decorative circles — depth without an image. */}
        <View style={[styles.decor, styles.decorLarge]} />
        <View style={[styles.decor, styles.decorSmall]} />

        <View style={styles.continueTop}>
          <View style={styles.continueEyebrowPill}>
            <Text style={styles.continueEyebrow}>{heading}</Text>
          </View>
          {premiumLocked ? <PremiumBadge compact /> : null}
        </View>

        <View style={styles.continueMain}>
          <View style={{ flex: 1 }}>
            <Text style={styles.continueTitle} numberOfLines={2}>
              {lessonTitle}
            </Text>
            <Text style={styles.continueMeta}>{meta}</Text>
          </View>
          <View style={styles.playWrap}>
            <PulseRing size={PLAY_SIZE} color="#FFFFFF" />
            <View style={styles.play}>
              <Text style={[styles.playIcon, { color: colors.primaryDark }]}>{premiumLocked ? '🔒' : '▶'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.continueProgressRow}>
          <GrowingBar
            progress={wordCount > 0 ? masteredCount / wordCount : 0}
            colors={gradients.celebration}
            trackColor="rgba(255,255,255,0.25)"
            height={6}
            delay={350}
            style={{ flex: 1 }}
          />
          <Text style={styles.continueProgressText}>
            {masteredCount}/{wordCount} words
          </Text>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
    headerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    eyebrow: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 1.2, textTransform: 'uppercase' },
    title: { fontSize: 34, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
    subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: 2 },
    percentBadge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    percentValue: { fontSize: 18, fontWeight: '900', color: '#3A2A10' },
    percentLabel: { fontSize: 10, fontWeight: '700', color: '#3A2A10', opacity: 0.75, marginTop: -2 },
    pathHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
    progressText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.sm },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    searchIcon: { fontSize: 16 },
    searchPlaceholder: { fontSize: 15, color: colors.textSecondary },
    statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.lg },
    statPill: { borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: spacing.sm, maxWidth: '100%' },
    statText: { fontSize: 13, color: colors.textPrimary },
    statValue: { fontWeight: '800' },
    continueShadow: { borderRadius: radii.lg + 4, marginBottom: spacing.lg },
    continueCard: { borderRadius: radii.lg + 4, padding: spacing.lg, overflow: 'hidden' },
    decor: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
    decorLarge: { width: 220, height: 220, top: -90, right: -60 },
    decorSmall: { width: 120, height: 120, bottom: -50, left: -30 },
    continueTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    continueEyebrowPill: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: radii.pill,
      paddingVertical: 4,
      paddingHorizontal: spacing.sm,
    },
    continueEyebrow: { fontSize: 11, fontWeight: '800', color: colors.textOnPrimary, letterSpacing: 0.8, textTransform: 'uppercase' },
    continueMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
    continueTitle: { fontSize: 26, fontWeight: '800', color: colors.textOnPrimary, letterSpacing: -0.3 },
    continueMeta: { fontSize: 14, color: colors.textOnPrimary, opacity: 0.85, marginTop: 2 },
    playWrap: { width: PLAY_SIZE, height: PLAY_SIZE },
    play: {
      width: PLAY_SIZE,
      height: PLAY_SIZE,
      borderRadius: PLAY_SIZE / 2,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    playIcon: { fontSize: 22, fontWeight: '900', marginLeft: 3 },
    continueProgressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
    continueProgressText: { fontSize: 12, fontWeight: '700', color: colors.textOnPrimary, opacity: 0.9 },
    doneCard: { borderRadius: radii.lg + 4, padding: spacing.lg, marginBottom: spacing.lg },
    doneTitle: { fontSize: 22, fontWeight: '800', color: colors.textOnPrimary },
    doneBody: { fontSize: 14, color: colors.textOnPrimary, opacity: 0.9, marginTop: spacing.xs, lineHeight: 20 },
    startHere: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: `${colors.accent}80`,
      marginBottom: spacing.lg,
    },
    startHereEyebrow: { fontSize: 11, fontWeight: '800', color: colors.accentText, letterSpacing: 0.5, textTransform: 'uppercase' },
    sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.md },
    sectionHeading: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
    sectionCount: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    exploreIntro: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    // Two per row on phones; a single column when large text needs the room.
    tileCell: { flexGrow: 1, flexBasis: '46%', minWidth: 150 },
    tile: { flex: 1, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface, gap: spacing.xs },
    tileIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
    tileEmoji: { fontSize: 22 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    cardBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    exploreNotice: { fontSize: 13, fontWeight: '700', color: colors.primary },
    chevron: { fontSize: 22, color: colors.textSecondary },
    emptyText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  });
