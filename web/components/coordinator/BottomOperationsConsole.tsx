'use client';

import React, { useState } from 'react';
import { 
  Activity, 
  Check, 
  AlertTriangle, 
  MessageSquare, 
  Clock, 
  ShieldAlert, 
  Send,
  Building,
  User,
  AlertOctagon
} from 'lucide-react';
import { FieldReport } from '@/lib/mockData';

interface BottomOperationsConsoleProps {
  reports: FieldReport[];
  activityLogs: { id: string; time: string; event: string; type: 'info' | 'warn' | 'success' | 'alert' }[];
  onConfirmReport: (id: string) => void;
  onFlagReport: (id: string) => void;
}

interface CommsMessage {
  id: string;
  sender: string;
  agency: 'NGO' | 'LGU' | 'OPS';
  text: string;
  time: string;
}

export default function BottomOperationsConsole({
  reports,
  activityLogs,
  onConfirmReport,
  onFlagReport
}: BottomOperationsConsoleProps) {
  const [activeTab, setActiveTab] = useState<'feed' | 'queue' | 'comms'>('queue');
  
  // Compact Communications state
  const [comms, setComms] = useState<CommsMessage[]>([
    { id: 'c-1', sender: 'Officer Mendoza', agency: 'OPS', text: 'Central Depot reporting 85% capacity reached on standard hygiene packs.', time: '10m ago' },
    { id: 'c-2', sender: 'Cebu CDRRMO', agency: 'LGU', text: 'LGU road clearing crews moving to Banilad area now. Road obstructions reported.', time: '18m ago' },
    { id: 'c-3', sender: 'Red Cross Cebu', agency: 'NGO', text: 'Dispatching 3 volunteer first-aid responders to Ermita evacuation center.', time: '35m ago' },
    { id: 'c-4', sender: 'PDRRMO Center', agency: 'LGU', text: 'Coastal high-tide alert issued for south Cebu coastline. Watch for tide surge.', time: '1h ago' }
  ]);
  const [newMsgText, setNewMsgText] = useState('');

  const pendingReports = reports.filter(r => r.status === 'pending');

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsgText.trim()) return;

    const newMsg: CommsMessage = {
      id: `c-${Date.now()}`,
      sender: 'Coordinator (You)',
      agency: 'OPS',
      text: newMsgText,
      time: 'Just now'
    };

    setComms(prev => [newMsg, ...prev]);
    setNewMsgText('');
  };

  return (
    <div className="h-[240px] bg-slate-950 border-t border-slate-800 flex flex-col overflow-hidden text-xs">
      {/* Console Tab Bar */}
      <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 px-4">
        <div className="flex">
          {/* Active Feed */}
          <button
            onClick={() => setActiveTab('feed')}
            className={`px-4 py-2 font-bold tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
              activeTab === 'feed' 
                ? 'border-teal-500 text-teal-400 bg-slate-950/40' 
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Live Activity Feed
          </button>

          {/* Verification Queue */}
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 font-bold tracking-wider uppercase border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'queue' 
                ? 'border-teal-500 text-teal-400 bg-slate-950/40' 
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Verification Queue
            {pendingReports.length > 0 && (
              <span className="bg-amber-950 border border-amber-800 text-amber-300 text-[10px] font-bold px-1.5 rounded-full">
                {pendingReports.length}
              </span>
            )}
          </button>

          {/* Communications Tab */}
          <button
            onClick={() => setActiveTab('comms')}
            className={`px-4 py-2 font-bold tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
              activeTab === 'comms' 
                ? 'border-teal-500 text-teal-400 bg-slate-950/40' 
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Communications
          </button>
        </div>

        {/* EOC Diagnostic telemetry */}
        <div className="text-[10px] text-slate-500 flex gap-4 font-mono select-none">
          <span>SUPABASE: CONNECTED</span>
          <span>REALTIME FEED: ACTIVE</span>
        </div>
      </div>

      {/* Tab Panel Content */}
      <div className="flex-1 overflow-y-auto bg-slate-900/10 p-3">
        {/* 1. LIVE ACTIVITY FEED */}
        {activeTab === 'feed' && (
          <div className="space-y-1.5 font-mono text-[11px]">
            {activityLogs.map((log) => {
              let textClass = 'text-slate-400';
              if (log.type === 'warn') textClass = 'text-amber-400';
              if (log.type === 'success') textClass = 'text-teal-400';
              if (log.type === 'alert') textClass = 'text-red-400';

              return (
                <div key={log.id} className="flex items-start gap-3 py-0.5 border-b border-slate-950/20">
                  <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                  <span className={textClass}>{log.event}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* 2. VERIFICATION QUEUE */}
        {activeTab === 'queue' && (
          <div className="h-full flex flex-col">
            {pendingReports.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 font-medium italic border border-dashed border-slate-800 rounded-lg">
                No reports awaiting verification in triage queue.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pendingReports.map((report) => (
                  <div 
                    key={report.id}
                    className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-lg flex flex-col justify-between hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          Report #{report.id}
                        </span>
                        <span className={`text-[9px] font-semibold px-1 rounded uppercase ${
                          report.needsSeverity === 'critical' ? 'bg-red-950 text-red-400 border border-red-800/50' :
                          'bg-amber-950 text-amber-400 border border-amber-800/40'
                        }`}>
                          {report.needsSeverity}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-300 line-clamp-2 italic mb-2 leading-relaxed">
                        "{report.rawText}"
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-[10px] text-slate-500">
                      <span>Source: <strong className="text-slate-400 uppercase">{report.source}</strong></span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onConfirmReport(report.id)}
                          className="px-2 py-0.5 bg-teal-900/60 hover:bg-teal-850 text-teal-300 border border-teal-700/60 font-bold rounded cursor-pointer flex items-center gap-0.5 transition-colors"
                        >
                          <Check className="w-3 h-3" /> Confirm
                        </button>
                        <button
                          onClick={() => onFlagReport(report.id)}
                          className="px-2 py-0.5 bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/60 font-bold rounded cursor-pointer flex items-center gap-0.5 transition-colors"
                        >
                          <AlertOctagon className="w-3 h-3" /> Flag
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. COMMUNICATIONS */}
        {activeTab === 'comms' && (
          <div className="h-full flex gap-4">
            {/* Message timelines */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {comms.map((msg) => {
                let badgeStyle = 'bg-slate-800 text-slate-300';
                if (msg.agency === 'LGU') badgeStyle = 'bg-amber-900/40 text-amber-300 border border-amber-800/30';
                if (msg.agency === 'NGO') badgeStyle = 'bg-blue-900/40 text-blue-300 border border-blue-800/30';
                if (msg.agency === 'OPS') badgeStyle = 'bg-teal-950/40 text-teal-300 border border-teal-800/30';

                return (
                  <div key={msg.id} className="bg-slate-950/80 border border-slate-800/40 p-2 rounded-lg flex items-start gap-2.5">
                    <div className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase shrink-0 mt-0.5 ${badgeStyle}`}>
                      {msg.agency}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-slate-300">{msg.sender}</span>
                        <span className="text-[9px] text-slate-500 font-mono flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" /> {msg.time}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-400 leading-normal">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick send form */}
            <form onSubmit={handleSendMessage} className="w-[260px] border-l border-slate-800 pl-4 flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">
                LGU / NGO Direct Broadcast
              </span>
              <textarea
                value={newMsgText}
                onChange={(e) => setNewMsgText(e.target.value)}
                placeholder="Type operational notice..."
                className="w-full flex-1 bg-slate-950 border border-slate-850 p-2 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 text-[10.5px] resize-none mb-2"
              />
              <button
                type="submit"
                className="w-full py-1.5 bg-teal-900 hover:bg-teal-850 border border-teal-800 text-teal-100 font-bold rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" /> Send Notice
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
