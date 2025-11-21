/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Edit3, Settings, Palette, BookOpen, Layers, Edit, Trash2 } from 'lucide-react';
import { worksApi, actsApi, chaptersApi, loreApi } from '../services/api';
import { useWorkStore } from '../stores/useWorkStore';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { LoadingScreen } from '../components/ui/Loading';
import { UserMenu } from '../components/ui/UserMenu';
import { Textarea } from '../components/ui/Input';
import { CreateLoreModal } from '../components/modals/CreateLoreModal';
import { SettingsModal } from '../components/modals/SettingsModal';
import { StyleManagerModal } from '../components/modals/StyleManagerModal';
import { CreateStyleModal } from '../components/modals/CreateStyleModal';
import { SummaryModal } from '../components/modals/SummaryModal';
import { DeleteConfirmDialog } from '../components/modals/DeleteConfirmDialog';
import { DeleteLoreConfirmDialog } from '../components/modals/DeleteLoreConfirmDialog';
import { EditActNameModal } from '../components/modals/EditActNameModal';
import { DeleteActConfirmDialog } from '../components/modals/DeleteActConfirmDialog';
import { ActSection } from '../components/chapters/ActSection';
import { WorkChatPanel } from '../components/work/WorkChatPanel';
import type { Work, Act, Chapter, LoreEntry } from '../types';

export const WorkDetailPage: React.FC = () => {
  const { workId } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const {
    setCurrentWork,
    setChapters,
    loreEntries,
    setLoreEntries
  } = useWorkStore();
  
  const [activeTab, setActiveTab] = useState<'synopsis' | 'chapters' | 'lore'>('chapters');
  const [isCreateLoreModalOpen, setIsCreateLoreModalOpen] = useState(false);
  const [editingLoreEntry, setEditingLoreEntry] = useState<LoreEntry | null>(null);
  const [deletingLoreEntry, setDeletingLoreEntry] = useState<LoreEntry | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStyleManagerOpen, setIsStyleManagerOpen] = useState(false);
  const [isCreateStyleOpen, setIsCreateStyleOpen] = useState(false);
  const [summaryModalChapter, setSummaryModalChapter] = useState<Chapter | null>(null);
  const [deleteModalChapter, setDeleteModalChapter] = useState<Chapter | null>(null);
  const [editActNameModal, setEditActNameModal] = useState<{ act: number; currentName?: string } | null>(null);
  const [deleteActModal, setDeleteActModal] = useState<{ act: number; actName?: string } | null>(null);
  const [isEditingSynopsis, setIsEditingSynopsis] = useState(false);
  const [synopsisContent, setSynopsisContent] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleContent, setTitleContent] = useState('');

  const workIdNum = parseInt(workId!);
  const queryClient = useQueryClient();

  // Work update mutations
  const updateSynopsisMutation = useMutation({
    mutationFn: (synopsis: string) => worksApi.update(workIdNum, { synopsis }),
    onSuccess: (response) => {
      setCurrentWork(response.data);
      queryClient.invalidateQueries({ queryKey: ['work', workIdNum] });
      setIsEditingSynopsis(false);
    }
  });

  const updateTitleMutation = useMutation({
    mutationFn: (title: string) => worksApi.update(workIdNum, { title }),
    onSuccess: (response) => {
      setCurrentWork(response.data);
      queryClient.invalidateQueries({ queryKey: ['work', workIdNum] });
      setIsEditingTitle(false);
    }
  });

  const deleteChapterMutation = useMutation({
    mutationFn: (chapter: Chapter) => chaptersApi.delete(workIdNum, chapter.id),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['chapters', workIdNum] });
      await queryClient.refetchQueries({ queryKey: ['acts', workIdNum] });
      await queryClient.refetchQueries({ queryKey: ['work', workIdNum] });
      setDeleteModalChapter(null);
    }
  });

  const deleteLoreEntryMutation = useMutation({
    mutationFn: (loreEntry: LoreEntry) => loreApi.delete(workIdNum, loreEntry.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lore', workIdNum] });
      setDeletingLoreEntry(null);
    }
  });

  const updateActNameMutation = useMutation({
    mutationFn: ({ actId, name }: { actId: number; name: string }) => 
      actsApi.update(workIdNum, actId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acts', workIdNum] });
      queryClient.invalidateQueries({ queryKey: ['chapters', workIdNum] });
      setEditActNameModal(null);
    }
  });

  const deleteActMutation = useMutation({
    mutationFn: (actId: number) => actsApi.delete(workIdNum, actId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acts', workIdNum] });
      queryClient.invalidateQueries({ queryKey: ['chapters', workIdNum] });
      queryClient.invalidateQueries({ queryKey: ['work', workIdNum] });
      setDeleteActModal(null);
    }
  });

  const createActMutation = useMutation({
    mutationFn: (data: Partial<Act>) => actsApi.create(workIdNum, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acts', workIdNum] });
    }
  });

  const reorderChaptersMutation = useMutation({
    mutationFn: ({ actId, chapterIds }: { actId: number; chapterIds: number[] }) =>
      chaptersApi.reorder(workIdNum, actId, chapterIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapters', workIdNum] });
    }
  });

  // Fetch work details
  const { data: work, isLoading: workLoading } = useQuery({
    queryKey: ['work', workIdNum],
    queryFn: async () => {
      const response = await worksApi.get(workIdNum);
      return response.data;
    },
    onSuccess: (data: Work) => {
      setCurrentWork(data);
      setSynopsisContent(data.synopsis || '');
      setTitleContent(data.title || '');
    }
  });

  // Fetch acts
  const { data: actsData } = useQuery({
    queryKey: ['acts', workIdNum],
    queryFn: async () => {
      const response = await actsApi.list(workIdNum);
      return response.data.results || response.data; // Handle both paginated and non-paginated responses
    },
    enabled: !!workIdNum
  });

  // Fetch chapters
  const { data: chaptersData } = useQuery({
    queryKey: ['chapters', workIdNum],
    queryFn: async () => {
      const response = await chaptersApi.list(workIdNum);
      return response.data.results || response.data; // Handle both paginated and non-paginated responses
    },
    enabled: !!workIdNum
  });

  // Handle chapters data (replaces deprecated onSuccess)
  useEffect(() => {
    if (chaptersData) {
      setChapters(workIdNum, chaptersData);
    }
  }, [chaptersData, workIdNum, setChapters]);

  // Fetch lore entries
  const { data: loreData } = useQuery({
    queryKey: ['lore', workIdNum],
    queryFn: async () => {
      const response = await loreApi.list(workIdNum);
      return response.data.results || response.data; // Handle both paginated and non-paginated responses
    },
    enabled: !!workIdNum
  });

  // Handle lore data
  useEffect(() => {
    if (loreData) {
      setLoreEntries(workIdNum, loreData);
    }
  }, [loreData, workIdNum, setLoreEntries]);

  if (workLoading) {
    return <LoadingScreen message="正在加载作品详情..." />;
  }

  if (!work) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-400 mb-2">作品未找到</h2>
          <Button onClick={() => navigate('/')}>返回首页</Button>
        </div>
      </div>
    );
  }

  // Always prioritize fresh React Query data over stale Zustand store data
  const workChapters = chaptersData || [];
  const workLore = loreData || loreEntries[workIdNum] || [];

  const handleChapterClick = (chapter: Chapter) => {
    navigate(`/works/${workIdNum}/chapters/${chapter.id}`);
  };

  const handleCreateChapter = () => {
    // Create chapter in first act by default
    if (actsData && Array.isArray(actsData) && actsData.length > 0) {
      const firstAct = actsData.sort((a, b) => a.order - b.order)[0];
      handleCreateChapterInAct(firstAct.id);
    } else {
      // Create first act and then create chapter
      handleCreateAct();
    }
  };

  const handleCreateLore = () => {
    setIsCreateLoreModalOpen(true);
  };

  const handleCreateChapterInAct = async (actId: number) => {
    // Calculate next chapter number within the act (this will be handled by backend)
    const actChapters = workChapters.filter(ch => ch.act === actId);
    const nextChapterNumber = actChapters.length + 1;
    const title = `第${nextChapterNumber}章`;
    
    try {
      await chaptersApi.create(workIdNum, {
        title,
        act: actId
      });
      
      // Refresh the chapters list
      queryClient.invalidateQueries({ queryKey: ['chapters', workIdNum] });
      queryClient.invalidateQueries({ queryKey: ['work', workIdNum] });
    } catch (error) {
      console.error('Failed to create chapter:', error);
    }
  };

  const handleChapterSummary = (chapter: Chapter) => {
    setSummaryModalChapter(chapter);
  };

  const handleChapterDelete = (chapter: Chapter) => {
    setDeleteModalChapter(chapter);
  };

  const handleConfirmDelete = () => {
    if (deleteModalChapter) {
      deleteChapterMutation.mutate(deleteModalChapter);
    }
  };

  const handleSummaryUpdated = () => {
    setSummaryModalChapter(null);
    queryClient.invalidateQueries({ queryKey: ['chapters', workIdNum] });
  };

  const handleEditLoreEntry = (loreEntry: LoreEntry) => {
    setEditingLoreEntry(loreEntry);
  };

  const handleDeleteLoreEntry = (loreEntry: LoreEntry) => {
    setDeletingLoreEntry(loreEntry);
  };

  const handleConfirmDeleteLoreEntry = () => {
    if (deletingLoreEntry) {
      deleteLoreEntryMutation.mutate(deletingLoreEntry);
    }
  };

  const handleEditSynopsis = () => {
    setIsEditingSynopsis(true);
    setSynopsisContent(work?.synopsis || '');
  };

  const handleSaveSynopsis = () => {
    updateSynopsisMutation.mutate(synopsisContent);
  };

  const handleCancelSynopsis = () => {
    setIsEditingSynopsis(false);
    setSynopsisContent(work?.synopsis || '');
  };

  const handleSynopsisKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelSynopsis();
    }
  };

  const handleEditTitle = () => {
    setIsEditingTitle(true);
    setTitleContent(work?.title || '');
  };

  const handleSaveTitle = () => {
    if (titleContent.trim() && titleContent.trim() !== work?.title) {
      updateTitleMutation.mutate(titleContent.trim());
    } else {
      setIsEditingTitle(false);
    }
  };

  const handleCancelTitle = () => {
    setIsEditingTitle(false);
    setTitleContent(work?.title || '');
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelTitle();
    }
  };

  const handleEditActName = (actId: number, currentName?: string) => {
    setEditActNameModal({ act: actId, currentName });
  };

  const handleSaveActName = (actName: string) => {
    if (editActNameModal) {
      updateActNameMutation.mutate({ 
        actId: editActNameModal.act, 
        name: actName 
      });
    }
  };

  const handleDeleteAct = (actId: number) => {
    // Find the act's name for the confirmation dialog
    const act = actsData?.find(a => a.id === actId);
    setDeleteActModal({ act: actId, actName: act?.name });
  };

  const handleConfirmDeleteAct = () => {
    if (deleteActModal) {
      deleteActMutation.mutate(deleteActModal.act);
    }
  };

  const handleCreateAct = () => {
    // Find the highest act order to create the next act
    const currentOrders = (actsData && Array.isArray(actsData)) ? actsData.map(act => act.order) : [0];
    const nextOrder = Math.max(...currentOrders, 0) + 1;

    createActMutation.mutate({
      name: `第${nextOrder}卷`,
      order: nextOrder
    });
  };

  const handleReorderChapters = (actId: number, chapterIds: number[]) => {
    reorderChaptersMutation.mutate({ actId, chapterIds });
  };

  const tabs = [
    { id: 'chapters', label: '章节', icon: BookOpen },
    { id: 'synopsis', label: '大纲', icon: Edit3 },
    { id: 'lore', label: '世界观', icon: Layers },
  ] as const;

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="flex items-center gap-2"
              >
                <ArrowLeft size={18} />
                返回首页
              </Button>
              <div>
                {isEditingTitle ? (
                  <input
                    type="text"
                    value={titleContent}
                    onChange={(e) => setTitleContent(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={handleTitleKeyDown}
                    className="text-2xl font-bold text-dark-text bg-transparent border-b-2 border-dark-primary focus:outline-none w-full min-w-[300px]"
                    autoFocus
                  />
                ) : (
                  <h1 
                    className="text-2xl font-bold text-dark-text hover:text-dark-primary cursor-pointer transition-colors"
                    onClick={handleEditTitle}
                    title="点击编辑标题"
                  >
                    {work.title}
                  </h1>
                )}
                <p className="text-dark-text-muted">
                  {work.word_count.toLocaleString()} 字 · {work.chapter_count} 章
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsStyleManagerOpen(true)}
                className="flex items-center gap-2"
              >
                <Palette size={16} />
                风格
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSettingsModalOpen(true)}
                className="flex items-center gap-2"
              >
                <Settings size={16} />
                设置
              </Button>
              {activeTab === 'lore' && (
                <Button
                  onClick={handleCreateLore}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Plus size={16} />
                  新建世界观条目
                </Button>
              )}
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <nav className="flex space-x-8">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 py-4 px-2 border-b-2 transition-colors ${
                    activeTab === id
                      ? 'border-dark-primary text-dark-primary'
                      : 'border-transparent text-dark-text-muted hover:text-dark-text'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </nav>
            
            {activeTab === 'chapters' && (
              <Button
                onClick={handleCreateAct}
                size="sm"
                className="flex items-center gap-2 my-2"
              >
                <Plus size={16} />
                添加新卷
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'synopsis' && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div id="synopsis-card">
              <Card className="flex flex-col h-[670px] overflow-hidden">
                <CardHeader className="flex-shrink-0">
                  <h3 className="text-lg font-semibold">作品大纲</h3>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden">
                {isEditingSynopsis ? (
                  <div className="flex h-full flex-col space-y-4">
                    <Textarea
                      value={synopsisContent}
                      onChange={(e) => setSynopsisContent(e.target.value)}
                      onBlur={handleSaveSynopsis}
                      onKeyDown={handleSynopsisKeyDown}
                      placeholder="请输入作品大纲、背景设定、人物关系等..."
                      rows={22}
                      className="resize-none h-[570px] min-h-[570px] max-h-[570px] overflow-y-auto"
                    />
                    <div className="flex items-center gap-2 justify-end text-sm text-dark-text-muted">
                      <span>按 Esc 取消编辑，点击其他地方自动保存</span>
                    </div>
                  </div>
                ) : (
                  work.synopsis ? (
                    <div
                      className="chinese-text text-dark-text whitespace-pre-wrap leading-relaxed hover:bg-dark-surface/30 rounded p-3 cursor-pointer transition-colors h-[570px] overflow-y-auto"
                      onClick={handleEditSynopsis}
                      title="点击编辑大纲"
                    >
                      {work.synopsis}
                    </div>
                  ) : (
                    <div
                      className="text-center py-8 text-dark-text-muted hover:bg-dark-surface/30 rounded cursor-pointer transition-colors h-[570px] flex flex-col justify-center"
                      onClick={handleEditSynopsis}
                      title="点击添加大纲"
                    >
                      <Edit3 size={48} className="mx-auto mb-4 opacity-50" />
                      <p>暂无大纲内容</p>
                      <p className="text-xs mt-2 opacity-70">点击此处添加大纲</p>
                    </div>
                  )
                )}
                </CardContent>
              </Card>
            </div>
            <div className="h-[670px]">
              <WorkChatPanel work={work} />
            </div>
          </div>
        )}

        {activeTab === 'chapters' && (
          <div className="space-y-4">
            {workChapters.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <BookOpen size={48} className="mx-auto mb-4 text-dark-text-muted opacity-50" />
                  <h3 className="text-lg font-medium text-dark-text mb-2">开始创作</h3>
                  <p className="text-dark-text-muted mb-4">创建第一个章节，开始您的小说创作之旅</p>
                  <Button onClick={handleCreateChapter} className="flex items-center gap-2">
                    <Plus size={18} />
                    创建第一章
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {/* Render acts from database */}
                {actsData && Array.isArray(actsData) && actsData.length > 0 ? (
                  actsData
                    .sort((a, b) => a.order - b.order)
                    .map(act => {
                      const actChapters = (workChapters || []).filter(ch => ch.act === act.id);
                      return (
                        <ActSection
                          key={act.id}
                          act={act.id}
                          actName={act.name}
                          chapters={actChapters.sort((a, b) => a.chapter_number - b.chapter_number)}
                          onChapterClick={handleChapterClick}
                          onChapterDelete={handleChapterDelete}
                          onChapterSummary={handleChapterSummary}
                          onCreateChapter={(actId) => handleCreateChapterInAct(actId)}
                          onEditActName={handleEditActName}
                          onDeleteAct={handleDeleteAct}
                          onReorderChapters={handleReorderChapters}
                        />
                      );
                    })
                ) : (
                  <div className="text-center py-8 text-dark-text-muted">
                    <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
                    <p>暂无卷，点击"创建新卷"开始创作</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'lore' && (
          <div className="space-y-4">
            {workLore.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Layers size={48} className="mx-auto mb-4 text-dark-text-muted opacity-50" />
                  <h3 className="text-lg font-medium text-dark-text mb-2">构建世界观</h3>
                  <p className="text-dark-text-muted mb-4">添加角色、设定和背景故事，让AI更好地理解您的世界</p>
                  <Button 
                    onClick={handleCreateLore}
                    className="flex items-center gap-2"
                  >
                    <Plus size={18} />
                    添加世界观条目
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {workLore.map((entry) => (
                  <Card key={entry.id} className="hover:border-dark-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-dark-text">{entry.name}</h4>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditLoreEntry(entry)}
                            className="px-2 py-1 h-auto"
                          >
                            <Edit size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteLoreEntry(entry)}
                            className="px-2 py-1 h-auto text-red-400 hover:text-red-300 hover:border-red-400"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-dark-text-muted text-sm line-clamp-3">
                        {entry.description}
                      </p>
                      {entry.triggers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {entry.triggers.slice(0, 3).map((trigger, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-dark-border rounded text-xs text-dark-text-muted"
                            >
                              {trigger}
                            </span>
                          ))}
                          {entry.triggers.length > 3 && (
                            <span className="px-2 py-1 text-xs text-dark-text-muted">
                              +{entry.triggers.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}

      <CreateLoreModal
        workId={workIdNum}
        isOpen={isCreateLoreModalOpen || !!editingLoreEntry}
        onClose={() => {
          setIsCreateLoreModalOpen(false);
          setEditingLoreEntry(null);
        }}
        onLoreCreated={() => {
          setIsCreateLoreModalOpen(false);
          setEditingLoreEntry(null);
          // Invalidate and refetch lore entries
          queryClient.invalidateQueries({ queryKey: ['lore', workIdNum] });
        }}
        editEntry={editingLoreEntry}
      />


      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      <StyleManagerModal
        isOpen={isStyleManagerOpen}
        onClose={() => setIsStyleManagerOpen(false)}
        onCreateNew={() => {
          setIsStyleManagerOpen(false);
          setIsCreateStyleOpen(true);
        }}
      />

      <CreateStyleModal
        isOpen={isCreateStyleOpen}
        onClose={() => setIsCreateStyleOpen(false)}
      />

      <SummaryModal
        chapter={summaryModalChapter}
        isOpen={!!summaryModalChapter}
        onClose={() => setSummaryModalChapter(null)}
        onSummaryUpdated={handleSummaryUpdated}
      />

      <DeleteConfirmDialog
        chapter={deleteModalChapter}
        isOpen={!!deleteModalChapter}
        onClose={() => setDeleteModalChapter(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={deleteChapterMutation.isPending}
      />

      <DeleteLoreConfirmDialog
        loreEntry={deletingLoreEntry}
        isOpen={!!deletingLoreEntry}
        onClose={() => setDeletingLoreEntry(null)}
        onConfirm={handleConfirmDeleteLoreEntry}
        isDeleting={deleteLoreEntryMutation.isPending}
      />

      <EditActNameModal
        isOpen={!!editActNameModal}
        onClose={() => setEditActNameModal(null)}
        onSave={handleSaveActName}
        currentName={editActNameModal?.currentName}
        actNumber={editActNameModal?.act || 1}
      />

      <DeleteActConfirmDialog
        act={deleteActModal?.act || null}
        actName={deleteActModal?.actName}
        isOpen={!!deleteActModal}
        onClose={() => setDeleteActModal(null)}
        onConfirm={handleConfirmDeleteAct}
        isDeleting={deleteActMutation.isPending}
      />
    </div>
  );
};
