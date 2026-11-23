import { notFound } from "next/navigation";

export default async function AppPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const url = "/" + path.join("/");
  if (
    !/^\/(tasks(?:\/[0-9a-f-]{36})?|campuses|providers(?:\/[0-9a-f-]{36})?|me\/(tasks|applications|bookings)(?:\/[0-9a-f-]{36})?|me\/(profile|earnings|notifications))$/.test(
      url,
    )
  )
    notFound();
  return null;
}
