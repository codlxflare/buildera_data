"use client";

import type { ReactNode } from "react";

interface TopNavProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  containerClassName?: string;
  className?: string;
}

export default function TopNav({
  title,
  subtitle,
  icon,
  actions,
  containerClassName = "",
  className = "",
}: TopNavProps) {
  return (
    <header className={`ui-nav flex-shrink-0 ${className}`}>
      <div className={`h-full px-4 lg:px-6 flex items-center justify-between gap-3 ${containerClassName}`}>
        <div className="flex items-center gap-3 min-w-0">
          {icon}
          <div className="min-w-0">
            <h1 className="ui-title-2 truncate">{title}</h1>
            {subtitle ? <p className="ui-caption truncate">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
