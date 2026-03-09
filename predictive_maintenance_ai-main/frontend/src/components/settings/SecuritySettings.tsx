import { useState } from 'react';
import { Lock, Shield } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';

export function SecuritySettings() {
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData(prev => ({ ...prev, [field]: value }));
    setUpdateMessage(''); // Clear message when user types
  };

  const handleUpdatePassword = async () => {
    setUpdateMessage('');
    
    // Validation
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setMessageType('error');
      setUpdateMessage('Please fill in all password fields');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setMessageType('error');
      setUpdateMessage('New password must be at least 8 characters long');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessageType('error');
      setUpdateMessage('New passwords do not match');
      return;
    }

    setIsUpdating(true);

    try {
      // Simulate API call - replace with actual API endpoint
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Store in localStorage (in production, this would be a secure API call)
      localStorage.setItem('passwordUpdated', new Date().toISOString());
      
      setMessageType('success');
      setUpdateMessage('Password updated successfully!');
      
      // Clear form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      
      setTimeout(() => setUpdateMessage(''), 4000);
    } catch (error) {
      setMessageType('error');
      setUpdateMessage('Failed to update password. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Password Section */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-slate-600" />
          Password Management
        </h3>
        <div className="space-y-4 bg-slate-50 rounded-lg p-6">
          <div>
            <Label htmlFor="currentPassword" className="text-slate-700">Current Password</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="currentPassword"
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                placeholder="Enter current password"
                className="pl-10"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="newPassword" className="text-slate-700">New Password</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="newPassword"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                placeholder="Enter new password (min 8 characters)"
                className="pl-10"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="confirmPassword" className="text-slate-700">Confirm New Password</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="confirmPassword"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                placeholder="Confirm new password"
                className="pl-10"
              />
            </div>
          </div>
          
          {/* Update Message */}
          {updateMessage && (
            <div className={`p-3 rounded-lg border-2 flex items-center gap-2 ${
              messageType === 'success' 
                ? 'bg-green-50 border-green-500 text-green-700' 
                : 'bg-red-50 border-red-500 text-red-700'
            }`}>
              {messageType === 'success' && (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              <p className="text-sm font-medium">{updateMessage}</p>
            </div>
          )}
          
          <Button 
            onClick={handleUpdatePassword}
            disabled={isUpdating}
            className="w-full disabled:opacity-50"
          >
            {isUpdating ? 'Updating Password...' : 'Update Password'}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Two-Factor Authentication */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-slate-600" />
          Two-Factor Authentication
        </h3>
        <div className="bg-slate-50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-slate-900">2FA Status</p>
              <p className="text-xs text-slate-500 mt-1">Add an extra layer of security to your account</p>
            </div>
            <Switch />
          </div>
          <Button variant="outline" className="w-full">
            Configure Two-Factor Authentication
          </Button>
        </div>
      </div>

      <Separator />

      {/* Active Sessions */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Active Sessions</h3>
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Current Device</p>
                <p className="text-xs text-slate-500 mt-1">Windows • Chrome Browser</p>
                <p className="text-xs text-slate-500">Last active: Just now</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                Active
              </span>
            </div>
          </div>
          <Button variant="outline" className="w-full text-red-600 hover:text-red-700 hover:bg-red-50">
            Revoke All Other Sessions
          </Button>
        </div>
      </div>

      <Separator />

      {/* Security Preferences */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Security Preferences</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-slate-900">Login Alerts</p>
              <p className="text-xs text-slate-500">Get notified of new login attempts</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-slate-900">Session Timeout</p>
              <p className="text-xs text-slate-500">Auto-logout after 30 minutes of inactivity</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-slate-900">Security Questions</p>
              <p className="text-xs text-slate-500">Required for account recovery</p>
            </div>
            <Switch />
          </div>
        </div>
      </div>
    </div>
  );
}
