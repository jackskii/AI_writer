/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, MessageCircle, Settings, Palette, Pencil, FileText, Wand2 } from 'lucide-react';
import { worksApi, chaptersApi } from '../services/api';
import { useWorkStore } from '../stores/useWorkStore';
import { useUIStore } from '../stores/useUIStore';
import { useMobile } from '../hooks/useMobile';
import { Button } from '../components/ui/Button';
import { LoadingScreen } from '../components/ui/Loading';
import { UserMenu } from '../components/ui/UserMenu';
import { EditorPanel } from '../components/editor/EditorPanel';
import { ChatPanel } from '../components/editor/ChatPanel';
import { AutoSaveIndicator } from '../components/editor/AutoSaveIndicator';
import { SettingsModal } from '../components/modals/SettingsModal';
import { StyleManagerModal } from '../components/modals/StyleManagerModal';
import { CreateStyleModal } from '../components/modals/CreateStyleModal';
import type { Work } from '../types';

// Mobile tab type
type MobileTab = 'editor' | 'chat';

export const EditorPage: React.FC = () => {
  const { workId, chapterId } = useParams<{ workId: string; chapterId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    currentWork,
    currentChapter,
    setCurrentWork,
    setCurrentChapter,
    updateChapter
  } = useWorkStore();

  const {
    isAutoSaving,
    setAutoSaving,
    setLastSaveTime
  } = useUIStore();

  // Mobile detection
  const isMobile = useMobile();

  // Use local state for editor content instead of problematic Zustand store
  const [editorContent, setEditorContent] = useState('');
  const [isEditingChapterTitle, setIsEditingChapterTitle] = useState(false);
  const [chapterTitleInput, setChapterTitleInput] = useState('');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStyleManagerOpen, setIsStyleManagerOpen] = useState(false);
  const [isCreateStyleOpen, setIsCreateStyleOpen] = useState(false);

  // Mobile-specific state
  const [mobileTab, setMobileTab] = useState<MobileTab>('editor');
  const [mobileAutoEditTriggerKey, setMobileAutoEditTriggerKey] = useState(0);
  const [mobileHeaderViewportTop, setMobileHeaderViewportTop] = useState(0);
  
  const lastSaveContentRef = useRef('');
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const workIdNum = parseInt(workId!);
  const chapterIdNum = parseInt(chapterId!);

  // Fetch work details
  const { data: work } = useQuery({
    queryKey: ['work', workIdNum],
    queryFn: async () => {
      const response = await worksApi.get(workIdNum);
      return response.data;
    },
    enabled: !currentWork || currentWork.id !== workIdNum,
    onSuccess: (data: Work) => {
      setCurrentWork(data);
    }
  });

  // Fetch chapter details
  const { data: chapter, isLoading } = useQuery({
    queryKey: ['chapter', workIdNum, chapterIdNum],
    queryFn: async () => {
      const response = await chaptersApi.get(workIdNum, chapterIdNum);
      console.log('Fetched chapter data:', response.data);
      return response.data;
    }
  });

  // Handle chapter data changes (replaces deprecated onSuccess)
  useEffect(() => {
    if (chapter) {
      console.log('Chapter fetched successfully:', {
        id: chapter.id,
        title: chapter.title,
        contentLength: chapter.content?.length || 0,
        content: chapter.content,
        updatedAt: chapter.updated_at
      });
      setCurrentChapter(chapter);
      const contentToSet = chapter.content || '';
      setEditorContent(contentToSet);
      lastSaveContentRef.current = contentToSet;
      setChapterTitleInput(chapter.title || '');
      console.log('Setting editor content:', contentToSet);
    }
  }, [chapter, setCurrentChapter]);

  // Auto-save function - force param bypasses the unchanged check for manual saves
  const performAutoSave = useCallback(async (content: string, force: boolean = false) => {
    // Check if content has changed using ref (skip for forced/manual saves)
    if (!force && content === lastSaveContentRef.current) {
      console.log('Skipping autosave - content unchanged', { content: content.substring(0, 50), lastSaved: lastSaveContentRef.current.substring(0, 50) });
      return;
    }

    console.log('Performing save with content length:', content.length, 'vs last saved:', lastSaveContentRef.current.length, 'force:', force);
    try {
      setAutoSaving(true);
      const response = await chaptersApi.autoSave(workIdNum, chapterIdNum, content);
      console.log('Autosave response:', response.data);
      
      // Update ref with current content
      lastSaveContentRef.current = content;
      setLastSaveTime(new Date());
      
      // Update local state
      if (currentChapter) {
        const updatedChapter = { ...currentChapter, content, updated_at: new Date().toISOString() };
        updateChapter(updatedChapter);
        setCurrentChapter(updatedChapter);
      }
      
      // Invalidate React Query cache to ensure fresh data on reload
      queryClient.invalidateQueries(['chapter', workIdNum, chapterIdNum]);
      queryClient.invalidateQueries(['chapters', workIdNum]);
      
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setAutoSaving(false);
    }
  }, [workIdNum, chapterIdNum, setAutoSaving, setLastSaveTime, updateChapter, setCurrentChapter, queryClient, currentChapter]);

  // Handle content change with debounced auto-save
  const handleContentChange = useCallback((content: string) => {
    setEditorContent(content);
    
    // Clear existing timer using ref
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    // Set new timer for 5 seconds
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave(content);
    }, 5000);
  }, [performAutoSave]);

  // Manual save - accepts optional content to avoid race condition with async state updates
  const handleManualSave = useCallback((contentToSave?: string) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    // Use provided content if available, otherwise fall back to current state
    const content = typeof contentToSave === 'string' ? contentToSave : editorContent;
    // Force save for manual saves - always save even if content unchanged
    performAutoSave(content, true);
  }, [performAutoSave, editorContent]);

  // Chapter title editing functions
  const handleStartEditingTitle = () => {
    setChapterTitleInput(currentChapterData?.title || '');
    setIsEditingChapterTitle(true);
  };

  const handleSaveTitle = async () => {
    if (!currentChapterData || chapterTitleInput.trim() === currentChapterData.title) {
      setIsEditingChapterTitle(false);
      return;
    }

    try {
      await chaptersApi.update(workIdNum, chapterIdNum, { title: chapterTitleInput.trim() });
      
      // Update local state
      const updatedChapter = { ...currentChapterData, title: chapterTitleInput.trim() };
      setCurrentChapter(updatedChapter);
      updateChapter(updatedChapter);
      
      // Invalidate queries to refresh chapter list
      queryClient.invalidateQueries(['chapter', workIdNum, chapterIdNum]);
      queryClient.invalidateQueries(['chapters', workIdNum]);
      
      setIsEditingChapterTitle(false);
    } catch (error) {
      console.error('Failed to update chapter title:', error);
      setChapterTitleInput(currentChapterData.title || '');
      setIsEditingChapterTitle(false);
    }
  };

  const handleCancelEditTitle = () => {
    setChapterTitleInput(currentChapterData?.title || '');
    setIsEditingChapterTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEditTitle();
    }
  };

  const handleMobileTopAutoEdit = () => {
    if (mobileTab !== 'editor') {
      setMobileTab('editor');
      requestAnimationFrame(() => {
        setMobileAutoEditTriggerKey(prev => prev + 1);
      });
      return;
    }
    setMobileAutoEditTriggerKey(prev => prev + 1);
  };

  // iOS keyboard can shift visual viewport; keep mobile top bar pinned to visible top.
  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') {
      setMobileHeaderViewportTop(0);
      return;
    }

    const updateViewportTop = () => {
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      setMobileHeaderViewportTop(Math.max(0, Math.round(viewportTop)));
    };

    updateViewportTop();

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', updateViewportTop);
    viewport?.addEventListener('scroll', updateViewportTop);
    window.addEventListener('scroll', updateViewportTop, { passive: true });

    return () => {
      viewport?.removeEventListener('resize', updateViewportTop);
      viewport?.removeEventListener('scroll', updateViewportTop);
      window.removeEventListener('scroll', updateViewportTop);
    };
  }, [isMobile]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  if (isLoading) {
    return <LoadingScreen message="正在加载章节..." />;
  }

  if (!chapter) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-400 mb-2">章节未找到</h2>
          <Button onClick={() => navigate(`/works/${workId}`)}>返回作品</Button>
        </div>
      </div>
    );
  }

  const currentWorkData = work || currentWork;
  const currentChapterData =
    (currentChapter?.id === chapterIdNum ? currentChapter : null) || chapter || currentChapter;

  console.log('EditorPage render - editorContent value:', { 
    editorContentLength: editorContent.length, 
    editorContent: editorContent.substring(0, 50),
    chapterContent: currentChapterData?.content?.substring(0, 50),
    chapterContentLength: currentChapterData?.content?.length || 0
  });

  return (
    <div className="h-screen bg-dark-bg flex flex-col">
      {/* Header - Desktop */}
      <header className="flex-shrink-0 border-b border-dark-border bg-dark-surface hidden md:block">
        <div className="flex items-center justify-between px-6 py-2">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/works/${workId}`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              返回
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-dark-text-muted">
                {currentChapterData?.act_name || `第${currentChapterData?.act || 1}卷`}
              </span>
              <span className="text-dark-text-muted">·</span>
              {isEditingChapterTitle ? (
                <input
                  type="text"
                  value={chapterTitleInput}
                  onChange={(e) => setChapterTitleInput(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={handleTitleKeyDown}
                  className="text-base font-semibold text-dark-text bg-dark-bg border border-dark-border rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-dark-primary"
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-dark-text">
                    {currentChapterData?.title || '未命名章节'}
                  </span>
                  <button
                    onClick={handleStartEditingTitle}
                    className="p-1 text-dark-text-muted hover:text-dark-primary hover:bg-dark-surface rounded transition-colors"
                    title="编辑标题"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <AutoSaveIndicator />
            <Button
              size="sm"
              onClick={() => handleManualSave()}
              disabled={isAutoSaving}
              className="flex items-center gap-2"
            >
              <Save size={16} />
              {isAutoSaving ? '保存中...' : '保存'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsStyleManagerOpen(true)}
              className="flex items-center gap-2"
              title="风格"
            >
              <Palette size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex items-center gap-2"
              title="设置"
            >
              <Settings size={16} />
            </Button>
            <UserMenu iconOnly />
          </div>
        </div>
      </header>

      {/* Header - Mobile (simplified) */}
      <header
        className="fixed left-0 right-0 z-30 border-b border-dark-border bg-dark-surface md:hidden"
        style={{ top: `${mobileHeaderViewportTop}px` }}
      >
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/works/${workId}`)}
              className="p-1"
            >
              <ArrowLeft size={20} />
            </Button>
            <span className="text-sm font-medium text-dark-text truncate max-w-[120px]">
              {currentChapterData?.title || '未命名章节'}
            </span>
          </div>

          <div className="mx-3 flex-shrink-0">
            <Button
              size="sm"
              onClick={handleMobileTopAutoEdit}
              className="h-8 px-3 bg-blue-600 text-white hover:bg-blue-500"
              title="自动编辑"
            >
              <Wand2 size={14} className="mr-1" />
              自动编辑
            </Button>
          </div>

          <div className="flex items-center gap-1 flex-1 justify-end">
            <AutoSaveIndicator />
            <Button
              size="sm"
              onClick={() => handleManualSave()}
              disabled={isAutoSaving}
              className="p-2"
            >
              <Save size={18} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2"
            >
              <Settings size={18} />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Editor Area - Desktop */}
      <div className="flex-1 hidden md:flex min-h-0">
        <div className="flex flex-col min-h-0 flex-1">
          <EditorPanel
            content={editorContent}
            onChange={handleContentChange}
            work={currentWorkData}
            chapter={currentChapterData}
            onSave={handleManualSave}
          />
        </div>

        {/* Right Panel - Full Height Chat */}
        <div className="w-96 border-l border-dark-border">
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 px-4 py-3 border-b border-dark-border bg-dark-surface">
              <div className="flex items-center gap-2 text-sm font-medium text-dark-text">
                <MessageCircle size={16} />
                AI 助手
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel 
                work={currentWorkData}
                chapter={currentChapterData}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Editor Area - Mobile (tabbed) */}
      <div className="flex-1 flex flex-col md:hidden min-h-0 pb-[60px] pt-[56px]">
        {mobileTab === 'editor' && (
          <div className="flex-1 flex flex-col min-h-0">
            <EditorPanel
              content={editorContent}
              onChange={handleContentChange}
              work={currentWorkData}
              chapter={currentChapterData}
              onSave={handleManualSave}
              isMobile={true}
              autoEditTriggerKey={mobileAutoEditTriggerKey}
            />
          </div>
        )}

        {/* Chat Tab Content */}
        {mobileTab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-shrink-0 px-4 py-3 border-b border-dark-border bg-dark-surface">
              <div className="flex items-center gap-2 text-sm font-medium text-dark-text">
                <MessageCircle size={16} />
                AI 助手
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel 
                work={currentWorkData}
                chapter={currentChapterData}
              />
            </div>
          </div>
        )}

      </div>

      {/* Mobile Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-dark-surface border-t border-dark-border safe-area-bottom">
        <div className="flex h-[60px]">
          <button
            onClick={() => setMobileTab('editor')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              mobileTab === 'editor' 
                ? 'text-dark-primary bg-dark-primary/10' 
                : 'text-dark-text-muted'
            }`}
          >
            <FileText size={20} />
            <span className="text-xs">编辑</span>
          </button>
          <button
            onClick={() => setMobileTab('chat')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              mobileTab === 'chat' 
                ? 'text-dark-primary bg-dark-primary/10' 
                : 'text-dark-text-muted'
            }`}
          >
            <MessageCircle size={20} />
            <span className="text-xs">AI助手</span>
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {/* Style Manager Modal */}
      <StyleManagerModal
        isOpen={isStyleManagerOpen}
        onClose={() => setIsStyleManagerOpen(false)}
        onCreateNew={() => {
          setIsStyleManagerOpen(false);
          setIsCreateStyleOpen(true);
        }}
      />

      {/* Create Style Modal */}
      <CreateStyleModal
        isOpen={isCreateStyleOpen}
        onClose={() => setIsCreateStyleOpen(false)}
      />
    </div>
  );
};
