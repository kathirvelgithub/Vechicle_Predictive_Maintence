import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext'; // <--- Import Context

// --- Components ---
import { Login } from './components/auth/Login';
import { Register } from './components/auth/Register';
import { DashboardLayout } from './components/layout2/DashboardLayout';

// --- Pages ---
import { MasterDashboard } from './components/dashboard/MasterDashboard';
import { VehicleHealth } from './components/vehicle-health/VehicleHealth';
import { Scheduling } from './components/scheduling/Scheduling';
import { Manufacturing } from './components/manufacturing/Manufacturing';
import { Security } from './components/security/Security';
import { Settings } from './components/settings/Settings';

// Inner component to handle logic (since it needs access to useAuth)
function AppContent() {
  const { token, login, logout, isLoading } = useAuth(); // <--- Use Global Auth State
  
  const [currentScreen, setCurrentScreen] = useState<'login' | 'register'>('login');
  const [currentPage, setCurrentPage] = useState<string>('dashboard');

  // 1. Loading State (prevents flickering)
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // 2. Not Authenticated? Show Login or Register
  if (!token) {
    if (currentScreen === 'register') {
      return (
        <Register 
            onRegister={login} // Pass the context's login function
            onSwitchToLogin={() => setCurrentScreen('login')} 
        />
      );
    }
    return (
      <Login 
          onLogin={login} // Pass the context's login function
          onSwitchToRegister={() => setCurrentScreen('register')} 
      />
    );
  }

  // 3. Authenticated? Show Dashboard Layout
  const handleNavigate = (page: string) => {
    if (page === 'logout') {
      logout(); // Call context's logout
      setCurrentScreen('login');
      setCurrentPage('dashboard');
    } else {
      setCurrentPage(page);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <MasterDashboard />;
      case 'vehicle-health':
        return <VehicleHealth />;
      case 'scheduling':
        return <Scheduling />;
      case 'manufacturing':
        return <Manufacturing />;
      case 'security':
        return <Security />;
      case 'settings':
        return <Settings />;
      default:
        return <MasterDashboard />;
    }
  };

  return (
    <DashboardLayout currentPage={currentPage} onNavigate={handleNavigate}>
      {renderPage()}
    </DashboardLayout>
  );
}

// Wrap the main App component with the Provider
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
} 