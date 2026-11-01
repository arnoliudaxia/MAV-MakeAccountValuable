import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dashboardFilters,
  overviewFilters,
  selectCategory,
  toggleExcludedCategory,
} from "../../src/components/bills/category-filters";
import {
  CATEGORY_LONG_PRESS_MS,
  createCategoryGestures,
} from "../../src/components/bills/category-gestures";

// Frontend-only helpers run in the existing node test suite; no DB/browser needed.
describe("dashboard category filter state", () => {
  it("switches between a single category and multiple reversible exclusions", () => {
    const single = selectCategory("Food");
    const first = toggleExcludedCategory(single, "Food");
    const second = toggleExcludedCategory(first, "Travel");
    expect(single).toEqual({ category: "Food", excludedCategories: [] });
    expect(second).toEqual({
      category: "",
      excludedCategories: ["Food", "Travel"],
    });
    expect(toggleExcludedCategory(second, "Food")).toEqual({
      category: "",
      excludedCategories: ["Travel"],
    });
    expect(selectCategory("Coffee")).toEqual({
      category: "Coffee",
      excludedCategories: [],
    });
    expect(selectCategory("")).toEqual({
      category: "",
      excludedCategories: [],
    });
  });

  it("builds one complete cards/table input and a category-independent overview", () => {
    const state = toggleExcludedCategory(selectCategory(""), "Food");
    const active = dashboardFilters(2026, 10, "Card", "train", state);
    expect(active).toEqual({
      year: 2026,
      month: 10,
      source: "Card",
      keyword: "train",
      category: undefined,
      excludedCategories: ["Food"],
    });
    const overview = overviewFilters(2026, 10, "Card", "train");
    expect(overview).toEqual({
      year: 2026,
      month: 10,
      source: "Card",
      keyword: "train",
    });
    expect(overview).not.toHaveProperty("category");
    expect(overview).not.toHaveProperty("excludedCategories");
    expect(
      dashboardFilters(2026, 11, "", "", selectCategory("Travel"))
    ).toEqual({
      year: 2026,
      month: 11,
      source: undefined,
      keyword: undefined,
      category: "Travel",
      excludedCategories: undefined,
    });
  });
});

const pointer = (pointerType = "touch") => ({
  pointerId: 1,
  pointerType,
  button: 0,
  isPrimary: true,
  clientX: 20,
  clientY: 30,
});
const action = (detail = 1) => ({
  detail,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});
function setup() {
  vi.useFakeTimers();
  const select = vi.fn();
  const exclude = vi.fn();
  return { select, exclude, gestures: createCategoryGestures(select, exclude) };
}
afterEach(() => vi.useRealTimers());

describe("shared SVG/HTML category gestures", () => {
  it("selects on normal mouse click and toggles directly on each right-click", () => {
    const { gestures, select, exclude } = setup();
    gestures.pointerDown("Food", pointer("mouse"));
    gestures.click("Food", action());
    expect(select).toHaveBeenCalledExactlyOnceWith("Food");
    const menu = action();
    gestures.contextMenu("Food", menu);
    gestures.contextMenu("Food", action());
    gestures.click("Food", action());
    expect(menu.preventDefault).toHaveBeenCalledOnce();
    expect(exclude).toHaveBeenCalledTimes(2);
    expect(exclude).toHaveBeenLastCalledWith("Food");
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("treats a short touch as a selection, never an exclusion", () => {
    const { gestures, select, exclude } = setup();
    gestures.pointerDown("Food", pointer());
    vi.advanceTimersByTime(CATEGORY_LONG_PRESS_MS - 1);
    gestures.pointerUp(pointer());
    gestures.click("Food", action());
    vi.runAllTimers();
    expect(exclude).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledExactlyOnceWith("Food");
  });

  it.each(["touch", "pen"])(
    "excludes once on %s hold, suppressing contextmenu and synthesized click",
    type => {
      const { gestures, select, exclude } = setup();
      gestures.pointerDown("Food", pointer(type));
      vi.advanceTimersByTime(CATEGORY_LONG_PRESS_MS);
      expect(exclude).toHaveBeenCalledExactlyOnceWith("Food");
      // A compatibility MouseEvent may have no pointerType at all.
      gestures.contextMenu("Food", action());
      gestures.pointerUp(pointer(type));
      gestures.contextMenu("Food", { ...action(), pointerType: type });
      gestures.click("Food", action());
      expect(select).not.toHaveBeenCalled();
      expect(exclude).toHaveBeenCalledTimes(1);
      // A new short press is intentional and must not be swallowed.
      gestures.pointerDown("Food", pointer(type));
      gestures.pointerUp(pointer(type));
      gestures.click("Food", action());
      expect(select).toHaveBeenCalledExactlyOnceWith("Food");
    }
  );

  it("ignores the native touch contextmenu even if it arrives before the timer", () => {
    const { gestures, exclude } = setup();
    gestures.pointerDown("Travel", pointer());
    vi.advanceTimersByTime(500);
    const menu = action();
    gestures.contextMenu("Travel", menu);
    expect(menu.preventDefault).toHaveBeenCalledOnce();
    expect(exclude).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(exclude).toHaveBeenCalledExactlyOnceWith("Travel");
  });

  it("ignores late mouse-shaped touch contextmenu during a sustained hold or after cancel", () => {
    const { gestures, exclude } = setup();
    gestures.pointerDown("Food", pointer());
    vi.advanceTimersByTime(3000);
    gestures.contextMenu("Food", { ...action(), pointerType: "mouse" });
    gestures.cancel();
    gestures.contextMenu("Food", action());
    expect(exclude).toHaveBeenCalledTimes(1);
    // An actual new right mouse press must still restore immediately.
    gestures.pointerDown("Food", { ...pointer("mouse"), button: 2 });
    gestures.contextMenu("Food", { ...action(), pointerType: "mouse" });
    expect(exclude).toHaveBeenCalledTimes(2);
  });

  it("allows repeating a long press to restore the same category", () => {
    const { gestures, exclude } = setup();
    for (let i = 0; i < 2; i++) {
      gestures.pointerDown("Food", pointer());
      vi.advanceTimersByTime(CATEGORY_LONG_PRESS_MS);
      gestures.pointerUp(pointer());
      gestures.click("Food", action());
    }
    expect(exclude).toHaveBeenCalledTimes(2);
  });

  it.each(["movement", "up", "cancel", "second finger"])(
    "cancels pending hold on %s",
    reason => {
      const { gestures, exclude } = setup();
      gestures.pointerDown("Food", pointer());
      vi.advanceTimersByTime(200);
      if (reason === "movement")
        gestures.pointerMove({ ...pointer(), clientY: 42 });
      if (reason === "up") gestures.pointerUp(pointer());
      if (reason === "cancel") gestures.cancel(); // also used for scroll/leave/unmount
      if (reason === "second finger")
        gestures.pointerDown("Food", {
          ...pointer(),
          isPrimary: false,
          pointerId: 2,
        });
      vi.runAllTimers();
      expect(exclude).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("tolerates small finger jitter but not a scroll-sized movement", () => {
    const { gestures, exclude } = setup();
    gestures.pointerDown("Food", pointer());
    gestures.pointerMove({ ...pointer(), clientX: 23, clientY: 34 });
    vi.advanceTimersByTime(CATEGORY_LONG_PRESS_MS);
    expect(exclude).toHaveBeenCalledOnce();
  });

  it("does not let another pointer release or move end the primary hold", () => {
    const { gestures, exclude } = setup();
    gestures.pointerDown("Food", pointer());
    gestures.pointerUp({ pointerId: 2 });
    gestures.pointerMove({ pointerId: 2, clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(CATEGORY_LONG_PRESS_MS);
    expect(exclude).toHaveBeenCalledOnce();
  });

  it("never starts a mouse long press and permits keyboard activation after a hold", () => {
    const { gestures, select, exclude } = setup();
    gestures.pointerDown("Food", pointer("mouse"));
    vi.runAllTimers();
    expect(exclude).not.toHaveBeenCalled();
    gestures.pointerDown("Food", pointer());
    vi.advanceTimersByTime(CATEGORY_LONG_PRESS_MS);
    gestures.pointerUp(pointer());
    gestures.click("Food", action(0));
    expect(select).toHaveBeenCalledExactlyOnceWith("Food");
  });
});
