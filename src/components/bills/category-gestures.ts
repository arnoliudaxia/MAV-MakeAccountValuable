export const CATEGORY_LONG_PRESS_MS = 600;
const MOVE_TOLERANCE_PX = 10;
const COMPATIBILITY_EVENT_MS = 1500;

type Pointer = {
  pointerId: number;
  pointerType: string;
  button: number;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
};
type ActionEvent = {
  preventDefault: () => void;
  stopPropagation: () => void;
};

// No DOM/React dependency: use the same gesture arbitration on SVG and HTML.
export function createCategoryGestures(
  onSelect: (category: string) => void,
  onExclude: (category: string) => void
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: { category: string; pointer: Pointer } | undefined;
  let suppressed: { category: string; until: number } | undefined;
  let lastTouch: { category: string; until: number } | undefined;

  function stopTimer() {
    clearTimeout(timer);
    timer = undefined;
  }
  function suppress(category: string) {
    suppressed = { category, until: Date.now() + COMPATIBILITY_EVENT_MS };
  }
  function cancel() {
    stopTimer();
    if (active) {
      suppress(active.category);
      lastTouch = {
        category: active.category,
        until: Date.now() + COMPATIBILITY_EVENT_MS,
      };
    }
    active = undefined;
  }

  return {
    pointerDown(category: string, pointer: Pointer) {
      if (!pointer.isPrimary) {
        cancel();
        return;
      }
      cancel();
      // A fresh primary press is intentional, unlike the click synthesized
      // after a long press. Never prevent pointerdown: scrolling stays native.
      if (pointer.pointerType === "mouse") lastTouch = undefined;
      if (pointer.button !== 0) return;
      suppressed = undefined;
      if (pointer.pointerType !== "touch" && pointer.pointerType !== "pen") {
        lastTouch = undefined;
        return;
      }
      active = { category, pointer };
      lastTouch = { category, until: Date.now() + COMPATIBILITY_EVENT_MS };
      timer = setTimeout(() => {
        timer = undefined;
        suppress(category);
        onExclude(category);
      }, CATEGORY_LONG_PRESS_MS);
    },
    pointerMove(pointer: Pick<Pointer, "pointerId" | "clientX" | "clientY">) {
      if (!active || active.pointer.pointerId !== pointer.pointerId) return;
      if (
        Math.hypot(
          pointer.clientX - active.pointer.clientX,
          pointer.clientY - active.pointer.clientY
        ) > MOVE_TOLERANCE_PX
      )
        cancel();
    },
    pointerUp(pointer: Pick<Pointer, "pointerId">) {
      if (!active || active.pointer.pointerId !== pointer.pointerId) return;
      stopTimer();
      lastTouch = {
        category: active.category,
        until: Date.now() + COMPATIBILITY_EVENT_MS,
      };
      if (suppressed?.category === active.category) suppress(active.category);
      active = undefined;
    },
    cancel,
    click(category: string, event: ActionEvent & { detail: number }) {
      event.stopPropagation();
      if (
        event.detail !== 0 &&
        suppressed?.category === category &&
        Date.now() <= suppressed.until
      ) {
        event.preventDefault();
        return;
      }
      onSelect(category);
    },
    contextMenu(
      category: string,
      event: ActionEvent & { pointerType?: string }
    ) {
      event.preventDefault();
      event.stopPropagation();
      // Touch contextmenu is a compatibility event, not a second exclusion.
      // It can arrive before OR after our timer/up/cancel, with no pointerType.
      if (
        active?.category === category ||
        event.pointerType === "touch" ||
        event.pointerType === "pen" ||
        (lastTouch?.category === category && Date.now() <= lastTouch.until)
      ) {
        return;
      }
      stopTimer();
      suppress(category);
      onExclude(category);
    },
  };
}
