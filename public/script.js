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

  const canUsePawCursor =
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!canUsePawCursor) {
    return;
  }

  const paw = document.createElement("div");
  paw.className = "paw-cursor";
  paw.setAttribute("aria-hidden", "true");
  document.body.appendChild(paw);
  document.body.classList.add("paw-cursor-enabled");
  document.documentElement.classList.add("paw-cursor-enabled");

  let targetX = -100;
  let targetY = -100;
  let currentX = -100;
  let currentY = -100;
  let visible = false;
  const followStrength = 0.55;

  function animatePaw() {
    currentX += (targetX - currentX) * followStrength;
    currentY += (targetY - currentY) * followStrength;

    if (Math.abs(targetX - currentX) < 0.35) {
      currentX = targetX;
    }
    if (Math.abs(targetY - currentY) < 0.35) {
      currentY = targetY;
    }

    paw.style.setProperty("--paw-x", `${currentX - 13}px`);
    paw.style.setProperty("--paw-y", `${currentY - 13}px`);
    requestAnimationFrame(animatePaw);
  }

  requestAnimationFrame(animatePaw);

  document.addEventListener("mousemove", (event) => {
    targetX = event.clientX;
    targetY = event.clientY;
    if (!visible) {
      currentX = targetX;
      currentY = targetY;
      paw.style.setProperty("--paw-x", `${currentX - 13}px`);
      paw.style.setProperty("--paw-y", `${currentY - 13}px`);
      paw.style.opacity = "1";
      visible = true;
    }
  });

  document.addEventListener("mouseleave", () => {
    paw.style.opacity = "0";
    visible = false;
  });

  window.addEventListener("mouseenter", (event) => {
    targetX = event.clientX;
    targetY = event.clientY;
    currentX = targetX;
    currentY = targetY;
    paw.style.setProperty("--paw-x", `${currentX - 13}px`);
    paw.style.setProperty("--paw-y", `${currentY - 13}px`);
    paw.style.opacity = "1";
    visible = true;
  });

  document.addEventListener("mousedown", () => {
    paw.classList.add("is-pressed");
  });

  document.addEventListener("mouseup", () => {
    paw.classList.remove("is-pressed");
  });

  document.addEventListener("mouseover", (event) => {
    if (event.target.closest("a, button, input, textarea, select, label")) {
      paw.classList.add("is-active");
    }
  });

  document.addEventListener("mouseout", (event) => {
    if (event.target.closest("a, button, input, textarea, select, label")) {
      paw.classList.remove("is-active");
    }
  });
});
