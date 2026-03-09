import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Separator } from '../ui/separator';
import { Loader2, AlertCircle } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google'; // Import Google SDK

interface LoginProps {
  onLogin: (token: string) => void;
  onSwitchToRegister: () => void;
}

export function Login({ onLogin, onSwitchToRegister }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Logic states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Standard Email/Password Login
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:8080/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        onLogin(data.token); 
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      setError('Server error. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  // 2. Google Login Handler
  const handleGoogleSuccess = async (credentialResponse: any) => {
    setLoading(true);
    setError('');
    
    try {
      // Send the Google Token to Spring Boot
      const res = await fetch('http://localhost:8080/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      const data = await res.json();

      if (res.ok) {
        // Receive YOUR App's JWT and Log In
        onLogin(data.token);
      } else {
        setError("Google authentication failed on server");
      }
    } catch (err) {
      setError("Network Error connecting to Google Auth endpoint");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900">
        <img
          src="https://images.unsplash.com/photo-1760626301131-b12379ceaf43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBjb25uZWN0ZWQlMjB2ZWhpY2xlJTIwY2l0eXxlbnwxfHx8fDE3NjU1NDU2MjV8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
          alt="Modern connected vehicle"
          className="object-cover w-full h-full opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/40 to-purple-900/40" />
        <div className="absolute bottom-12 left-12 text-white max-w-lg">
          <h2 className="text-4xl mb-4 font-bold">Intelligent Automotive Intelligence</h2>
          <p className="text-lg opacity-90">
            AI-powered orchestration for predictive maintenance, quality insights, and autonomous service management.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">OEM Aftersales Intelligence Portal</h1>
            <p className="text-slate-600">Sign in to access your command center</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox id="remember" />
                <label htmlFor="remember" className="text-sm cursor-pointer text-slate-600">
                  Remember me
                </label>
              </div>
              <button type="button" className="text-sm text-blue-600 hover:underline">
                Forgot password?
              </button>
            </div>

            {/* Error Message Display */}
            {error && (
                <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-md text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
                </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                    </>
                ) : (
                    'Sign In'
                )}
            </Button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-slate-500">Or continue with</span>
              </div>
            </div>

            {/* Google Login Button */}
            <div className="mt-6 flex justify-center w-full">
               <GoogleLogin
                 onSuccess={handleGoogleSuccess}
                 onError={() => setError('Google Login Failed')}
                 theme="outline"
                 size="large"
                 width="100%" // Attempts to fill width, might be capped by Google's CSS
                 useOneTap // Helps with auto-popup if supported
               />
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-slate-600">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="text-blue-600 hover:underline font-medium"
              >
                Register here
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}