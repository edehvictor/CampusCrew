"use client";

import Link from "next/link";
import { pageHref } from "@/features/book-one/navigation";
import {
  Users,
  Wallet,
  BriefcaseBusiness,
  ChevronRight,
  ClipboardList,
  Compass,
  GraduationCap,
  House,
  LogOut,
  Menu,
  Plus,
  Send,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Page } from "@/features/book-one/model";
import { useSidebarCollapse } from "@/hooks/use-sidebar-collapse";
import "./marketplace-shell.css";

const navigation = [
  {
    label: "Marketplace",
    items: [
      { view: "Home", icon: House },
      { view: "Explore campuses", icon: GraduationCap },
      { view: "Browse tasks", icon: Compass },
      { view: "Find providers", icon: Users },
    ],
  },
  {
    label: "My activity",
    items: [
      { view: "Posted tasks", icon: ClipboardList },
      { view: "Sent applications", icon: Send },
      { view: "Bookings", icon: BriefcaseBusiness },
      { view: "Earnings", icon: Wallet },
    ],
  },
] as const;

type Props = {
  view: Page;
  onNavigate: (view: Page) => void;
  onPost: () => void;
  accountControl?: ReactNode;
  logout?: { run: () => void; pending: boolean };
  children: ReactNode;
};

export function MarketplaceShell({
  view,
  onNavigate,
  onPost,
  accountControl,
  logout,
  children,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebar = useSidebarCollapse();

  function navigate(next: Page) {
    onNavigate(next);
    setMenuOpen(false);
  }

  return (
    <div
      className="marketplace-shell"
      data-menu={menuOpen ? "open" : "closed"}
      data-sidebar={sidebar.collapsed ? "collapsed" : "expanded"}
    >
      <a className="skip-link" href="#marketplace-main">
        Skip to content
      </a>
      <aside className="workspace-sidebar" id="workspace-sidebar">
        <div className="sidebar-content">
          <button
            className="brand"
            aria-label="CampusCrew home"
            title="CampusCrew home"
            type="button"
            onClick={() => navigate("Home")}
          >
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Campuscrew</span>
          </button>
          <nav aria-label="Main navigation">
            {navigation.map((group) => (
              <div className="navigation-group" key={group.label}>
                <p>{group.label}</p>
                {group.items.map(({ view: item, icon: Icon }) => (
                  <Link
                    href={pageHref(item)}
                    key={item}
                    className="navigation-item"
                    aria-label={item}
                    title={item}
                    aria-current={view === item ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(item);
                    }}
                  >
                    <Icon aria-hidden="true" size={18} />
                    <span>{item}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          {logout && (
            <div className="sidebar-footer">
              <button
                className="navigation-item"
                type="button"
                aria-label="Log out"
                title="Log out"
                disabled={logout.pending}
                onClick={() => {
                  setMenuOpen(false);
                  logout.run();
                }}
              >
                <LogOut aria-hidden="true" size={18} />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
        <button
          className="sidebar-edge"
          type="button"
          aria-label={sidebar.collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={
            sidebar.collapsed
              ? "Hover to expand sidebar"
              : "Hover to collapse sidebar"
          }
          aria-expanded={!sidebar.collapsed}
          aria-controls="workspace-sidebar"
          onPointerEnter={(event) => sidebar.hoverEdge(event.pointerType)}
          onPointerLeave={sidebar.cancelHover}
          onPointerDown={sidebar.cancelHover}
          onBlur={sidebar.cancelHover}
          onClick={sidebar.toggle}
        />
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
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <X size={19} aria-hidden="true" />
              ) : (
                <Menu size={19} aria-hidden="true" />
              )}
            </button>
            <span className="mobile-brand" role="img" aria-label="Campuscrew">
              <span className="brand-mark" aria-hidden="true" />
            </span>
            <span className="workspace-crumb">
              {[
                "Home",
                "Explore campuses",
                "Browse tasks",
                "Find providers",
                "Provider profile",
              ].includes(view)
                ? "Marketplace"
                : "My activity"}{" "}
              <ChevronRight size={13} aria-hidden="true" />{" "}
              <strong>{view}</strong>
            </span>
          </div>
          <div className="workspace-actions">
            <button
              type="button"
              className="button button-primary"
              aria-label="Post a task"
              onClick={() => {
                setMenuOpen(false);
                onPost();
              }}
            >
              <Plus size={18} aria-hidden="true" />{" "}
              <span className="post-desktop">Post a task</span>
              <span className="post-mobile">Post</span>
            </button>
            {accountControl}
          </div>
        </header>
        <main id="marketplace-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
