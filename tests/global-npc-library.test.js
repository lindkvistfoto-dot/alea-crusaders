import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("Permanent SLP library integration", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../features/npc/global-library.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../features/npc/global-library.css", import.meta.url), "utf8");
  it("mounts inside the existing SLP section without altering campaign NPC routing", () => {
    const section = html.indexOf('data-admin-section="people"');
    const mount = html.indexOf('id="globalNpcLibraryMount"');
    expect(section).toBeGreaterThan(0);
    expect(mount).toBeGreaterThan(section);
    expect(html).toContain("./features/npc/global-library.js");
    expect(html).toContain("./features/npc/global-library.css");
    expect(css).toContain(".global-npc-card");
  });
  it("reads campaign-independent templates and clones by controlled RPC", () => {
    expect(ui).toContain('global_npcs?select=*&active=eq.true&order=name.asc');
    expect(ui).toContain("rpc/add_global_npc_to_campaign");
    expect(ui).toContain("p_global_npc_id");
    expect(ui).toContain("p_campaign_id");
    expect(ui).toContain("Det permanenta originalet är oförändrat");
  });
  it("escapes all text data before injecting into admin HTML", () => {
    expect(ui).toContain("escapeHtml");
    expect(ui).toContain("safe(item.name)");
    expect(ui).toContain('profileText("Hemligheter (endast SL)", item.secrets)');
  });
});