'use client';

import React, { useState } from 'react';
import {
  Map,
  FileText,
  Truck,
  Package,
  AlertOctagon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface LeftSidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  reportsCount: number;
  highPriorityCount: number;
  onCreateIncident: () => void;
  onBroadcastAlert: () => void;
  onExportReport: () => void;
}

export default function LeftSidebar({
  currentView,
  onViewChange,
  reportsCount,
  highPriorityCount,
  onCreateIncident,
  onBroadcastAlert,
  onExportReport
}: LeftSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    {
      id: 'map',
      label: 'Live Map',
      icon: Map,
      badge: highPriorityCount > 0 ? `${highPriorityCount} risk` : null,
      badgeColor: 'bg-red-900/60 text-red-200 border-red-800'
    },
    {
      id: 'reports',
      label: 'Field Reports',
      icon: FileText,
      badge: reportsCount > 0 ? `${reportsCount} pending` : null,
      badgeColor: 'bg-amber-900/60 text-amber-200 border-amber-800'
    },
    {
      id: 'teams',
      label: 'Teams & Dispatch',
      icon: Truck,
      badge: null,
      badgeColor: ''
    },
    {
      id: 'manifests',
      label: 'Supply Manifests',
      icon: Package,
      badge: null,
      badgeColor: ''
    },
  ];

  return (
    <aside
      className="h-full bg-slate-950 border-r border-slate-800 flex flex-col justify-between select-none shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
      style={{ width: collapsed ? '56px' : '260px' }}
    >
      {/* Brand header */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between min-h-[56px]">
        {!collapsed ? (
          <>
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="bg-teal-900/80 border border-teal-500/30 p-1.5 rounded-lg shrink-0">
                <AlertOctagon className="w-4 h-4 text-teal-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">LUWAS OPS</p>
                <h1 className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
                  Cebu Command
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse shrink-0" />
                </h1>
              </div>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-teal-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="w-full flex flex-col items-center gap-2">
            <div className="bg-teal-900/80 border border-teal-500/30 p-1.5 rounded-lg">
              <AlertOctagon className="w-4 h-4 text-teal-400" />
            </div>
            <button
              onClick={() => setCollapsed(false)}
              className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-teal-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-1.5 space-y-1 overflow-y-auto overflow-x-hidden text-xs">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center rounded-lg font-medium transition-colors cursor-pointer ${
                collapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-slate-900 text-teal-400 border border-slate-800 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <div className={`flex items-center ${collapsed ? '' : 'gap-2.5'}`}>
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-400' : 'text-slate-500'}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>
              {!collapsed && item.badge && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold shrink-0 ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Pinned actions */}
      {!collapsed && (
        <div className="p-3 border-t border-slate-800 bg-slate-900/20 space-y-1.5 text-xs">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-2">
            Emergency Actions
          </span>
          <button
            onClick={onCreateIncident}
            className="w-full py-2 px-3 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 hover:text-white font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Create Incident</span>
          </button>
        </div>
      )}

      {collapsed && (
        <div className="p-2 border-t border-slate-800">
          <button
            onClick={onCreateIncident}
            title="Create Incident"
            className="w-full p-2 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
          >
            <AlertOctagon className="w-4 h-4" />
          </button>
        </div>
      )}
    </aside>
  );
}
