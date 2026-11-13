import { useRef, type PointerEvent } from 'react';

/** True when the pointer is on the modal <dialog>'s ::backdrop (outside its box). */
function onBackdrop(e: PointerEvent<HTMLDialogElement>): boolean {
  if (e.target !== e.currentTarget) return false;
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

/**
 * Pointer handlers for a modal <dialog> that call `onClose` on a click outside it.
 * Both press and release must land on the backdrop, so a text selection or slider
 * drag that starts inside and ends outside doesn't close it.
 */
export function useBackdropClose(onClose: () => void) {
  const downOnBackdrop = useRef(false);
  return {
    onPointerDown: (e: PointerEvent<HTMLDialogElement>) => {
      downOnBackdrop.current = onBackdrop(e);
    },
    onPointerUp: (e: PointerEvent<HTMLDialogElement>) => {
      const close = downOnBackdrop.current && onBackdrop(e);
      downOnBackdrop.current = false;
      if (close) onClose();
    },
  };
}
