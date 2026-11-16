"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

const categories = ["Cleaning", "Hair & beauty", "Tutoring", "Repairs", "Tech & design", "Errands"] as const;
const areas = ["North Campus", "Main Campus", "Off Campus", "Online"] as const;

type Category = typeof categories[number];
type Status = "Open" | "Awaiting funding" | "Funded" | "Ready for review" | "Paid" | "Refunded";
type View = "Find work" | "My requests" | "My bookings";
type Quote = { id: string; provider: string; amount: number; availability: string; note: string; own?: boolean };
type Job = { id: string; title: string; category: Category; area: string; timing: string; budget: number; scope: string; customer: string; own?: boolean; quotes: Quote[]; accepted?: string; status: Status; completion?: string };

const samples: Job[] = [
  { id: "cleaning", title: "Clean a two-bedroom student flat", category: "Cleaning", area: "North Campus", timing: "Saturday, 10:00 AM", budget: 42000, scope: "Clean the kitchen, bathroom, and two bedrooms. I’ll provide the mop and cleaning supplies. The booking is for one visit.", customer: "Amara N.", own: true, quotes: [{ id: "chioma", provider: "Chioma O.", amount: 38000, availability: "Saturday, 10:00 AM", note: "I can finish the rooms and shared areas in about two hours." }], status: "Open" },
  { id: "hair", title: "Knotless braids before the weekend", category: "Hair & beauty", area: "Main Campus", timing: "Friday afternoon", budget: 55000, scope: "Medium-sized knotless braids. I’ll bring the extensions. I can come to your workspace near campus.", customer: "Ada E.", quotes: [], status: "Open" },
  { id: "maths", title: "Help with introductory calculus", category: "Tutoring", area: "Main Campus", timing: "Wednesday evening", budget: 32000, scope: "A 90-minute session covering limits and differentiation, with time to work through a few practice questions.", customer: "Daniel U.", quotes: [], status: "Open" },
  { id: "design", title: "Design a price list for my shop", category: "Tech & design", area: "Online", timing: "This week", budget: 48000, scope: "Create a one-page price list for my snack business. I’ll provide the branding and prices. Please deliver a PDF and editable file.", customer: "Wale A.", quotes: [], status: "Open" },
];

const number = new Intl.NumberFormat("en-NG");
const price = (value: number) => number.format(value) + " G$";
const mark: Record<Category, string> = { Cleaning: "CL", "Hair & beauty": "HB", Tutoring: "TU", Repairs: "RE", "Tech & design": "TD", Errands: "ER" };

export default function Home() {
  const [jobs, setJobs] = useState(samples);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("Find work");
  const [selectedId, setSelectedId] = useState("cleaning");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");
  const [dialog, setDialog] = useState<"post" | "quote" | "complete" | null>(null);
  const [mobileDetails, setMobileDetails] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("campuscrew-book-one-v1");
      if (saved) setJobs(JSON.parse(saved) as Job[]);
    } catch {
      // Use the sample requests if storage is unavailable.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem("campuscrew-book-one-v1", JSON.stringify(jobs)); } catch { /* Session remains usable. */ }
  }, [jobs, ready]);

  const matches = jobs.filter(job => {
    if (view === "Find work" && job.status !== "Open") return false;
    if (view === "My requests" && !job.own) return false;
    if (view === "My bookings" && (!job.accepted || (!job.own && !job.quotes.some(quote => quote.id === job.accepted && quote.own)))) return false;
    return (!category || job.category === category) &&
      (!area || job.area === area) &&
      (job.title + " " + job.scope + " " + job.category).toLowerCase().includes(search.trim().toLowerCase());
  });
  const selected = matches.find(job => job.id === selectedId) ?? matches[0];
  const accepted = selected?.quotes.find(quote => quote.id === selected.accepted);

  function navigate(next: View, jobId?: string) {
    setView(next);
    setSearch("");
    setCategory("");
    setArea("");
    setMobileDetails(Boolean(jobId));
    if (jobId) setSelectedId(jobId);
  }

  function updateJob(id: string, update: (job: Job) => Job) {
    setJobs(current => current.map(job => job.id === id ? update(job) : job));
  }

  function confirmQuote(job: Job, quote: Quote) {
    updateJob(job.id, current => current.own && current.status === "Open"
      ? { ...current, accepted: quote.id, status: "Awaiting funding" } : current);
    navigate("My bookings", job.id);
    setNotice("Quote accepted. Review the booking before funding.");
  }

  function changeStatus(job: Job, from: Status, to: Status, message: string) {
    updateJob(job.id, current => current.status === from ? { ...current, status: to } : current);
    setNotice(message);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const amount = Number(field("amount"));
    if (dialog !== "complete" && (!Number.isSafeInteger(amount) || amount < 1)) return;
    if (dialog === "post") {
      if (!field("title") || !field("scope") || !field("timing")) return;
      const id = crypto.randomUUID();
      const job: Job = { id, title: field("title"), category: field("category") as Category, area: field("area"), timing: field("timing"), budget: amount, scope: field("scope"), customer: "You", own: true, quotes: [], status: "Open" };
      setJobs(current => [job, ...current]);
      navigate("My requests", id);
      setNotice("Request posted in this demo.");
    } else if (dialog === "quote" && selected && field("availability") && field("note")) {
      const quote: Quote = { id: crypto.randomUUID(), provider: "You", amount, availability: field("availability"), note: field("note"), own: true };
      updateJob(selected.id, current => current.status === "Open" && !current.quotes.some(item => item.own)
        ? { ...current, quotes: [...current.quotes, quote] } : current);
      setNotice("Quote sent in this demo.");
    } else if (dialog === "complete" && selected && field("note")) {
      updateJob(selected.id, current => current.status === "Funded"
        ? { ...current, completion: field("note"), status: "Ready for review" } : current);
      setNotice("Completion submitted for review.");
    } else {
      return;
    }
    setDialog(null);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("Find work")}><span className="brandmark" aria-hidden="true">C</span> Campuscrew</button>
        <button className="button post primary" onClick={() => setDialog("post")}>＋ Post a request</button>
        <nav aria-label="Marketplace">
          <p>Marketplace</p>
          {(["Find work", "My requests", "My bookings"] as View[]).map((item, index) => (
            <button key={item} aria-current={view === item ? "page" : undefined} onClick={() => navigate(item)}>
              <span aria-hidden="true">{["⌕", "▤", "▣"][index]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom"><span className="avatar small">AN</span><div><strong>Amara N.</strong><small>Demo account</small></div></div>
      </aside>

      <main>
        <header className="topbar"><span>Marketplace <span className="slash">/</span> <strong>{view}</strong></span><span className="demo"><i /> Demo mode</span></header>
        <section className="intro">
          <div><h1>{view === "Find work" ? "Campus requests" : view}</h1><p>{view === "Find work" ? "Book local services on your own or with neighbours." : view === "My requests" ? "Review quotes and choose who will do the work." : "Track funding, completion, and payouts for your bookings."}</p></div>
          <button className="button primary mobile-post" onClick={() => setDialog("post")}>＋ New request</button>
        </section>
        <section className={"board" + (mobileDetails ? " show-detail" : "")}>
          <div className="listing">
            <div className="filters">
              <input type="search" aria-label="Search requests" placeholder="Search requests" value={search} onChange={event => setSearch(event.target.value)} />
              <div>
                <select aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select>
                <select aria-label="Filter by service area" value={area} onChange={event => setArea(event.target.value)}><option value="">All areas</option>{areas.map(item => <option key={item}>{item}</option>)}</select>
              </div>
            </div>
            <div className="results">{matches.length} {matches.length === 1 ? "result" : "results"}</div>
            {matches.map(job => (
              <button key={job.id} className={"job" + (selected?.id === job.id ? " current" : "")} aria-pressed={selected?.id === job.id} onClick={() => { setSelectedId(job.id); setMobileDetails(true); setNotice(""); }}>
                <span className="category-icon" data-category={job.category}>{mark[job.category]}</span>
                <span className="job-body"><span className="job-title">{job.title}</span><span className="job-meta">{job.category} · {job.area}</span><span className="job-price">{price(job.budget)}</span></span>
                <span className="job-end">{job.status === "Open" ? job.quotes.length + (job.quotes.length === 1 ? " quote" : " quotes") : job.status}</span>
              </button>
            ))}
            {!matches.length && <p className="empty">No matching requests. Try a different filter or post a request.</p>}
          </div>
          <div className="detail">
            <button className="back" onClick={() => setMobileDetails(false)}>← Back to requests</button>
            {selected ? (
              <>
                <div className="detail-labels"><span className="badge">{selected.category}</span><span className={"status " + (selected.status === "Funded" || selected.status === "Paid" ? "positive" : "")}>{selected.status}</span></div>
                <h2>{selected.title}</h2>
                <p className="byline">Posted by {selected.customer}</p>
                <div className="facts"><div><small>{accepted ? "Agreed payout" : "Customer budget"}</small><strong>{price(accepted?.amount ?? selected.budget)}</strong></div><div><small>Service area</small><strong>{selected.area}</strong></div><div><small>When</small><strong>{accepted?.availability ?? selected.timing}</strong></div></div>
                <h3>What’s needed</h3>
                <p className="scope">{selected.scope}</p>
                <p className="payment-note">Book One · This demo uses simulated G$ and stores bookings in this browser.</p>
                {selected.status === "Open" && selected.own && (
                  <div className="quotes"><h3>Quotes ({selected.quotes.length})</h3>
                    {selected.quotes.length === 0 && <p className="scope">Quotes from nearby providers will appear here.</p>}
                    {selected.quotes.map(quote => <article className="quote" key={quote.id}><div><strong>{quote.provider}</strong><p>{quote.availability} · {quote.note}</p></div><div><strong>{price(quote.amount)}</strong><button className="button primary" onClick={() => confirmQuote(selected, quote)}>Accept quote</button></div></article>)}
                  </div>
                )}
                {selected.status === "Open" && !selected.own && (
                  selected.quotes.some(quote => quote.own) ? <p className="badge">Quote sent</p> : <button className="button primary" onClick={() => setDialog("quote")}>Send a quote</button>
                )}
                {accepted && <div className="booking"><h3>Booking with {accepted.provider}</h3><p className="scope">{accepted.note}</p>
                  {selected.completion && <p className="scope"><strong>Completion note</strong><br />{selected.completion}</p>}
                  <div className="booking-actions">
                    {selected.status === "Awaiting funding" && <button className="button primary" onClick={() => changeStatus(selected, "Awaiting funding", "Funded", "Demo funding confirmed.")}>Simulate funding</button>}
                    {selected.status === "Funded" && <><button className="button primary" onClick={() => setDialog("complete")}>Submit completion</button><button className="button secondary" onClick={() => changeStatus(selected, "Funded", "Refunded", "Demo refund recorded.")}>Simulate cancellation</button></>}
                    {selected.status === "Ready for review" && <button className="button primary" onClick={() => changeStatus(selected, "Ready for review", "Paid", "Demo payout recorded.")}>Approve and simulate payout</button>}
                    {selected.status === "Paid" && <span className="status positive">Demo payout recorded</span>}
                    {selected.status === "Refunded" && <span className="status">Demo refund recorded</span>}
                  </div>
                </div>}
              </>
            ) : <p className="empty">Choose a request to see its details.</p>}
          </div>
        </section>
        <div className="announcement" role="status">{notice}</div>
      </main>

      {dialog && (
        <div className="overlay">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <header><h2 id="dialog-title">{dialog === "post" ? "Post a request" : dialog === "quote" ? "Send a quote" : "Submit completion"}</h2><button aria-label="Close dialog" className="close" onClick={() => setDialog(null)}>×</button></header>
            <form onSubmit={submit}>
              {dialog === "post" && <>
                <label>Request title<input name="title" required maxLength={100} autoFocus /></label>
                <div className="form-row"><label>Category<select name="category">{categories.map(item => <option key={item}>{item}</option>)}</select></label><label>Service area<select name="area">{areas.map(item => <option key={item}>{item}</option>)}</select></label></div>
                <label>When do you need it?<input name="timing" required maxLength={80} /></label>
              </>}
              {dialog !== "complete" && <label>{dialog === "post" ? "Budget (demo G$)" : "Quote (demo G$)"}<input name="amount" type="number" min={1} max={1000000000} step={1} required autoFocus={dialog === "quote"} /></label>}
              {dialog === "quote" && <label>Availability<input name="availability" required maxLength={80} /></label>}
              <label>{dialog === "post" ? "What needs to be done?" : dialog === "quote" ? "What’s included?" : "What did you complete?"}<textarea name={dialog === "post" ? "scope" : "note"} required maxLength={750} rows={3} autoFocus={dialog === "complete"} /></label>
              <button className="button primary" type="submit">{dialog === "post" ? "Post request" : dialog === "quote" ? "Send quote" : "Submit for review"}</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
