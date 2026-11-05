import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * "Edit word" from a recording card: opens the word in the admin editor,
 * and when the admin comes back, quietly reloads the list so the card shows
 * the edited word (or drops it if it no longer needs anything). The open
 * card stays open if the word is still on the list.
 */
export function useEditWordFromQueue<T>(fetchItems: () => Promise<T[]>, setItems: (items: T[]) => void) {
  const editing = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!editing.current) return;
      editing.current = false;
      fetchItems()
        .then(setItems)
        .catch(() => {
          // Keep the list as it was; the next visit loads it again.
        });
    }, [fetchItems, setItems])
  );

  return useCallback((wordGroupId: string) => {
    editing.current = true;
    router.push({ pathname: '/admin/word-groups/[wordGroupId]', params: { wordGroupId } });
  }, []);
}
