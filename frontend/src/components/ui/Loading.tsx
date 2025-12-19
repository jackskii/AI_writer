import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className={`spinner ${sizeClasses[size]} ${className}`}></div>
  );
};

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = '正在加载...'
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-dark-bg">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-dark-text-muted">{message}</p>
    </div>
  );
};

interface LoadingButtonProps {
  isLoading: boolean;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  isLoading,
  children,
  className = '',
  onClick,
  disabled = false,
  variant = 'primary'
}) => {
  const variantClasses = variant === 'outline'
    ? 'bg-transparent border border-dark-border text-dark-text hover:bg-dark-surface'
    : 'bg-dark-primary text-white hover:bg-blue-600';

  return (
    <button
      className={`inline-flex items-center justify-center px-4 py-2 rounded-lg focus-ring disabled:opacity-50 ${variantClasses} ${className}`}
      disabled={isLoading || disabled}
      onClick={onClick}
    >
      {isLoading && <LoadingSpinner size="sm" className="mr-2" />}
      {children}
    </button>
  );
};