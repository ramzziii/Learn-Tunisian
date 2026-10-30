// An in-memory stand-in for the 0021 budget functions (reserve / reconcile /
// release / mark ambiguous), with the same accounting rule: a reservation is
// granted only if logged spend + outstanding reservations + the new amount
// stay within the budget. The real SQL is exercised in supabase/tests/.
export interface FakeReservation {
  id: string;
  accountId: string | null;
  callType: string;
  model: string;
  amountUsd: number;
  status: 'reserved' | 'reconciled' | 'released' | 'ambiguous';
  note?: string;
}

export interface FakeUsageRow {
  reservationId: string;
  accountId: string | null;
  profileId: string | null;
  callType: string;
  model: string;
  units: Record<string, number | null | undefined>;
  costUsd: number;
  usageEstimated: boolean;
  pricing: Record<string, unknown>;
}

export function createFakeBudgetStore(options: { spentUsd?: number; fail?: Partial<Record<'reserve' | 'reconcile' | 'release' | 'markAmbiguous', boolean>> } = {}) {
  const reservations: FakeReservation[] = [];
  const usage: FakeUsageRow[] = [];
  let next = 1;
  const failIf = (op: 'reserve' | 'reconcile' | 'release' | 'markAmbiguous') => {
    if (options.fail?.[op]) throw new Error(`${op} failed (simulated database error)`);
  };
  const spent = () => (options.spentUsd ?? 0) + usage.reduce((s, u) => s + u.costUsd, 0);
  const held = () =>
    reservations.filter((r) => r.status === 'reserved' || r.status === 'ambiguous').reduce((s, r) => s + r.amountUsd, 0);

  const store = {
    reservations,
    usage,
    async reserve(r: { accountId: string | null; callType: string; model: string; amountUsd: number; budgetUsd: number }) {
      failIf('reserve');
      if (spent() + held() + r.amountUsd > r.budgetUsd + 1e-12) return null;
      const id = `res-${next++}`;
      reservations.push({ id, accountId: r.accountId, callType: r.callType, model: r.model, amountUsd: r.amountUsd, status: 'reserved' });
      return id;
    },
    async reconcile(r: {
      reservationId: string;
      profileId: string | null;
      units: Record<string, number | null | undefined>;
      costUsd: number;
      usageEstimated: boolean;
      pricing: Record<string, unknown>;
    }) {
      failIf('reconcile');
      const res = reservations.find((x) => x.id === r.reservationId);
      if (!res || (res.status !== 'reserved' && res.status !== 'ambiguous')) throw new Error('reservation_already_settled');
      res.status = 'reconciled';
      usage.push({
        reservationId: res.id,
        accountId: res.accountId,
        profileId: r.profileId,
        callType: res.callType,
        model: res.model,
        units: r.units,
        costUsd: r.costUsd,
        usageEstimated: r.usageEstimated,
        pricing: r.pricing,
      });
    },
    async release(id: string) {
      failIf('release');
      const res = reservations.find((x) => x.id === id);
      if (!res || res.status !== 'reserved') throw new Error('reservation_not_releasable');
      res.status = 'released';
    },
    async markAmbiguous(id: string, reason: string) {
      failIf('markAmbiguous');
      const res = reservations.find((x) => x.id === id);
      if (!res || res.status !== 'reserved') throw new Error('reservation_not_reserved');
      res.status = 'ambiguous';
      res.note = reason;
    },
  };
  return store;
}
