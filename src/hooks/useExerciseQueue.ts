import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdultExerciseType, ExerciseItem } from '@/types/exercises';
import type { Track, Word } from '@/types/models';

const OPTION_COUNT = 4;
const ADULT_TYPE_CYCLE: AdultExerciseType[] = ['reading_match', 'typing_spelling'];

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildOptions(target: Word, allWords: Word[]): Word[] {
  const distractors = shuffled(allWords.filter((w) => w.id !== target.id)).slice(
    0,
    OPTION_COUNT - 1
  );
  return shuffled([target, ...distractors]);
}

/** One shuffled pass over every word, each paired with an exercise type for this track. */
function buildPass(words: Word[], track: Track, passIndex: number): ExerciseItem[] {
  const order = shuffled(words);
  return order.map((word, i) => {
    const type =
      track === 'kid' ? 'listen_and_tap' : ADULT_TYPE_CYCLE[(passIndex + i) % ADULT_TYPE_CYCLE.length];
    return {
      key: `${word.id}-${passIndex}-${i}`,
      type,
      targetWord: word,
      options: buildOptions(word, words),
    };
  });
}

export interface ExerciseQueue {
  currentExercise: ExerciseItem | null;
  /** Advances to the next exercise. The queue loops and reshuffles indefinitely for time-based sessions. */
  next: () => void;
}

/**
 * Produces an endless, reshuffled sequence of exercises over `words` — the
 * session screen keeps pulling from this until its time goal elapses, so
 * there is no fixed "N exercises per lesson" concept here by design.
 */
export function useExerciseQueue(words: Word[], track: Track): ExerciseQueue {
  const [queue, setQueue] = useState<ExerciseItem[]>(() => (words.length > 0 ? buildPass(words, track, 0) : []));
  const [index, setIndex] = useState(0);
  const nextPassIndexRef = useRef(1);

  useEffect(() => {
    setQueue(words.length > 0 ? buildPass(words, track, 0) : []);
    setIndex(0);
    nextPassIndexRef.current = 1;
  }, [words, track]);

  useEffect(() => {
    if (words.length === 0) return;
    // Keep at least one full pass buffered ahead of the current position.
    if (index >= queue.length - 2) {
      setQueue((prev) => [...prev, ...buildPass(words, track, nextPassIndexRef.current)]);
      nextPassIndexRef.current += 1;
    }
  }, [index, queue.length, words, track]);

  const next = useCallback(() => setIndex((prev) => prev + 1), []);

  return { currentExercise: queue[index] ?? null, next };
}
