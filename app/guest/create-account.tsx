import { useLocalSearchParams } from 'expo-router';

import { CreateAccountPrompt, type CreateAccountReason } from '@/components/guest/CreateAccountPrompt';

/** The guest preview's create-account screen (nudge at the preview limit, Talk, account-only pages). */
export default function GuestCreateAccount() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const known: CreateAccountReason[] = ['keep-learning', 'talk', 'account'];
  return <CreateAccountPrompt reason={known.includes(reason as CreateAccountReason) ? (reason as CreateAccountReason) : 'keep-learning'} />;
}
