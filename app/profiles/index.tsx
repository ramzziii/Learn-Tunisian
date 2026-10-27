import { Redirect, router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { calculateAge } from '@/lib/age';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { Profile } from '@/types/models';

/**
 * Learn Tunisian has one profile per account. This screen exists only for an
 * account that already has several profiles from an earlier version: the
 * learner picks the one to use, and the others are kept exactly as they are
 * — nothing is merged, rewritten or deleted. There is no way to add a
 * profile. An account with one (or no) profile never stays here.
 */
export default function ProfileChooser() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { profiles, isLoading, setActiveProfileId } = useActiveProfile();
  const { signOut } = useAuth();

  if (isLoading) return <LoadingScreen themed />;
  if (profiles.length <= 1) return <Redirect href="/home" />;

  const choose = async (profile: Profile) => {
    await setActiveProfileId(profile.id);
    router.replace('/home');
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', "You'll need to sign back in with your email and password.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <Text style={styles.eyebrow}>Your profiles</Text>
      <Text style={styles.title}>Choose your profile</Text>
      <Text style={styles.body}>
        Learn Tunisian now has one profile per account. Yours has {profiles.length} from an earlier version — pick
        the one to use. The others are kept as they are; nothing is deleted.
      </Text>

      <FlatList
        data={profiles}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.lg }}
        renderItem={({ item, index }) => (
          <Reveal delay={index * 60}>
            <PressableScale haptic style={styles.card} onPress={() => choose(item)}>
              <Text style={styles.avatar}>🙋</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>Age {calculateAge(item.dateOfBirth)}</Text>
              </View>
            </PressableScale>
          </Reveal>
        )}
      />

      <Button themed label="Sign out" variant="ghost" onPress={handleSignOut} style={{ marginTop: spacing.sm }} />
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: spacing.md,
    },
    title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
    body: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: spacing.sm },
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
