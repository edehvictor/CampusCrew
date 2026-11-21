import Image from "next/image";
import { ArrowRight, Check, Clock3, MapPin, Plus, ClipboardList, UserRoundCheck, WalletCards, Map } from "lucide-react";
import { categories, price, type Category, type Job } from "./model";
import { CategoryIcon } from "./category-icon";
import "./discovery.css";

type HomeProps = {
  jobs: Job[];
  onPost: () => void;
  onBrowse: (category?: Category) => void;
  onTask: (job: Job) => void;
};

function CampusLogo() {
  return <Image src="/campuses/unn.png" alt="University of Nigeria" width={340} height={80} className="campus-logo" />;
}

export function Home({ jobs, onPost, onBrowse, onTask }: HomeProps) {
  const available = jobs.filter(job => job.status === "Open");
  return (
    <div className="discovery-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="home-kicker">UNIVERSITY OF NIGERIA, NSUKKA</p>
          <h1 id="home-title">Campus task<br /><em>marketplace.</em></h1>
          <p>Book a service, get an errand done, or find paid work around campus.</p>
          <div className="home-actions">
            <button className="button button-primary" type="button" onClick={onPost}><Plus size={17} aria-hidden="true" /> Post a task</button>
            <button className="button button-secondary" type="button" onClick={() => onBrowse()}>Find work <ArrowRight size={17} aria-hidden="true" /></button>
          </div>
          <p className="home-escrow-note"><WalletCards size={16} aria-hidden="true" /> Funds stay in escrow until you confirm the task is complete.</p>
        </div>
        <div className="home-hero-art"><Image src="/campuscrew-errand-hero.webp" alt="A student carrying groceries for a campus errand" width={960} height={1440} priority /></div>
      </section>

      <section className="home-services" aria-labelledby="services-title">
        <div className="discovery-section-heading"><div><h2 id="services-title">What do you need help with?</h2></div></div>
        <div className="service-grid">{categories.map(category => (
          <button type="button" className="service-tile" key={category} onClick={() => onBrowse(category)}><CategoryIcon category={category} /><span>{category}</span><ArrowRight size={14} aria-hidden="true" /></button>
        ))}</div>
      </section>

      <section className="how-section" aria-labelledby="how-title"><div className="discovery-section-heading"><div><p className="discovery-eyebrow">Simple from start to finish</p><h2 id="how-title">How CampusCrew works</h2></div></div><div className="how-grid">
        <article className="how-card"><span className="how-number">01</span><span className="how-illustration illust-task"><ClipboardList size={25} /><Plus size={15} /></span><h3>Post what you need</h3><p>Describe the service or errand, choose an area and set your budget in USDC.</p></article>
        <article className="how-card"><span className="how-number">02</span><span className="how-illustration illust-choose"><UserRoundCheck size={27} /><span>•••</span></span><h3>Choose who does it</h3><p>Compare nearby providers by price, availability and their note.</p></article>
        <article className="how-card"><span className="how-number">03</span><span className="how-illustration illust-pay"><WalletCards size={27} /><Check size={15} /></span><h3>Pay when it’s done</h3><p>Fund the agreed booking and approve payment after the work is complete.</p></article>
      </div></section>

      <section className="home-recent" aria-labelledby="recent-title">
        <div className="discovery-section-heading"><div><p className="discovery-eyebrow">Around campus</p><h2 id="recent-title">Open tasks</h2></div><button className="text-button" type="button" onClick={() => onBrowse()}>All tasks <ArrowRight size={15} aria-hidden="true" /></button></div>
        {available.length ? <div className="recent-task-grid">{available.slice(0, 3).map(job => (
          <button className="recent-task" key={job.id} type="button" onClick={() => onTask(job)}>
            <div className="recent-task-top"><CategoryIcon category={job.category} /><span>{job.category}</span></div>
            <h3>{job.title}</h3><p><MapPin size={13} aria-hidden="true" /> {job.area}</p>
            <div className="recent-task-bottom"><strong>{price(job.budget)}</strong><ArrowRight size={17} aria-hidden="true" /></div>
          </button>
        ))}</div> : <div className="discovery-empty"><div><h3>No open tasks yet</h3><p>Post a task or browse available work around campus.</p></div><button type="button" className="button button-secondary" onClick={onPost}>Post a task</button></div>}
      </section>
    </div>
  );
}

export function ExploreCampuses({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="discovery-page campus-page">
      <header className="campus-page-heading"><p className="discovery-eyebrow">Built around your community</p><h1>Find your <em>corner.</em></h1><p>Local services work better when local means close. We’re starting with one campus and growing from there.</p></header>
      <div className="campus-grid">
        <article className="active-campus-card">
          <div className="campus-card-top"><span className="campus-status"><span className="live-dot" /> Active campus</span><span className="campus-number">01 / NSUKKA</span></div>
          <div className="campus-identity"><CampusLogo /></div>
          <h2>University of Nigeria</h2><p className="campus-location"><MapPin size={15} aria-hidden="true" /> Nsukka, Enugu State</p>
          <p className="campus-card-description">A little help for life on and around campus. Connect with nearby providers for everyday services.</p>
          <div className="campus-highlights"><span><Check size={14} aria-hidden="true" /> Tasks & applications</span><span><Check size={14} aria-hidden="true" /> Testnet USDC bookings</span></div>
          <button className="button button-primary" type="button" onClick={onOpen}><span>Explore UNN tasks</span><ArrowRight size={17} aria-hidden="true" /></button>
        </article>
        <article className="upcoming-campus-card" aria-labelledby="upcoming-title">
          <span className="coming-soon-label"><Clock3 size={14} aria-hidden="true" /> Coming soon</span>
          <div className="campus-growth-art" aria-hidden="true"><span /><Map size={48} strokeWidth={1.2} /><span /></div>
          <h2 id="upcoming-title">More campuses on the way</h2>
          <p>We’re starting with UNN. Other campuses will be added as they open.</p>
        </article>
      </div>
    </div>
  );
}
