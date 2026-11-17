import { BriefcaseBusiness, ChevronRight, ClipboardList, Compass, LogOut, Menu, Plus, Send, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { View } from "@/features/book-one/model";
import "./marketplace-shell.css";

const navigation = [
  { label: "Marketplace", items: [{ view: "Browse tasks", icon: Compass }] },
  {
    label: "My activity",
    items: [
      { view: "Posted tasks", icon: ClipboardList },
      { view: "Sent applications", icon: Send },
      { view: "Bookings", icon: BriefcaseBusiness },
    ],
  },
] as const;

type Props = {
  view: View;
  onNavigate: (view: View) => void;
  onPost: () => void;
  accountControl?: ReactNode;
  logout?: { run: () => void; pending: boolean };
  children: ReactNode;
};

export function MarketplaceShell({ view, onNavigate, onPost, accountControl, logout, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  function navigate(next: View) {
    onNavigate(next);
    setMenuOpen(false);
  }

  return (
    <div className="marketplace-shell" data-menu={menuOpen ? "open" : "closed"}>
      <a className="skip-link" href="#marketplace-main">Skip to content</a>
      <aside className="workspace-sidebar" id="workspace-sidebar">
        <button className="brand" type="button" onClick={() => navigate("Browse tasks")}>
          <span className="brand-mark" aria-hidden="true" />
          Campuscrew
        </button>
        <nav aria-label="Main navigation">
          {navigation.map(group => (
            <div className="navigation-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(({ view: item, icon: Icon }) => (
                <button
                  key={item}
                  className="navigation-item"
                  type="button"
                  aria-current={view === item ? "page" : undefined}
                  onClick={() => navigate(item)}
                >
                  <Icon aria-hidden="true" size={18} />
                  <span>{item}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        {logout && (
          <div className="sidebar-footer">
            <button
              className="navigation-item"
              type="button"
              disabled={logout.pending}
              onClick={() => { setMenuOpen(false); logout.run(); }}
            >
              <LogOut aria-hidden="true" size={18} />
              <span>Log out</span>
            </button>
          </div>
        )}
      </aside>

      <div className="workspace-main">
        <header className="workspace-header">
          <div className="workspace-context">
            <button
              type="button"
              className="button button-icon menu-button"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-controls="workspace-sidebar"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(open => !open)}
            >
              {menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
            </button>
            <span className="mobile-brand"><span className="brand-mark" aria-hidden="true" /> Campuscrew</span>
            <span className="workspace-crumb">
              {view === "Browse tasks" ? "Marketplace" : "My activity"} <ChevronRight size={13} aria-hidden="true" /> <strong>{view}</strong>
            </span>
          </div>
          <div className="workspace-actions">
            <button type="button" className="button button-primary" aria-label="Post a task" onClick={() => { setMenuOpen(false); onPost(); }}>
              <Plus size={18} aria-hidden="true" /> <span className="post-desktop">Post a task</span><span className="post-mobile">Post</span>
            </button>
            {accountControl}
          </div>
        </header>
        <main id="marketplace-main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
