import { useState, MouseEvent } from 'react';
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

  // --- Notifications State ---
  const [notifications] = useState([
    { id: 1, text: 'Diagnosis Agent identified transmission issue on VIN#12345', time: '5m ago', unread: true },
    { id: 2, text: 'Scheduling Agent optimized 12 appointments', time: '15m ago', unread: true },
    { id: 3, text: 'Security Alert: Anomalous API access blocked', time: '1h ago', unread: false },
  ]);
  const unreadCount = notifications.filter((n) => n.unread).length;

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
            {notifications.map((notification) => (
              <DropdownMenuItem key={notification.id} className="flex flex-col items-start p-3 cursor-pointer">
                <div className="flex items-start justify-between w-full">
                  <p className="text-sm pr-2 font-medium text-slate-700">{notification.text}</p>
                  {notification.unread && (
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-1 flex-shrink-0" />
                  )}
                </div>
                <span className="text-xs text-slate-500 mt-1">{notification.time}</span>
              </DropdownMenuItem>
            ))}
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