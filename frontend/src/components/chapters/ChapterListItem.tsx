import React, { useState } from 'react';
import { Trash2, FileText } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Chapter } from '../../types';

interface ChapterListItemProps {
  chapter: Chapter;
  onClick: () => void;
  onDelete: () => void;
  onSummary: () => void;
}

export const ChapterListItem: React.FC<ChapterListItemProps> = ({
  chapter,
  onClick,
  onDelete,
  onSummary
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { 
      month: 'numeric', 
      day: 'numeric' 
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  const handleSummary = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSummary();
  };

  return (
    <div
      className={`
        group flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-all duration-200
        hover:bg-dark-surface/50 border-l-2 border-transparent hover:border-dark-primary/30
        ${isHovered ? 'bg-dark-surface/30' : ''}
      `}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          {/* Chapter number and title */}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-dark-text">
              {chapter.chapter_number}. {chapter.title}
            </span>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-dark-text-muted flex-shrink-0">
            <span>{chapter.word_count.toLocaleString()}字</span>
            <span>{formatDate(chapter.updated_at)}</span>
          </div>

          {/* Action buttons - only visible on hover */}
          <div className={`flex items-center gap-2 transition-all duration-200 ${
            isHovered || window.matchMedia('(max-width: 768px)').matches
              ? 'opacity-100 translate-x-0' 
              : 'opacity-0 translate-x-2'
          }`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSummary}
              className="h-8 px-2 py-1 text-xs hover:bg-dark-primary/20 hover:text-dark-primary flex items-center gap-1"
            >
              <FileText size={12} />
              摘要
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="h-8 px-2 py-1 text-xs hover:bg-red-500/20 hover:text-red-400 flex items-center gap-1"
            >
              <Trash2 size={12} />
              删除
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};