import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the learner has asked the OS to reduce motion. Looping or
 * decorative animations should stop (or jump to their end state) when it's on.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => mounted && setReduced(!!value))
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value: boolean) => setReduced(value));
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}
