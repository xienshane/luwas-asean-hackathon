import React from 'react';

// Titled section block with a consistent top divider + spacing rhythm (12/16/24 tiers).
// Gives the panel one elevation/affordance system instead of ad-hoc bordered cards.
export default function Section({
  title,
  action,
  children,
  divider = true,
  className = '',
}: {
  title?: React.ReactNode;
  /** Optional right-aligned control/status in the section header. */
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Top hairline divider (off for the first section under a hero). */
  divider?: boolean;
  className?: string;
}) {
  return (
    <section className={`px-4 py-3 ${divider ? 'border-t border-line' : ''} ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-2.5">
          {title && (
            <h3 className="text-[12px] font-medium text-muted">{title}</h3>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
