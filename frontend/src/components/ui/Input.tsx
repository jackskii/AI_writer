import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className = '',
  ...props
}) => {
  return (
    <div className="flex flex-col">
      {label && (
        <label className="text-sm font-medium text-dark-text mb-2">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-3 py-2 bg-dark-surface border border-dark-border rounded-lg
          text-dark-text placeholder-dark-text-muted
          focus-ring focus:border-dark-primary
          ${error ? 'border-red-500' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <span className="text-red-500 text-xs mt-1">{error}</span>
      )}
    </div>
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  className = '',
  ...props
}) => {
  return (
    <div className="flex flex-col">
      {label && (
        <label className="text-sm font-medium text-dark-text mb-2">
          {label}
        </label>
      )}
      <textarea
        className={`
          w-full px-3 py-2 bg-dark-surface border border-dark-border rounded-lg
          text-dark-text placeholder-dark-text-muted
          focus-ring focus:border-dark-primary
          resize-vertical
          ${error ? 'border-red-500' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <span className="text-red-500 text-xs mt-1">{error}</span>
      )}
    </div>
  );
};