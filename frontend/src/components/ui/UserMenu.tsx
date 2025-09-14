import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { User, Settings, LogOut, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useWorkStore } from '../../stores/useWorkStore';
import { useClickOutside } from '../../hooks/useClickOutside';

export const UserMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const { clearAll } = useWorkStore();

  useClickOutside(menuRef, () => setIsOpen(false));

  const handleLogout = async () => {
    try {
      await logout();
      // Clear all work store data to prevent cross-user contamination
      clearAll();
      // Clear React Query cache to prevent user data leakage
      queryClient.clear();
      navigate('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
    }
    setIsOpen(false);
  };

  const handleSettings = () => {
    // TODO: Navigate to settings page
    console.log('Settings clicked');
    setIsOpen(false);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-surface border border-dark-border hover:border-dark-primary transition-colors"
      >
        <div className="w-8 h-8 bg-dark-primary rounded-full flex items-center justify-center">
          <User size={16} className="text-white" />
        </div>
        <div className="flex flex-col items-start">
          <span className="text-sm font-medium text-dark-text">
            {user.first_name && user.last_name 
              ? `${user.first_name} ${user.last_name}` 
              : user.username
            }
          </span>
          <span className="text-xs text-dark-text-muted">{user.email}</span>
        </div>
        <ChevronDown size={16} className={`text-dark-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-dark-surface border border-dark-border rounded-lg shadow-xl z-50">
          <div className="p-4 border-b border-dark-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-dark-primary rounded-full flex items-center justify-center">
                <User size={18} className="text-white" />
              </div>
              <div>
                <div className="font-medium text-dark-text">
                  {user.first_name && user.last_name 
                    ? `${user.first_name} ${user.last_name}` 
                    : user.username
                  }
                </div>
                <div className="text-sm text-dark-text-muted">{user.email}</div>
              </div>
            </div>
          </div>
          
          <div className="py-2">
            <button
              onClick={handleSettings}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-dark-bg transition-colors"
            >
              <Settings size={16} className="text-dark-text-muted" />
              <span className="text-dark-text">设置</span>
            </button>
            
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-dark-bg transition-colors text-red-400"
            >
              <LogOut size={16} />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};