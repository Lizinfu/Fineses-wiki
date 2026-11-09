import test from "node:test";
import assert from "node:assert/strict";
import { LIGHT_DIRECTION, normalize3, litColor, sideNormal, faceNormal } from "../../assets/scripts/atlas/lighting.mjs";

const rgb = color => [color >>> 16, color >>> 8 & 255, color & 255];
const near = (actual, expected, tolerance = 1e-10) => {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++)
    assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance, `${actual} differs from ${expected}`);
};

test("one fixed northwest overhead light illuminates all surface orientations", () => {
  assert.ok(Object.isFrozen(LIGHT_DIRECTION));
  assert.ok(LIGHT_DIRECTION[0] < 0 && LIGHT_DIRECTION[1] < 0 && LIGHT_DIRECTION[2] > 0);
  assert.ok(Math.abs(Math.hypot(...LIGHT_DIRECTION) - 1) < 1e-12);
  const base = 0xb0b0b0,
    lit = rgb(litColor(base, LIGHT_DIRECTION))[0],
    away = rgb(litColor(base, LIGHT_DIRECTION.map(value => -value)))[0],
    top = rgb(litColor(base, [0, 0, 1]))[0];
  assert.ok(lit > top && top > away);
  assert.ok(away >= 176 * 0.5, "ambient fill keeps the unlit side readable");
  assert.ok(Math.abs(top - 176) < 6, "top faces retain the existing light base appearance");
  assert.equal(litColor(base, [0, -1, 0]), litColor(base, [0, -500, 0]));
});

test("neutral illumination preserves gray and colored material hue", () => {
  for (const normal of [[0, 0, 1], [-1, 0, 0], [1, 0, 0], LIGHT_DIRECTION]) {
    const gray = rgb(litColor(0xd8d8d8, normal));
    assert.equal(gray[0], gray[1]);
    assert.equal(gray[1], gray[2]);
    for (const color of [0x804020, 0x4080c0, 0xf0a070]) {
      const original = rgb(color), result = rgb(litColor(color, normal)),
        scale = result[0] / original[0];
      for (let channel = 1; channel < 3; channel++)
        assert.ok(Math.abs(result[channel] - original[channel] * scale) <= 1.6,
          "every channel should share a common light factor, allowing integer rounding");
    }
  }
});

test("highlight limits use a common RGB factor without clipped white patches", () => {
  for (const color of [0xffffff, 0xf5f0e0, 0xff8040]) {
    const original = rgb(color), result = rgb(litColor(color, LIGHT_DIRECTION,
      { ambient: 1, diffuse: 1 }));
    assert.ok(Math.max(...result) <= 250);
    const scale = result[0] / original[0];
    for (let i = 1; i < result.length; i++)
      assert.ok(Math.abs(result[i] - original[i] * scale) <= 1);
  }
  assert.equal(litColor(0x804020, [0, 0, 1], { ambient: 0, diffuse: 0 }), 0);
  assert.deepEqual(rgb(litColor(0xffffff, LIGHT_DIRECTION, { maxChannel: 220 })), [220, 220, 220]);
});

test("side normals use geographic edge orientation rather than translation or length", () => {
  const a = { x: 4, y: -7 }, b = { x: 7, y: -3 },
    normal = sideNormal(a, b);
  near(normal, [0.8, -0.6, 0]);
  near(sideNormal({ x: a.x + 11000, y: a.y - 6000 },
    { x: b.x + 11000, y: b.y - 6000 }), normal);
  near(sideNormal([0, 0], [30, 40]), normal);
  near(sideNormal(b, a, -1), normal);
  near(sideNormal(a, b, -1), normal.map(value => -value));
  assert.ok(rgb(litColor(0xb0b0b0, sideNormal([0, 0], [1, 0])))[0] >
    rgb(litColor(0xb0b0b0, sideNormal([1, 0], [0, 0])))[0]);
});

test("3D face normals respond to actual roof slopes and winding", () => {
  const roof = [[0, 0, 0], [2, 0, 0], [2, 2, 1], [0, 2, 1]],
    normal = faceNormal(roof);
  near(normal, normalize3([0, -1, 2]));
  near(faceNormal(roof.map(([x, y, z]) => ({ x: x * 17 + 1000, y: y * 17 - 2000, z: z * 17 + 400 }))), normal);
  near(faceNormal([...roof].reverse()), normal.map(value => -value));
  near(faceNormal([...roof].reverse(), -1), normal);
  near(faceNormal([[1, 1, 3], [4, 1, 3], [4, 5, 3], [1, 5, 3]]), [0, 0, 1]);
});

test("normalization remains finite and scale invariant for tiny or huge inputs", () => {
  near(normalize3([3, 4, 0]), [0.6, 0.8, 0]);
  near(normalize3([3e-300, 4e-300, 0]), [0.6, 0.8, 0]);
  near(normalize3([1.7e308, 1.7e308, 0]), [Math.SQRT1_2, Math.SQRT1_2, 0]);
  near(normalize3([0, 0, 0]), [0, 0, 1]);
  near(normalize3([NaN, 2, 1], [0, 1, 0]), [0, 1, 0]);
  near(normalize3(undefined, [0, 0, 0]), [0, 0, 0]);
});

test("degenerate geometry and invalid light options have safe bounded results", () => {
  for (const points of [[], [[0, 0, 0]], [[1, 2, 3], [1, 2, 3], [1, 2, 3]],
    [[0, 0, 0], [NaN, 1, 1], [0, 0, 1]], [[0, 0, 0], [1, 1, 1], [2, 2, 2]]])
    near(faceNormal(points), [0, 0, 1]);
  near(sideNormal([0, 0], [0, 0]), [0, 0, 0]);
  near(sideNormal([NaN, 0], [1, 0]), [0, 0, 0]);
  for (const normal of [undefined, null, [0, 0, 0], [NaN, Infinity, 0]]) {
    const color = litColor(0xffffff, normal, { ambient: NaN, diffuse: Infinity, maxChannel: -1, maxBrightness: -1 });
    assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff);
  }
  assert.equal(litColor(NaN, [0, 0, 1]), 0);
  assert.equal(litColor(-1, [0, 0, 1]), 0);
  assert.equal(litColor(0, [0, 0, 1]), 0);
});
