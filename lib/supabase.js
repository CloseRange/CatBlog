const { createClient } = require("@supabase/supabase-js");

function getEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function hasSupabaseConfig() {
  const url = getEnv("SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  return Boolean(url && (anonKey || serviceRoleKey));
}

function createSupabaseClient(mode = "anon") {
  const url = getEnv("SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const key = mode === "service" ? serviceRoleKey || anonKey : anonKey || serviceRoleKey;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getSupabaseBucket() {
  return getEnv("SUPABASE_STORAGE_BUCKET") || "catblog-images";
}

function sanitizeStorageSegment(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getCatBucket(slug) {
  return getSupabaseBucket();
}

function getCatStoragePrefix(slug) {
  return sanitizeStorageSegment(slug);
}

function getSupabaseImageUrl(storagePath, bucketName) {
  const path = String(storagePath || "").replace(/^\/+/, "");
  const url = getEnv("SUPABASE_URL");

  if (!url || !path) {
    return "";
  }

  const bucket = encodeURIComponent(bucketName || getSupabaseBucket());
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${url}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

module.exports = {
  getCatBucket,
  getCatStoragePrefix,
  createSupabaseClient,
  getSupabaseBucket,
  getSupabaseImageUrl,
  hasSupabaseConfig,
};
