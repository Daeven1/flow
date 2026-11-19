import { expect, test } from "vitest";
import { planFor } from "./planting";
import { spots } from "./layout";

const S = { id: "s1", plantSpecies: "FERN", plantX: 0, plantY: 0 };
const END = new Date("2026-11-20T03:00:00.000Z");
test("a finished session keeps its plant", () => {
  expect(planFor(S, "COMPLETED", END, [])).toEqual(
    { sessionId: "s1", species: "FERN", x: 0, y: 0, status: "ALIVE", plantedAt: END, witheredAt: null });
  expect(planFor(S, "CLEARED", END, [])?.status).toBe("ALIVE");
});
test("a lost session leaves a withered plant", () => {
  expect(planFor(S, "LEFT", END, [])).toMatchObject({ status: "WITHERED", witheredAt: END });
  expect(planFor(S, "GAVE_UP", END, [])?.status).toBe("WITHERED");
});
test("a taken spot moves to the nearest free one", () => {
  expect(planFor(S, "COMPLETED", END, [{ x: 0, y: 0 }])).toMatchObject({ x: 0, y: -1 });
});
test("a full grid widens instead of failing", () => {
  const p = planFor(S, "COMPLETED", END, spots(6));
  expect(p).not.toBeNull();
  expect(spots(6).some((s) => s.x === p!.x && s.y === p!.y)).toBe(false);
});
test("a session without a plant makes none", () => {
  expect(planFor({ id: "s2", plantSpecies: null, plantX: null, plantY: null }, "COMPLETED", END, [])).toBeNull();
  expect(planFor({ ...S, plantSpecies: "OAK" }, "COMPLETED", END, [])).toBeNull();
});
