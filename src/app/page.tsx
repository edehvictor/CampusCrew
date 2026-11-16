import { BookOneBoard } from "@/features/book-one/board";
import { getPilotConfig } from "@/features/book-one/pilot-config";
import { PilotLoader } from "@/features/book-one/pilot-loader";

export const dynamic = "force-dynamic";

export default function Home() {
  const config = getPilotConfig();
  return config ? <PilotLoader config={config} /> : <BookOneBoard />;
}
