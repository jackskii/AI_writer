import React, { useState } from 'react';
import { Eye, EyeOff, User, Lock, Mail } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { authApi, RegisterRequest } from '../../services/authApi';
import { useAuthStore } from '../../stores/useAuthStore';

interface RegisterFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onSwitchToLogin }) => {
  const [formData, setFormData] = useState<RegisterRequest>({
    username: '',
    email: '',
    password: '',
    password_confirm: '',
    first_name: '',
    last_name: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { login } = useAuthStore();

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      login(data.user, data.token);
      onSuccess?.();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.username && formData.email && formData.password && formData.password_confirm) {
      registerMutation.mutate(formData);
    }
  };

  const handleChange = (field: keyof RegisterRequest) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const isFormValid = formData.username && formData.email && formData.password && formData.password_confirm;
  const passwordsMatch = formData.password === formData.password_confirm;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-dark-text mb-2">创建账户</h1>
        <p className="text-dark-text-muted">开始您的 AI 写作之旅</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Username Field */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-dark-text">用户名 *</label>
          <div className="relative">
            <User size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-text-muted" />
            <Input
              type="text"
              value={formData.username}
              onChange={handleChange('username')}
              placeholder="请输入用户名"
              className="pl-10 bg-dark-surface border-dark-border"
              required
            />
          </div>
        </div>

        {/* Email Field */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-dark-text">邮箱 *</label>
          <div className="relative">
            <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-text-muted" />
            <Input
              type="email"
              value={formData.email}
              onChange={handleChange('email')}
              placeholder="请输入邮箱"
              className="pl-10 bg-dark-surface border-dark-border"
              required
            />
          </div>
        </div>

        {/* First Name Field */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-dark-text">姓名</label>
          <div className="flex gap-3">
            <Input
              type="text"
              value={formData.first_name}
              onChange={handleChange('first_name')}
              placeholder="姓"
              className="bg-dark-surface border-dark-border"
            />
            <Input
              type="text"
              value={formData.last_name}
              onChange={handleChange('last_name')}
              placeholder="名"
              className="bg-dark-surface border-dark-border"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-dark-text">密码 *</label>
          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-text-muted" />
            <Input
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange('password')}
              placeholder="请输入密码（至少6位）"
              className="pl-10 pr-10 bg-dark-surface border-dark-border"
              minLength={6}
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

        {/* Confirm Password Field */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-dark-text">确认密码 *</label>
          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-text-muted" />
            <Input
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.password_confirm}
              onChange={handleChange('password_confirm')}
              placeholder="请再次输入密码"
              className={`pl-10 pr-10 bg-dark-surface border-dark-border ${
                formData.password_confirm && !passwordsMatch ? 'border-red-500' : ''
              }`}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-dark-text-muted hover:text-dark-text"
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {formData.password_confirm && !passwordsMatch && (
            <p className="text-red-400 text-sm">密码不匹配</p>
          )}
        </div>

        {/* Error Message */}
        {registerMutation.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-red-400 text-sm">
              {registerMutation.error instanceof Error ? registerMutation.error.message : '注册失败，请检查输入信息'}
            </p>
          </div>
        )}

        {/* Register Button */}
        <Button
          type="submit"
          className="w-full bg-dark-primary hover:bg-dark-primary/90"
          disabled={registerMutation.isPending || !isFormValid || !passwordsMatch}
        >
          {registerMutation.isPending ? '注册中...' : '注册'}
        </Button>

        {/* Switch to Login */}
        <div className="text-center">
          <p className="text-dark-text-muted">
            已有账户？
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-dark-primary hover:text-dark-primary/80 ml-1 font-medium"
            >
              立即登录
            </button>
          </p>
        </div>
      </form>
    </div>
  );
};
