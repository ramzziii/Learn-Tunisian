/**
 * Consecutive-day streak, computed purely from a list of local-calendar-day
 * date strings ("YYYY-MM-DD") that had at least one session logged — no
 * dedicated streak column/table, this is derived from session_logs the same
 * way fetchMinutesLearnedToday derives "today" (see src/data/sessionLogs.ts).
 *
 * A streak stays "alive" if today hasn't been practiced yet but yesterday
 * was — the day isn't over, so it shouldn't read as broken until it actually
 * lapses (two consecutive missed days).
 */
export function calculateStreak(activeDates: string[], today: Date = new Date()): number {
  const activeSet = new Set(activeDates);
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);

  const toKey = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // If today has no activity yet, start counting from yesterday instead of
  // breaking the streak outright — the user still has the rest of today.
  if (!activeSet.has(toKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (activeSet.has(toKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
