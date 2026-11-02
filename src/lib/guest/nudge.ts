/**
 * The guest preview's gentle nudge ("Create a free account to keep learning")
 * shows at most once per app launch. Kept in memory on purpose: nothing is
 * stored, and a new launch may show it once again. It never blocks — "Not
 * now" returns to where the learner was.
 */
let shownThisLaunch = false;

/** True the first time it's asked in this launch (and marks it shown). */
export function takeGuestNudge(): boolean {
  if (shownThisLaunch) return false;
  shownThisLaunch = true;
  return true;
}

export function resetGuestNudgeForTests(): void {
  shownThisLaunch = false;
}
