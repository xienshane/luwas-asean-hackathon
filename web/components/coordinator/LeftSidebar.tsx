'use client';

import React from 'react';
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
  AlertOctagon
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
  // Navigation links definition
  const navItems = [
    { id: 'overview', label: 'Overview', icon: Activity, badge: highPriorityCount > 0 ? `${highPriorityCount} Risk` : null, badgeColor: 'bg-red-900/60 text-red-200 border-red-800' },
    { id: 'map', label: 'Live Map', icon: Map },
    { id: 'reports', label: 'Field Reports', icon: FileText, badge: reportsCount > 0 ? `${reportsCount}` : null, badgeColor: 'bg-amber-900/60 text-amber-200 border-amber-800' },
    { id: 'volunteers', label: 'Volunteers', icon: Users },
    { id: 'teams', label: 'Teams', icon: Truck },
    { id: 'manifests', label: 'Supply Manifests', icon: Package },
    { id: 'routes', label: 'Routes', icon: Navigation },
    { id: 'predictions', label: 'Impact Predictions', icon: Cpu },
    { id: 'roads', label: 'Road Network', icon: Compass },
    { id: 'comms', label: 'Communications', icon: Radio },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-[280px] h-full bg-slate-950 border-r border-slate-800 flex flex-col justify-between select-none">
      {/* Brand / Logo */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2">
          <div className="bg-teal-900/80 border border-teal-500/30 p-1.5 rounded-lg text-teal-400 flex items-center justify-center">
            <AlertOctagon className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">LUWAS OPS</h2>
            <h1 className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
              Cebu Command <span className="inline-block w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            </h1>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto text-xs">
        {navItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-colors cursor-pointer ${
                isActive 
                  ? 'bg-slate-900 text-teal-400 border border-slate-800 font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <IconComponent className={`w-4.5 h-4.5 ${isActive ? 'text-teal-400' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Emergency Operations */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/20 space-y-2 text-xs">
        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">
          Pinned Emergency Actions
        </span>
        
        <button
          onClick={onCreateIncident}
          className="w-full py-2 px-3 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 hover:text-white font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Create Incident</span>
        </button>

        <button
          onClick={onBroadcastAlert}
          className="w-full py-2 px-3 bg-teal-950/80 hover:bg-teal-900 border border-teal-800 text-teal-200 hover:text-white font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Megaphone className="w-4 h-4" />
          <span>Broadcast Alert</span>
        </button>

        <button
          onClick={onExportReport}
          className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-slate-200 font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Situation Report</span>
        </button>
      </div>
    </aside>
  );
}
