import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("media viewer navigation prototype contract", () => {
  it("provides three structurally named viewer variants", () => {
    assert.match(app, /function renderVariantA\(/u);
    assert.match(app, /function renderVariantB\(/u);
    assert.match(app, /function renderVariantC\(/u);
    assert.match(app, /data-layout="immersive"/u);
    assert.match(app, /data-layout="time-rails"/u);
    assert.match(app, /data-layout="album-caption"/u);
  });

  it("binds bare horizontal arrow keys to media navigation", () => {
    assert.match(app, /event\.key !== "ArrowLeft" && event\.key !== "ArrowRight"/u);
    assert.match(app, /else navigateMedia\(direction\)/u);
    assert.match(app, /data-media-direction/u);
  });

  it("renders the persisted positive prompt or an explicit missing state", () => {
    assert.match(app, /positivePrompt/u);
    assert.match(app, /正面提示词/u);
    assert.match(app, /生成时保存/u);
    assert.match(app, /这项媒体的生成记录没有保存正面提示词。/u);
  });

  it("names both disabled time boundaries with the current Session scope", () => {
    assert.match(app, /当前媒体已是本会话最新媒体/u);
    assert.match(app, /当前媒体已是本会话最早媒体/u);
  });

  it("uses a module entry point and preserves complete media", () => {
    assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/u);
    assert.match(styles, /object-fit:\s*contain;/u);
    assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)/u);
  });
});
