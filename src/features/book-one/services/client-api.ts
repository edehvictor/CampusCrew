export async function clientApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json().catch(() => null);
  if (!response.ok || value === undefined)
    throw new Error(
      value?.error ?? "CampusCrew could not finish this request.",
    );
  return value as T;
}
