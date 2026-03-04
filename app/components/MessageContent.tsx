"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-inherit">{children}</strong>,
  table: ({ children }: { children?: ReactNode }) => (
    <div className="overflow-x-auto my-3 rounded-lg border border-surface-700/80">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => <thead className="bg-surface-800/90">{children}</thead>,
  tbody: ({ children }: { children?: ReactNode }) => <tbody className="divide-y divide-surface-700/60">{children}</tbody>,
  tr: ({ children }: { children?: ReactNode }) => <tr className="border-b border-surface-700/50 last:border-0">{children}</tr>,
  th: ({ children }: { children?: ReactNode }) => (
    <th className="px-3 py-2 text-left font-medium text-surface-200 border-r border-surface-700/50 last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="px-3 py-2 text-surface-100 border-r border-surface-700/40 last:border-r-0">
      {children}
    </td>
  ),
  h2: ({ children }: { children?: ReactNode }) => <h2 className="text-base font-semibold mt-3 mb-1.5 text-surface-100">{children}</h2>,
  h3: ({ children }: { children?: ReactNode }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-surface-200">{children}</h3>,
  code: ({ className, children, ...props }: { className?: string; children?: ReactNode }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block p-3 rounded-lg bg-surface-900/90 text-sm overflow-x-auto" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="px-1.5 py-0.5 rounded bg-surface-900/80 text-[0.85em] font-mono" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => <pre className="my-2 overflow-x-auto">{children}</pre>,
};

export default function MessageContent({ content }: { content: string }) {
  if (!content.trim()) return null;
  return (
    <div className="message-content text-sm leading-relaxed break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
