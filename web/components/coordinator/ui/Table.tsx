import React from 'react';

// Minimal calm table primitives — density over decoration. Tables are the
// default for scannable lists (Teams, Routes, Supply Manifests).

const RAIL: Record<'critical' | 'warning' | 'active', string> = {
  critical: 'var(--color-critical)',
  warning: 'var(--color-warning)',
  active: 'var(--color-active)',
};

export function Table({ children }: { children: React.ReactNode }) {
  return <table className="w-full text-[13px] border-collapse">{children}</table>;
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead>{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({
  children,
  selected,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  tone?: 'critical' | 'warning' | 'active';
}) {
  return (
    <tr
      onClick={onClick}
      // inset box-shadow gives a left severity rail without breaking border-collapse
      style={tone ? { boxShadow: `inset 2px 0 0 ${RAIL[tone]}` } : undefined}
      className={`border-b border-line transition-colors duration-100 ${
        onClick ? 'cursor-pointer' : ''
      } ${selected ? 'bg-raised' : onClick ? 'hover:bg-raised/40' : ''}`}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-3 py-2 font-medium text-[12px] text-muted border-b border-line ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  align = 'left',
  mono = false,
  muted = false,
  className = '',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2 ${muted ? 'text-muted' : 'text-fg'} ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${mono ? 'font-mono tabular-nums' : ''} ${className}`}
    >
      {children}
    </td>
  );
}
