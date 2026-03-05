"use client";

import { useState, useRef, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Единый стиль тултипа при наведении (совпадает с графиками) */
export const TOOLTIP_CONTENT_STYLE = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 10px 40px -10px rgba(15, 23, 42, 0.25), 0 4px 12px -2px rgba(15, 23, 42, 0.08)",
  maxWidth: 320,
} as const;

const GAP = 2;
const VIEWPORT_PADDING = 8;

interface HoverTooltipProps {
  children: ReactNode;
  content: ReactNode;
  place?: "top" | "bottom";
  className?: string;
}

export default function HoverTooltip({ children, content, place = "top", className = "" }: HoverTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; transform: string } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!visible || typeof document === "undefined") return;
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const run = () => {
      const tr = trigger.getBoundingClientRect();
      const tt = tooltip.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // При translate(-50%, ...) значение left задаёт центр тултипа после сдвига
      let left = tr.left + tr.width / 2;
      let top: number;
      let transform: string;
      if (place === "top") {
        top = tr.top - GAP;
        transform = "translate(-50%, -100%)";
      } else {
        top = tr.bottom + GAP;
        transform = "translate(-50%, 0)";
      }

      // Ограничение по горизонтали: при прижатии к краю задаём левый край явно (без -50%)
      if (left - tt.width / 2 < VIEWPORT_PADDING) {
        left = VIEWPORT_PADDING;
        transform = place === "top" ? "translate(0, -100%)" : "translate(0, 0)";
      } else if (left + tt.width / 2 > vw - VIEWPORT_PADDING) {
        left = vw - tt.width - VIEWPORT_PADDING;
        transform = place === "top" ? "translate(0, -100%)" : "translate(0, 0)";
      }
      // Ограничиваем по вертикали: не уезжать за верх/низ экрана
      if (place === "top" && top - tt.height < VIEWPORT_PADDING) top = VIEWPORT_PADDING + tt.height;
      if (place === "bottom" && top + tt.height > vh - VIEWPORT_PADDING) top = vh - tt.height - VIEWPORT_PADDING;

      setPos({ left, top, transform });
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(tooltip);
    return () => ro.disconnect();
  }, [visible, place, content]);

  const tooltipEl = visible && (
    <div
      ref={tooltipRef}
      role="tooltip"
      className="pointer-events-none transition-opacity duration-150 z-[9999]"
      style={{
        ...(pos
          ? {
              position: "fixed" as const,
              left: pos.left,
              top: pos.top,
              transform: pos.transform,
            }
          : {
              position: "fixed" as const,
              left: -9999,
              top: 0,
              visibility: "hidden" as const,
            }),
        ...TOOLTIP_CONTENT_STYLE,
      }}
    >
      <div className="leading-snug text-slate-700 min-w-0">{content}</div>
      {place === "top" && pos && (
        <div
          className="absolute left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#e2e8f0]"
          style={{ top: "100%", marginTop: -1 }}
        />
      )}
      {place === "bottom" && pos && (
        <div
          className="absolute left-1/2 -translate-x-1/2 border-[6px] border-transparent border-b-[#e2e8f0]"
          style={{ bottom: "100%", marginBottom: -1 }}
        />
      )}
    </div>
  );

  return (
    <>
      <div
        ref={triggerRef}
        className={`relative inline-flex ${className}`}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => {
          setVisible(false);
          setPos(null);
        }}
      >
        {children}
      </div>
      {typeof document !== "undefined" && visible && createPortal(tooltipEl, document.body)}
    </>
  );
}
