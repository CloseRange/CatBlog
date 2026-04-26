document.addEventListener("DOMContentLoaded", () => {
  const cards = document.querySelectorAll(".post-card");

  cards.forEach((card) => {
    card.addEventListener("mouseenter", () => {
      card.classList.add("is-hovered");
    });

    card.addEventListener("mouseleave", () => {
      card.classList.remove("is-hovered");
    });

    card.addEventListener("focusin", () => {
      card.classList.add("is-hovered");
    });

    card.addEventListener("focusout", () => {
      card.classList.remove("is-hovered");
    });
  });
});
