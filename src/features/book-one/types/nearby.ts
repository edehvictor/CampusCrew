import { z } from "zod";
import { categories } from "../model.ts";
import type { PublicProvider } from "./experience";

export const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(1500),
});
export const nearbySchema = z.discriminatedUnion("action", [
  coordinateSchema.extend({ action: z.literal("publish") }),
  coordinateSchema.extend({
    action: z.literal("search"),
    radius: z.union([
      z.literal(1),
      z.literal(3),
      z.literal(5),
      z.literal(10),
      z.literal(20),
    ]),
    category: z.enum(categories).optional(),
  }),
  z.object({ action: z.literal("stop") }),
]);
export type NearbyPosition = z.infer<typeof coordinateSchema>;
export type NearbyProvider = PublicProvider & {
  distanceKm: number;
  locationUpdatedAt: string;
  locationExpiresAt: string;
};
export type LocationSharing = {
  sharing: boolean;
  updatedAt?: string;
  expiresAt?: string;
};
