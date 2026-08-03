import React from 'react';

// A calm, fixed-height header strip for screen titles, filters, and actions.
// Whitespace and a single hairline instead of a gradient banner.
export default function Toolbar({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`shrink-0 flex items-center gap-3 px-4 h-10 border-b border-line bg-surface ${className}`}
    >
      {children}
    </div>
  );
}
