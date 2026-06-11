import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { worksApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Card, CardHeader, CardContent } from '../ui/Card';
import type { Work } from '../../types';

interface CreateWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkCreated: (work: Work) => void;
}

export const CreateWorkModal: React.FC<CreateWorkModalProps> = ({
  isOpen,
  onClose,
  onWorkCreated
}) => {
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');

  const createMutation = useMutation({
    mutationFn: (workData: { title: string; synopsis: string }) =>
      worksApi.create(workData),
    onSuccess: (response) => {
      onWorkCreated(response.data);
      setTitle('');
      setSynopsis('');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    createMutation.mutate({
      title: title.trim(),
      synopsis: synopsis.trim(),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-dark-text">创建新作品</h3>
            <button
              onClick={onClose}
              className="text-dark-text-muted hover:text-dark-text"
            >
              <X size={20} />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="作品标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入您的作品标题..."
              required
              autoFocus
            />
            <Textarea
              label="作品简介"
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="简要描述您的作品内容、背景或创作想法..."
              rows={4}
            />
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={!title.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? '创建中...' : '创建作品'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};