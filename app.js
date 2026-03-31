const express = require("express");
const path = require("path");
const posts = require("./data/posts");

const app = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

function createSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function withComputedFields(post) {
  return {
    ...post,
    slug: createSlug(post.title),
    shortBody:
      post.body.length > 210 ? `${post.body.slice(0, 210).trim()}...` : post.body,
  };
}

app.get("/", (req, res) => {
  const sortedPosts = [...posts]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(withComputedFields);

  res.render("index", {
    pageTitle: "Captain Whiskers Logbook",
    posts: sortedPosts,
  });
});

app.get("/about", (req, res) => {
  res.render("about", {
    pageTitle: "About The Cat",
  });
});

app.get("/post/:slug", (req, res, next) => {
  const post = posts
    .map(withComputedFields)
    .find((entry) => entry.slug === req.params.slug);

  if (!post) {
    return next();
  }

  return res.render("post", {
    pageTitle: post.title,
    post,
  });
});

app.use((req, res) => {
  res.status(404).render("404", {
    pageTitle: "Page Not Found",
  });
});

app.listen(port, () => {
  console.log(`CatBlog is purring at http://localhost:${port}`);
});
