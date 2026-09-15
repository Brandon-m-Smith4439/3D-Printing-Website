"use client";

import { PointerEvent, ReactNode, useRef, useState } from "react";

export function QueueTrackScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0 });
  const [dragging, setDragging] = useState(false);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!ref.current || event.pointerType === "touch") return;
    drag.current = { active: true, startX: event.clientX, startScroll: ref.current.scrollLeft };
    ref.current.setPointerCapture(event.pointerId); setDragging(true);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current.active || !ref.current) return;
    ref.current.scrollLeft = drag.current.startScroll - (event.clientX - drag.current.startX);
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    drag.current.active = false; setDragging(false);
    if (ref.current?.hasPointerCapture(event.pointerId)) ref.current.releasePointerCapture(event.pointerId);
  }

  return <div ref={ref} className={`queue-track-shell queue-drag-shell ${dragging ? "is-dragging" : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>{children}</div>;
}
