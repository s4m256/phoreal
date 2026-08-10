import assert from "node:assert/strict";
import test from "node:test";
import { compareProblemCodes, dayKey, fixedPeriodDays, isTheoryTag, splitSegmentByDay } from "../app/components/training-view-model.mjs";

test("fixed training period contains every day from start through TBF", () => {
  const start = new Date(2026, 4, 2);
  const end = new Date(2027, 1, 20);
  const now = new Date(2026, 7, 9, 12).getTime();
  const days = fixedPeriodDays(start, end, new Map(), now);
  assert.equal(days.length, 295);
  assert.equal(days[0].key, "2026-05-02");
  assert.equal(days.at(-1).key, "2027-02-20");
  assert.equal(days.find((day) => day.key === "2026-08-09").seconds, 0);
  assert.equal(days.find((day) => day.key === "2026-08-10").seconds, null);
});

test("segments crossing midnight are split and aggregated by problem", () => {
  const daily = new Map();
  const start = new Date(2026, 5, 1, 23, 59, 30).toISOString();
  splitSegmentByDay(start, 90, 11, daily);
  splitSegmentByDay(new Date(2026, 5, 2, 0, 1).toISOString(), 120, 11, daily);
  splitSegmentByDay(new Date(2026, 5, 2, 0, 3).toISOString(), 30, 22, daily);
  assert.equal(daily.get("2026-06-01").seconds, 30);
  assert.equal(daily.get("2026-06-02").seconds, 210);
  assert.equal(daily.get("2026-06-02").problems.get(11), 180);
  assert.equal(daily.get("2026-06-02").problems.get(22), 30);
  assert.equal(dayKey(new Date(2026, 5, 2)), "2026-06-02");
});

test("catalog orders T, E and PE using natural numeric order", () => {
  const codes = ["PE2", "E2", "T10", "T2", "PE", "E1", "T1", "PE1"];
  assert.deepEqual(codes.sort(compareProblemCodes), ["T1", "T2", "T10", "E1", "E2", "PE", "PE1", "PE2"]);
});

test("technical catalog tags are hidden from content views",()=>{assert.equal(isTheoryTag("X"),false);assert.equal(isTheoryTag("Y25"),false);assert.equal(isTheoryTag("2025"),false);assert.equal(isTheoryTag("Mecânica"),true)});
