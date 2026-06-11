import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PenTool, Sparkles } from 'lucide-react';
import { LoginForm } from '../components/auth/LoginForm';
import { RegisterForm } from '../components/auth/RegisterForm';
import { useAuthStore } from '../stores/useAuthStore';

export const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleAuthSuccess = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-dark-bg flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden bg-gradient-to-br from-dark-primary/20 to-dark-secondary/20">
        <div className="absolute inset-0 bg-dark-surface/50" />
        <div className="relative z-10 flex flex-col justify-center px-12 py-24">
          <div className="max-w-lg">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-dark-primary rounded-lg flex items-center justify-center">
                <PenTool size={24} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-dark-text">AI 写作助手</h1>
            </div>
            
            <h2 className="text-4xl font-bold text-dark-text mb-6">
              让 AI 成为您的
              <br />
              <span className="text-dark-primary">创作伙伴</span>
            </h2>
            
            <p className="text-lg text-dark-text-muted mb-8 leading-relaxed">
              自动编辑、情节建议、章节对话... 
              专业的 AI 写作工具帮助您突破创作瓶颈，
              提升写作效率，创造精彩故事。
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-dark-primary rounded-full" />
                <span className="text-dark-text">智能文本续写与改写</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-dark-primary rounded-full" />
                <span className="text-dark-text">实时写作建议与灵感</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-dark-primary rounded-full" />
                <span className="text-dark-text">章节摘要与笔记管理</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-dark-primary rounded-full" />
                <span className="text-dark-text">世界观设定与角色档案</span>
              </div>
            </div>
          </div>
          
          {/* Decorative Elements */}
          <div className="absolute top-20 right-20 w-32 h-32 bg-dark-primary/10 rounded-full blur-xl" />
          <div className="absolute bottom-20 right-40 w-24 h-24 bg-dark-secondary/10 rounded-full blur-lg" />
          <div className="absolute top-40 right-60">
            <Sparkles size={20} className="text-dark-primary/30" />
          </div>
        </div>
      </div>

      {/* Right Side - Auth Forms */}
      <div className="flex-1 lg:max-w-md xl:max-w-lg flex items-center justify-center px-8 py-12">
        <div className="w-full">
          {isLogin ? (
            <LoginForm 
              onSuccess={handleAuthSuccess}
              onSwitchToRegister={() => setIsLogin(false)}
            />
          ) : (
            <RegisterForm 
              onSuccess={handleAuthSuccess}
              onSwitchToLogin={() => setIsLogin(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
};