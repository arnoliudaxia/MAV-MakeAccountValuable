import { useEffect, useMemo } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { createCategoryGestures } from "./category-gestures";

export function useCategoryGestures(
  onSelect: (category: string) => void,
  onExclude: (category: string) => void
) {
  const gestures = useMemo(
    () => createCategoryGestures(onSelect, onExclude),
    [onSelect, onExclude]
  );

  useEffect(() => {
    // Window capture also cancels when the finger leaves the original shape.
    const move = (event: globalThis.PointerEvent) =>
      gestures.pointerMove(event);
    const up = (event: globalThis.PointerEvent) => gestures.pointerUp(event);
    const cancel = () => gestures.cancel();
    const otherPointer = (event: globalThis.PointerEvent) => {
      if (!event.isPrimary) cancel();
    };
    window.addEventListener("pointerdown", otherPointer, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("scroll", cancel, true);
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      window.removeEventListener("pointerdown", otherPointer, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("scroll", cancel, true);
      window.removeEventListener("blur", cancel);
    };
  }, [gestures]);

  return (category: string) => ({
    onPointerDown: (event: PointerEvent) =>
      gestures.pointerDown(category, event),
    onPointerLeave: () => gestures.cancel(),
    onClick: (event: MouseEvent) => gestures.click(category, event),
    onContextMenu: (event: MouseEvent) =>
      gestures.contextMenu(category, {
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
        pointerType: (event.nativeEvent as globalThis.PointerEvent).pointerType,
      }),
    onKeyDown: (event: KeyboardEvent) => {
      // Keyboard equivalent for contextmenu. Normal Enter/Space uses HTML click.
      if (
        event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")
      ) {
        event.preventDefault();
        event.stopPropagation();
        onExclude(category);
      }
    },
  });
}
