import type { Page } from "./model";
export const pagePaths: Record<Page, string> = {
  Home: "/",
  "Explore campuses": "/campuses",
  "Browse tasks": "/tasks",
  "Posted tasks": "/me/tasks",
  "Sent applications": "/me/applications",
  Bookings: "/me/bookings",
  "Find providers": "/providers",
  "Provider profile": "/providers",
  "My profile": "/me/profile",
  Earnings: "/me/earnings",
  Notifications: "/me/notifications",
};
export function pageFromPath(path: string): Page {
  if (path.startsWith("/providers/")) return "Provider profile";
  return (Object.entries(pagePaths)
    .filter(([name]) => name !== "Provider profile")
    .sort((a, b) => b[1].length - a[1].length)
    .find(
      ([, prefix]) =>
        path === prefix || (prefix !== "/" && path.startsWith(prefix + "/")),
    )?.[0] ?? "Home") as Page;
}
export function pageHref(page: Page, id?: string) {
  return pagePaths[page] + (id ? "/" + encodeURIComponent(id) : "");
}
export function routeId(path: string) {
  const tail = path.split("/").filter(Boolean).at(-1);
  return tail && /^[0-9a-f-]{36}$/i.test(tail) ? tail : undefined;
}
