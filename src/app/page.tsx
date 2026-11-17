import { getPilotConfig } from "@/features/book-one/pilot-config";
import { PilotLoader } from "@/features/book-one/pilot-loader";
import "@/features/book-one/book-one.css";

export const dynamic = "force-dynamic";

export default function Home() {
  const config = getPilotConfig();
  if (config) return <PilotLoader config={config} />;

  return (
    <main className="book-one">
      <header className="board-intro">
        <div>
          <h1>CampusCrew is unavailable</h1>
          <p>Check back shortly to browse and post tasks.</p>
        </div>
      </header>
    </main>
  );
}
