import React from 'react';
import { X } from 'lucide-react';

// Linear-style contextual side panel. Header (eyebrow / title / subtitle +
// optional close), scrollable body, optional sticky footer for actions.
export default function DetailPanel({
  eyebrow,
  title,
  subtitle,
  onClose,
  footer,
  children,
  className = '',
}: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={`h-full bg-surface border-l border-line flex flex-col overflow-hidden ${className}`}
    >
      <header className="shrink-0 px-4 py-2.5 border-b border-line flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="text-[13px] text-muted mb-0.5">{eyebrow}</p>}
          <h2 className="text-[14px] font-medium text-fg truncate">{title}</h2>
          {subtitle && <div className="text-[13px] text-muted mt-0.5">{subtitle}</div>}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 text-muted hover:text-fg p-1 rounded-control transition-colors duration-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">{children}</div>

      {footer && <footer className="shrink-0 border-t border-line">{footer}</footer>}
    </aside>
  );
}
