import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url));

describe("Häxans brygder hero image", () => {
  test("the shop selects a different image for each mode", () => {
    const js=read("features/shop/store.js").toString("utf8");
    expect(js).toContain("const ALCHEMY_HERO_SRC='./assets/alchemy-hero.jpg");
    expect(js).toContain("const src=alchemy?ALCHEMY_HERO_SRC:SHOP_HERO_SRC");
    expect(js).toContain("img.dataset.shopHeroSrc=src");
    expect(js).not.toContain("if(shopMode==='alchemy'){img.classList.remove('loaded');img.removeAttribute('src');");
  });
  test("the shipped alchemist image is a complete JPEG", () => {
    const image=read("assets/alchemy-hero.jpg");
    expect(image.length).toBeGreaterThan(200_000);
    expect(image[0]).toBe(0xff);
    expect(image[1]).toBe(0xd8);
    expect(image[image.length-2]).toBe(0xff);
    expect(image[image.length-1]).toBe(0xd9);
  });
  test("the illustration is not obstructed by the placeholder", () => {
    const css=read("features/shop/store.css").toString("utf8");
    expect(css).toContain(".shop-alchemy .shop-hero-media img.loaded + .shop-hero-image-fallback");
    expect(css).toContain(".shop-alchemy .shop-hero-media::before{content:none}");
  });
});
