(function () {
  "use strict";
  const mount = document.getElementById("globalNpcLibraryMount");
  const section = document.querySelector('[data-admin-section="people"]');
  if (!mount || !section) return;

  let entries = [];
  let loading = false;
  let loaded = false;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  const safe = escapeHtml;
  const attr = escapeHtml;
  const list = value => Array.isArray(value) ? value : [];
  const fmtStats = a => ["STY", "STO", "FYS", "SMI", "INT", "PSY", "KAR"].map(
    key => '<span><strong>' + key + '</strong> ' + safe(a?.[key] ?? "–") + '</span>'
  ).join("");
  const skillRows = rows => list(rows).map(item =>
    '<li>' + safe(item.name || item.skill_id || "Färdighet") + ' <b>FV ' + safe(item.fv ?? "–") + '</b></li>'
  ).join("");
  const spellRows = rows => list(rows).map(item =>
    '<li>' + safe(item.name || "Besvärjelse") + ' <b>FV ' + safe(item.fv ?? "–") + '</b></li>'
  ).join("");
  const bullets = items => list(items).map(x => '<li>' + safe(x) + '</li>').join("");
  const profileText = (label, body) => body ?
    '<section><h5>' + safe(label) + '</h5><p>' + safe(body) + '</p></section>' : "";
  const profile = item => {
    const skills = skillRows(item.skills);
    const spells = spellRows(item.spells);
    const weapons = list(item.weapons).map(w => '<li>' + safe(w.name) + ' <b>FV ' + safe(w.fv ?? "–") + '</b> · ' + safe(w.damage) + '</li>').join("");
    return '<article class="global-npc-profile">' +
      '<div class="global-npc-attributes">' + fmtStats(item.attributes) + '</div>' +
      profileText("Utseende / bildidentitet", item.appearance) +
      profileText("Personlighet", item.personality) +
      profileText("Bakgrund", item.background) +
      profileText("Drivkraft", item.motivation) +
      profileText("Svaghet", item.weakness) +
      profileText("Relationer", item.relationships) +
      profileText("Hemligheter (endast SL)", item.secrets) +
      (list(item.hooks).length ? '<section><h5>Äventyrskrokar</h5><ul>' + bullets(item.hooks) + '</ul></section>' : "") +
      (list(item.equipment_notes).length ? '<section><h5>Utrustning / föremål</h5><ul>' + bullets(item.equipment_notes) + '</ul></section>' : "") +
      '<section><h5>Stridsutrustning</h5><ul>' + (weapons || '<li>Inga vapen</li>') + '</ul>' +
      '<p>Rustning: ' + safe(item.armor?.name || "Ingen") + ' · ABS ' + safe(item.armor?.absorption ?? 0) + '</p></section>' +
      (skills ? '<section><h5>Färdigheter</h5><ul class="global-npc-columns">' + skills + '</ul></section>' : "") +
      (spells ? '<section><h5>Besvärjelser</h5><ul class="global-npc-columns">' + spells + '</ul></section>' : "") +
      profileText("Spelledaranteckningar", item.gm_notes) +
      '</article>';
  };

  const draw = () => {
    const intro = '<div class="global-npc-heading"><div><h3>Permanenta SLP · bibliotek</h3>' +
      '<p>Fristående original som aldrig är knutna till en kampanj. En kopia kan läggas till i aktuell kampanj utan att ändra originalet.</p></div>' +
      '<button type="button" data-library-action="refresh" class="smallbtn">Uppdatera</button></div>';
    const cards = entries.map(item =>
      '<article class="global-npc-card"><div class="global-npc-card-top">' +
      (item.image_path && typeof npcPortraitCachedUrl === "function" && npcPortraitCachedUrl(item.image_path)
        ? '<img class="global-npc-avatar" src="' + attr(npcPortraitCachedUrl(item.image_path)) + '" alt="Porträtt av ' + attr(item.name) + '">'
        : '<span class="global-npc-initial" aria-hidden="true">' + safe(item.name?.slice(0, 1) || "✦") + '</span>') +
      '<div><h4>' + safe(item.name) + '</h4><p>' + safe(item.title) + '</p>' +
      '<small>' + safe(item.race) + ' · ' + safe(item.profession) + (item.age_years ? ' · ' + safe(item.age_years) + ' år' : "") + '</small></div></div>' +
      '<p class="global-npc-description">' + safe(item.description) + '</p>' +
      '<p class="global-npc-counts">' + list(item.skills).length + ' färdigheter · ' +
      list(item.spells).length + ' besvärjelser · ' + list(item.weapons).length + ' vapen</p>' +
      '<details><summary>Visa fullständig SLP-profil</summary>' + profile(item) + '</details>' +
      '<button type="button" class="smallbtn global-npc-copy" data-library-action="copy" data-npc-id="' + attr(item.id) +
      '">Lägg en kopia i aktuell kampanj</button></article>'
    ).join("");
    mount.innerHTML = intro +
      '<p class="global-npc-status" id="globalNpcLibraryStatus" role="status" aria-live="polite">' +
      (loading ? "Läser in biblioteket…" : loaded ? entries.length + " permanenta SLP registrerade." : "Biblioteket laddas vid öppning.") + '</p>' +
      '<div class="global-npc-grid">' + cards + '</div>';
  };

  const status = message => {
    const el = document.getElementById("globalNpcLibraryStatus");
    if (el) el.textContent = message;
  };
  const load = async () => {
    if (loading) return;
    loading = true;
    draw();
    try {
      entries = await dbJson("global_npcs?select=*&active=eq.true&order=name.asc");
      if (!Array.isArray(entries)) entries = [];
      if (typeof preloadNpcPortraits === "function") await preloadNpcPortraits(entries);
      loaded = true;
    } catch (error) {
      status("Kunde inte läsa biblioteket: " + error.message);
      loading = false;
      return;
    }
    loading = false;
    draw();
  };

  mount.addEventListener("click", async event => {
    const button = event.target.closest("button[data-library-action]");
    if (!button) return;
    if (button.dataset.libraryAction === "refresh") {
      await load();
      return;
    }
    if (button.dataset.libraryAction !== "copy") return;
    const campaignId = typeof centralCampaignId !== "undefined" ? centralCampaignId : null;
    if (!campaignId) {
      status("Ingen aktiv kampanj är vald. Originalen finns kvar i biblioteket.");
      return;
    }
    const id = button.dataset.npcId;
    if (!entries.some(x => x.id === id)) return;
    button.disabled = true;
    status("Skapar en fristående kopia i aktuell kampanj…");
    try {
      await dbJson("rpc/add_global_npc_to_campaign", {
        method: "POST",
        body: JSON.stringify({ p_global_npc_id: id, p_campaign_id: campaignId })
      });
      status("Kampanjkopia skapad. Det permanenta originalet är oförändrat.");
      if (typeof loadCampaignContentData === "function") {
        await loadCampaignContentData();
        if (typeof renderAdminCampaignContent === "function") renderAdminCampaignContent();
      }
    } catch (error) {
      status("Kunde inte skapa kampanjkopian: " + error.message);
    } finally {
      button.disabled = false;
    }
  });

  draw();
  const watcher = new MutationObserver(() => {
    if (!section.classList.contains("hidden") && !loaded && !loading) load();
  });
  watcher.observe(section, { attributes: true, attributeFilter: ["class"] });
  if (!section.classList.contains("hidden")) load();
})();