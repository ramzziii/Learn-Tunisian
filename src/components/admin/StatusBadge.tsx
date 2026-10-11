import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing } from '@/constants/theme';
import type { ContentStatus } from '@/types/models';

const STATUS_COLOR: Record<ContentStatus, string> = {
  draft: '#8A8278',
  pending_review: '#C98A2E',
  approved: '#4CA771',
  rejected: '#D9634C',
  archived: '#6B6560',
};

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  archived: 'Archived',
};

/** A small colored pill for a ContentStatus value — used in list rows so
 * status is visible without opening a detail screen. */
export function StatusBadge({ status }: { status: ContentStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}26` }]}>
      <Text style={[styles.text, { color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing.sm, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '700' },
});
