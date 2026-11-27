type Target = { requestId: string; wallet: string };

// External resolver calls have no browser payment intent. Observe active
// bookings even when the pending-transaction queue is empty.
export async function reconcilePayments({
  pending,
  active,
  sync,
}: {
  pending: () => Promise<Target[]>;
  active: () => Promise<Target[]>;
  sync: (wallet: string, requestId: string) => Promise<unknown>;
}) {
  const [submitted, observed] = await Promise.all([pending(), active()]);
  const targets = new Map<string, string>();
  for (const target of [...submitted, ...observed])
    if (!targets.has(target.requestId))
      targets.set(target.requestId, target.wallet);
  const results = await Promise.allSettled(
    [...targets].map(([id, wallet]) => sync(wallet, id)),
  );
  return results.every((result) => result.status === "fulfilled");
}
