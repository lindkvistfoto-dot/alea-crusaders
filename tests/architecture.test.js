import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("application architecture smoke checks", () => {
  test("index is a slim shell", () => {
    const html = read("index.html");
    expect(html.length).toBeLessThan(150_000);
    expect(html).not.toMatch(/<style[\\s>]/i);
    expect(html).toContain("./features/combat/admin-scenes.js");
    expect(html).toContain("./features/combat/runtime.js");
    expect(html).toContain("./legacy/app.js");
    expect(html).toContain("./src/main.js");
  });

  test("classic application scripts are syntactically valid", () => {
    const files = [
      "public/features/combat/admin-scenes.js",
      "public/features/combat/runtime.js",
      "public/legacy/app.js",
    ];
    for (const file of files) {
      expect(() => new Function(read(file)), file).not.toThrow();
    }
  });

  test("combat code is owned by combat packages", () => {
    const legacy = read("public/legacy/app.js");
    const admin = read("public/features/combat/admin-scenes.js");
    const runtime = read("public/features/combat/runtime.js");
    expect(legacy).not.toContain("function eventCombatHexGeometry");
    expect(legacy).not.toContain("function renderCombatMap");
    expect(admin).toContain("function eventCombatHexGeometry");
    expect(runtime).toContain("function renderCombatMap");
  });
});
