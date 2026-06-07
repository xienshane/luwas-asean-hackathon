'use client';

import React, { useState } from 'react';
import {
  Map,
  FileText,
  Truck,
  Package,
  AlertOctagon,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User
} from 'lucide-react';
import Image from 'next/image';

interface LeftSidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  reportsCount: number;
  highPriorityCount: number;
  onCreateIncident: () => void;
  onLogout?: () => void; // Optional logout handler
}

export default function LeftSidebar({
  currentView,
  onViewChange,
  reportsCount,
  highPriorityCount,
  onCreateIncident,
  onLogout
}: LeftSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    if (onLogout) {
      onLogout();
    } else {
      // Default logout behavior - can be customized
      if (typeof window !== 'undefined') {
        // Clear any stored auth data
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        sessionStorage.clear();
        
        // Redirect to login page or refresh
        window.location.href = '/login';
      }
    }
  };

  const handleCancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  return (
    <>
      <aside
        className="h-full bg-slate-950 border-r border-slate-800 flex flex-col justify-between select-none shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ width: collapsed ? '56px' : '260px' }}
      >
 {/* Brand header */}
<div className={`p-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between ${collapsed ? 'min-h-[80px]' : 'min-h-[56px]'}`}>
  {!collapsed ? (
    <>
      <div className="flex items-center overflow-hidden flex-1">
        <div className="min-w-0 flex-1">
          <Image
            src="/LUWAS_font.png"
            alt="LUWAS"
            width={120}
            height={32}
            className="h-8 w-auto object-contain"
            priority
          />
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
    <div className="w-full flex flex-col items-center gap-3">
      <Image
        src="/LUWAS_logo.png"
        alt="LUWAS"
        width={40}
        height={40}
        className="w-10 h-10 object-contain"
        priority
      />
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

        {/* Bottom Section - Emergency Actions above, Profile and Logout below */}
        <div className="border-t border-slate-800">
          {!collapsed ? (
            <>
              {/* Emergency Actions */}
              <div className="p-3 bg-slate-900/20 space-y-1.5 text-xs">
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

              {/* User Profile Section */}
              <div className="p-3 bg-slate-900/20 border-t border-slate-800">
                <div className="flex items-center gap-2 mb-3">
                  <div className="bg-slate-800 rounded-full p-1.5">
                    <User className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate">Operations Officer</p>
                    <p className="text-[9px] text-slate-500 truncate">cebu.cdrrmo@luwas.gov.ph</p>
                  </div>
                </div>
              </div>

              {/* Logout Button - Below Profile */}
              <div className="px-3 pb-3">
                <button
                  onClick={handleLogoutClick}
                  className="w-full py-2 px-3 bg-slate-800 hover:bg-red-900/80 border border-slate-700 hover:border-red-800 text-slate-300 hover:text-red-200 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer group"
                >
                  <LogOut className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                  <span>Logout</span>
                </button>
              </div>
            </>
          ) : (
            <div className="p-2 space-y-2">
              {/* Create Incident Button - Collapsed */}
              <button
                onClick={onCreateIncident}
                title="Create Incident"
                className="w-full p-2 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
              >
                <AlertOctagon className="w-4 h-4" />
              </button>
              
              {/* Logout Button - Collapsed */}
              <button
                onClick={handleLogoutClick}
                title="Logout"
                className="w-full p-2 bg-slate-800 hover:bg-red-900/80 border border-slate-700 hover:border-red-800 text-slate-300 hover:text-red-200 rounded-lg flex items-center justify-center transition-all cursor-pointer group"
              >
                <LogOut className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="bg-red-950/80 p-2 rounded-full">
                  <LogOut className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">Confirm Logout</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Are you sure you want to sign out?</p>
                </div>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="p-4 text-sm text-slate-300">
              <p>You will need to sign in again to access the command center.</p>
              <p className="text-xs text-slate-500 mt-2">Any unsaved changes will be lost.</p>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/30 flex gap-3 justify-end">
              <button
                onClick={handleCancelLogout}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLogout}
                className="px-4 py-2 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}