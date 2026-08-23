import { ListenAndTap } from '@/components/exercises/kid/ListenAndTap';
import { ReadingMatch } from '@/components/exercises/adult/ReadingMatch';
import { TypingSpelling } from '@/components/exercises/adult/TypingSpelling';
import type { ExerciseItem } from '@/types/exercises';

interface ExerciseRendererProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/** Picks the right exercise UI for `exercise.type`. Kid and adult components share word data but render entirely differently. */
export function ExerciseRenderer({ exercise, onComplete }: ExerciseRendererProps) {
  switch (exercise.type) {
    case 'listen_and_tap':
      return <ListenAndTap key={exercise.key} exercise={exercise} onComplete={onComplete} />;
    case 'reading_match':
      return <ReadingMatch key={exercise.key} exercise={exercise} onComplete={onComplete} />;
    case 'typing_spelling':
      return <TypingSpelling key={exercise.key} exercise={exercise} onComplete={onComplete} />;
  }
}
