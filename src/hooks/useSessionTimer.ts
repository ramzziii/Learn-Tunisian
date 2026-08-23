import { useCallback, useEffect, useRef, useState } from 'react';

export interface SessionTimer {
  elapsedSeconds: number;
  goalSeconds: number;
  remainingSeconds: number;
  isComplete: boolean;
  /** Extends the goal by N minutes and resumes the session (used by "Add more time"). */
  addMinutes: (minutes: number) => void;
}

/**
 * Drives a time-based (not exercise-count-based) session: `isComplete` flips
 * once `elapsedSeconds` reaches the goal. Uses wall-clock time (Date.now())
 * rather than a naive tick counter so it stays correct if the app is
 * backgrounded mid-session.
 */
export function useSessionTimer(initialGoalMinutes: number): SessionTimer {
  const [goalSeconds, setGoalSeconds] = useState(initialGoalMinutes * 60);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const addMinutes = useCallback((minutes: number) => {
    setGoalSeconds((prev) => prev + minutes * 60);
  }, []);

  return {
    elapsedSeconds,
    goalSeconds,
    remainingSeconds: Math.max(goalSeconds - elapsedSeconds, 0),
    isComplete: elapsedSeconds >= goalSeconds,
    addMinutes,
  };
}
