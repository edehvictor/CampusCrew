import type { ReactNode } from "react";
import { getPilotConfig } from "@/features/book-one/pilot-config";
import { PilotLoader } from "@/features/book-one/pilot-loader";
import "@/features/book-one/book-one.css";

export const dynamic = "force-dynamic";

// Keep the authenticated board mounted while only the route changes.
export default function MarketplaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {getPilotConfig() ? (
        <PilotLoader />
      ) : (
        <main className="book-one">
          <header className="board-intro">
            <div>
              <h1>CampusCrew is unavailable</h1>
              <p>Check back shortly to browse and post tasks.</p>
            </div>
          </header>
        </main>
      )}
      {children}
    </>
  );
}
