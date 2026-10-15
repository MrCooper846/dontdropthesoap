"use client";
import { useEffect, useRef, useState } from "react";
export function useMatchCountdown(deadline: number | null, serverTime: number) {
  const receipt = useRef({ serverTime, receivedAt: performance.now() });
  if (receipt.current.serverTime !== serverTime)
    receipt.current = { serverTime, receivedAt: performance.now() };
  const [, redraw] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => redraw((value) => value + 1), 250);
    return () => clearInterval(timer);
  }, []);
  return deadline === null
    ? null
    : Math.max(
        0,
        Math.ceil(
          (deadline -
            serverTime -
            (performance.now() - receipt.current.receivedAt)) /
            1000,
        ),
      );
}
