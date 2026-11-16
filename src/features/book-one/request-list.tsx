import { ChevronDown, ChevronRight, ListFilter, MapPin, Search, X } from "lucide-react";
import { categories, price, type Job, type View } from "./model";
import { CategoryIcon } from "./category-icon";

export const emptyFilters = { search: "", category: "", area: "" };
export type Filters = typeof emptyFilters;

const emptyMessage: Record<View, string> = {
  "Browse tasks": "New tasks will appear here.",
  "Posted tasks": "Post a task to start receiving applications.",
  "Sent applications": "Apply for a task and track it here.",
  "Bookings": "Bookings appear here after a provider is selected.",
};

type Props = {
  view: View;
  areas: readonly string[];
  filters: Filters;
  onFilter: (filters: Filters) => void;
  jobs: Job[];
  selectedId?: string;
  onSelect: (job: Job) => void;
};

export function RequestList({ view, areas, filters, onFilter, jobs, selectedId, onSelect }: Props) {
  const hasFilters = Boolean(filters.search || filters.category || filters.area);
  const applicationView = view === "Sent applications";

  return (
    <section className="request-list" aria-label={view}>
      <div className="request-tools">
        <div className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks"
            value={filters.search}
            onChange={event => onFilter({ ...filters, search: event.target.value })}
          />
        </div>
        <div className="request-filters">
          <div className="select-field">
            <ListFilter size={15} aria-hidden="true" />
            <select aria-label="Filter by category" value={filters.category} onChange={event => onFilter({ ...filters, category: event.target.value })}>
              <option value="">All categories</option>
              {categories.map(item => <option key={item}>{item}</option>)}
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </div>
          <div className="select-field">
            <MapPin size={15} aria-hidden="true" />
            <select aria-label="Filter by service area" value={filters.area} onChange={event => onFilter({ ...filters, area: event.target.value })}>
              <option value="">All areas</option>
              {areas.map(item => <option key={item}>{item}</option>)}
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="request-list-heading">
        <span>{jobs.length} {jobs.length === 1 ? "task" : "tasks"}</span>
        {hasFilters && (
          <button type="button" className="text-button" onClick={() => onFilter(emptyFilters)}>
            <X size={13} aria-hidden="true" /> Clear filters
          </button>
        )}
      </div>
      {jobs.length === 0 ? (
        <p className="empty-message">{hasFilters ? "No matching tasks. Try changing your search or filters." : emptyMessage[view]}</p>
      ) : (
        <ul className="request-items">
          {jobs.map(job => {
            const ownQuote = applicationView ? job.quotes.find(quote => quote.own) : undefined;
            const chosenQuote = job.quotes.find(quote => quote.id === job.accepted);
            const count = job.applicationCount ?? job.quotes.length;
            const applicationCount = `${count} ${count === 1 ? "application" : "applications"}`;

            return (
              <li key={job.id}>
                <button
                  type="button"
                  className="request-item"
                  aria-pressed={selectedId === job.id}
                  onClick={() => onSelect(job)}
                >
                  <CategoryIcon category={job.category} />
                  <span className="request-item-copy">
                    <strong>{job.title}</strong>
                    <span className="request-item-meta">{job.category} <span aria-hidden="true">·</span> {job.area}</span>
                    <span className="request-item-summary">
                      <span>{price(ownQuote?.amount ?? chosenQuote?.amount ?? job.budget)}</span>
                      <span>{job.status === "Open" ? (ownQuote ? "Application sent" : applicationCount) : job.status}</span>
                    </span>
                  </span>
                  <ChevronRight className="request-chevron" size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
