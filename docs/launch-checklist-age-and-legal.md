# Launch checklist: age and legal

Tasks the app owner must complete before releasing Learn Tunisian. This list
describes work to do; it does not state or imply that the app meets any law
or store policy.

## What the app does today (for reference)

- **Creating an account:** a date-of-birth gate (MM / DD / YYYY). Under 18
  can't continue. No ID check, selfie or third-party age verification.
- **Guest preview (signed out):** a yes/no "Are you 18 or older?" question; no
  date of birth is asked.
- **Retry block:** after an under-18 date of birth or a guest's "No", the
  device can't retry the age gate or the guest preview for 24 hours
  (`AGE_RETRY_BLOCK_HOURS` in `src/lib/age/retryBlock.ts`). Only a yes/no flag
  and its end time are stored on the device; the typed date is never stored,
  logged or sent. Reinstalling the app resets the block.
- **Server-side checks** already in place (e.g. adult date of birth required
  for a profile) are unchanged.

## Owner tasks

- [ ] **Apple App Store age rating.** Answer the age-rating questionnaire in
      App Store Connect accurately, including the questions about AI chat
      (Talk to a Tunisian) and user-generated content (recordings,
      translation requests). Choose the mature / 18+ rating the answers lead
      to.
- [ ] **Google Play content rating.** Complete the IARC content-rating
      questionnaire accurately, including AI chat and user-generated content,
      and set the target audience to adults. Choose the mature / 18+ rating
      the answers lead to.
- [ ] **Legal review before launch.** Have a lawyer review:
  - the Terms of Use and Privacy Policy (the consent screen text is still a
    placeholder);
  - the age approach described above (self-declared date of birth for
    accounts, yes/no for the guest preview, the 24-hour retry block);
  - any US state app-store age-verification laws that may apply. These laws
    are changing; confirm their current status and effective dates at the
    time of launch.
- [ ] **Host the legal pages** (Terms of Use, Privacy Policy) at public URLs
      and add those URLs to both store listings and the consent screen.
- [ ] **Support contact.** Set `EXPO_PUBLIC_SUPPORT_EMAIL` (see `.env.example`) for the
      project. Use a role address,
      not a personal one, and never commit it to the repository.
- [ ] **Wording.** Don't state or imply legal compliance (for example "COPPA
      compliant", "age verified", "meets state law") in the app, store
      listings or docs.
