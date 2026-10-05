(() => {
  const baseIcons = {
    Fysik: "◒",
    Styrka: "↔",
    Karisma: "◇",
    Storlek: "▮",
    Smidighet: "↗",
    Intelligens: "▤",
    "Psykisk kraft": "◉"
  };

  const derivedMeta = {
    Skadebonus: {
      icon: "✹",
      description: "Tillägg till skada vid fysiska attacker."
    },
    Svärdshand: {
      icon: "⚔",
      description: "Vilken hand som är din starkaste i närstrid."
    },
    Förflyttning: {
      icon: "➜",
      description: "Hur långt du normalt kan förflytta dig."
    },
    Bärförmåga: {
      icon: "◆",
      description: "Hur mycket utrustning du kan bära."
    }
  };

  function decorateSectionTitles() {
    document.querySelectorAll("#grundPanel > .section > .section-title").forEach(title => {
      const value = title.textContent.trim();
      if (value === "Grundegenskaper") {
        title.dataset.glowIcon = "▥";
        title.closest(".section")?.classList.add("glow-stat-section", "glow-base-section");
      } else if (value === "Härledda värden") {
        title.dataset.glowIcon = "✦";
        title.closest(".section")?.classList.add("glow-stat-section", "glow-derived-section");
      }
    });
  }

  function decorateBaseGrid() {
    const grid = document.getElementById("basegrid");
    if (!grid) return;

    const cells = Array.from(grid.children);
    if (cells.length < 4) return;

    cells.slice(0, 3).forEach((cell, index) => {
      cell.classList.add("glow-base-head", `glow-base-col-${index + 1}`);
    });

    const bonusIndex = cells.findIndex(cell => cell.classList.contains("bonus-exp-row"));
    const end = bonusIndex >= 0 ? bonusIndex : cells.length;
    const bodyCells = cells.slice(3, end);

    for (let i = 0; i + 2 < bodyCells.length; i += 3) {
      const nameCell = bodyCells[i];
      const valueCell = bodyCells[i + 1];
      const groupCell = bodyCells[i + 2];
      const label = nameCell.textContent.trim();

      nameCell.classList.add("glow-base-name");
      valueCell.classList.add("glow-base-value");
      groupCell.classList.add("glow-base-group");

      if (!nameCell.dataset.glowDecorated) {
        nameCell.dataset.glowDecorated = "1";
        nameCell.textContent = "";

        const icon = document.createElement("span");
        icon.className = "glow-base-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = baseIcons[label] || "◆";

        const text = document.createElement("span");
        text.className = "glow-base-label";
        text.textContent = label;

        nameCell.append(icon, text);
      }
    }

    const bonus = grid.querySelector(".bonus-exp-row");
    if (bonus) bonus.classList.add("glow-bonus-exp");
  }

  function decorateDerived() {
    const grid = document.getElementById("derived");
    if (!grid) return;

    grid.querySelectorAll(":scope > .field").forEach(field => {
      if (field.dataset.glowDecorated) return;

      const label = field.querySelector(".label");
      if (!label) return;

      const key = label.textContent.trim();
      const meta = derivedMeta[key] || {
        icon: "✦",
        description: "Härlett värde för rollpersonen."
      };

      field.dataset.glowDecorated = "1";
      field.dataset.glowKey = key;
      field.classList.add("glow-derived-card");

      const icon = document.createElement("div");
      icon.className = "glow-derived-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = meta.icon;

      const copy = document.createElement("div");
      copy.className = "glow-derived-copy";
      label.classList.add("glow-derived-label");
      copy.appendChild(label);

      const description = document.createElement("div");
      description.className = "glow-derived-description";
      description.textContent = meta.description;
      copy.appendChild(description);

      const value = field.querySelector(".val, .grund-input");
      field.prepend(copy);
      field.prepend(icon);
      if (value) value.classList.add("glow-derived-value");
    });
  }

  function syncCharacterViewClass() {
    const view = document.getElementById("view");
    document.body.classList.toggle(
      "character-glowup-active",
      Boolean(view && !view.classList.contains("hidden"))
    );
  }

  function decorate() {
    syncCharacterViewClass();
    decorateSectionTitles();
    decorateBaseGrid();
    decorateDerived();
  }

  let scheduled = false;
  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorate();
    });
  }

  function start() {
    decorate();
    const observer = new MutationObserver(scheduleDecorate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
