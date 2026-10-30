/** The word the user types to confirm account deletion (the server checks it too). */
export const DELETE_CONFIRMATION_WORD = 'DELETE';

/** Exactly DELETE (surrounding spaces ignored) — not "delete", not "DELETE ME". */
export function isDeleteConfirmation(text: string): boolean {
  return text.trim() === DELETE_CONFIRMATION_WORD;
}
