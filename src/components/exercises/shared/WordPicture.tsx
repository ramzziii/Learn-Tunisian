import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { placeholderEmojiFor } from '@/constants/placeholderVisuals';
import { radii, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import { getImageUrl } from '@/lib/supabase/client';
import type { WordGroup } from '@/types/models';

interface WordPictureProps {
  group: WordGroup;
  size: number;
}

export function WordPicture({ group, size }: WordPictureProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const imageUrl = getImageUrl(group.imagePath);
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: radii.md }]}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: radii.md }} />
      ) : (
        <Text style={{ fontSize: size * 0.5 }}>{placeholderEmojiFor(group.id)}</Text>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
