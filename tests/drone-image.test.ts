import assert from "node:assert/strict";
import test from "node:test";
import {
  readDroneBackgroundImage,
  readDroneMapAdjustment,
} from "../src/drone-image.ts";

test("drone background accepts only bounded JPEG data URLs", () => {
  const image = `data:image/jpeg;base64,${"A".repeat(32)}`;
  assert.equal(readDroneBackgroundImage(image), image);
  for (const value of [
    undefined,
    "/local/drone.jpg",
    "https://example.com/drone.jpg",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:image/jpeg;base64,not base64",
    "data:image/jpeg;base64,AA=A",
    "data:image/jpeg;base64,",
    `data:image/jpeg;base64,${"A".repeat(2_800_001)}`,
  ]) {
    assert.equal(readDroneBackgroundImage(value), undefined);
  }
});

test("saved drone alignment accepts only finite bounded adjustments", () => {
  assert.deepEqual(readDroneMapAdjustment({ dx: 4, dy: -5, rotation: 15, scale: 1.2 }),
    { dx: 4, dy: -5, rotation: 15, scale: 1.2 });
  for (const value of [
    null,
    [],
    { dx: Infinity, dy: 0, rotation: 0, scale: 1 },
    { dx: 0, dy: 1_000_001, rotation: 0, scale: 1 },
    { dx: 0, dy: 0, rotation: NaN, scale: 1 },
    { dx: 0, dy: 0, rotation: 0, scale: 4.1 },
  ]) {
    assert.equal(readDroneMapAdjustment(value), undefined);
  }
});
