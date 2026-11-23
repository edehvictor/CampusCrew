import Image from "next/image";
import {
  ArrowRight,
  Check,
  Clock3,
  MapPin,
  Plus,
  ClipboardList,
  UserRoundCheck,
  WalletCards,
  Landmark,
} from "lucide-react";
import { categories, price, type Category, type Job } from "./model";
import { CategoryIcon } from "./category-icon";
import "./discovery.css";
import "./campus-directory.css";

type HomeProps = {
  jobs: Job[];
  onPost: () => void;
  onBrowse: (category?: Category) => void;
  onTask: (job: Job) => void;
};

function CampusLogo() {
  return (
    <Image
      src="/campuses/unn.png"
      alt="University of Nigeria"
      width={340}
      height={80}
      className="campus-logo"
    />
  );
}

export function Home({ jobs, onPost, onBrowse, onTask }: HomeProps) {
  const available = jobs.filter((job) => job.status === "Open");
  return (
    <div className="discovery-page home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="home-kicker">UNIVERSITY OF NIGERIA, NSUKKA</p>
          <h1 id="home-title">
            Campus task
            <br />
            <em>marketplace.</em>
          </h1>
          <p>
            Book a service, get an errand done, or find paid work around campus.
          </p>
          <div className="home-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={onPost}
            >
              <Plus size={17} aria-hidden="true" /> Post a task
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => onBrowse()}
            >
              Find work <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
          <p className="home-escrow-note">
            <WalletCards size={16} aria-hidden="true" /> Funds stay in escrow
            until you confirm the task is complete.
          </p>
        </div>
        <div className="home-hero-art">
          <Image
            src="/campuscrew-errand-hero.webp"
            alt="A student carrying groceries for a campus errand"
            width={960}
            height={1440}
            priority
          />
        </div>
      </section>

      <section className="home-services" aria-labelledby="services-title">
        <div className="discovery-section-heading">
          <div>
            <h2 id="services-title">What do you need help with?</h2>
          </div>
        </div>
        <div className="service-grid">
          {categories.map((category) => (
            <button
              type="button"
              className="service-tile"
              key={category}
              onClick={() => onBrowse(category)}
            >
              <CategoryIcon category={category} />
              <span>{category}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section className="how-section" aria-labelledby="how-title">
        <div className="discovery-section-heading">
          <div>
            <p className="discovery-eyebrow">Simple from start to finish</p>
            <h2 id="how-title">How CampusCrew works</h2>
          </div>
        </div>
        <div className="how-grid">
          <article className="how-card">
            <span className="how-number">01</span>
            <span className="how-illustration illust-task">
              <ClipboardList size={25} />
              <Plus size={15} />
            </span>
            <h3>Post what you need</h3>
            <p>
              Describe the service or errand, choose an area and set your budget
              in USDC.
            </p>
          </article>
          <article className="how-card">
            <span className="how-number">02</span>
            <span className="how-illustration illust-choose">
              <UserRoundCheck size={27} />
              <span>•••</span>
            </span>
            <h3>Choose who does it</h3>
            <p>
              Compare nearby providers by price, availability and their note.
            </p>
          </article>
          <article className="how-card">
            <span className="how-number">03</span>
            <span className="how-illustration illust-pay">
              <WalletCards size={27} />
              <Check size={15} />
            </span>
            <h3>Pay when it’s done</h3>
            <p>
              Fund the agreed booking and approve payment after the work is
              complete.
            </p>
          </article>
        </div>
      </section>

      <section className="home-recent" aria-labelledby="recent-title">
        <div className="discovery-section-heading">
          <div>
            <p className="discovery-eyebrow">Around campus</p>
            <h2 id="recent-title">Open tasks</h2>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => onBrowse()}
          >
            All tasks <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
        {available.length ? (
          <div className="recent-task-grid">
            {available.slice(0, 3).map((job) => (
              <button
                className="recent-task"
                key={job.id}
                type="button"
                onClick={() => onTask(job)}
              >
                <div className="recent-task-top">
                  <CategoryIcon category={job.category} />
                  <span>{job.category}</span>
                </div>
                <h3>{job.title}</h3>
                <p>
                  <MapPin size={13} aria-hidden="true" /> {job.area}
                </p>
                <div className="recent-task-bottom">
                  <strong>{price(job.budget)}</strong>
                  <ArrowRight size={17} aria-hidden="true" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="discovery-empty">
            <div>
              <h3>No open tasks yet</h3>
              <p>Post a task or browse available work around campus.</p>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={onPost}
            >
              Post a task
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export function ExploreCampuses({
  jobs,
  onOpen,
}: {
  jobs: Job[];
  onOpen: (category?: Category) => void;
}) {
  const available = jobs.filter((job) => job.status === "Open").length;
  return (
    <div className="discovery-page campus-directory">
      <header className="campus-directory-heading">
        <div>
          <p className="discovery-eyebrow">Explore campuses</p>
          <h1>
            Find your <em>campus.</em>
          </h1>
          <p>
            Everyday errands, local services and paid work. All closer to
            campus.
          </p>
        </div>
        <span className="campus-live-count">
          <span className="live-dot" />1 campus live
        </span>
      </header>
      <article className="campus-hub" aria-labelledby="unn-hub-title">
        <div className="campus-hub-content">
          <div className="campus-hub-top">
            <span className="campus-status">
              <span className="live-dot" />
              Open for tasks
            </span>
            <span className="campus-index">CAMPUS 001</span>
          </div>
          <div className="campus-hub-brand">
            <CampusLogo />
          </div>
          <h2 id="unn-hub-title">Nsukka campus</h2>
          <p className="campus-hub-location">
            <MapPin size={14} />
            Nsukka, Enugu State
          </p>
          <p className="campus-hub-description">
            From a quick delivery to your next tutor. Find people who can help,
            or put your own skills to work.
          </p>
          <div className="campus-hub-bottom">
            <div>
              <strong>{available}</strong>
              <span>open {available === 1 ? "task" : "tasks"}</span>
            </div>
            <button
              className="button button-primary"
              type="button"
              onClick={() => onOpen()}
            >
              Explore UNN tasks
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="campus-locator" aria-hidden="true">
          <span className="locator-code">UNN / NSUKKA</span>
          <svg className="locator-lines" viewBox="0 0 340 300" fill="none">
            <path
              d="M-20 60C80 20 80 170 190 90S320 30 380 100M-20 105C80 65 80 215 190 135S320 75 380 145M-20 150C80 110 80 260 190 180S320 120 380 190M-20 195C80 155 80 305 190 225S320 165 380 235"
              stroke="currentColor"
            />
            <path
              d="M70-20V320M170-20V320M270-20V320M-20 80H360M-20 180H360M-20 280H360"
              stroke="currentColor"
              strokeDasharray="2 8"
            />
          </svg>
          <span className="locator-ring locator-ring-outer" />
          <span className="locator-ring" />
          <span className="locator-marker">
            <Landmark size={40} strokeWidth={1.3} />
          </span>
          <span className="locator-tag">
            <span className="live-dot" />
            University of Nigeria
          </span>
          <span className="locator-caption">Our first campus community</span>
        </div>
      </article>
      <section
        className="campus-shortcuts"
        aria-labelledby="campus-services-title"
      >
        <header>
          <h2 id="campus-services-title">What needs doing at UNN?</h2>
          <span>Pick a service to explore</span>
        </header>
        <div>
          {categories.map((category) => (
            <button
              type="button"
              key={category}
              onClick={() => onOpen(category)}
            >
              <CategoryIcon category={category} />
              <span>{category}</span>
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </section>
      <aside className="campus-next">
        <span className="campus-next-icon">
          <Clock3 size={19} strokeWidth={1.6} />
        </span>
        <div>
          <h2>More campuses, coming soon.</h2>
          <p>
            We are starting with UNN. New locations will appear here when they
            launch.
          </p>
        </div>
        <span className="campus-next-status">On the way</span>
      </aside>
    </div>
  );
}
