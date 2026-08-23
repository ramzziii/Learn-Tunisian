import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Profile } from '@/types/models';

export default function ProfileSwitcher() {
  const { profiles, setActiveProfileId } = useActiveProfile();
  const { signOut } = useAuth();

  const choose = async (profile: Profile) => {
    await setActiveProfileId(profile.id);
    router.replace('/home');
  };

  return (
    <ScreenContainer>
      <Text style={styles.title}>Who&apos;s learning?</Text>

      <FlatList
        data={profiles}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.lg }}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => choose(item)}>
            <Text style={styles.avatar}>{item.track === 'kid' ? '🧒' : '🙋'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                Age {item.age} · {item.track === 'kid' ? 'Kid track' : 'Adult/teen track'}
              </Text>
            </View>
          </Pressable>
        )}
      />

      <Button label="Add a profile" variant="secondary" onPress={() => router.push('/onboarding/who')} />
      <Button label="Sign out" variant="ghost" onPress={signOut} style={{ marginTop: spacing.sm }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  avatar: { fontSize: 32 },
  name: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});
