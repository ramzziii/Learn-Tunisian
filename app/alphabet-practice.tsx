import { router } from 'expo-router';

import { AlphabetPracticeSession } from '@/components/alphabet/AlphabetPracticeSession';

export default function AlphabetPracticeScreen() {
  return <AlphabetPracticeSession onExit={() => router.back()} />;
}
