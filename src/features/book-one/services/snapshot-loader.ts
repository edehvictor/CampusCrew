// Share background reads; explicit mutations start a fresh generation so an old
// account response cannot overwrite a sign-in, profile save or sign-out.
export function createSnapshotLoader<T>(
  fetchSnapshot: () => Promise<T>,
  apply: (data: T) => void,
) {
  let generation = 0;
  let pending: Promise<T> | null = null;
  return (fresh = false): Promise<T> => {
    if (pending && !fresh) return pending;
    const current = ++generation;
    const request = fetchSnapshot()
      .then((data) => {
        if (current === generation) apply(data);
        return data;
      })
      .finally(() => {
        if (current === generation) pending = null;
      });
    pending = request;
    return request;
  };
}
