import { useWindowDimensions } from 'react-native';

/**
 * Computes an exact pixel width for one column of an evenly-spaced,
 * flex-wrapped grid. Deliberately avoids percentage-string widths
 * (`width: '31%'`) on children of a `flexWrap: 'wrap'` row — those stopped
 * resolving correctly against the container after the RN/Yoga upgrade that
 * came with the Expo SDK 57 bump, so an explicit computed width is used
 * instead.
 */
export function useColumnWidth(columns: number, horizontalPadding: number, gap: number): number {
  const { width } = useWindowDimensions();
  const usableWidth = width - horizontalPadding * 2 - gap * (columns - 1);
  return usableWidth / columns;
}
