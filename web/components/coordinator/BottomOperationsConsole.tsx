'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, ChevronDown } from 'lucide-react';
import { Timeline } from './ui';
import type { TimelineItem, Tone } from './ui';

interface BottomOperationsConsoleProps {
  activityLogs: { id: string; time: string; event: string; type: 'info' | 'warn' | 'success' | 'alert' }[];
  initialHeight?: number;
  minHeight?: number;
  maxHeight?: number;
}

interface CommsMessage {
  id: string;
  sender: string;
  agency: 'NGO' | 'LGU' | 'OPS';
  text: string;
  time: string;
}

const LOG_TONE: Record<string, Tone> = {
  info: 'neutral',
  warn: 'warning',
  success: 'active',
  alert: 'critical',
};

export default function BottomOperationsConsole({
  activityLogs,
  initialHeight = 240,
  minHeight = 160,
  maxHeight = 560,
}: BottomOperationsConsoleProps) {
  const [activeTab, setActiveTab] = useState<'feed' | 'comms'>('feed');
  const [height, setHeight] = useState(initialHeight);
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const dragStartY = useRef(0);
  const startHeight = useRef(0);

  const [comms, setComms] = useState<CommsMessage[]>([
    { id: 'c-1', sender: 'Officer Mendoza', agency: 'OPS', text: 'Central Depot reporting 85% capacity on standard hygiene packs.', time: '10m ago' },
    { id: 'c-2', sender: 'Cebu CDRRMO', agency: 'LGU', text: 'Road clearing crews moving to Banilad area now.', time: '18m ago' },
    { id: 'c-3', sender: 'Red Cross Cebu', agency: 'NGO', text: 'Dispatching 3 first-aid responders to Ermita evacuation center.', time: '35m ago' },
    { id: 'c-4', sender: 'PDRRMO Center', agency: 'LGU', text: 'Coastal high-tide alert issued for south Cebu coastline.', time: '1h ago' },
  ]);
  const [newMsgText, setNewMsgText] = useState('');

  const feedItems: TimelineItem[] = activityLogs.map((log) => ({
    id: log.id,
    time: log.time,
    tone: LOG_TONE[log.type] ?? 'neutral',
    text: log.event,
  }));

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsgText.trim()) return;
    setComms((prev) => [
      { id: `c-${Date.now()}`, sender: 'Coordinator (You)', agency: 'OPS', text: newMsgText, time: 'Just now' },
      ...prev,
    ]);
    setNewMsgText('');
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    startHeight.current = height;
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const next = startHeight.current + (dragStartY.current - e.clientY);
      setHeight(Math.min(maxHeight, Math.max(minHeight, next)));
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, maxHeight, minHeight]);

  const toggleCollapse = () => setIsCollapsed((c) => !c);

  const tabs: { id: 'feed' | 'comms'; label: string }[] = [
    { id: 'feed', label: 'Activity' },
    { id: 'comms', label: 'Comms' },
  ];

  return (
    <div
      className="bg-surface border-t border-line flex flex-col overflow-hidden"
      style={isCollapsed ? undefined : { height: `${height}px` }}
    >
      {/* Resize handle — only meaningful while expanded */}
      {!isCollapsed && (
        <div className="h-1.5 bg-line hover:bg-muted/40 cursor-row-resize transition-colors duration-100" onMouseDown={handleMouseDown} />
      )}

      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-line pr-2">
        <div className="flex text-[13px]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id);
                if (isCollapsed) setIsCollapsed(false);
              }}
              className={`px-4 py-2 border-b-2 transition-colors duration-100 cursor-pointer ${
                activeTab === t.id ? 'border-fg/50 text-fg' : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleCollapse}
          title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          className="p-1.5 text-muted hover:text-fg hover:bg-raised rounded-control transition-colors duration-100 cursor-pointer"
        >
          <ChevronDown
            className="w-4 h-4 transition-transform duration-100"
            style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>
      </div>

      {/* Panel body — hidden when collapsed so only the tab-bar strip remains */}
      {!isCollapsed && (
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'feed' && <div className="py-1.5">{feedItems.length > 0 ? <Timeline items={feedItems} /> : <Empty>No activity yet.</Empty>}</div>}

        {activeTab === 'comms' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              {comms.map((msg) => (
                <div key={msg.id} className="flex items-start gap-3 px-4 py-2 border-b border-line">
                  <span className="text-[11px] text-muted font-mono shrink-0 w-9 pt-0.5">{msg.agency}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-fg">{msg.sender}</span>
                      <span className="text-[12px] text-muted font-mono tabular-nums">{msg.time}</span>
                    </div>
                    <p className="text-[13px] text-muted leading-snug">{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendMessage} className="shrink-0 flex items-center gap-2 border-t border-line p-2">
              <input
                value={newMsgText}
                onChange={(e) => setNewMsgText(e.target.value)}
                placeholder="Send an operational notice…"
                className="flex-1 bg-bg border border-line rounded-control px-3 py-1.5 text-[13px] text-fg placeholder:text-muted focus:outline-none focus:border-muted"
              />
              <button
                type="submit"
                className="px-3 py-1.5 border border-line text-fg hover:bg-raised rounded-control text-[13px] flex items-center gap-1.5 transition-colors duration-100 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            </form>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center h-full text-[13px] text-muted">{children}</div>;
}
