import { ListenChooseMeaning } from '@/components/exercises/adult/ListenChooseMeaning';
import { ListenChooseRecording } from '@/components/exercises/adult/ListenChooseRecording';
import { ReadingMatch } from '@/components/exercises/adult/ReadingMatch';
import { SpeakingPractice } from '@/components/exercises/adult/SpeakingPractice';
import { TypingSpelling } from '@/components/exercises/adult/TypingSpelling';
import type { ExerciseCompleteHandler, ExerciseItem } from '@/types/exercises';

interface ExerciseRendererProps {
  exercise: ExerciseItem;
  onComplete: ExerciseCompleteHandler;
}

/** Picks the right exercise UI for `exercise.type`. */
export function ExerciseRenderer({ exercise, onComplete }: ExerciseRendererProps) {
  switch (exercise.type) {
    case 'reading_match':
      return <ReadingMatch key={exercise.key} exercise={exercise} onComplete={onComplete} />;
    case 'typing_spelling':
      return <TypingSpelling key={exercise.key} exercise={exercise} onComplete={onComplete} />;
    case 'speaking':
      return <SpeakingPractice key={exercise.key} exercise={exercise} onComplete={onComplete} />;
    case 'listen_recording':
      return <ListenChooseRecording key={exercise.key} exercise={exercise} onComplete={onComplete} />;
    case 'listen_meaning':
      return <ListenChooseMeaning key={exercise.key} exercise={exercise} onComplete={onComplete} />;
  }
}
