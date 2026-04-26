const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const posts = require("./data/posts");
require("dotenv").config();

const {
  createSupabaseClient,
  getCatBucket,
  getSupabaseBucket,
  getSupabaseImageUrl,
  hasSupabaseConfig,
} = require("./lib/supabase");

const app = express();
const port = process.env.PORT || 3000;
const supabase = createSupabaseClient("service");
const supabaseAuth = createSupabaseClient("anon");
const upload = multer({ storage: multer.memoryStorage() });
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "michael.m.hulbert@gmail.com";
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_PROJECT_ID = String(process.env.OPENAI_PROJECT_ID || "").trim();
const OPENAI_ORG_ID = String(process.env.OPENAI_ORG_ID || "").trim();
const AI_ENABLED = Boolean(OPENAI_API_KEY);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-session-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);
app.use(
  express.static(path.join(__dirname, "public"), {
    redirect: false,
  })
);
app.use((req, res, next) => {
  res.locals.isAdmin = Boolean(req.session && req.session.isAdmin);
  res.locals.formatDisplayDate = formatDisplayDate;
  res.locals.siteName = "CatBlog";
  res.locals.siteBrand = "CatBlog";
  res.locals.siteBasePath = "";
  res.locals.blogNavLabel = "";
  res.locals.isJavaSite = false;
  res.locals.stylesheetPath = "/styles.css";
  next();
});

app.use((req, res, next) => {
  const isJavaPath = req.path === "/java" || req.path.startsWith("/java/");

  if (isJavaPath) {
    res.locals.siteName = "Java's Logbook";
    res.locals.siteBrand = "Java's Logbook";
    res.locals.siteBasePath = "/java";
    res.locals.blogNavLabel = "Java's Blog";
    res.locals.isJavaSite = true;
    res.locals.stylesheetPath = "/styles.css";
  }

  next();
});

function createSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function normalizeImage(image, fallbackAlt, fallbackBucket) {
  if (typeof image === "string") {
    return {
      src: image,
      alt: fallbackAlt,
      caption: "",
      storageBucket: fallbackBucket || getSupabaseBucket(),
      storagePath: "",
    };
  }

  const storagePath = image.storagePath || image.storage_path || "";
  const storageBucket =
    image.storageBucket ||
    image.storage_bucket ||
    fallbackBucket ||
    getSupabaseBucket();

  return {
    src: image.src || (storagePath ? getSupabaseImageUrl(storagePath, storageBucket) : ""),
    alt: image.alt || fallbackAlt,
    caption: image.caption || "",
    storageBucket,
    storagePath,
  };
}

function normalizePostRow(post) {
  const catName = (post.cat && post.cat.name) || "this cat";
  const fallbackBucket =
    (post.cat && post.cat.slug && getCatBucket(post.cat.slug)) || getSupabaseBucket();
  const fallbackAlt = `Photo of ${catName} for post: ${post.title}`;
  const rawImages = Array.isArray(post.post_images) ? post.post_images : [];
  const images = rawImages
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((image) => normalizeImage(image, fallbackAlt, fallbackBucket))
    .filter((image) => Boolean(image.src));
  const coverImageRow =
    rawImages.find((image) => image.is_cover) || rawImages[0] || null;
  const coverImage = coverImageRow
    ? normalizeImage(coverImageRow, fallbackAlt, fallbackBucket)
    : images[0] || null;

  return {
    ...post,
    images,
    coverImage,
  };
}

function withComputedFields(post) {
  const words = post.body.trim().split(/\s+/).length;
  const catName = (post.cat && post.cat.name) || "this cat";
  const fallbackBucket =
    (post.cat && post.cat.slug && getCatBucket(post.cat.slug)) || getSupabaseBucket();
  const fallbackAlt = `Photo of ${catName} for post: ${post.title}`;
  const images = Array.isArray(post.images)
    ? post.images
        .map((image) => normalizeImage(image, fallbackAlt, fallbackBucket))
        .filter((image) => Boolean(image.src))
    : [];
  const coverImage = post.coverImage
    ? normalizeImage(post.coverImage, fallbackAlt, fallbackBucket)
    : images[0] || null;

  return {
    ...post,
    slug: post.slug || createSlug(post.title),
    shortBody:
      post.body.length > 210 ? `${post.body.slice(0, 210).trim()}...` : post.body,
    readMinutes: Math.max(1, Math.ceil(words / 180)),
    images,
    coverImage,
  };
}

async function loadPosts(options = {}) {
  const requestedCatSlug = String(options.catSlug || "").trim().toLowerCase();

  if (!hasSupabaseConfig() || !supabase) {
    const inMemoryPosts = [...posts]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(withComputedFields);

    if (!requestedCatSlug) {
      return inMemoryPosts;
    }

    return inMemoryPosts.filter((post) => {
      const postCatSlug = String((post.cat && post.cat.slug) || "java").toLowerCase();
      return postCatSlug === requestedCatSlug;
    });
  }

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, title, slug, date, mood, body, cat:cats(id, name, slug), post_images(id, storage_bucket, storage_path, alt, caption, sort_order, is_cover)"
    )
    .order("date", { ascending: false });

  if (error) {
    throw error;
  }

  const normalized = (data || []).map(normalizePostRow).map(withComputedFields);
  if (!requestedCatSlug) {
    return normalized;
  }

  return normalized.filter((post) => {
    const postCatSlug = String((post.cat && post.cat.slug) || "").toLowerCase();
    return postCatSlug === requestedCatSlug;
  });
}

function buildGalleryItemsFromPosts(allPosts) {
  return allPosts.flatMap((post) =>
    (post.images || []).map((image, index) => ({
      ...image,
      postTitle: post.title,
      postSlug: post.slug,
      date: post.date,
      index,
    }))
  );
}

async function generatePostDraftFromPrompt(prompt) {
  if (!AI_ENABLED) {
    throw new Error("OpenAI is not configured. Add OPENAI_API_KEY in .env.");
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  };
  if (/^proj_[a-zA-Z0-9_-]+$/.test(OPENAI_PROJECT_ID)) {
    headers["OpenAI-Project"] = OPENAI_PROJECT_ID;
  }
  if (/^org_[a-zA-Z0-9_-]+$/.test(OPENAI_ORG_ID)) {
    headers["OpenAI-Organization"] = OPENAI_ORG_ID;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.8,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cat_blog_post_draft",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              mood: { type: "string" },
              body: { type: "string" },
            },
            required: ["title", "mood", "body"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You write playful first-person cat blog posts about a cat named Java. Return only valid JSON for title, mood, and body. Body should be 2-4 short paragraphs separated by newline characters.",
        },
        {
          role: "user",
          content: `Write a blog post draft based on: ${prompt}`,
        },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const apiMessage =
      (payload && payload.error && payload.error.message) ||
      "OpenAI request failed.";
    const errorCode = payload && payload.error && payload.error.code;
    const errorType = payload && payload.error && payload.error.type;

    if (
      response.status === 429 ||
      errorCode === "insufficient_quota" ||
      errorType === "insufficient_quota"
    ) {
      throw new Error(
        "OpenAI quota error. Verify billing is active for the same account as this API key, and try a newly created API key if needed."
      );
    }

    throw new Error(apiMessage);
  }

  const content =
    payload &&
    payload.choices &&
    payload.choices[0] &&
    payload.choices[0].message &&
    payload.choices[0].message.content;

  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error("OpenAI returned invalid JSON.");
  }

  return {
    title: String(parsed.title || "").trim(),
    mood: String(parsed.mood || "").trim(),
    body: String(parsed.body || "").trim(),
  };
}

function ensureSupabaseForAdmin(req, res, next) {
  if (!hasSupabaseConfig() || !supabase) {
    return res.status(500).render("admin-login", {
      pageTitle: "Admin Login",
      metaDescription: "Admin access for Java's Logbook.",
      currentPath: "/admin",
      error: "Supabase is not configured. Add environment variables first.",
    });
  }

  return next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }

  return res.redirect("/admin/login");
}

function formatDateForInput(value) {
  if (!value) {
    return "";
  }

  const asString = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) {
    return asString;
  }

  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function formatDisplayDate(value, options = {}) {
  if (!value) {
    return "";
  }

  let year;
  let month;
  let day;

  if (value instanceof Date) {
    year = value.getUTCFullYear();
    month = value.getUTCMonth() + 1;
    day = value.getUTCDate();
  } else {
    const dateString = String(value).slice(0, 10);
    const parts = dateString.split("-").map(Number);
    [year, month, day] = parts;
  }

  if (!year || !month || !day) {
    return String(value);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    month: options.month || "short",
    day: options.day || "numeric",
    year: options.year || "numeric",
    timeZone: "UTC",
  }).format(date);
}

function normalizeCoverFlags(images) {
  let coverFound = false;

  const normalized = images.map((image) => {
    if (image.is_cover && !coverFound) {
      coverFound = true;
      return image;
    }

    return {
      ...image,
      is_cover: false,
    };
  });

  if (!coverFound && normalized.length) {
    normalized[0].is_cover = true;
  }

  return normalized;
}

function parseImagesInput(rawInput) {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error("Images JSON is invalid. Please fix and submit again.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Images JSON must be an array.");
  }

  const mapped = parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Image row ${index + 1} must be an object.`);
    }

    const storagePath = String(
      entry.storage_path || entry.storagePath || ""
    )
      .trim()
      .replace(/^\/+/, "");

    if (!storagePath) {
      throw new Error(`Image row ${index + 1} is missing storage_path.`);
    }

    const sortOrderNumber = Number(entry.sort_order);
    const sortOrder = Number.isFinite(sortOrderNumber)
      ? sortOrderNumber
      : index;

    return {
      storage_path: storagePath,
      alt: entry.alt ? String(entry.alt).trim() : null,
      caption: entry.caption ? String(entry.caption).trim() : "",
      sort_order: sortOrder,
      is_cover:
        entry.is_cover === true ||
        String(entry.is_cover || "").toLowerCase() === "true",
    };
  });

  return normalizeCoverFlags(mapped);
}

function parseSingleGallerySelection(selectedPath) {
  const storagePath = normalizeFolderPath(selectedPath || "");
  if (!storagePath) {
    return [];
  }

  const fileName = path.basename(storagePath || "image");
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const generatedAlt = baseName
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    {
      storage_path: storagePath,
      alt: generatedAlt || null,
      caption: "",
      sort_order: 0,
      is_cover: true,
    },
  ];
}

function sanitizeFileName(fileName) {
  return String(fileName || "image")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeFolderPath(folderPath) {
  return String(folderPath || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function isImagePath(storagePath, mimetype) {
  const mime = String(mimetype || "").toLowerCase();
  if (mime.startsWith("image/")) {
    return true;
  }

  return /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(String(storagePath || ""));
}

const STORAGE_ALLOWED_MIME_TYPES = [
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
];

function getBucketForCat(cat) {
  const slug = String((cat && cat.slug) || "").trim();
  return getCatBucket(slug);
}

async function ensureCatBucketExists(cat) {
  const bucket = getBucketForCat(cat);
  const { data: existingBucket, error: getBucketError } = await supabase.storage
    .getBucket(bucket);

  if (getBucketError) {
    const message = String(getBucketError.message || "");
    const notFound = /not found|does not exist|no rows/i.test(message);

    if (!notFound) {
      throw new Error(getBucketError.message);
    }

    const { error: createError } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 10485760,
      allowedMimeTypes: STORAGE_ALLOWED_MIME_TYPES,
    });

    if (createError) {
      throw new Error(createError.message);
    }

    return bucket;
  }

  if (existingBucket) {
    const { error: updateError } = await supabase.storage.updateBucket(bucket, {
      public: true,
      fileSizeLimit: 10485760,
      allowedMimeTypes: STORAGE_ALLOWED_MIME_TYPES,
    });

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return bucket;
}

async function listBucketImages(bucket) {
  const targetBucket = String(bucket || "").trim() || getSupabaseBucket();
  const foldersToVisit = [""];
  const files = [];

  while (foldersToVisit.length) {
    const folder = foldersToVisit.shift();
    let offset = 0;
    const limit = 100;

    while (true) {
      const { data, error } = await supabase.storage
        .from(targetBucket)
        .list(folder, {
          limit,
          offset,
          sortBy: { column: "name", order: "asc" },
        });

      if (error) {
        throw new Error(error.message);
      }

      const entries = Array.isArray(data) ? data : [];
      entries.forEach((entry) => {
        const entryName = String(entry.name || "");
        if (!entryName) {
          return;
        }

        const fullPath = folder ? `${folder}/${entryName}` : entryName;
        const isFolder = !entry.id && !entry.metadata;

        if (isFolder) {
          foldersToVisit.push(fullPath);
          return;
        }

        if (isImagePath(fullPath, entry.metadata && entry.metadata.mimetype)) {
          files.push({
            storagePath: fullPath,
            name: entryName,
            updatedAt: entry.updated_at,
            size: entry.metadata && entry.metadata.size,
            mimeType: entry.metadata && entry.metadata.mimetype,
            publicUrl: getSupabaseImageUrl(fullPath, targetBucket),
          });
        }
      });

      if (entries.length < limit) {
        break;
      }

      offset += limit;
    }
  }

  files.sort((a, b) => a.storagePath.localeCompare(b.storagePath));
  return files;
}

async function getNextImageSortOrder(postId) {
  const { data, error } = await supabase
    .from("post_images")
    .select("sort_order")
    .eq("post_id", postId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  if (!data || !data.length) {
    return 0;
  }

  return Number(data[0].sort_order || 0) + 1;
}

async function postHasCoverImage(postId) {
  const { data, error } = await supabase
    .from("post_images")
    .select("id")
    .eq("post_id", postId)
    .eq("is_cover", true)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data && data.length);
}

function serializeImagesInput(images) {
  const value = (Array.isArray(images) ? images : [])
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((image, index) => ({
      storage_bucket: image.storage_bucket || image.storageBucket || "",
      storage_path: image.storage_path,
      alt: image.alt || "",
      caption: image.caption || "",
      sort_order:
        typeof image.sort_order === "number" ? image.sort_order : index,
      is_cover: Boolean(image.is_cover),
    }));

  return JSON.stringify(value, null, 2);
}

async function fetchAdminCats() {
  const { data, error } = await supabase
    .from("cats")
    .select("id, name, slug, description, created_at")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const cats = data || [];
  if (!cats.length) {
    return [];
  }

  const { data: postCounts, error: countError } = await supabase
    .from("posts")
    .select("cat_id")
    .not("cat_id", "is", null);

  if (countError) {
    throw new Error(countError.message);
  }

  const countsByCatId = (postCounts || []).reduce((acc, row) => {
    const key = String(row.cat_id || "");
    if (!key) {
      return acc;
    }
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return cats.map((cat) => ({
    ...cat,
    postCount: countsByCatId[cat.id] || 0,
  }));
}

async function fetchAdminCatById(catId) {
  const normalizedId = String(catId || "").trim();
  if (!normalizedId) {
    return null;
  }

  const { data, error } = await supabase
    .from("cats")
    .select("id, name, slug, description")
    .eq("id", normalizedId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

async function fetchAdminPosts(catId) {
  const normalizedCatId = String(catId || "").trim();
  let query = supabase
    .from("posts")
    .select("id, title, slug, mood, date, updated_at, cat_id")
    .order("date", { ascending: false });

  if (normalizedCatId) {
    query = query.eq("cat_id", normalizedCatId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function fetchAdminPostById(postId) {
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, title, slug, date, mood, body, cat_id, post_images(id, storage_bucket, storage_path, alt, caption, sort_order, is_cover)"
    )
    .eq("id", postId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function fetchPostCatByPostId(postId) {
  const { data, error } = await supabase
    .from("posts")
    .select("id, cat:cats(id, name, slug)")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || !data.cat) {
    return null;
  }

  return data.cat;
}

async function saveAdminPost(formData) {
  const title = String(formData.title || "").trim();
  const mood = String(formData.mood || "").trim();
  const body = String(formData.body || "").trim();
  const date = String(formData.date || "").trim();
  const slug = String(formData.slug || "").trim() || createSlug(title);
  const postId = String(formData.postId || "").trim();
  const catId = String(formData.catId || "").trim();

  if (!title || !mood || !body || !date || !catId) {
    throw new Error("Title, mood, date, and body are required.");
  }

  const selectedCat = await fetchAdminCatById(catId);
  if (!selectedCat) {
    throw new Error("Selected cat was not found.");
  }

  const bucket = await ensureCatBucketExists(selectedCat);

  const images = formData.selectedPath
    ? parseSingleGallerySelection(formData.selectedPath)
    : parseImagesInput(formData.imagesJson);

  let savedPostId = postId;
  if (savedPostId) {
    const { data, error } = await supabase
      .from("posts")
      .update({ title, slug, mood, date, body, cat_id: catId })
      .eq("id", savedPostId)
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    savedPostId = data.id;
  } else {
    const { data, error } = await supabase
      .from("posts")
      .insert({ title, slug, mood, date, body, cat_id: catId })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    savedPostId = data.id;
  }

  const { error: deleteError } = await supabase
    .from("post_images")
    .delete()
    .eq("post_id", savedPostId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (images.length) {
    const rows = images.map((image) => ({
      post_id: savedPostId,
      storage_bucket: bucket,
      storage_path: image.storage_path,
      alt: image.alt,
      caption: image.caption,
      sort_order: image.sort_order,
      is_cover: image.is_cover,
    }));

    const { error: imageInsertError } = await supabase
      .from("post_images")
      .insert(rows);

    if (imageInsertError) {
      throw new Error(imageInsertError.message);
    }
  }

  return savedPostId;
}

app.get("/", (req, res) => {
  const availableBlogs = [
    {
      key: "java",
      name: "Java",
      title: "Java's Logbook",
      description:
        "A memorial archive of Java's stories and photos, powered by Supabase content.",
      href: "/java",
      isLive: true,
    },
    {
      key: "coming-soon",
      name: "Next Cat",
      title: "Future Cat Blog",
      description:
        "Reserved for the next cat's adventures. Keep this card as your template for adding more cats.",
      href: "",
      isLive: false,
    },
  ];

  return res.render("main-index", {
    pageTitle: "Choose A Blog",
    metaDescription:
      "Choose which cat blog to visit. Java's memorial blog is available now, and more cats can be added later.",
    currentPath: "/",
    availableBlogs,
    siteName: "CatBlog Directory",
    siteBrand: "CatBlog Directory",
    siteBasePath: "",
    isJavaSite: false,
    stylesheetPath: "/styles.css",
  });
});

app.get("/about", (req, res) => {
  res.render("main-about", {
    pageTitle: "About",
    metaDescription:
      "About the CatBlog directory and how each cat blog is organized.",
    currentPath: "/about",
    siteName: "CatBlog Directory",
    siteBrand: "CatBlog Directory",
    siteBasePath: "",
    isJavaSite: false,
    stylesheetPath: "/styles.css",
  });
});

app.get("/gallery", async (req, res, next) => {
  try {
    const allPosts = await loadPosts();
    const galleryItems = buildGalleryItemsFromPosts(allPosts);

    return res.render("main-gallery", {
      pageTitle: "Gallery",
      metaDescription:
        "All currently published photos across CatBlog blogs.",
      currentPath: "/gallery",
      galleryItems,
      siteName: "CatBlog Directory",
      siteBrand: "CatBlog Directory",
      siteBasePath: "",
      isJavaSite: false,
      stylesheetPath: "/styles.css",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/java", async (req, res, next) => {
  try {
    const allPosts = await loadPosts({ catSlug: "java" });
    const [featuredPost, ...latestPosts] = allPosts;

    return res.render("index", {
      pageTitle: "Java's Logbook",
      metaDescription:
        "A memorial archive of Java's stories and photos, preserved with love.",
      currentPath: "/",
      featuredPost,
      posts: latestPosts,
      siteName: "Java's Logbook",
      siteBrand: "Java's Logbook",
      siteBasePath: "/java",
      isJavaSite: true,
      stylesheetPath: "/styles.css",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/java/about", (req, res) => {
  res.render("about", {
    pageTitle: "About Java",
    metaDescription: "About Java and the memorial archive.",
    currentPath: "/about",
    siteName: "Java's Logbook",
    siteBrand: "Java's Logbook",
    siteBasePath: "/java",
    isJavaSite: true,
    stylesheetPath: "/styles.css",
  });
});

app.get("/java/gallery", async (req, res, next) => {
  try {
    const allPosts = await loadPosts({ catSlug: "java" });

    return res.render("gallery", {
      pageTitle: "Java's Photo Gallery",
      metaDescription: "A memorial gallery of Java's photos.",
      currentPath: "/gallery",
      galleryItems: buildGalleryItemsFromPosts(allPosts),
      siteName: "Java's Logbook",
      siteBrand: "Java's Logbook",
      siteBasePath: "/java",
      isJavaSite: true,
      stylesheetPath: "/styles.css",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/post/:slug", async (req, res, next) => {
  try {
    const allPosts = await loadPosts();
    const post = allPosts.find((entry) => entry.slug === req.params.slug);

    if (!post) {
      return next();
    }

    return res.render("main-post", {
      pageTitle: post.title,
      metaDescription: post.shortBody,
      currentPath: "",
      post,
      siteName: "CatBlog",
      siteBrand: "CatBlog",
      siteBasePath: "",
      isJavaSite: false,
      stylesheetPath: "/styles.css",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/java/post/:slug", async (req, res, next) => {
  try {
    const postsToSearch = await loadPosts();
    const post = postsToSearch.find((entry) => entry.slug === req.params.slug);

    if (!post) {
      return next();
    }

    return res.render("post", {
      pageTitle: post.title,
      metaDescription: post.shortBody,
      currentPath: "",
      post,
      siteName: "Java's Logbook",
      siteBrand: "Java's Logbook",
      siteBasePath: "/java",
      isJavaSite: true,
      stylesheetPath: "/styles.css",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/admin/login", ensureSupabaseForAdmin, (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect("/admin");
  }

  return res.render("admin-login", {
    pageTitle: "Admin Login",
    metaDescription: "Admin access for Java's Logbook.",
    currentPath: "/admin",
    error: "",
  });
});

app.post("/admin/login", ensureSupabaseForAdmin, async (req, res) => {
  const password = String(req.body.password || "");

  if (!password) {
    return res.status(400).render("admin-login", {
      pageTitle: "Admin Login",
      metaDescription: "Admin access for Java's Logbook.",
      currentPath: "/admin",
      error: "Password is required.",
    });
  }

  const client = supabaseAuth || supabase;
  if (!client) {
    return res.status(500).render("admin-login", {
      pageTitle: "Admin Login",
      metaDescription: "Admin access for Java's Logbook.",
      currentPath: "/admin",
      error: "Supabase client is not available.",
    });
  }

  const { error } = await client.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password,
  });

  if (error) {
    return res.status(401).render("admin-login", {
      pageTitle: "Admin Login",
      metaDescription: "Admin access for Java's Logbook.",
      currentPath: "/admin",
      error: "Login failed. Check your password.",
    });
  }

  req.session.isAdmin = true;
  req.session.adminEmail = ADMIN_EMAIL;
  return req.session.save(() => {
    res.redirect("/admin");
  });
});

app.post("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

app.post(
  "/admin/generate",
  ensureSupabaseForAdmin,
  requireAdmin,
  async (req, res) => {
    const mode = req.body.postId ? "edit" : "create";
    const catId = String(req.body.catId || "").trim();
    const selectedCat = await fetchAdminCatById(catId);

    if (!selectedCat) {
      return res.redirect("/admin");
    }

    const aiPrompt = String(req.body.aiPrompt || "").trim();
    const selectedPath = String(req.body.selectedPath || "");
    const selectedBucket = await ensureCatBucketExists(selectedCat);
    const galleryImages = await listBucketImages(selectedBucket).catch(() => []);
    const selectedImagesByPath = parseSingleGallerySelection(selectedPath).reduce(
      (acc, image) => {
        acc[image.storage_path] = {
          alt: image.alt || "",
          caption: image.caption || "",
          sort_order: image.sort_order || 0,
          is_cover: Boolean(image.is_cover),
        };
        return acc;
      },
      {}
    );

    if (!AI_ENABLED) {
      return res.status(400).render("admin-form", {
        pageTitle: mode === "edit" ? "Edit Post" : "Create Post",
        metaDescription: "Manage blog content.",
        currentPath: "/admin",
        error: "OpenAI is not configured. Add OPENAI_API_KEY in .env.",
        mode,
        selectedCat,
        selectedBucket,
        catId: selectedCat.id,
        galleryImages,
        selectedImagesByPath,
        selectedPath,
        aiEnabled: AI_ENABLED,
        aiPrompt,
        aiGenerated: false,
        formData: {
          catId: selectedCat.id,
          postId: String(req.body.postId || ""),
          title: String(req.body.title || ""),
          slug: String(req.body.slug || ""),
          date: String(req.body.date || ""),
          mood: String(req.body.mood || ""),
          body: String(req.body.body || ""),
          imagesJson: String(req.body.imagesJson || "[]"),
        },
        saved: false,
        uploaded: false,
        uploadError: "",
      });
    }

    if (!aiPrompt) {
      return res.status(400).render("admin-form", {
        pageTitle: mode === "edit" ? "Edit Post" : "Create Post",
        metaDescription: "Manage blog content.",
        currentPath: "/admin",
        error: "Add a prompt for AI generation.",
        mode,
        selectedCat,
        selectedBucket,
        catId: selectedCat.id,
        galleryImages,
        selectedImagesByPath,
        selectedPath,
        aiEnabled: AI_ENABLED,
        aiPrompt,
        aiGenerated: false,
        formData: {
          catId: selectedCat.id,
          postId: String(req.body.postId || ""),
          title: String(req.body.title || ""),
          slug: String(req.body.slug || ""),
          date: String(req.body.date || ""),
          mood: String(req.body.mood || ""),
          body: String(req.body.body || ""),
          imagesJson: String(req.body.imagesJson || "[]"),
        },
        saved: false,
        uploaded: false,
        uploadError: "",
      });
    }

    try {
      const draft = await generatePostDraftFromPrompt(aiPrompt);

      return res.render("admin-form", {
        pageTitle: mode === "edit" ? "Edit Post" : "Create Post",
        metaDescription: "Manage blog content.",
        currentPath: "/admin",
        error: "",
        mode,
        selectedCat,
        selectedBucket,
        catId: selectedCat.id,
        galleryImages,
        selectedImagesByPath,
        selectedPath,
        aiEnabled: AI_ENABLED,
        aiPrompt,
        aiGenerated: true,
        formData: {
          catId: selectedCat.id,
          postId: String(req.body.postId || ""),
          title: draft.title || String(req.body.title || ""),
          slug: String(req.body.slug || ""),
          date:
            String(req.body.date || "") ||
            new Date().toISOString().slice(0, 10),
          mood: draft.mood || String(req.body.mood || ""),
          body: draft.body || String(req.body.body || ""),
          imagesJson: String(req.body.imagesJson || "[]"),
        },
        saved: false,
        uploaded: false,
        uploadError: "",
      });
    } catch (error) {
      return res.status(400).render("admin-form", {
        pageTitle: mode === "edit" ? "Edit Post" : "Create Post",
        metaDescription: "Manage blog content.",
        currentPath: "/admin",
        error: `AI generation failed: ${error.message}`,
        mode,
        selectedCat,
        selectedBucket,
        catId: selectedCat.id,
        galleryImages,
        selectedImagesByPath,
        selectedPath,
        aiEnabled: AI_ENABLED,
        aiPrompt,
        aiGenerated: false,
        formData: {
          catId: selectedCat.id,
          postId: String(req.body.postId || ""),
          title: String(req.body.title || ""),
          slug: String(req.body.slug || ""),
          date: String(req.body.date || ""),
          mood: String(req.body.mood || ""),
          body: String(req.body.body || ""),
          imagesJson: String(req.body.imagesJson || "[]"),
        },
        saved: false,
        uploaded: false,
        uploadError: "",
      });
    }
  }
);

app.post(
  "/admin/upload/:id",
  ensureSupabaseForAdmin,
  requireAdmin,
  upload.single("imageFile"),
  async (req, res) => {
    try {
      const postId = String(req.params.id || "").trim();
      if (!postId) {
        return res.status(400).redirect("/admin");
      }

      if (!req.file) {
        return res.redirect(`/admin/edit/${postId}?uploadError=Please+choose+a+file`);
      }

      if (!String(req.file.mimetype || "").startsWith("image/")) {
        return res.redirect(`/admin/edit/${postId}?uploadError=Only+image+files+are+allowed`);
      }

      const ext = path.extname(req.file.originalname || "") || "";
      const baseName = sanitizeFileName(path.basename(req.file.originalname || "image", ext));
      const timestamp = Date.now();
      const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, "") || ".bin";
      const postCat = await fetchPostCatByPostId(postId);
      if (!postCat) {
        return res.redirect(`/admin/edit/${postId}?uploadError=Post+cat+not+found`);
      }

      const folder = normalizeFolderPath(postCat.slug || "images");
      const storagePath = folder
        ? `${folder}/${timestamp}-${baseName || "image"}${safeExt}`
        : `${timestamp}-${baseName || "image"}${safeExt}`;
      const bucket = await ensureCatBucketExists(postCat);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const sortOrder = await getNextImageSortOrder(postId);
      const hasCover = await postHasCoverImage(postId);
      const isCover = req.body.makeCover === "on" || !hasCover;

      const { error: imageInsertError } = await supabase.from("post_images").insert({
        post_id: postId,
        storage_bucket: bucket,
        storage_path: storagePath,
        alt: String(req.body.alt || "").trim() || null,
        caption: String(req.body.caption || "").trim() || "",
        sort_order: sortOrder,
        is_cover: isCover,
      });

      if (imageInsertError) {
        throw new Error(imageInsertError.message);
      }

      if (isCover) {
        const { error: clearOldCoverError } = await supabase
          .from("post_images")
          .update({ is_cover: false })
          .eq("post_id", postId)
          .neq("storage_path", storagePath)
          .eq("is_cover", true);

        if (clearOldCoverError) {
          throw new Error(clearOldCoverError.message);
        }
      }

      return res.redirect(`/admin/edit/${postId}?uploaded=1`);
    } catch (error) {
      return res.redirect(
        `/admin/edit/${req.params.id}?uploadError=${encodeURIComponent(error.message)}`
      );
    }
  }
);

app.get(
  "/admin/gallery",
  ensureSupabaseForAdmin,
  requireAdmin,
  async (req, res, next) => {
    try {
      const cats = await fetchAdminCats();
      const requestedCatId = String(req.query.catId || "").trim();
      const selectedCat = requestedCatId
        ? await fetchAdminCatById(requestedCatId)
        : null;

      if (requestedCatId && !selectedCat) {
        return res.redirect("/admin/gallery");
      }

      const selectedBucket = selectedCat
        ? await ensureCatBucketExists(selectedCat)
        : "";
      const images = selectedBucket ? await listBucketImages(selectedBucket) : [];

      res.render("admin-gallery", {
        pageTitle: "Admin Gallery",
        metaDescription: "Manage images in Supabase storage.",
        currentPath: "/admin",
        cats,
        selectedCat,
        selectedBucket,
        images,
        uploaded: req.query.uploaded === "1",
        deleted: req.query.deleted === "1",
        renamed: req.query.renamed === "1",
        error: String(req.query.error || ""),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/admin/gallery/upload",
  ensureSupabaseForAdmin,
  requireAdmin,
  upload.single("imageFile"),
  async (req, res) => {
    try {
      const catId = String(req.body.catId || "").trim();
      const selectedCat = await fetchAdminCatById(catId);
      if (!selectedCat) {
        return res.redirect("/admin/gallery?error=Select+a+cat+first");
      }

      if (!req.file) {
        return res.redirect(`/admin/gallery?catId=${encodeURIComponent(catId)}&error=Please+choose+an+image+file`);
      }

      if (!String(req.file.mimetype || "").startsWith("image/")) {
        return res.redirect(`/admin/gallery?catId=${encodeURIComponent(catId)}&error=Only+image+files+are+allowed`);
      }

      const bucket = await ensureCatBucketExists(selectedCat);
      const folder = normalizeFolderPath(req.body.folder || selectedCat.slug || "images");
      const ext = path.extname(req.file.originalname || "") || "";
      const baseName = sanitizeFileName(
        path.basename(req.file.originalname || "image", ext)
      );
      const timestamp = Date.now();
      const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, "") || ".bin";
      const fileName = `${timestamp}-${baseName || "image"}${safeExt}`;
      const storagePath = folder ? `${folder}/${fileName}` : fileName;

      const { error } = await supabase.storage
        .from(bucket)
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (error) {
        throw new Error(error.message);
      }

      return res.redirect(`/admin/gallery?catId=${encodeURIComponent(catId)}&uploaded=1`);
    } catch (error) {
      const catId = String(req.body.catId || "").trim();
      const catQuery = catId ? `catId=${encodeURIComponent(catId)}&` : "";
      return res.redirect(`/admin/gallery?${catQuery}error=${encodeURIComponent(error.message)}`);
    }
  }
);

app.post(
  "/admin/gallery/delete",
  ensureSupabaseForAdmin,
  requireAdmin,
  async (req, res) => {
    try {
      const catId = String(req.body.catId || "").trim();
      const selectedCat = await fetchAdminCatById(catId);
      if (!selectedCat) {
        return res.redirect("/admin/gallery?error=Select+a+cat+first");
      }

      const storagePath = normalizeFolderPath(req.body.storagePath || "");
      if (!storagePath) {
        return res.redirect(`/admin/gallery?catId=${encodeURIComponent(catId)}&error=Image+path+is+required`);
      }

      const bucket = await ensureCatBucketExists(selectedCat);
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove([storagePath]);

      if (storageError) {
        throw new Error(storageError.message);
      }

      const { error: relationError } = await supabase
        .from("post_images")
        .delete()
        .eq("storage_bucket", bucket)
        .eq("storage_path", storagePath);

      if (relationError) {
        throw new Error(relationError.message);
      }

      return res.redirect(`/admin/gallery?catId=${encodeURIComponent(catId)}&deleted=1`);
    } catch (error) {
      const catId = String(req.body.catId || "").trim();
      const catQuery = catId ? `catId=${encodeURIComponent(catId)}&` : "";
      return res.redirect(`/admin/gallery?${catQuery}error=${encodeURIComponent(error.message)}`);
    }
  }
);

app.post(
  "/admin/gallery/rename",
  ensureSupabaseForAdmin,
  requireAdmin,
  async (req, res) => {
    try {
      const catId = String(req.body.catId || "").trim();
      const selectedCat = await fetchAdminCatById(catId);
      if (!selectedCat) {
        return res.redirect("/admin/gallery?error=Select+a+cat+first");
      }

      const oldPath = normalizeFolderPath(req.body.oldPath || "");
      let newPath = normalizeFolderPath(req.body.newPath || "");

      if (!oldPath || !newPath) {
        return res.redirect(`/admin/gallery?catId=${encodeURIComponent(catId)}&error=Both+old+and+new+paths+are+required`);
      }

      const oldExt = path.extname(oldPath || "");
      const newExt = path.extname(newPath || "");
      if (oldExt && !newExt) {
        newPath = `${newPath}${oldExt}`;
      }

      if (oldPath === newPath) {
        return res.redirect(`/admin/gallery?catId=${encodeURIComponent(catId)}&error=New+path+must+be+different`);
      }

      const bucket = await ensureCatBucketExists(selectedCat);
      const { error: moveError } = await supabase.storage
        .from(bucket)
        .move(oldPath, newPath);

      if (moveError) {
        throw new Error(moveError.message);
      }

      const { error: updateError } = await supabase
        .from("post_images")
        .update({ storage_path: newPath })
        .eq("storage_bucket", bucket)
        .eq("storage_path", oldPath);

      if (updateError) {
        throw new Error(updateError.message);
      }

      return res.redirect(`/admin/gallery?catId=${encodeURIComponent(catId)}&renamed=1`);
    } catch (error) {
      const catId = String(req.body.catId || "").trim();
      const catQuery = catId ? `catId=${encodeURIComponent(catId)}&` : "";
      return res.redirect(`/admin/gallery?${catQuery}error=${encodeURIComponent(error.message)}`);
    }
  }
);

app.get("/admin", ensureSupabaseForAdmin, requireAdmin, async (req, res, next) => {
  try {
    const cats = await fetchAdminCats();
    const requestedCatId = String(req.query.catId || "").trim();
    const selectedCat = requestedCatId
      ? await fetchAdminCatById(requestedCatId)
      : null;

    if (requestedCatId && !selectedCat) {
      return res.redirect("/admin");
    }

    const adminPosts = selectedCat ? await fetchAdminPosts(selectedCat.id) : [];

    res.render("admin-dashboard", {
      pageTitle: "Admin",
      metaDescription: "Manage blog posts.",
      currentPath: "/admin",
      saved: req.query.saved === "1",
      newCatRequested: req.query.newCat === "1",
      selectedCat,
      cats,
      posts: adminPosts,
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/admin/new",
  ensureSupabaseForAdmin,
  requireAdmin,
  async (req, res, next) => {
    try {
      const selectedCat = await fetchAdminCatById(req.query.catId);
      if (!selectedCat) {
        return res.redirect("/admin");
      }

      const selectedBucket = await ensureCatBucketExists(selectedCat);
      const galleryImages = await listBucketImages(selectedBucket);

      res.render("admin-form", {
        pageTitle: "New Post",
        metaDescription: "Create a new blog post.",
        currentPath: "/admin",
        error: "",
        mode: "create",
        selectedCat,
        selectedBucket,
        catId: selectedCat.id,
        galleryImages,
        selectedImagesByPath: {},
        selectedPath: "",
        aiEnabled: AI_ENABLED,
        aiPrompt: "",
        aiGenerated: false,
        formData: {
          catId: selectedCat.id,
          postId: "",
          title: "",
          slug: "",
          date: "",
          mood: "",
          body: "",
          imagesJson: "[]",
        },
        saved: false,
        uploaded: false,
        uploadError: "",
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/admin/edit/:id",
  ensureSupabaseForAdmin,
  requireAdmin,
  async (req, res, next) => {
    try {
      const post = await fetchAdminPostById(req.params.id);
      const selectedCat = await fetchAdminCatById(post.cat_id);
      if (!selectedCat) {
        return res.redirect("/admin");
      }

      const selectedBucket = await ensureCatBucketExists(selectedCat);
      const galleryImages = await listBucketImages(selectedBucket);
      const selectedImagesByPath = (post.post_images || []).reduce((acc, image) => {
        acc[image.storage_path] = {
          alt: image.alt || "",
          caption: image.caption || "",
          sort_order: image.sort_order || 0,
          is_cover: Boolean(image.is_cover),
        };
        return acc;
      }, {});
      const selectedCover = (post.post_images || []).find((image) => image.is_cover);
      const selectedPath = selectedCover
        ? selectedCover.storage_path
        : (post.post_images && post.post_images[0] && post.post_images[0].storage_path) || "";

      res.render("admin-form", {
        pageTitle: "Edit Post",
        metaDescription: "Edit an existing blog post.",
        currentPath: "/admin",
        error: "",
        mode: "edit",
        selectedCat,
        selectedBucket,
        catId: selectedCat.id,
        galleryImages,
        selectedImagesByPath,
        selectedPath,
        aiEnabled: AI_ENABLED,
        aiPrompt: "",
        aiGenerated: false,
        formData: {
          catId: selectedCat.id,
          postId: post.id,
          title: post.title,
          slug: post.slug,
          date: formatDateForInput(post.date),
          mood: post.mood,
          body: post.body,
          imagesJson: serializeImagesInput(post.post_images),
        },
        saved: req.query.saved === "1",
        uploaded: req.query.uploaded === "1",
        uploadError: String(req.query.uploadError || ""),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/admin/save",
  ensureSupabaseForAdmin,
  requireAdmin,
  async (req, res) => {
    const catId = String(req.body.catId || "").trim();

    try {
      const savedPostId = await saveAdminPost(req.body);
      return res.redirect(
        `/admin/edit/${savedPostId}?saved=1&catId=${encodeURIComponent(catId)}`
      );
    } catch (error) {
      const selectedCat = await fetchAdminCatById(catId);
      const selectedBucket = selectedCat
        ? await ensureCatBucketExists(selectedCat).catch(() => "")
        : "";
      const galleryImages = await listBucketImages(selectedBucket).catch(() => []);
      const selectedImagesByPath = parseSingleGallerySelection(
        req.body.selectedPath
      ).reduce((acc, image) => {
        acc[image.storage_path] = {
          alt: image.alt || "",
          caption: image.caption || "",
          sort_order: image.sort_order || 0,
          is_cover: Boolean(image.is_cover),
        };
        return acc;
      }, {});

      return res.status(400).render("admin-form", {
        pageTitle: req.body.postId ? "Edit Post" : "New Post",
        metaDescription: "Manage blog content.",
        currentPath: "/admin",
        error: error.message,
        mode: req.body.postId ? "edit" : "create",
        selectedCat,
        selectedBucket,
        catId,
        galleryImages,
        selectedImagesByPath,
        selectedPath: String(req.body.selectedPath || ""),
        aiEnabled: AI_ENABLED,
        aiPrompt: String(req.body.aiPrompt || ""),
        aiGenerated: false,
        formData: {
          catId,
          postId: String(req.body.postId || ""),
          title: String(req.body.title || ""),
          slug: String(req.body.slug || ""),
          date: String(req.body.date || ""),
          mood: String(req.body.mood || ""),
          body: String(req.body.body || ""),
          imagesJson: String(req.body.imagesJson || "[]"),
        },
        saved: false,
        uploaded: false,
        uploadError: "",
      });
    }
  }
);

app.use((req, res) => {
  res.status(404).render("404", {
    pageTitle: "Page Not Found",
    metaDescription: "The page you requested could not be found.",
    currentPath: "",
  });
});

app.listen(port, () => {
  console.log(`Java's Logbook is purring at http://localhost:${port}`);
});
