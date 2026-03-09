import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';
import { Plus, Trash2 } from 'lucide-react';

export function ServiceCenterConfig() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg mb-1">Service Center Capacity Configuration</h3>
        <p className="text-sm text-slate-600">Configure service bay capacity and operating hours</p>
      </div>

      {/* Service Center Selection */}
      <div>
        <Label htmlFor="serviceCenter">Service Center</Label>
        <Select defaultValue="mumbai-central">
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mumbai-central">Mumbai Central Service Center</SelectItem>
            <SelectItem value="mumbai-west">Mumbai West Service Center</SelectItem>
            <SelectItem value="delhi-ncr">Delhi NCR Service Center</SelectItem>
            <SelectItem value="bangalore-east">Bangalore East Service Center</SelectItem>
            <SelectItem value="chennai-north">Chennai North Service Center</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Operating Hours */}
      <div>
        <h4 className="mb-4">Operating Hours</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="openTime">Opening Time</Label>
            <Input id="openTime" type="time" defaultValue="09:00" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="closeTime">Closing Time</Label>
            <Input id="closeTime" type="time" defaultValue="18:00" className="mt-1" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Service Bays */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4>Service Bays Configuration</h4>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Bay
          </Button>
        </div>
        <div className="space-y-3">
          {[
            { id: 'bay-1', name: 'Bay 1', type: 'General Service' },
            { id: 'bay-2', name: 'Bay 2', type: 'General Service' },
            { id: 'bay-3', name: 'Bay 3', type: 'Heavy Repair' },
            { id: 'bay-4', name: 'Bay 4', type: 'Express Service' },
          ].map((bay) => (
            <div key={bay.id} className="flex items-center space-x-4 p-3 border rounded-lg">
              <Input defaultValue={bay.name} className="w-32" />
              <Select defaultValue={bay.type.toLowerCase().replace(' ', '-')}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general-service">General Service</SelectItem>
                  <SelectItem value="heavy-repair">Heavy Repair</SelectItem>
                  <SelectItem value="express-service">Express Service</SelectItem>
                  <SelectItem value="diagnostics">Diagnostics Only</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="text-red-600">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Capacity Limits */}
      <div>
        <h4 className="mb-4">Daily Capacity Limits</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="maxDaily">Maximum Daily Appointments</Label>
            <Input id="maxDaily" type="number" defaultValue="180" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="buffer">Capacity Buffer (%)</Label>
            <Input id="buffer" type="number" defaultValue="10" className="mt-1" />
            <p className="text-xs text-slate-600 mt-1">Reserved capacity for urgent cases</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* AI Scheduling Settings */}
      <div>
        <h4 className="mb-4">AI Scheduling Settings</h4>
        <div className="space-y-4">
          <div>
            <Label htmlFor="autoSchedule">Auto-Scheduling Threshold</Label>
            <Select defaultValue="high">
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical Only (90%+ probability)</SelectItem>
                <SelectItem value="high">High Priority (70%+ probability)</SelectItem>
                <SelectItem value="medium">Medium Priority (50%+ probability)</SelectItem>
                <SelectItem value="all">All Predictions</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-600 mt-1">
              Minimum failure probability for automatic scheduling
            </p>
          </div>
          <div>
            <Label htmlFor="leadTime">Scheduling Lead Time (days)</Label>
            <Input id="leadTime" type="number" defaultValue="1" className="mt-1" />
            <p className="text-xs text-slate-600 mt-1">
              Minimum advance notice for scheduled appointments
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 pt-6 border-t">
        <Button variant="outline">Reset to Default</Button>
        <Button>Save Configuration</Button>
      </div>
    </div>
  );
}
