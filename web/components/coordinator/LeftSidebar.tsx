'use client';

import React, { useState } from 'react';
import {
  Map,
  FileText,
  Truck,
  Package,
  RotateCcw,
  PanelLeftOpen,
  PanelLeftClose,
  LogOut,
  User,
  CloudLightning,
} from 'lucide-react';
import Image from 'next/image';
import { StatusDot } from './ui';
import type { Tone } from './ui';

interface LeftSidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  reportsCount: number;
  highPriorityCount: number;
  onReset: () => void;
  onRunDay0?: () => void;
  day0Running?: boolean;
  online?: boolean;
  onLogout?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  count: number;
  tone: Tone;
}

export default function LeftSidebar({
  currentView,
  onViewChange,
  reportsCount,
  highPriorityCount,
  onReset,
  onRunDay0,
  day0Running,
  online = true,
  onLogout,
}: LeftSidebarProps) {
  // Icon rail by default — the map is the product; chrome stays out of the way.
  const [collapsed, setCollapsed] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const navItems: NavItem[] = [
    { id: 'map', label: 'Live Map', icon: Map, count: highPriorityCount, tone: 'critical' },
    { id: 'reports', label: 'Field Reports', icon: FileText, count: reportsCount, tone: 'warning' },
    { id: 'teams', label: 'Teams & Dispatch', icon: Truck, count: 0, tone: 'neutral' },
    { id: 'manifests', label: 'Supply Manifests', icon: Package, count: 0, tone: 'neutral' },
  ];

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    if (onLogout) {
      onLogout();
    } else if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      sessionStorage.clear();
      window.location.href = '/';
    }
  };

  return (
    <>
      <aside
        className="h-full bg-surface border-r border-line flex flex-col justify-between select-none shrink-0 overflow-hidden transition-[width] duration-150 ease-out"
        style={{ width: collapsed ? '56px' : '232px' }}
      >
        {/* Brand header */}
        <div
          className={`px-3 border-b border-line flex items-center ${
            collapsed ? 'flex-col gap-3 py-3' : 'justify-between h-14'
          }`}
        >
          {collapsed ? (
            <Image src="/LUWAS_logo.png" alt="LUWAS" width={32} height={32} className="w-8 h-8 object-contain" priority />
          ) : (
            <Image src="/LUWAS_font.png" alt="LUWAS" width={108} height={28} className="h-7 w-auto object-contain" priority />
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="shrink-0 w-7 h-7 rounded-control flex items-center justify-center text-muted hover:text-fg hover:bg-raised transition-colors duration-100 cursor-pointer"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => onViewChange(item.id)}
                title={collapsed ? item.label : undefined}
                className={`relative w-full flex items-center rounded-control text-[14px] transition-colors duration-100 cursor-pointer ${
                  collapsed ? 'justify-center py-2.5' : 'gap-2.5 px-2.5 py-2'
                } ${
                  isActive
                    ? 'bg-raised text-fg font-medium'
                    : 'text-muted hover:text-fg hover:bg-raised/40'
                }`}
              >
                {isActive && <span aria-hidden className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-fg/50" />}
                <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-fg' : 'text-muted'}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {item.count > 0 &&
                  (collapsed ? (
                    <span className="absolute top-1.5 right-1.5">
                      <StatusDot tone={item.tone} />
                    </span>
                  ) : (
                    <span className="ml-auto flex items-center gap-1.5 text-[13px] text-muted tabular-nums">
                      <StatusDot tone={item.tone} />
                      {item.count}
                    </span>
                  ))}
              </button>
            );
          })}
        </nav>

        {/* Bottom: emergency action + profile + logout */}
        <div className="border-t border-line p-2 space-y-2">
          {onRunDay0 && (
            <button
              onClick={onRunDay0}
              disabled={day0Running || !online}
              title={
                online
                  ? 'Run Day 0 Predictions — forecast impact before any field report'
                  : 'Offline — reconnect to run AI forecasting'
              }
              className={`w-full flex items-center rounded-control border border-active/30 text-active hover:bg-active/10 transition-colors duration-100 cursor-pointer disabled:opacity-50 disabled:cursor-default ${
                collapsed ? 'justify-center py-2.5' : 'gap-2 px-2.5 py-2 text-[13px] font-medium'
              }`}
            >
              <CloudLightning className={`w-[18px] h-[18px] shrink-0 ${day0Running ? 'animate-pulse' : ''}`} />
              {!collapsed && <span>{day0Running ? 'Forecasting…' : 'Run Day 0'}</span>}
            </button>
          )}
          <button
            onClick={onReset}
            title="Reset to scratch"
            className={`w-full flex items-center rounded-control border border-critical/30 text-critical hover:bg-critical/10 transition-colors duration-100 cursor-pointer ${
              collapsed ? 'justify-center py-2.5' : 'gap-2 px-2.5 py-2 text-[13px] font-medium'
            }`}
          >
            <RotateCcw className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && <span>Reset</span>}
          </button>

          {!collapsed && (
            <div className="flex items-center gap-2 px-1 py-1">
              <div className="bg-raised rounded-full p-1.5 shrink-0">
                <User className="w-4 h-4 text-muted" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] text-fg truncate">Operations Officer</p>
                <p className="text-[12px] text-muted truncate">cebu.cdrrmo@luwas.gov.ph</p>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowLogoutConfirm(true)}
            title="Sign out"
            className={`w-full flex items-center rounded-control text-muted hover:text-fg hover:bg-raised transition-colors duration-100 cursor-pointer ${
              collapsed ? 'justify-center py-2.5' : 'gap-2 px-2.5 py-2 text-[13px]'
            }`}
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface border border-line rounded-card max-w-md w-full mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h3 className="text-[17px] font-medium text-fg">Sign out</h3>
              <p className="text-[13px] text-muted mt-1">You&apos;ll need to sign in again to access the command center.</p>
            </div>
            <div className="px-5 py-4 text-[14px] text-muted">
              Any unsaved changes will be lost.
            </div>
            <div className="px-5 py-4 border-t border-line flex gap-2 justify-end">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-[13px] text-muted hover:text-fg border border-line rounded-control transition-colors duration-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLogout}
                className="px-4 py-2 text-[13px] font-medium text-critical bg-critical/10 hover:bg-critical/20 border border-critical/30 rounded-control transition-colors duration-100 cursor-pointer flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
