const fs = require("fs");
const path = require("path");

const postsPath = path.join(__dirname, "..", "public", "java", "java_posts.json");
const imagesPath = path.join(
  __dirname,
  "..",
  "public",
  "java",
  "java_post_images.json"
);

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const trimmed = raw.trim();

  if (!trimmed) {
    return [];
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function computePostFields(post, imagesByPostId) {
  const body = String(post.body || "").replace(/\r\n/g, "\n");
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const images = (imagesByPostId.get(post.id) || [])
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((image) => ({
      src: `/images/${image.storage_path}`,
      alt: image.alt || `Photo of Java for post: ${post.title}`,
      caption: image.caption || "",
    }));

  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    date: post.date,
    mood: post.mood,
    body,
    shortBody: body.length > 210 ? `${body.slice(0, 210).trim()}...` : body,
    readMinutes: Math.max(1, Math.ceil(words / 180)),
    images,
    coverImage: images[0] || null,
  };
}

function loadJavaSiteData() {
  const posts = readJson(postsPath);
  const postImages = readJson(imagesPath);

  const imagesByPostId = new Map();
  postImages.forEach((image) => {
    const list = imagesByPostId.get(image.post_id) || [];
    list.push(image);
    imagesByPostId.set(image.post_id, list);
  });

  const computedPosts = posts
    .map((post) => computePostFields(post, imagesByPostId))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    posts: computedPosts,
    galleryItems: computedPosts.flatMap((post) =>
      post.images.map((image, index) => ({
        ...image,
        postTitle: post.title,
        postSlug: post.slug,
        date: post.date,
        index,
      }))
    ),
  };
}

module.exports = {
  loadJavaSiteData,
};
