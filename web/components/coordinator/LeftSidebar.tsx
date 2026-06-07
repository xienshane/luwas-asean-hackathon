'use client';

import React, { useState } from 'react';
import { 
  Activity, 
  Map, 
  FileText, 
  Users, 
  Truck, 
  Package, 
  Navigation, 
  Cpu, 
  Compass, 
  Radio, 
  Settings, 
  PlusCircle, 
  Megaphone, 
  Download,
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
    { id: 'overview',     label: 'Overview',          icon: Activity,   badge: highPriorityCount > 0 ? `${highPriorityCount}` : null, badgeColor: 'bg-red-900/60 text-red-200 border-red-800' },
    { id: 'map',          label: 'Live Map',           icon: Map },
    { id: 'reports',      label: 'Field Reports',      icon: FileText,   badge: reportsCount > 0 ? `${reportsCount}` : null, badgeColor: 'bg-amber-900/60 text-amber-200 border-amber-800' },
    { id: 'volunteers',   label: 'Volunteers',         icon: Users },
    { id: 'teams',        label: 'Teams',              icon: Truck },
    { id: 'manifests',    label: 'Supply Manifests',   icon: Package },
    { id: 'routes',       label: 'Routes',             icon: Navigation },
    { id: 'predictions',  label: 'Impact Predictions', icon: Cpu },
    { id: 'roads',        label: 'Road Network',       icon: Compass },
    { id: 'comms',        label: 'Communications',     icon: Radio },
    { id: 'settings',     label: 'Settings',           icon: Settings },
  ];

  return (
    <aside
      className="h-full bg-slate-950 border-r border-slate-800 flex flex-col justify-between select-none shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
      style={{ width: collapsed ? '56px' : '280px' }}
    >
      {/* ── Brand / Logo + Collapse toggle ── */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between min-h-[56px]">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="bg-teal-900/80 border border-teal-500/30 p-1.5 rounded-lg text-teal-400 flex items-center justify-center shrink-0">
              <AlertOctagon className="w-5 h-5 text-teal-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase truncate">LUWAS OPS</h2>
              <h1 className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
                Cebu Command <span className="inline-block w-2 h-2 rounded-full bg-teal-500 animate-pulse shrink-0" />
              </h1>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="w-full flex justify-center">
            <div className="bg-teal-900/80 border border-teal-500/30 p-1.5 rounded-lg">
              <AlertOctagon className="w-5 h-5 text-teal-400" />
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed(c => !c)}
          className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-teal-400 hover:bg-slate-800 transition-colors cursor-pointer ${collapsed ? 'absolute left-[18px] top-[62px] z-10 bg-slate-900 border border-slate-700' : ''}`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Navigation Links ── */}
      <nav className="flex-1 py-3 px-1.5 space-y-0.5 overflow-y-auto overflow-x-hidden text-xs">
        {navItems.map((item) => {
          const IconComponent = item.icon;
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
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
              }`}
            >
              <div className={`flex items-center ${collapsed ? '' : 'gap-2.5'}`}>
                <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-400' : 'text-slate-500'}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>

              {!collapsed && item.badge && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold shrink-0 ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}

              {/* Collapsed badge dot */}
              {collapsed && item.badge && (
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Bottom Emergency Actions ── */}
      <div className={`border-t border-slate-800 bg-slate-900/20 space-y-2 text-xs ${collapsed ? 'p-2' : 'p-4'}`}>
        {!collapsed && (
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">
            Pinned Emergency Actions
          </span>
        )}

        <button
          onClick={onCreateIncident}
          title={collapsed ? 'Create Incident' : undefined}
          className={`w-full bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 hover:text-white font-bold rounded-lg flex items-center transition-colors cursor-pointer ${collapsed ? 'justify-center p-2' : 'justify-center gap-1.5 py-2 px-3'}`}
        >
          <PlusCircle className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Create Incident</span>}
        </button>

        <button
          onClick={onBroadcastAlert}
          title={collapsed ? 'Broadcast Alert' : undefined}
          className={`w-full bg-teal-950/80 hover:bg-teal-900 border border-teal-800 text-teal-200 hover:text-white font-bold rounded-lg flex items-center transition-colors cursor-pointer ${collapsed ? 'justify-center p-2' : 'justify-center gap-1.5 py-2 px-3'}`}
        >
          <Megaphone className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Broadcast Alert</span>}
        </button>

        <button
          onClick={onExportReport}
          title={collapsed ? 'Situation Report' : undefined}
          className={`w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-slate-200 font-semibold rounded-lg flex items-center transition-colors cursor-pointer ${collapsed ? 'justify-center p-2' : 'justify-center gap-1.5 py-2 px-3'}`}
        >
          <Download className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Situation Report</span>}
        </button>
      </div>
    </aside>
  );
}
