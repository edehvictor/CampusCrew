export type Reputation = {
  completed: number;
  clients: number;
  repeatClients: number;
  rating: number | null;
  reviewCount: number;
};
export type PublicProvider = {
  id: string;
  name: string;
  area: string;
  bio: string;
  skills: string[];
  coverage: string[];
  stats: Reputation;
  reviews: { id: string; stars: number; comment: string; createdAt: string }[];
};
export type ActivityNotification = {
  id: string;
  request_id: string | null;
  title: string;
  path?: string;
  created_at: string;
  read_at: string | null;
};
export type BookingExperience = {
  events: { id: string; label: string; created_at: string }[];
  messages: {
    id: string;
    body: string;
    mine: boolean;
    created_at: string;
    name: string;
  }[];
  evidence: { id: string; name: string; mime: string; created_at: string }[];
  canReview: boolean;
  ownReview: { stars: number; comment: string } | null;
};
