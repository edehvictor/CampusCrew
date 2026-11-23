// Run as a separate worker alongside the deployed application. Never expose its secret to the browser.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const origin = process.env.CAMPUSCREW_WORKER_ORIGIN ?? "http://localhost:3000";
const secret = process.env.EXPERIENCE_WORKER_SECRET;
if (!secret) throw new Error("Configure EXPERIENCE_WORKER_SECRET first.");
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
while (!stopping) {
  try {
    const result = await fetch(
      new URL("/api/internal/experience-worker", origin),
      {
        method: "POST",
        headers: { Authorization: "Bearer " + secret },
        signal: AbortSignal.timeout(55000),
      },
    );
    if (!result.ok) {
      console.error("Worker request failed:", result.status);
      if (process.argv.includes("--once")) process.exitCode = 1;
    } else if (process.argv.includes("--once"))
      console.log("Worker cycle completed.");
  } catch {
    console.error("Worker could not reach CampusCrew; retrying.");
    if (process.argv.includes("--once")) process.exitCode = 1;
  }
  if (process.argv.includes("--once")) break;
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 10000));
}
