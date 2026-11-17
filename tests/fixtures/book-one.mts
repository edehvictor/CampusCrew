import type { Job } from "../../src/features/book-one/model";

const tasks: Job[] = [
  {
    id: "cleaning",
    title: "Clean a two-bedroom student flat",
    category: "Cleaning",
    area: "Around Nsukka",
    timing: "Saturday, 10:00 AM",
    budget: 42000,
    scope: "Clean the kitchen, bathroom, and two bedrooms. I’ll provide the mop and cleaning supplies. The booking is for one visit.",
    customer: "Amara N.",
    own: true,
    quotes: [
      {
        id: "chioma",
        provider: "Chioma O.",
        amount: 38000,
        availability: "Saturday, 10:00 AM",
        note: "I can finish the rooms and shared areas in about two hours.",
      },
    ],
    status: "Open",
  },
  {
    id: "hair",
    title: "Knotless braids before the weekend",
    category: "Hair & beauty",
    area: "On campus",
    timing: "Friday afternoon",
    budget: 55000,
    scope: "Medium-sized knotless braids. I’ll bring the extensions. I can come to your workspace near campus.",
    customer: "Ada E.",
    quotes: [],
    status: "Open",
  },
  {
    id: "maths",
    title: "Help with introductory calculus",
    category: "Tutoring",
    area: "On campus",
    timing: "Wednesday evening",
    budget: 32000,
    scope: "A 90-minute session covering limits and differentiation, with time to work through a few practice questions.",
    customer: "Daniel U.",
    quotes: [],
    status: "Open",
  },
  {
    id: "design",
    title: "Design a price list for my shop",
    category: "Tech & design",
    area: "Online",
    timing: "This week",
    budget: 48000,
    scope: "Create a one-page price list for my snack business. I’ll provide the branding and prices. Please deliver a PDF and editable file.",
    customer: "Wale A.",
    quotes: [],
    status: "Open",
  },
];

const [cleaningRequest, braidsRequest] = tasks;

const tasksWithApplications: Job[] = [
  {
    ...cleaningRequest,
    area: "Around Nsukka",
    quotes: [
      ...cleaningRequest.quotes,
      {
        id: "ngozi",
        provider: "Ngozi E.",
        amount: 40000,
        availability: "Saturday, 11:00 AM",
        note: "I can clean the flat and wipe down the kitchen cabinets.",
      },
      {
        id: "uche",
        provider: "Uche N.",
        amount: 42000,
        availability: "Saturday, 10:00 AM",
        note: "I can start at 10 and bring my own cleaning supplies.",
      },
    ],
  },
  { ...braidsRequest, area: "On campus" },
];

export function makeTaskFixtures(): Job[] {
  return structuredClone([...tasksWithApplications, ...tasks.slice(2)]);
}
