import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useWorkStore } from '../../stores/useWorkStore';
import { useClickOutside } from '../../hooks/useClickOutside';

interface UserMenuProps {
  iconOnly?: boolean;
}

export const UserMenu: React.FC<UserMenuProps> = ({ iconOnly = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const { clearAll } = useWorkStore();

  useClickOutside(menuRef, () => {
    setIsOpen(false);
    setShowProfile(false);
  });

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

  const handleProfile = () => {
    setShowProfile(true);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-lg bg-dark-surface border border-dark-border hover:border-dark-primary transition-colors ${
          iconOnly ? 'p-2' : 'px-3 py-2'
        }`}
      >
        <div className="w-8 h-8 bg-dark-primary rounded-full flex items-center justify-center">
          <User size={16} className="text-white" />
        </div>
        {!iconOnly && (
          <>
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
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-dark-surface border border-dark-border rounded-lg shadow-xl z-50">
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
          
          {showProfile ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-dark-text">个人信息</h4>
                <button 
                  onClick={() => setShowProfile(false)}
                  className="text-xs text-dark-primary hover:underline"
                >
                  返回
                </button>
              </div>
              <div className="space-y-3 p-3 bg-dark-bg rounded-lg border border-dashed border-dark-border">
                <p className="text-xs text-dark-text-muted text-center mb-2">
                  ⚠️ 功能开发中 (Placeholder)
                </p>
                <button className="w-full text-left px-3 py-2 text-sm text-dark-text-muted bg-dark-surface rounded hover:bg-dark-surface/80 transition-colors" disabled>
                  修改密码
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-dark-text-muted bg-dark-surface rounded hover:bg-dark-surface/80 transition-colors" disabled>
                  修改邮箱
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-dark-text-muted bg-dark-surface rounded hover:bg-dark-surface/80 transition-colors" disabled>
                  修改用户名
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-dark-text-muted bg-dark-surface rounded hover:bg-dark-surface/80 transition-colors" disabled>
                  绑定第三方账号
                </button>
              </div>
            </div>
          ) : (
            <div className="py-2">
              <button
                onClick={handleProfile}
                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-dark-bg transition-colors"
              >
                <User size={16} className="text-dark-text-muted" />
                <span className="text-dark-text">个人信息</span>
              </button>
              
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-dark-bg transition-colors text-red-400"
              >
                <LogOut size={16} />
                <span>退出登录</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};