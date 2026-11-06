import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { DayOverview, type Slot } from "../src/features/plans/DayOverview";

const props = {
  copyTargets: () => [],
  onMove: () => {},
  onCopy: () => {},
  onJump: () => {},
};

test("the week overview draws a new plan, whose days are all empty", () => {
  const slots: Slot[] = ["Mon", "Tue", "Wed"].map((label, slot) => ({ slot, label, day: null }));
  const html = renderToString(createElement(DayOverview, { ...props, slots }));
  for (const label of ["Mon", "Tue", "Wed"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("translateY"), "nothing is being dragged");
});
