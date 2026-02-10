import React, { useState } from 'react';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { authApi } from '../../services/authApi';
import type { LoginRequest } from '../../services/authApi';
import { useAuthStore } from '../../stores/useAuthStore';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onSwitchToRegister }) => {
  const [formData, setFormData] = useState<LoginRequest>({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  const { login } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      login(data.user, data.token);
      onSuccess?.();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.username && formData.password) {
      loginMutation.mutate(formData);
    }
  };

  const handleChange = (field: keyof LoginRequest) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-dark-text mb-2">欢迎回来</h1>
        <p className="text-dark-text-muted">登录您的 AI 写作助手账户</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Username Field */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-dark-text">用户名</label>
          <div className="relative">
            <User size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-text-muted" />
            <Input
              type="text"
              inputMode="email"
              value={formData.username}
              onChange={handleChange('username')}
              placeholder="请输入用户名"
              className="pl-10 bg-dark-surface border-dark-border"
              required
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-dark-text">密码</label>
          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-text-muted" />
            <Input
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange('password')}
              placeholder="请输入密码"
              className="pl-10 pr-10 bg-dark-surface border-dark-border"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-dark-text-muted hover:text-dark-text"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {loginMutation.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-red-400 text-sm">
              {loginMutation.error instanceof Error ? loginMutation.error.message : '登录失败，请检查用户名和密码'}
            </p>
          </div>
        )}

        {/* Login Button */}
        <Button
          type="submit"
          className="w-full bg-dark-primary hover:bg-dark-primary/90"
          disabled={loginMutation.isPending || !formData.username || !formData.password}
        >
          {loginMutation.isPending ? '登录中...' : '登录'}
        </Button>

        {/* Switch to Register */}
        <div className="text-center">
          <p className="text-dark-text-muted">
            还没有账户？
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-dark-primary hover:text-dark-primary/80 ml-1 font-medium"
            >
              立即注册
            </button>
          </p>
        </div>
      </form>
    </div>
  );
};
