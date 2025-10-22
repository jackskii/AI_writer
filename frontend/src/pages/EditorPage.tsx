import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Sparkles, MessageCircle } from 'lucide-react';
import { worksApi, chaptersApi } from '../services/api';
import { useWorkStore } from '../stores/useWorkStore';
import { useUIStore } from '../stores/useUIStore';
import { Button } from '../components/ui/Button';
import { LoadingScreen } from '../components/ui/Loading';
import { UserMenu } from '../components/ui/UserMenu';
import { EditorPanel } from '../components/editor/EditorPanel';
import { ChatPanel } from '../components/editor/ChatPanel';
import { AutoSaveIndicator } from '../components/editor/AutoSaveIndicator';
import type { Work, Chapter } from '../types';

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
  
  // Use local state for editor content instead of problematic Zustand store
  const [editorContent, setEditorContent] = useState('');
  const [isEditingChapterTitle, setIsEditingChapterTitle] = useState(false);
  const [chapterTitleInput, setChapterTitleInput] = useState('');
  
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

  // Auto-save function
  const performAutoSave = useCallback(async (content: string) => {
    // Check if content has changed using ref (no closure issues)
    if (content === lastSaveContentRef.current) {
      console.log('Skipping autosave - content unchanged', { content: content.substring(0, 50), lastSaved: lastSaveContentRef.current.substring(0, 50) });
      return;
    }
    
    console.log('Performing autosave with content length:', content.length, 'vs last saved:', lastSaveContentRef.current.length);
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

  // Manual save
  const handleManualSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    performAutoSave(editorContent);
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

  // Use fetched data directly instead of store state
  const currentWorkData = work || currentWork;
  const currentChapterData = chapter || currentChapter;

  console.log('EditorPage render - editorContent value:', { 
    editorContentLength: editorContent.length, 
    editorContent: editorContent.substring(0, 50),
    chapterContent: currentChapterData?.content?.substring(0, 50),
    chapterContentLength: currentChapterData?.content?.length || 0
  });

  return (
    <div className="h-screen bg-dark-bg flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-dark-border bg-dark-surface">
        <div className="flex items-center justify-between px-6 py-3">
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
            <div className="flex flex-col">
              <div className="text-sm text-dark-text-muted">
                {currentChapterData?.act_name || `第${currentChapterData?.act || 1}卷`}
              </div>
              <div className="flex items-center">
                {isEditingChapterTitle ? (
                  <input
                    type="text"
                    value={chapterTitleInput}
                    onChange={(e) => setChapterTitleInput(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={handleTitleKeyDown}
                    className="text-xl font-semibold text-dark-text bg-transparent border-none outline-none focus:ring-0 px-0"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={handleStartEditingTitle}
                    className="text-xl font-semibold text-dark-text hover:text-dark-primary transition-colors text-left"
                  >
                    {currentChapterData?.title || '未命名章节'}
                  </button>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <AutoSaveIndicator />
            <Button
              size="sm"
              onClick={handleManualSave}
              disabled={isAutoSaving}
              className="flex items-center gap-2"
            >
              <Save size={16} />
              {isAutoSaving ? '保存中...' : '保存'}
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Editor Area */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel - Editor */}
        <div className="flex-1 flex flex-col">
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
    </div>
  );
};