import { Image, StyleSheet, Text, View } from 'react-native';

import { placeholderEmojiFor } from '@/constants/placeholderVisuals';
import { colors, radii } from '@/constants/theme';
import { getImageUrl } from '@/lib/supabase/client';
import type { Word } from '@/types/models';

interface WordPictureProps {
  word: Word;
  size: number;
}

export function WordPicture({ word, size }: WordPictureProps) {
  const imageUrl = getImageUrl(word.imagePath);
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: radii.md }]}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: radii.md }} />
      ) : (
        <Text style={{ fontSize: size * 0.5 }}>{placeholderEmojiFor(word.englishMeaning)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
