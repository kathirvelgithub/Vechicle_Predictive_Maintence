import { useState, useEffect } from 'react';
import { X, LogOut, Mail, Phone, Building } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { useAuth } from '../../context/AuthContext';

interface UserProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfilePanel({ isOpen, onClose }: UserProfilePanelProps) {
  const { user, logout } = useAuth();
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    plant: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName || '',
        email: user.email || '',
        phone: '',
        plant: user.plant || '',
      });
    }
  }, [user]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setSaveMessage('');
    
    try {
      // Simulate API call - replace with actual API endpoint
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Store in localStorage for persistence
      const userData = {
        ...user,
        fullName: formData.fullName,
        email: formData.email,
        plant: formData.plant,
      };
      localStorage.setItem('userProfile', JSON.stringify(userData));
      
      setSaveMessage('Changes saved successfully!');
      setIsEditing(false); // Exit edit mode after successful save
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const initials = formData.fullName
    ? formData.fullName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Slide Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="bg-white border-b-2 border-slate-200 px-6 py-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 ring-2 ring-slate-200 shadow-md">
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-base font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-lg font-bold text-slate-900">{formData.fullName || 'Guest User'}</h2>
                  <p className="text-xs text-slate-600 flex items-center gap-1.5">
                    <Mail className="h-3 w-3" />
                    {formData.email || 'guest@example.com'}
                  </p>
                  <p className="text-xs text-slate-500 font-medium">
                    {user?.role || 'Viewer'} • {formData.plant || 'HQ'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-slate-600 hover:bg-slate-100 hover:text-slate-900 -mt-1 -mr-2"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-slate-50">
            <div className="px-6 py-6">
              {/* Personal Information Section */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6">
                <h3 className="text-base font-semibold text-slate-900 mb-4">Personal Information</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="fullName" className="text-slate-700 font-medium text-sm block mb-2">
                      Full Name
                    </Label>
                    <Input
                      id="fullName"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange('fullName', e.target.value)}
                      disabled={!isEditing}
                      className="h-11 bg-slate-50 border-slate-300 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-slate-700 font-medium text-sm block mb-2">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        disabled={!isEditing}
                        className="pl-10 h-11 bg-slate-50 border-slate-300 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                        placeholder="your.email@example.com"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-slate-700 font-medium text-sm block mb-2">
                      Phone Number
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        disabled={!isEditing}
                        placeholder="+1 (555) 000-0000"
                        className="pl-10 h-11 bg-slate-50 border-slate-300 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="plant" className="text-slate-700 font-medium text-sm block mb-2">
                      Plant/Location
                    </Label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="plant"
                        value={formData.plant}
                        onChange={(e) => handleInputChange('plant', e.target.value)}
                        disabled={!isEditing}
                        className="pl-10 h-11 bg-slate-50 border-slate-300 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                        placeholder="Enter location"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Role & Permissions Section */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Role & Permissions</h3>
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Role</p>
                        <p className="text-base font-bold text-slate-900">
                          {user?.role || 'Viewer'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-green-600 font-medium mb-1">Access Level</p>
                        <p className="text-base font-bold text-green-700">Full Access</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="relative mb-6">
                <div className="flex gap-3">
                  <Button 
                    onClick={() => setIsEditing(!isEditing)}
                    variant="outline"
                    className="flex-1 h-12 text-base font-semibold border-2 border-slate-300 text-slate-700 hover:bg-slate-50 transition-all"
                  >
                    {isEditing ? 'Cancel' : 'Edit'}
                  </Button>
                  <Button 
                    onClick={handleSaveChanges}
                    disabled={isSaving || !isEditing}
                    className="flex-1 h-12 text-base font-semibold shadow-sm hover:shadow-md transition-all bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
                
                {/* Success Notification */}
                {saveMessage && (
                  <div className={`absolute -top-16 left-0 right-0 mx-auto w-fit px-6 py-3 rounded-lg shadow-lg border-2 animate-in slide-in-from-top duration-300 ${
                    saveMessage.includes('success') 
                      ? 'bg-green-50 border-green-500 text-green-700' 
                      : 'bg-red-50 border-red-500 text-red-700'
                  }`}>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      {saveMessage.includes('success') && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {saveMessage}
                    </p>
                  </div>
                )}
              </div>

              {/* Account Actions */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                  Account Actions
                </h3>
                <Button
                  variant="outline"
                  className="w-full h-12 border-2 border-red-300 text-red-600 hover:bg-red-600 hover:text-white font-semibold transition-all"
                  onClick={logout}
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
