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

  const carousel = document.querySelector("[data-home-carousel]");
  if (!carousel) {
    return;
  }

  const slides = Array.from(carousel.querySelectorAll("[data-home-slide]"));
  const dots = Array.from(carousel.querySelectorAll("[data-carousel-dot]"));
  const cycleDelayMs = 9000;
  let activeIndex = slides.findIndex((slide) => slide.classList.contains("is-active"));
  let timerId = null;

  carousel.style.setProperty("--carousel-cycle-ms", `${cycleDelayMs}ms`);

  if (!slides.length) {
    return;
  }

  if (activeIndex < 0) {
    activeIndex = 0;
  }

  const restartPillFill = () => {
    if (!dots.length) {
      return;
    }

    dots.forEach((dot) => {
      dot.classList.remove("is-progressing");
    });

    const activeDot = dots[activeIndex];
    if (!activeDot) {
      return;
    }

    // Force a reflow so CSS fill animation restarts from 0.
    void activeDot.offsetWidth;
    activeDot.classList.add("is-progressing");
  };

  const setActiveSlide = (nextIndex) => {
    slides.forEach((slide, index) => {
      slide.classList.toggle("is-active", index === nextIndex);
    });

    dots.forEach((dot, index) => {
      const isActive = index === nextIndex;
      dot.classList.toggle("is-active", isActive);
      dot.classList.toggle("is-completed", index < nextIndex);
      dot.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    activeIndex = nextIndex;
    restartPillFill();
  };

  const showNext = () => {
    const nextIndex = (activeIndex + 1) % slides.length;
    setActiveSlide(nextIndex);
  };

  const restartTimer = () => {
    if (timerId) {
      window.clearInterval(timerId);
    }

    if (slides.length > 1) {
      timerId = window.setInterval(showNext, cycleDelayMs);
    }

    restartPillFill();
  };

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const dotIndex = Number(dot.getAttribute("data-carousel-dot"));
      if (Number.isNaN(dotIndex)) {
        return;
      }

      setActiveSlide(dotIndex);
      restartTimer();
    });
  });

  slides.forEach((slide) => {
    const postHref = slide.getAttribute("data-post-href");
    if (!postHref) {
      return;
    }

    slide.addEventListener("click", () => {
      window.location.href = postHref;
    });

    slide.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      window.location.href = postHref;
    });
  });

  restartTimer();
});
