/**
 * Feature toggles for hiding a surface without deleting its code — flip
 * back to true to re-enable. Nothing else should branch on these directly;
 * they're read from the one or two entry-point screens that decide whether
 * a feature is reachable at all.
 */

/** Whether a user can start a child profile and see the kid-track home
 * experience. Turned off while adult-track work is the focus — the kid
 * track's exercises, badges, celebration, and home content are untouched
 * and still fully work for any existing kid profile; this only hides the
 * "My child" entry point in app/onboarding/who.tsx and makes app/home.tsx
 * fall back to the adult experience for any kid-track profile, so no *new*
 * kid profiles get created and none are shown while this is false. */
export const KIDS_SECTION_ENABLED = false;
