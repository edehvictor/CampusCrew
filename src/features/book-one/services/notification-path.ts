export function notificationPath(requestId: string | null, eventKey: string) {
  if (!requestId) return "/me/notifications";
  if (
    eventKey.startsWith("task-edited:") ||
    eventKey.startsWith("task-removed:")
  )
    return "/me/applications/" + requestId;
  if (
    eventKey.startsWith("application:") ||
    eventKey.startsWith("application-edited:") ||
    eventKey.startsWith("application-withdrawn:")
  )
    return "/me/tasks/" + requestId;
  return "/me/bookings/" + requestId;
}
