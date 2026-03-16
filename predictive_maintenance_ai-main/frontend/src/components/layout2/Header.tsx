import { useEffect, useState, MouseEvent } from 'react';
import { Search, Bell, Settings as SettingsIcon } from 'lucide-react';
import MenuIcon from '@mui/icons-material/Menu';

// MUI Imports
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import PersonAdd from '@mui/icons-material/PersonAdd';
import Settings from '@mui/icons-material/Settings';
import Logout from '@mui/icons-material/Logout';

// UI Components
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { useAuth } from '../../context/AuthContext';
import { UserProfilePanel } from './UserProfilePanel';
import { api, NotificationItem } from '../../services/api';
import { stream } from '../../services/stream';

interface HeaderProps {
  onNavigate?: (page: string) => void;
  onMenuClick: () => void;
}

export function Header({ onNavigate, onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth(); // ✅ Get logout function
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);

  // --- MUI Menu State ---
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleAvatarClick = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // ✅ New Handler: Handles the Logout Logic
  const handleLogout = () => {
    handleMenuClose(); // Close the menu
    if (logout) {
        logout(); // Trigger the auth context logout
    }
  };

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const loadNotifications = async () => {
    try {
      const rows = await api.getNotifications({ recipient: user?.email, limit: 10 });
      setNotifications(rows);
    } catch {
      // Keep UI usable even if notifications endpoint is unavailable.
      setNotifications([]);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [user?.email]);

  useEffect(() => {
    stream.start();
    const unsubscribe = stream.subscribe((event) => {
      if (event.topic !== 'notification.created' && event.topic !== 'notification.updated') {
        return;
      }
      void loadNotifications();
    });

    return () => {
      unsubscribe();
    };
  }, [user?.email]);

  const formatNotificationTime = (sentAt?: string) => {
    if (!sentAt) {
      return 'just now';
    }

    const parsed = new Date(sentAt);
    if (Number.isNaN(parsed.getTime())) {
      return sentAt;
    }

    const minutes = Math.round((Date.now() - parsed.getTime()) / 60000);
    if (minutes <= 1) {
      return 'just now';
    }
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  };

  const markAsRead = async (notification: NotificationItem) => {
    if (!notification.id || notification.read) {
      return;
    }

    try {
      await api.markNotificationRead(notification.id);
      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                read: true,
              }
            : item,
        ),
      );
    } catch {
      // Keep silent to avoid disrupting navigation for transient failures.
    }
  };

  const initials = user?.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 sticky top-0 z-10">
      
      {/* Left Side: Menu Toggle + Search */}
      <div className="flex items-center flex-1 max-w-2xl gap-3">
        <Button 
            variant="ghost" 
            size="icon" 
            onClick={onMenuClick}
            className="text-slate-600 hover:bg-slate-100"
        >
            <MenuIcon /> 
        </Button>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="search"
            placeholder={`Search ${user?.plant || 'data'}...`} 
            className="pl-10"
          />
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center space-x-2">
        
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5 text-slate-600" />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <DropdownMenuItem className="text-sm text-slate-500" disabled>
                No notifications yet
              </DropdownMenuItem>
            ) : (
              notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id || `${notification.vehicle_id}-${notification.sent_at}`}
                  className="flex cursor-pointer flex-col items-start p-3"
                  onClick={() => void markAsRead(notification)}
                >
                  <div className="flex w-full items-start justify-between">
                    <p className="pr-2 text-sm font-medium text-slate-700">
                      {notification.title || notification.message || 'Notification'}
                    </p>
                    {!notification.read && <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-600" />}
                  </div>
                  {notification.message && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{notification.message}</p>
                  )}
                  <span className="mt-1 text-xs text-slate-500">{formatNotificationTime(notification.sent_at)}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Quick Settings Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onNavigate?.('settings')}
          className="relative hover:bg-slate-100 hidden md:flex"
          title="Settings"
        >
          <SettingsIcon className="w-5 h-5 text-slate-600" />
        </Button>

        {/* --- MUI ACCOUNT MENU START --- */}
        <Tooltip title="Account settings">
          <IconButton
            onClick={handleAvatarClick}
            size="small"
            sx={{ ml: 2 }}
            aria-controls={open ? 'account-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={open ? 'true' : undefined}
          >
            <Avatar 
                sx={{ 
                    width: 32, 
                    height: 32,
                    bgcolor: 'transparent',
                    color: 'inherit'
                }}
                className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold text-sm"
            >
                {initials}
            </Avatar>
          </IconButton>
        </Tooltip>
        
        <Menu
            anchorEl={anchorEl}
            id="account-menu"
            open={open}
            onClose={handleMenuClose}
            onClick={handleMenuClose}
            slotProps={{
            paper: {
                elevation: 0,
                sx: {
                overflow: 'visible',
                filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                mt: 1.5,
                '& .MuiAvatar-root': {
                    width: 32,
                    height: 32,
                    ml: -0.5,
                    mr: 1,
                },
                '&::before': {
                    content: '""',
                    display: 'block',
                    position: 'absolute',
                    top: 0,
                    right: 14,
                    width: 10,
                    height: 10,
                    bgcolor: 'background.paper',
                    transform: 'translateY(-50%) rotate(45deg)',
                    zIndex: 0,
                },
                },
            },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
            <MenuItem onClick={() => { handleMenuClose(); setProfilePanelOpen(true); }}>
                <Avatar /> Profile
            </MenuItem>
            <MenuItem onClick={handleMenuClose}>
                <Avatar /> My account
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleMenuClose}>
                <ListItemIcon>
                    <PersonAdd fontSize="small" />
                </ListItemIcon>
                Add another account
            </MenuItem>
            <MenuItem onClick={() => { handleMenuClose(); onNavigate?.('settings'); }}>
                <ListItemIcon>
                    <Settings fontSize="small" />
                </ListItemIcon>
                Settings
            </MenuItem>
            {/* ✅ FIXED: Logout Button now calls handleLogout */}
            <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                    <Logout fontSize="small" />
                </ListItemIcon>
                Logout
            </MenuItem>
        </Menu>
        {/* --- MUI ACCOUNT MENU END --- */}

      </div>

      {/* User Profile Panel (Slide-over) */}
      <UserProfilePanel
        isOpen={profilePanelOpen}
        onClose={() => setProfilePanelOpen(false)}
      />
    </header>
  );
}