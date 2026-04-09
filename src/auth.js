const { createClient } = require("@supabase/supabase-js");

let supabaseAdmin = null;

function getSupabaseAdminClient() {
  if (supabaseAdmin) return supabaseAdmin;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase backend env is missing.");
  }

  supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdmin;
}

function extractBearerToken(request) {
  const header = String(request.headers?.authorization || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function getUserFromRequest(request, { optional = false } = {}) {
  const token = extractBearerToken(request);
  if (!token) {
    if (optional) return null;
    throw new Error("Unauthorized");
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    if (optional) return null;
    throw new Error("Unauthorized");
  }

  return data.user;
}

module.exports = {
  getUserFromRequest,
};
