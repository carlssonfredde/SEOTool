import { describe, expect, it } from "vitest";
import { extractMeta } from "./audit";

describe("extractMeta", () => {
  it("keeps apostrophes inside double-quoted descriptions", () => {
    const html = `<meta name="description" content="Mugwort's party lasted all night.">`;
    expect(extractMeta(html, "description")).toBe("Mugwort's party lasted all night.");
  });

  it("reads content before name and decodes entities", () => {
    const html = `<meta content='DJ &amp; guests' name='description'>`;
    expect(extractMeta(html, "description")).toBe("DJ & guests");
  });

  it("matches property metadata without confusing it with name metadata", () => {
    const html = `<meta name="description" content="Page"><meta property="og:title" content="DJ Freddy">`;
    expect(extractMeta(html, "og:title", "property")).toBe("DJ Freddy");
  });

  it("continues past an incomplete matching tag", () => {
    const html = `<meta name="description"><meta name="description" content="The usable description">`;
    expect(extractMeta(html, "description")).toBe("The usable description");
  });

  it("does not combine malformed and later meta tags", () => {
    const html = `<meta name="description" <meta property="og:title" content="Social title">`;
    expect(extractMeta(html, "description")).toBeNull();
    expect(extractMeta(html, "og:title", "property")).toBe("Social title");
  });

  it("keeps the first value of a duplicate attribute", () => {
    const html = `<meta name="description" content="First description" content="Second description">`;
    expect(extractMeta(html, "description")).toBe("First description");
  });
});
