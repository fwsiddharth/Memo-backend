const { createClient } = require("@supabase/supabase-js");

const DEFAULT_SETTINGS = {
  sidebar_compact: "1",
  autoplay_next: "1",
  preferred_sub_lang: "en",
  ui_animations: "1",
};

let supabase = null;

function getSupabaseClient() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase database env is missing.");
  }

  supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabase;
}

function boolToSetting(value, defaultValue = true) {
  return (value ?? (defaultValue ? "1" : "0")) === "1";
}

function mapHistoryRow(row) {
  if (!row) return null;
  return {
    animeId: row.anime_id,
    provider: row.provider,
    episodeId: row.episode_id,
    source: row.source,
    position: Number(row.position || 0),
    duration: Number(row.duration || 0),
    completed: Boolean(row.completed),
    animeTitle: row.anime_title || null,
    animeCover: row.anime_cover || null,
    episodeNumber: Number.isFinite(Number(row.episode_number)) ? Number(row.episode_number) : null,
    episodeTitle: row.episode_title || null,
    updatedAt: Number(row.updated_at || 0),
  };
}

function mapFavoriteRow(row) {
  if (!row) return null;
  return {
    animeId: row.anime_id,
    provider: row.provider,
    animeTitle: row.anime_title || null,
    animeCover: row.anime_cover || null,
    addedAt: Number(row.added_at || 0),
  };
}

function mapTrackerRow(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    connected: Boolean(row.connected),
    username: row.username || null,
    updatedAt: Number(row.updated_at || 0),
  };
}

function ensureNoError(error, fallbackMessage) {
  if (error) {
    throw new Error(error.message || fallbackMessage);
  }
}

async function ensureSeedSettings(userId) {
  const client = getSupabaseClient();
  const rows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
    user_id: userId,
    key,
    value,
  }));

  const { error } = await client
    .from("app_settings")
    .upsert(rows, { onConflict: "user_id,key", ignoreDuplicates: true });

  ensureNoError(error, "Failed to seed settings.");
}

async function initDb() {
  const client = getSupabaseClient();
  const { error } = await client.from("app_settings").select("key").limit(1);
  if (error) {
    throw new Error(
      `Supabase schema is missing or unreachable. Run backend/supabase/schema.sql first. (${error.message})`,
    );
  }
}

async function saveProgress(input, userId) {
  const completed = Boolean(input.completed);
  const duration = Number(input.duration || 0);
  const position = completed ? duration : Number(input.position || 0);

  const payload = {
    user_id: userId,
    anime_id: input.animeId,
    provider: input.provider || "anilist",
    episode_id: input.episodeId,
    source: input.source || "default",
    position,
    duration,
    completed,
    anime_title: input.animeTitle || null,
    anime_cover: input.animeCover || null,
    episode_number: Number.isFinite(input.episodeNumber) ? input.episodeNumber : null,
    episode_title: input.episodeTitle || null,
    updated_at: Date.now(),
  };

  const { error } = await getSupabaseClient()
    .from("watch_history")
    .upsert(payload, { onConflict: "user_id,anime_id,provider,episode_id,source" });

  ensureNoError(error, "Failed to save progress.");
}

async function getContinueWatching(userId, limit = 24) {
  const fetchLimit = Math.max(limit * 4, 120);
  const { data, error } = await getSupabaseClient()
    .from("watch_history")
    .select("*")
    .eq("user_id", userId)
    .gt("position", 0)
    .eq("completed", false)
    .order("updated_at", { ascending: false })
    .limit(fetchLimit);

  ensureNoError(error, "Failed to load continue watching.");

  const seen = new Set();
  const deduped = [];

  for (const row of data || []) {
    const item = mapHistoryRow(row);
    if (!item) continue;
    if (item.duration > 0 && item.position >= item.duration * 0.95) continue;
    const key = `${item.provider}:${item.animeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

async function getAnimeHistory(userId, animeId, provider = "anilist") {
  const { data, error } = await getSupabaseClient()
    .from("watch_history")
    .select("*")
    .eq("user_id", userId)
    .eq("anime_id", animeId)
    .eq("provider", provider)
    .order("episode_number", { ascending: true })
    .order("updated_at", { ascending: false });

  ensureNoError(error, "Failed to load anime history.");
  return (data || []).map(mapHistoryRow);
}

async function getRecentHistory(userId, limit = 60) {
  const { data, error } = await getSupabaseClient()
    .from("watch_history")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 60)));

  ensureNoError(error, "Failed to load recent history.");
  return (data || []).map(mapHistoryRow);
}

async function getResume(userId, animeId, episodeId, source = "default", provider = "anilist") {
  let item = null;

  if (source && source !== "default") {
    const { data, error } = await getSupabaseClient()
      .from("watch_history")
      .select("*")
      .eq("user_id", userId)
      .eq("anime_id", animeId)
      .eq("provider", provider)
      .eq("episode_id", episodeId)
      .eq("source", source)
      .limit(1)
      .maybeSingle();

    ensureNoError(error, "Failed to load resume progress.");
    item = mapHistoryRow(data);
  }

  if (!item) {
    const { data, error } = await getSupabaseClient()
      .from("watch_history")
      .select("*")
      .eq("user_id", userId)
      .eq("anime_id", animeId)
      .eq("provider", provider)
      .eq("episode_id", episodeId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    ensureNoError(error, "Failed to load resume progress.");
    item = mapHistoryRow(data);
  }

  if (!item) return null;
  if (item.duration > 0 && item.position >= item.duration * 0.95) return null;
  return item;
}

async function deleteAnimeHistory(userId, animeId, provider = "anilist") {
  console.log('[DB] deleteAnimeHistory called with:', { userId, animeId, provider });
  
  const { error } = await getSupabaseClient()
    .from("watch_history")
    .delete()
    .eq("user_id", userId)
    .eq("anime_id", animeId)
    .eq("provider", provider);

  if (error) {
    console.error('[DB] Delete error:', error);
  } else {
    console.log('[DB] Successfully deleted history for anime:', animeId);
  }

  ensureNoError(error, "Failed to delete anime history.");
}

async function addFavorite(input, userId) {
  console.log('[DB] addFavorite called with:', { input, userId });
  
  const payload = {
    user_id: userId,
    anime_id: input.animeId,
    provider: input.provider || "anilist",
    anime_title: input.animeTitle || null,
    anime_cover: input.animeCover || null,
    added_at: Date.now(), // Use milliseconds timestamp for BIGINT column
  };
  
  console.log('[DB] Inserting payload:', payload);

  const { error } = await getSupabaseClient()
    .from("favorites")
    .upsert(payload, { onConflict: "user_id,anime_id,provider" });

  if (error) {
    console.error('[DB] Supabase error:', error);
  } else {
    console.log('[DB] Successfully saved favorite');
  }
  
  ensureNoError(error, "Failed to save favorite.");
}

async function removeFavorite(animeId, provider = "anilist", userId) {
  console.log('[DB] removeFavorite called with:', { animeId, provider, userId });
  
  const { data, error } = await getSupabaseClient()
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("anime_id", animeId)
    .eq("provider", provider)
    .select(); // Return deleted rows for debugging

  if (error) {
    console.error('[DB] Supabase delete error:', error);
  } else {
    console.log('[DB] Successfully deleted favorite:', data);
  }

  ensureNoError(error, "Failed to remove favorite.");
}

async function isFavorite(animeId, provider = "anilist", userId) {
  const { data, error } = await getSupabaseClient()
    .from("favorites")
    .select("anime_id")
    .eq("user_id", userId)
    .eq("anime_id", animeId)
    .eq("provider", provider)
    .limit(1)
    .maybeSingle();

  ensureNoError(error, "Failed to check favorite.");
  return Boolean(data?.anime_id);
}

async function listFavorites(userId, limit = 100) {
  const { data, error } = await getSupabaseClient()
    .from("favorites")
    .select("*")
    .eq("user_id", userId)
    .order("added_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)));

  ensureNoError(error, "Failed to load favorites.");
  return (data || []).map(mapFavoriteRow);
}

async function getSettings(userId) {
  await ensureSeedSettings(userId);

  const { data, error } = await getSupabaseClient()
    .from("app_settings")
    .select("key, value")
    .eq("user_id", userId);

  ensureNoError(error, "Failed to load settings.");
  const map = new Map((data || []).map((row) => [row.key, row.value]));
  let captionSettings = null;

  try {
    const rawCaptionSettings = map.get("caption_settings");
    captionSettings = rawCaptionSettings ? JSON.parse(rawCaptionSettings) : null;
  } catch {
    captionSettings = null;
  }

  return {
    sidebarCompact: boolToSetting(map.get("sidebar_compact"), true),
    autoplayNext: boolToSetting(map.get("autoplay_next"), true),
    preferredSubLang: map.get("preferred_sub_lang") || "en",
    uiAnimations: boolToSetting(map.get("ui_animations"), true),
    captionSettings,
  };
}

async function updateSettings(input, userId) {
  await ensureSeedSettings(userId);
  const rows = [];

  if (typeof input.sidebarCompact === "boolean") {
    rows.push({
      user_id: userId,
      key: "sidebar_compact",
      value: input.sidebarCompact ? "1" : "0",
    });
  }
  if (typeof input.autoplayNext === "boolean") {
    rows.push({
      user_id: userId,
      key: "autoplay_next",
      value: input.autoplayNext ? "1" : "0",
    });
  }
  if (typeof input.preferredSubLang === "string") {
    rows.push({
      user_id: userId,
      key: "preferred_sub_lang",
      value: input.preferredSubLang || "en",
    });
  }
  if (typeof input.uiAnimations === "boolean") {
    rows.push({
      user_id: userId,
      key: "ui_animations",
      value: input.uiAnimations ? "1" : "0",
    });
  }
  if (input.captionSettings && typeof input.captionSettings === "object") {
    rows.push({
      user_id: userId,
      key: "caption_settings",
      value: JSON.stringify(input.captionSettings),
    });
  }

  if (!rows.length) return;

  const { error } = await getSupabaseClient()
    .from("app_settings")
    .upsert(rows, { onConflict: "user_id,key" });

  ensureNoError(error, "Failed to update settings.");
}

async function listTrackers(userId) {
  const { data, error } = await getSupabaseClient()
    .from("trackers")
    .select("*")
    .eq("user_id", userId)
    .order("provider", { ascending: true });

  ensureNoError(error, "Failed to load trackers.");
  return (data || []).map(mapTrackerRow);
}

async function connectTracker({ provider, username, token }, userId) {
  const payload = {
    user_id: userId,
    provider: String(provider || "").toLowerCase().trim(),
    connected: true,
    username: username || null,
    token: token || null,
    updated_at: Date.now(),
  };

  const { error } = await getSupabaseClient()
    .from("trackers")
    .upsert(payload, { onConflict: "user_id,provider" });

  ensureNoError(error, "Failed to connect tracker.");
}

async function disconnectTracker(provider, userId) {
  const payload = {
    user_id: userId,
    provider: String(provider || "").toLowerCase().trim(),
    connected: false,
    username: null,
    token: null,
    updated_at: Date.now(),
  };

  const { error } = await getSupabaseClient()
    .from("trackers")
    .upsert(payload, { onConflict: "user_id,provider" });

  ensureNoError(error, "Failed to disconnect tracker.");
}

// Notification functions
function mapNotificationRow(row) {
  if (!row) return null;
  return {
    animeId: row.anime_id,
    provider: row.provider,
    animeTitle: row.anime_title || null,
    animeCover: row.anime_cover || null,
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

async function isNotificationEnabled(userId, animeId, provider = "anilist") {
  const { data, error } = await getSupabaseClient()
    .from("notifications")
    .select("enabled")
    .eq("user_id", userId)
    .eq("anime_id", animeId)
    .eq("provider", provider)
    .limit(1)
    .maybeSingle();

  ensureNoError(error, "Failed to check notification status.");
  return Boolean(data?.enabled);
}

async function enableNotification(userId, animeId, provider = "anilist", animeTitle = null, animeCover = null) {
  const payload = {
    user_id: userId,
    anime_id: animeId,
    provider: provider,
    anime_title: animeTitle,
    anime_cover: animeCover,
    enabled: true,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  const { error } = await getSupabaseClient()
    .from("notifications")
    .upsert(payload, { onConflict: "user_id,anime_id,provider" });

  ensureNoError(error, "Failed to enable notification.");
}

async function disableNotification(userId, animeId, provider = "anilist") {
  const { error } = await getSupabaseClient()
    .from("notifications")
    .update({ enabled: false, updated_at: Date.now() })
    .eq("user_id", userId)
    .eq("anime_id", animeId)
    .eq("provider", provider);

  ensureNoError(error, "Failed to disable notification.");
}

async function listNotifications(userId) {
  const { data, error } = await getSupabaseClient()
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("updated_at", { ascending: false });

  ensureNoError(error, "Failed to load notifications.");
  return (data || []).map(mapNotificationRow);
}

// Authentication functions for username support
async function isUsernameAvailable(username) {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .rpc('is_username_available', { check_username: username });
  
  if (error) {
    console.error('Error checking username availability:', error);
    throw new Error('Failed to check username availability');
  }
  
  return data;
}

async function signUpWithProfile(email, password, username, displayName) {
  const client = getSupabaseClient();
  
  // First check if username is available
  const available = await isUsernameAvailable(username);
  if (!available) {
    throw new Error('Username is already taken');
  }
  
  // Create the user with metadata and auto-confirm email
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    user_metadata: {
      username,
      display_name: displayName
    },
    email_confirm: true // Auto-confirm email
  });
  
  if (error) {
    console.error('Error creating user:', error);
    throw new Error(error.message || 'Failed to create account');
  }
  
  return data;
}

async function signInWithUsernameOrEmail(identifier, password) {
  const client = getSupabaseClient();
  
  // First, find the user by username or email
  const { data: userData, error: userError } = await client
    .rpc('find_user_by_username_or_email', { identifier });
  
  if (userError || !userData || userData.length === 0) {
    throw new Error('Invalid username/email or password');
  }
  
  const user = userData[0];
  
  // Sign in with the email (Supabase requires email for sign in)
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password
  });
  
  if (error) {
    console.error('Error signing in:', error);
    throw new Error('Invalid username/email or password');
  }
  
  // Return both the auth data and the user profile info
  return {
    ...data,
    profile: {
      username: user.username,
      displayName: user.display_name
    }
  };
}

module.exports = {
  initDb,
  saveProgress,
  getContinueWatching,
  getAnimeHistory,
  getRecentHistory,
  getResume,
  deleteAnimeHistory,
  addFavorite,
  removeFavorite,
  isFavorite,
  listFavorites,
  getSettings,
  updateSettings,
  listTrackers,
  connectTracker,
  disconnectTracker,
  isNotificationEnabled,
  enableNotification,
  disableNotification,
  listNotifications,
  isUsernameAvailable,
  signUpWithProfile,
  signInWithUsernameOrEmail,
};
