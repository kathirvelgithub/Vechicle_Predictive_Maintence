import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import { Bell, Mail, Smartphone, AlertCircle, Check } from 'lucide-react';

const defaultNotificationSettings = [
  {
    category: 'AI Agent Activity',
    settings: [
      { id: 'agent-anomaly', label: 'Security anomaly detected', description: 'Alert when UEBA detects unusual agent behavior', enabled: true },
      { id: 'agent-action', label: 'Autonomous agent actions', description: 'Notify when agents schedule appointments or contact customers', enabled: true },
      { id: 'agent-error', label: 'Agent errors and failures', description: 'Alert when agents encounter errors', enabled: true },
    ],
  },
  {
    category: 'Vehicle Health',
    settings: [
      { id: 'health-critical', label: 'Critical failure predictions', description: 'Immediate alerts for high-probability failures', enabled: true },
      { id: 'health-warning', label: 'Warning-level predictions', description: 'Moderate-risk failure predictions', enabled: true },
      { id: 'health-summary', label: 'Daily fleet health summary', description: 'Daily digest of fleet health status', enabled: false },
    ],
  },
  {
    category: 'Service Scheduling',
    settings: [
      { id: 'schedule-capacity', label: 'Capacity alerts', description: 'Alert when demand exceeds service center capacity', enabled: true },
      { id: 'schedule-conflict', label: 'Scheduling conflicts', description: 'Notify when manual review is needed', enabled: true },
      { id: 'schedule-summary', label: 'Weekly scheduling summary', description: 'Weekly report of scheduling performance', enabled: true },
    ],
  },
  {
    category: 'Manufacturing Quality',
    settings: [
      { id: 'mfg-critical', label: 'Critical CAPA alerts', description: 'Immediate alerts for critical quality issues', enabled: true },
      { id: 'mfg-insights', label: 'New AI insights available', description: 'Notify when AI generates new RCA insights', enabled: true },
      { id: 'mfg-report', label: 'Monthly quality reports', description: 'Monthly manufacturing quality summary', enabled: false },
    ],
  },
];

export function NotificationPreferences() {
  // Channel states
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState(defaultNotificationSettings);
  
  // UI states
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load saved preferences from localStorage on mount
  useEffect(() => {
    const savedPreferences = localStorage.getItem('notificationPreferences');
    if (savedPreferences) {
      try {
        const parsed = JSON.parse(savedPreferences);
        setEmailEnabled(parsed.emailEnabled ?? true);
        setSmsEnabled(parsed.smsEnabled ?? true);
        setInAppEnabled(parsed.inAppEnabled ?? true);
        setNotificationSettings(parsed.settings ?? defaultNotificationSettings);
      } catch (error) {
        console.error('Failed to load notification preferences:', error);
      }
    }
  }, []);

  // Mark as changed when any setting updates
  useEffect(() => {
    setHasChanges(true);
    setSaveSuccess(false);
  }, [emailEnabled, smsEnabled, inAppEnabled, notificationSettings]);

  // Handle individual notification toggle
  const handleNotificationToggle = (categoryIndex: number, settingId: string, checked: boolean) => {
    setNotificationSettings(prev => {
      const updated = [...prev];
      const setting = updated[categoryIndex].settings.find(s => s.id === settingId);
      if (setting) {
        setting.enabled = checked;
      }
      return updated;
    });
  };

  // Save preferences
  const handleSave = async () => {
    setIsSaving(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Save to localStorage
    const preferences = {
      emailEnabled,
      smsEnabled,
      inAppEnabled,
      settings: notificationSettings,
    };
    localStorage.setItem('notificationPreferences', JSON.stringify(preferences));
    
    setIsSaving(false);
    setSaveSuccess(true);
    setHasChanges(false);
    
    // Hide success message after 3 seconds
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Reset to default
  const handleReset = () => {
    setEmailEnabled(true);
    setSmsEnabled(true);
    setInAppEnabled(true);
    setNotificationSettings(JSON.parse(JSON.stringify(defaultNotificationSettings)));
    localStorage.removeItem('notificationPreferences');
    setSaveSuccess(false);
    setHasChanges(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg mb-1 flex items-center gap-2">
          <Bell className="h-5 w-5 text-slate-600" />
          Notification Preferences
        </h3>
        <p className="text-sm text-slate-600">Configure how and when you receive notifications</p>
      </div>

      {/* Success Message */}
      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 flex items-center gap-3 animate-in fade-in duration-300">
          <Check className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">Preferences saved successfully!</p>
            <p className="text-sm text-green-700">Your notification settings have been updated.</p>
          </div>
        </div>
      )}

      {/* Notification Channels */}
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <h4 className="mb-3 font-semibold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-slate-600" />
          Notification Channels
        </h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-white rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-slate-600" />
              <div>
                <Label className="font-medium">Email Notifications</Label>
                <p className="text-sm text-slate-600">Receive notifications via email</p>
              </div>
            </div>
            <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
          </div>
          <div className="flex items-center justify-between p-3 bg-white rounded-lg">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-slate-600" />
              <div>
                <Label className="font-medium">SMS Notifications</Label>
                <p className="text-sm text-slate-600">Receive critical alerts via SMS</p>
              </div>
            </div>
            <Switch checked={smsEnabled} onCheckedChange={setSmsEnabled} />
          </div>
          <div className="flex items-center justify-between p-3 bg-white rounded-lg">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-slate-600" />
              <div>
                <Label className="font-medium">In-App Notifications</Label>
                <p className="text-sm text-slate-600">Show notifications in the application</p>
              </div>
            </div>
            <Switch checked={inAppEnabled} onCheckedChange={setInAppEnabled} />
          </div>
        </div>
      </div>

      {/* Notification Categories */}
      {notificationSettings.map((category, categoryIndex) => (
        <div key={categoryIndex}>
          <h4 className="mb-4 font-semibold text-slate-900">{category.category}</h4>
          <div className="space-y-4">
            {category.settings.map((setting) => (
              <div key={setting.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                <div className="flex-1">
                  <Label className="font-medium cursor-pointer">{setting.label}</Label>
                  <p className="text-sm text-slate-600">{setting.description}</p>
                </div>
                <Switch 
                  checked={setting.enabled} 
                  onCheckedChange={(checked) => handleNotificationToggle(categoryIndex, setting.id, checked)}
                />
              </div>
            ))}
          </div>
          {categoryIndex < notificationSettings.length - 1 && <Separator className="mt-6" />}
        </div>
      ))}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6 border-t">
        <div className="text-sm text-slate-600">
          {hasChanges && !saveSuccess && (
            <span className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-4 w-4" />
              You have unsaved changes
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            Reset to Default
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </div>
    </div>
  );
}
