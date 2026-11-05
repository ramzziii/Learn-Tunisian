/**
 * Whether the app is in the signed-out guest preview, for the data layer:
 * while it's on, data functions read the guest-preview views and keep
 * progress, favorites and used items on the device — never writing to the
 * server. Set by GuestProvider; a plain flag so data functions (not React)
 * can read it.
 */
let active = false;

export function setGuestSessionActive(on: boolean): void {
  active = on;
}

export function isGuestSessionActive(): boolean {
  return active;
}
