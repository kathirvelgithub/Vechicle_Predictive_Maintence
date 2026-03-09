import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';

const apiKeys = [
  {
    id: '1',
    name: 'Production API Key',
    key: 'pk_live_51JxY2zK3b4c5d6e7f8g9h0i1j2k3l4m',
    created: '2024-11-15',
    lastUsed: '2 hours ago',
    status: 'active',
  },
  {
    id: '2',
    name: 'Development API Key',
    key: 'pk_test_51JxY2zK3b4c5d6e7f8g9h0i1j2k3l4m',
    created: '2024-10-20',
    lastUsed: '1 day ago',
    status: 'active',
  },
  {
    id: '3',
    name: 'Legacy API Key',
    key: 'pk_old_51JxY2zK3b4c5d6e7f8g9h0i1j2k3l4m',
    created: '2024-06-10',
    lastUsed: '3 months ago',
    status: 'inactive',
  },
];

export function ApiKeyManagement() {
  const [showKey, setShowKey] = useState<string | null>(null);

  const maskKey = (key: string, id: string) => {
    if (showKey === id) {
      return key;
    }
    return key.slice(0, 12) + '•••••••••••••••••••••••••••••';
  };

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    // In a real app, show a toast notification
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg mb-1">API Key Management</h3>
          <p className="text-sm text-slate-600">
            Manage API keys for integrating with external systems and services
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Generate New Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate New API Key</DialogTitle>
              <DialogDescription>
                Create a new API key for authenticating with the OEM platform APIs
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="keyName">API Key Name</Label>
                <Input id="keyName" placeholder="e.g., Production Key" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="keyDescription">Description (Optional)</Label>
                <Input id="keyDescription" placeholder="e.g., Used for production environment" className="mt-1" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                <p className="text-amber-900">
                  ⚠️ <strong>Important:</strong> Copy and save your API key immediately after generation.
                  For security reasons, you won't be able to view it again.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Generate Key</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* API Keys Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>API Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.map((apiKey) => (
              <TableRow key={apiKey.id}>
                <TableCell>{apiKey.name}</TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                      {maskKey(apiKey.key, apiKey.id)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowKey(showKey === apiKey.id ? null : apiKey.id)}
                    >
                      {showKey === apiKey.id ? (
                        <EyeOff className="w-3 h-3" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(apiKey.key)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>{apiKey.created}</TableCell>
                <TableCell>{apiKey.lastUsed}</TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={
                      apiKey.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-700'
                    }
                  >
                    {apiKey.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* API Documentation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="mb-2">API Documentation</h4>
        <p className="text-sm text-slate-700 mb-3">
          View comprehensive API documentation for integrating with the OEM Aftersales Intelligence Platform.
        </p>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">
            View API Docs
          </Button>
          <Button variant="outline" size="sm">
            Download Postman Collection
          </Button>
        </div>
      </div>

      {/* Usage Guidelines */}
      <div className="bg-slate-50 rounded-lg p-4">
        <h4 className="mb-3">Security Best Practices</h4>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start space-x-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Never commit API keys to version control systems</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Rotate API keys regularly (recommended: every 90 days)</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Use environment-specific keys for development and production</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Immediately revoke any keys that may have been compromised</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
