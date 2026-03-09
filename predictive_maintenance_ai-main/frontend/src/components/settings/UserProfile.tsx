import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Upload } from 'lucide-react';

export function UserProfile() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg mb-1">Profile Information</h3>
        <p className="text-sm text-slate-600">Update your personal information and account details</p>
      </div>

      {/* Profile Picture */}
      <div className="flex items-center space-x-4">
        <Avatar className="w-20 h-20">
          <AvatarImage src="" />
          <AvatarFallback className="bg-blue-600 text-white text-xl">JD</AvatarFallback>
        </Avatar>
        <Button variant="outline">
          <Upload className="w-4 h-4 mr-2" />
          Upload Photo
        </Button>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="firstName">First Name</Label>
          <Input id="firstName" defaultValue="John" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="lastName">Last Name</Label>
          <Input id="lastName" defaultValue="Doe" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="email">Email Address</Label>
          <Input id="email" type="email" defaultValue="john.doe@company.com" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="phone">Phone Number</Label>
          <Input id="phone" defaultValue="+91-98765-43210" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="role">Role</Label>
          <Select defaultValue="service-manager">
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="service-manager">Service Center Manager</SelectItem>
              <SelectItem value="manufacturing-engineer">Manufacturing Engineer</SelectItem>
              <SelectItem value="system-admin">System Administrator</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="location">Primary Location</Label>
          <Select defaultValue="mumbai">
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mumbai">Mumbai, Maharashtra</SelectItem>
              <SelectItem value="delhi">Delhi NCR</SelectItem>
              <SelectItem value="bangalore">Bangalore, Karnataka</SelectItem>
              <SelectItem value="chennai">Chennai, Tamil Nadu</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Password Change */}
      <div className="pt-6 border-t">
        <h3 className="text-lg mb-4">Change Password</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input id="currentPassword" type="password" className="mt-1" />
          </div>
          <div></div>
          <div>
            <Label htmlFor="newPassword">New Password</Label>
            <Input id="newPassword" type="password" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input id="confirmPassword" type="password" className="mt-1" />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 pt-6 border-t">
        <Button variant="outline">Cancel</Button>
        <Button>Save Changes</Button>
      </div>
    </div>
  );
}
