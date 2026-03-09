import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Footer } from './Footer';

interface DashboardLayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function DashboardLayout({ children, currentPage, onNavigate }: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-700 via-slate-800 to-gray-900">
      
      {/* Sidebar Drawer */}
      <Sidebar 
        currentPage={currentPage} 
        onNavigate={onNavigate} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* ✅ CHANGED: Connected onMenuClick to open the sidebar */}
        <Header 
          onNavigate={onNavigate} 
          onMenuClick={() => setIsSidebarOpen(true)} 
        />
        
        {/* The main content area where children are rendered */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
        
        <Footer />
      </div>
    </div>
  );
}