import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { NotificationPreferences } from './NotificationPreferences';
import { ServiceCenterConfig } from './ServiceCenterConfig';
import { SecuritySettings } from './SecuritySettings';

export function Settings() {
  const [activeTab, setActiveTab] = useState('notifications');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl mb-2">Settings & Customizations</h1>
        <p className="text-slate-600">Manage your account, preferences, and system configurations</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="service-center">Service Center</TabsTrigger>
            </TabsList>

            <TabsContent value="notifications" className="mt-6">
              <NotificationPreferences />
            </TabsContent>

            <TabsContent value="security" className="mt-6">
              <SecuritySettings />
            </TabsContent>

            <TabsContent value="service-center" className="mt-6">
              <ServiceCenterConfig />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
