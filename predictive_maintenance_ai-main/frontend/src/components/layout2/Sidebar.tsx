import * as React from 'react';
import Drawer from '@mui/material/Drawer';
import { cn } from '../ui/utils';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Master Dashboard' },
  { id: 'vehicle-health', label: 'Vehicle Health & Predictive' },
  { id: 'scheduling', label: 'Service Scheduling' },
  { id: 'manufacturing', label: 'Manufacturing Insights' },
  { id: 'security', label: 'Security & UEBA' },
];

export function Sidebar({ currentPage, onNavigate, isOpen, onClose }: SidebarProps) {
  
  const DrawerList = (
    <div 
      className="w-80 bg-white flex flex-col h-full" 
      role="presentation"
    >
      {/* Logo Section (Icon removed) */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center">
          <div>
            <h1 className="text-lg font-bold text-slate-900">PredictAI</h1>
            <p className="text-xs text-slate-500">Platform v2.5</p>
          </div>
        </div>
      </div>

      {/* Navigation (Icons removed) */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                // onClose(); 
              }}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200',
                isActive
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25 scale-[1.02]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:translate-x-1'
              )}
            >
              <div className="flex items-center">
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Agent Status Indicator */}
      <div className="p-4 border-t border-slate-200 mt-auto">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50" />
            <span className="text-xs font-semibold text-slate-700">System Status</span>
          </div>
          <p className="text-xs text-green-700 font-medium">All agents operational</p>
        </div>
      </div>

      {/* Footer branding */}
      <div className="p-4 border-t border-slate-200">
        <p className="text-xs text-center text-slate-400">© 2025 PredictAI</p>
      </div>
    </div>
  );

  return (
    <Drawer
      anchor="left"
      open={isOpen}
      onClose={onClose}
    >
      {DrawerList}
    </Drawer>
  );
}