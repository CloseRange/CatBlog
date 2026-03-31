document.addEventListener("DOMContentLoaded", () => {
  const cards = document.querySelectorAll(".post-card");

  cards.forEach((card) => {
    card.addEventListener("mouseenter", () => {
      card.style.transform = "translateY(-4px)";
      card.style.transition = "transform 180ms ease";
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "translateY(0)";
    });
  });
});
