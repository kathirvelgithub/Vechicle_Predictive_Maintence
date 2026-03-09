import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';

// 1. Define what the User object looks like
export interface User {
  fullName: string;
  email?: string;
  role: string;
  plant?: string;
}

// 2. Update the Context Type to accept (token, user)
interface AuthContextType {
  user: User | null;
  // ✅ CHANGED: Now accepts two arguments
  login: (token: string, userData: User) => void; 
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // On load, check if cookie exists
    const token = Cookies.get('authToken');
    const storedUser = localStorage.getItem('userProfile');

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user data");
      }
    }
    setIsLoading(false);
  }, []);

  // 3. Update the login implementation
  const login = (token: string, userData: User) => {
    // Save Token to Cookie
    Cookies.set('authToken', token, { expires: 1, secure: false }); 
    
    // Save User Data to LocalStorage (so we remember their name/role)
    localStorage.setItem('userProfile', JSON.stringify(userData));
    
    setUser(userData);
  };

  const logout = () => {
    Cookies.remove('authToken');
    localStorage.removeItem('userProfile');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}