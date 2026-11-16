import "server-only";

export function getPilotConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

  if (!supabaseUrl || !supabaseKey || !projectId || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return { supabaseUrl, supabaseKey, projectId };
}
