import type { NearbyPosition } from "../types/nearby";

// Called only from an explicit click. No watchPosition or background tracking.
export function requestNearbyPosition(): Promise<NearbyPosition> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      reject(
        new Error(
          "Location needs HTTPS or localhost and a supported browser. You can still browse by area.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!Number.isFinite(coords.accuracy) || coords.accuracy > 1500) {
          reject(
            new Error(
              "Your location estimate is too broad. Try on a phone, or browse by area.",
            ),
          );
          return;
        }
        // Discard precision before transmitting; the server enforces this too.
        resolve({
          latitude: Math.round(coords.latitude * 100) / 100,
          longitude: Math.round(coords.longitude * 100) / 100,
          accuracy: coords.accuracy,
        });
      },
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? "Location permission was denied. You can allow it in your browser or browse by area."
              : "Could not get your location. Try again or browse by area.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
