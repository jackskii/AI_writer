/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Edit3, Settings, Palette, BookOpen, Layers, FileText, MessageCircle, ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { worksApi, actsApi, chaptersApi, loreApi, factionsApi } from '../services/api';
import { useWorkStore } from '../stores/useWorkStore';
import { useMobile } from '../hooks/useMobile';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { LoadingScreen } from '../components/ui/Loading';
import { UserMenu } from '../components/ui/UserMenu';
import { Textarea } from '../components/ui/Input';
import { CreateLoreModal } from '../components/modals/CreateLoreModal';
import { CreateFactionModal } from '../components/modals/CreateFactionModal';
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
import { FactionSection } from '../components/lore/FactionSection';
import { LoreTemplateModal } from '../components/modals/LoreTemplateModal';
import { ActSynopsisModal } from '../components/modals/ActSynopsisModal';
import type { Work, Act, Chapter, Faction, LoreEntry } from '../types';

export const WorkDetailPage: React.FC = () => {
  const { workId } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const { setCurrentWork, loreEntries, setLoreEntries } = useWorkStore();
  
  const [activeTab, setActiveTab] = useState<'synopsis' | 'chapters' | 'lore'>('chapters');
  const [mobileSynopsisTab, setMobileSynopsisTab] = useState<'synopsis' | 'chat'>('synopsis');
  const [loreViewMode, setLoreViewMode] = useState<'faction' | 'compact'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'compact';
    }
    return 'faction';
  });
  const [isCreateLoreModalOpen, setIsCreateLoreModalOpen] = useState(false);
  const [createLoreDefaultFaction, setCreateLoreDefaultFaction] = useState<number | null>(null);
  const [editingLoreEntry, setEditingLoreEntry] = useState<LoreEntry | null>(null);
  const [deletingLoreEntry, setDeletingLoreEntry] = useState<LoreEntry | null>(null);
  const [isCreateFactionModalOpen, setIsCreateFactionModalOpen] = useState(false);
  const [editingFaction, setEditingFaction] = useState<Faction | null>(null);
  const [isLoreTemplateModalOpen, setIsLoreTemplateModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStyleManagerOpen, setIsStyleManagerOpen] = useState(false);
  const [isCreateStyleOpen, setIsCreateStyleOpen] = useState(false);
  const [summaryModalChapter, setSummaryModalChapter] = useState<Chapter | null>(null);
  const [deleteModalChapter, setDeleteModalChapter] = useState<Chapter | null>(null);
  const [editActNameModal, setEditActNameModal] = useState<{ act: number; currentName?: string } | null>(null);
  const [deleteActModal, setDeleteActModal] = useState<{ act: number; actName?: string } | null>(null);
  const [actSynopsisModalAct, setActSynopsisModalAct] = useState<Act | null>(null);
  const [isEditingSynopsis, setIsEditingSynopsis] = useState(false);
  const [synopsisContent, setSynopsisContent] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleContent, setTitleContent] = useState('');
  const [collapsedFactions, setCollapsedFactions] = useState<Set<number>>(new Set());
  const [collapsedCompactFactions, setCollapsedCompactFactions] = useState<Set<number>>(new Set());
  const workIdNum = parseInt(workId!);
  const queryClient = useQueryClient();
  const isMobile = useMobile();

  // Work mutations
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

  // Faction mutations
  const createFactionMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) => factionsApi.create(workIdNum, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factions', workIdNum] });
      setIsCreateFactionModalOpen(false);
    }
  });

  const updateFactionMutation = useMutation({
    mutationFn: ({ factionId, name, description }: { factionId: number; name: string; description: string }) =>
      factionsApi.update(workIdNum, factionId, { name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factions', workIdNum] });
      setEditingFaction(null);
      setIsCreateFactionModalOpen(false);
    }
  });

  const deleteFactionMutation = useMutation({
    mutationFn: (factionId: number) => factionsApi.delete(workIdNum, factionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factions', workIdNum] });
      queryClient.invalidateQueries({ queryKey: ['lore', workIdNum] });
    }
  });


  // Act mutations
  const updateActNameMutation = useMutation({
    mutationFn: ({ actId, name }: { actId: number; name: string }) => actsApi.update(workIdNum, actId, { name }),
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

  // Queries
  const { data: work, isLoading: workLoading } = useQuery({
    queryKey: ['work', workIdNum],
    queryFn: async () => {
      const response = await worksApi.get(workIdNum);
      return response.data;
    }
  });

  const { data: actsData } = useQuery({
    queryKey: ['acts', workIdNum],
    queryFn: async () => {
      const response = await actsApi.list(workIdNum);
      return response.data.results || response.data;
    },
    enabled: !!workIdNum
  });

  const { data: chaptersData } = useQuery({
    queryKey: ['chapters', workIdNum],
    queryFn: async () => {
      const response = await chaptersApi.list(workIdNum);
      return response.data.results || response.data;
    },
    enabled: !!workIdNum
  });

  const { data: factionsData } = useQuery({
    queryKey: ['factions', workIdNum],
    queryFn: async () => {
      const response = await factionsApi.list(workIdNum);
      const data = response.data.results || response.data;
      return Array.isArray(data) ? data : [];
    },
    enabled: !!workIdNum
  });

  const { data: loreData } = useQuery({
    queryKey: ['lore', workIdNum],
    queryFn: async () => {
      const response = await loreApi.list(workIdNum);
      const data = response.data.results || response.data;
      return Array.isArray(data) ? data : [];
    },
    enabled: !!workIdNum
  });

  // Effects
  useEffect(() => {
    if (work) setCurrentWork(work);
  }, [work, setCurrentWork]);

  useEffect(() => {
    if (loreData) setLoreEntries(workIdNum, loreData);
  }, [loreData, workIdNum, setLoreEntries]);

  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (work && !initialized) {
      setSynopsisContent(work.synopsis || '');
      setTitleContent(work.title || '');
      setInitialized(true);
    }
  }, [work, initialized]);

  // Sort factions - must be before early returns to follow React hooks rules
  // Order: 无归属 (top) → normal factions (by order) → 世界观 (bottom)
  const sortedFactions = React.useMemo(() => {
    if (!factionsData || !Array.isArray(factionsData)) return [];
    return [...factionsData].sort((a, b) => {
      // 无归属 always first
      if (a.faction_type === 'no_faction') return -1;
      if (b.faction_type === 'no_faction') return 1;
      // 世界观 always last
      if (a.faction_type === 'worldbuilding') return 1;
      if (b.faction_type === 'worldbuilding') return -1;
      // Normal factions sorted by order
      return a.order - b.order;
    });
  }, [factionsData]);

  // Derived data - also needs to be before early returns if used with hooks
  const workChapters = Array.isArray(chaptersData) ? chaptersData : [];
  const workLoreSource = loreData || loreEntries[workIdNum] || [];
  const workLore = Array.isArray(workLoreSource) ? workLoreSource : [];
  const compactLoreFactions = React.useMemo(() => {
    if (!sortedFactions.length) return [];
    return sortedFactions
      .map((faction) => ({
        faction,
        entries: workLore.filter((entry) => entry.factions?.includes(faction.id)),
      }))
      .filter((item) => item.entries.length > 0);
  }, [sortedFactions, workLore]);

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

  const getLoreEntriesForFaction = (factionId: number): LoreEntry[] => {
    if (!workLore) return [];
    return workLore.filter(entry => entry.factions?.includes(factionId));
  };

  // Handlers
  const handleChapterClick = (chapter: Chapter) => navigate(`/works/${workIdNum}/chapters/${chapter.id}`);
  
  const handleCreateChapter = () => {
    if (actsData && Array.isArray(actsData) && actsData.length > 0) {
      const sortedActs = [...actsData].sort((a, b) => {
        const aType = a.act_type === 'side_chapters' ? 1 : 0;
        const bType = b.act_type === 'side_chapters' ? 1 : 0;
        if (aType !== bType) return aType - bType;
        return a.order - b.order;
      });
      const firstAct = sortedActs[0];
      handleCreateChapterInAct(firstAct.id);
    } else {
      handleCreateAct();
    }
  };

  const handleCreateChapterInAct = async (actId: number) => {
    const actChapters = workChapters.filter(ch => ch.act === actId);
    const nextChapterNumber = actChapters.length + 1;
    try {
      await chaptersApi.create(workIdNum, { title: `第${nextChapterNumber}章`, act: actId });
      queryClient.invalidateQueries({ queryKey: ['chapters', workIdNum] });
      queryClient.invalidateQueries({ queryKey: ['work', workIdNum] });
    } catch (error) {
      console.error('Failed to create chapter:', error);
    }
  };

  const handleCreateLore = (defaultFactionId?: number) => {
    setCreateLoreDefaultFaction(defaultFactionId || null);
    setIsCreateLoreModalOpen(true);
  };

  const handleCreateFaction = () => {
    setEditingFaction(null);
    setIsCreateFactionModalOpen(true);
  };
  const handleEditFaction = (faction: Faction) => {
    setEditingFaction(faction);
    setIsCreateFactionModalOpen(true);
  };

  const handleFactionSubmit = (name: string, description: string) => {
    if (editingFaction) {
      updateFactionMutation.mutate({ factionId: editingFaction.id, name, description });
    } else {
      createFactionMutation.mutate({ name, description });
    }
  };

  const handleToggleFactionCollapse = (factionId: number) => {
    setCollapsedFactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(factionId)) {
        newSet.delete(factionId);
      } else {
        newSet.add(factionId);
      }
      return newSet;
    });
  };
  const handleToggleCompactFactionCollapse = (factionId: number) => {
    setCollapsedCompactFactions(prev => {
      const next = new Set(prev);
      if (next.has(factionId)) next.delete(factionId);
      else next.add(factionId);
      return next;
    });
  };
  const handleUpdateFaction = (factionId: number, name: string, description: string) => updateFactionMutation.mutate({ factionId, name, description });
  const handleDeleteFaction = (factionId: number) => {
    if (confirm('确定要删除这个阵营吗？')) deleteFactionMutation.mutate(factionId);
  };

  const handleEditLoreEntry = (loreEntry: LoreEntry) => setEditingLoreEntry(loreEntry);
  const handleDeleteLoreEntry = (loreEntry: LoreEntry) => setDeletingLoreEntry(loreEntry);
  const handleConfirmDeleteLoreEntry = () => { if (deletingLoreEntry) deleteLoreEntryMutation.mutate(deletingLoreEntry); };

  const handleChapterSummary = (chapter: Chapter) => setSummaryModalChapter(chapter);
  const handleChapterDelete = (chapter: Chapter) => setDeleteModalChapter(chapter);
  const handleConfirmDelete = () => { if (deleteModalChapter) deleteChapterMutation.mutate(deleteModalChapter); };
  const handleEditSynopsis = () => { setIsEditingSynopsis(true); setSynopsisContent(work?.synopsis || ''); };
  const handleSaveSynopsis = () => updateSynopsisMutation.mutate(synopsisContent);
  const handleCancelSynopsis = () => { setIsEditingSynopsis(false); setSynopsisContent(work?.synopsis || ''); };
  const handleSynopsisKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Escape') handleCancelSynopsis(); };

  const handleEditTitle = () => { setIsEditingTitle(true); setTitleContent(work?.title || ''); };
  const handleSaveTitle = () => {
    if (titleContent.trim() && titleContent.trim() !== work?.title) updateTitleMutation.mutate(titleContent.trim());
    else setIsEditingTitle(false);
  };
  const handleCancelTitle = () => { setIsEditingTitle(false); setTitleContent(work?.title || ''); };
  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveTitle();
    else if (e.key === 'Escape') handleCancelTitle();
  };

  const handleEditActName = (actId: number, currentName?: string) => setEditActNameModal({ act: actId, currentName });
  const handleSaveActName = (actName: string) => { if (editActNameModal) updateActNameMutation.mutate({ actId: editActNameModal.act, name: actName }); };
  const handleDeleteAct = (actId: number) => { const act = actsData?.find(a => a.id === actId); setDeleteActModal({ act: actId, actName: act?.name }); };
  const handleConfirmDeleteAct = () => { if (deleteActModal) deleteActMutation.mutate(deleteActModal.act); };
  const handleActSynopsis = (act: Act) => setActSynopsisModalAct(act);
  const handleActSynopsisUpdated = (synopsis: string) => { queryClient.invalidateQueries({ queryKey: ['acts', workIdNum] }); };
  const handleCreateAct = () => {
    const currentOrders = (actsData && Array.isArray(actsData)) ? actsData.map(act => act.order) : [0];
    const nextOrder = Math.max(...currentOrders, 0) + 1;
    createActMutation.mutate({ name: `第${nextOrder}卷`, order: nextOrder });
  };
  const handleReorderChapters = (actId: number, chapterIds: number[]) => reorderChaptersMutation.mutate({ actId, chapterIds });
  const effectiveLoreViewMode: 'faction' | 'compact' = isMobile ? 'compact' : loreViewMode;

  const tabs = [
    { id: 'chapters', label: '章节', icon: BookOpen },
    { id: 'synopsis', label: '大纲', icon: Edit3 },
    { id: 'lore', label: '世界观', icon: Layers },
  ];

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Desktop Header */}
      <header className="border-b border-dark-border hidden md:block">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="flex items-center gap-2">
                <ArrowLeft size={18} />返回首页
              </Button>
              <div>
                {isEditingTitle ? (
                  <input type="text" value={titleContent} onChange={(e) => setTitleContent(e.target.value)} onBlur={handleSaveTitle} onKeyDown={handleTitleKeyDown} className="text-2xl font-bold text-dark-text bg-transparent border-b-2 border-dark-primary focus:outline-none w-full min-w-[300px]" autoFocus />
                ) : (
                  <h1 className="text-2xl font-bold text-dark-text hover:text-dark-primary cursor-pointer transition-colors" onClick={handleEditTitle}>{work.title}</h1>
                )}
                <p className="text-dark-text-muted">{work.word_count.toLocaleString()} 字 · {work.chapter_count} 章</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsStyleManagerOpen(true)} className="flex items-center gap-2"><Palette size={16} />风格</Button>
              <Button variant="outline" size="sm" onClick={() => setIsSettingsModalOpen(true)} className="flex items-center gap-2"><Settings size={16} />设置</Button>
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Header - Two Rows */}
      <header className="border-b border-dark-border md:hidden">
        {/* Row 1: Back button, Title, Word count, User menu */}
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button onClick={() => navigate('/')} className="flex-shrink-0 p-1 text-dark-text-muted hover:text-dark-text">
                <ArrowLeft size={20} />
              </button>
              <div className="min-w-0 flex-1">
                {isEditingTitle ? (
                  <input type="text" value={titleContent} onChange={(e) => setTitleContent(e.target.value)} onBlur={handleSaveTitle} onKeyDown={handleTitleKeyDown} className="text-lg font-bold text-dark-text bg-transparent border-b-2 border-dark-primary focus:outline-none w-full" autoFocus />
                ) : (
                  <h1 className="text-lg font-bold text-dark-text truncate" onClick={handleEditTitle}>{work.title}</h1>
                )}
                <p className="text-xs text-dark-text-muted">{work.word_count.toLocaleString()} 字 · {work.chapter_count} 章</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => setIsStyleManagerOpen(true)} className="p-2 text-dark-text-muted hover:text-dark-text">
                <Palette size={18} />
              </button>
              <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 text-dark-text-muted hover:text-dark-text">
                <Settings size={18} />
              </button>
              <UserMenu />
            </div>
          </div>
        </div>
        {/* Row 2: Tabs and action button */}
        <div className="px-2 pb-1 flex items-center justify-between">
          <nav className="flex items-center">
            {tabs.map(({ id, label, icon: Icon }) => (
              <div key={id} className="flex items-center">
                <button onClick={() => setActiveTab(id)} className={`flex items-center gap-1 py-2 px-2 text-xs border-b-2 transition-colors ${activeTab === id ? 'border-dark-primary text-dark-primary' : 'border-transparent text-dark-text-muted'}`}>
                  <Icon size={14} />{label}
                </button>
                {id === 'lore' && activeTab === 'lore' && !isMobile && (
                  <button
                    onClick={() => setLoreViewMode(loreViewMode === 'compact' ? 'faction' : 'compact')}
                    className="ml-1 px-2 py-1 text-xs rounded border border-dark-border text-dark-text-muted hover:text-dark-text"
                    title={loreViewMode === 'compact' ? '切换到常规视图' : '切换到紧凑视图'}
                  >
                    {loreViewMode === 'compact' ? '常规' : '紧凑'}
                  </button>
                )}
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            {activeTab === 'chapters' && (
              <button onClick={handleCreateAct} className="flex items-center gap-1 px-2 py-1 text-xs bg-dark-primary text-white rounded">
                <Plus size={12} />新卷
              </button>
            )}
            {activeTab === 'lore' && (
              <>
                <button onClick={() => setIsLoreTemplateModalOpen(true)} className="flex items-center gap-1 px-2 py-1 text-xs border border-dark-border text-dark-text rounded">
                  <FileText size={12} />模板
                </button>
                <button onClick={handleCreateFaction} className="flex items-center gap-1 px-2 py-1 text-xs bg-dark-primary text-white rounded">
                  <Plus size={12} />阵营
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Desktop Tab Bar */}
      <div className="border-b border-dark-border hidden md:block">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <nav className="flex items-center space-x-6">
              {tabs.map(({ id, label, icon: Icon }) => (
                <div key={id} className="flex items-center">
                  <button onClick={() => setActiveTab(id)} className={`flex items-center gap-2 py-4 px-2 border-b-2 transition-colors ${activeTab === id ? 'border-dark-primary text-dark-primary' : 'border-transparent text-dark-text-muted hover:text-dark-text'}`}>
                    <Icon size={18} />{label}
                  </button>
                  {id === 'lore' && activeTab === 'lore' && !isMobile && (
                    <button
                      onClick={() => setLoreViewMode(loreViewMode === 'compact' ? 'faction' : 'compact')}
                      className="ml-2 px-2 py-1 text-xs rounded border border-dark-border text-dark-text-muted hover:text-dark-text"
                      title={loreViewMode === 'compact' ? '切换到常规视图' : '切换到紧凑视图'}
                    >
                      {loreViewMode === 'compact' ? '常规' : '紧凑'}
                    </button>
                  )}
                </div>
              ))}
            </nav>
            {activeTab === 'chapters' && <Button onClick={handleCreateAct} size="sm" className="flex items-center gap-2 my-2"><Plus size={16} />添加新卷</Button>}
            {activeTab === 'lore' && (
              <div className="flex items-center gap-2 my-2">
                <Button variant="outline" size="sm" onClick={() => setIsLoreTemplateModalOpen(true)} className="flex items-center gap-2"><FileText size={16} />条目模板</Button>
                <Button onClick={handleCreateFaction} size="sm" className="flex items-center gap-2"><Plus size={16} />新建阵营</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className={`max-w-7xl mx-auto px-6 py-8 ${activeTab === 'synopsis' ? 'md:pb-8 pb-[80px]' : ''}`}>
        {activeTab === 'synopsis' && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {/* Desktop: synopsis + chat side by side */}
            <Card className="hidden md:flex flex-col h-[670px] overflow-hidden">
              <CardHeader className="flex-shrink-0"><h3 className="text-lg font-semibold">作品大纲</h3></CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                {isEditingSynopsis ? (
                  <Textarea value={synopsisContent} onChange={(e) => setSynopsisContent(e.target.value)} onBlur={handleSaveSynopsis} onKeyDown={handleSynopsisKeyDown} placeholder="请输入作品大纲..." rows={22} className="resize-none h-[570px] min-h-[570px] max-h-[570px] overflow-y-auto" />
                ) : work.synopsis ? (
                  <div className="chinese-text text-dark-text whitespace-pre-wrap leading-relaxed hover:bg-dark-surface/30 rounded p-3 cursor-pointer h-[570px] overflow-y-auto" onClick={handleEditSynopsis}>{work.synopsis}</div>
                ) : (
                  <div className="text-center py-8 text-dark-text-muted cursor-pointer h-[570px] flex flex-col justify-center" onClick={handleEditSynopsis}>
                    <Edit3 size={48} className="mx-auto mb-4 opacity-50" /><p>暂无大纲内容，点击添加</p>
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="hidden md:block h-[670px]"><WorkChatPanel work={work} scrollToLatestOnMount /></div>

            {/* Mobile: dedicated page switch between synopsis and chat */}
            <div className="md:hidden">
              {mobileSynopsisTab === 'synopsis' ? (
                <Card className="flex flex-col h-[calc(100vh-240px)] overflow-hidden">
                  <CardHeader className="flex-shrink-0"><h3 className="text-lg font-semibold">作品大纲</h3></CardHeader>
                  <CardContent className="flex-1 overflow-hidden">
                    {isEditingSynopsis ? (
                      <Textarea value={synopsisContent} onChange={(e) => setSynopsisContent(e.target.value)} onBlur={handleSaveSynopsis} onKeyDown={handleSynopsisKeyDown} placeholder="请输入作品大纲..." rows={22} className="resize-none h-full min-h-0 overflow-y-auto" />
                    ) : work.synopsis ? (
                      <div className="chinese-text text-dark-text whitespace-pre-wrap leading-relaxed hover:bg-dark-surface/30 rounded p-3 cursor-pointer h-full overflow-y-auto" onClick={handleEditSynopsis}>{work.synopsis}</div>
                    ) : (
                      <div className="text-center py-8 text-dark-text-muted cursor-pointer h-full flex flex-col justify-center" onClick={handleEditSynopsis}>
                        <Edit3 size={48} className="mx-auto mb-4 opacity-50" /><p>暂无大纲内容，点击添加</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="h-[calc(100vh-240px)]">
                  <WorkChatPanel work={work} scrollToLatestOnMount />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'chapters' && (
          <div className="space-y-4">
            {workChapters.length === 0 ? (
              <Card><CardContent className="text-center py-12">
                <BookOpen size={48} className="mx-auto mb-4 text-dark-text-muted opacity-50" />
                <h3 className="text-lg font-medium text-dark-text mb-2">开始创作</h3>
                <Button onClick={handleCreateChapter} className="flex items-center gap-2"><Plus size={18} />创建第一章</Button>
              </CardContent></Card>
            ) : (
              <div className="space-y-3">
                {actsData && Array.isArray(actsData) && actsData.length > 0 ? (
                  [...actsData].sort((a, b) => {
                    // Sort: normal acts first (by order), then side chapters acts (by order)
                    const aType = a.act_type === 'side_chapters' ? 1 : 0;
                    const bType = b.act_type === 'side_chapters' ? 1 : 0;
                    if (aType !== bType) return aType - bType;
                    return a.order - b.order;
                  }).map(act => (
                    <ActSection key={act.id} actData={act} chapters={(workChapters || []).filter(ch => ch.act === act.id).sort((a, b) => a.chapter_number - b.chapter_number)} onChapterClick={handleChapterClick} onChapterDelete={handleChapterDelete} onChapterSummary={handleChapterSummary} onCreateChapter={handleCreateChapterInAct} onEditActName={handleEditActName} onDeleteAct={handleDeleteAct} onReorderChapters={handleReorderChapters} onActSynopsis={handleActSynopsis} />
                  ))
                ) : (
                  <div className="text-center py-8 text-dark-text-muted"><BookOpen size={48} className="mx-auto mb-4 opacity-50" /><p>暂无卷，点击"添加新卷"开始创作</p></div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'lore' && (
          <div className="space-y-4">
            {sortedFactions.length === 0 ? (
              <Card><CardContent className="text-center py-12">
                <Layers size={48} className="mx-auto mb-4 text-dark-text-muted opacity-50" />
                <h3 className="text-lg font-medium text-dark-text mb-2">构建世界观</h3>
                <p className="text-dark-text-muted mb-4">创建阵营来组织角色和世界观设定</p>
                <Button onClick={handleCreateFaction} className="flex items-center gap-2"><Plus size={18} />创建第一个阵营</Button>
              </CardContent></Card>
            ) : (
              effectiveLoreViewMode === 'faction' ? (
                <div className="space-y-4">
                  {sortedFactions.map((faction) => (
                  <FactionSection key={faction.id} faction={faction} isCollapsed={collapsedFactions.has(faction.id)} loreEntries={getLoreEntriesForFaction(faction.id)} onToggleCollapse={handleToggleFactionCollapse} onEditFaction={handleEditFaction} onDeleteFaction={handleDeleteFaction} onAddCharacter={(factionId) => handleCreateLore(factionId)} onEditLoreEntry={handleEditLoreEntry} onDeleteLoreEntry={handleDeleteLoreEntry} />
                  ))}
                  <div className="flex justify-center pt-4">
                    <Button onClick={handleCreateFaction} variant="outline" className="flex items-center gap-2"><Plus size={18} />新建阵营</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {compactLoreFactions.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-dark-text-muted">
                        当前没有包含条目的阵营
                      </CardContent>
                    </Card>
                  ) : (
                    compactLoreFactions.map(({ faction, entries }) => (
                      <div key={faction.id} className="border border-dark-border rounded-md p-2 bg-dark-surface/20">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <button
                              onClick={() => handleToggleCompactFactionCollapse(faction.id)}
                              className="p-1 rounded hover:bg-dark-bg text-dark-text-muted hover:text-dark-text flex-shrink-0"
                              title={collapsedCompactFactions.has(faction.id) ? '展开' : '收起'}
                            >
                              {collapsedCompactFactions.has(faction.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <h4 className="text-sm font-medium text-dark-text truncate flex-shrink-0">{faction.name}</h4>
                            {faction.faction_type === 'normal' && (
                              <button
                                onClick={() => handleEditFaction(faction)}
                                className="p-1 rounded hover:bg-dark-bg text-dark-text-muted hover:text-dark-primary flex-shrink-0"
                                title="编辑阵营"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                            <span className="text-xs text-dark-text-muted truncate min-w-0">
                              {faction.description || '暂无描述'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleCreateLore(faction.id)}
                            className="p-1 rounded hover:bg-dark-primary/20 text-dark-primary ml-2 flex-shrink-0"
                            title="在该阵营创建条目"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        {!collapsedCompactFactions.has(faction.id) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                            {entries.map((entry) => (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between gap-2 rounded border border-dark-border/60 px-2 py-1 bg-dark-bg/50"
                              >
                                <button onClick={() => handleEditLoreEntry(entry)} className="text-left hover:text-dark-primary flex-1 min-w-0">
                                  <div className="flex items-start gap-2">
                                    <span className="text-xs text-dark-text truncate flex-shrink-0 max-w-[40%]">{entry.name}</span>
                                    <span className="text-xs text-dark-text-muted line-clamp-2 min-w-0 flex-1">{entry.description}</span>
                                  </div>
                                </button>
                                <button
                                  onClick={() => handleDeleteLoreEntry(entry)}
                                  className="p-1 rounded text-dark-text-muted hover:text-red-400 hover:bg-dark-bg transition-colors"
                                  title="删除条目"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )
            )}
          </div>
        )}

      </main>

      <CreateLoreModal workId={workIdNum} isOpen={isCreateLoreModalOpen || !!editingLoreEntry} onClose={() => { setIsCreateLoreModalOpen(false); setEditingLoreEntry(null); setCreateLoreDefaultFaction(null); }} onLoreCreated={() => { setIsCreateLoreModalOpen(false); setEditingLoreEntry(null); setCreateLoreDefaultFaction(null); queryClient.invalidateQueries({ queryKey: ['lore', workIdNum] }); }} editEntry={editingLoreEntry} factions={factionsData || []} defaultFactionId={createLoreDefaultFaction} />
      <CreateFactionModal isOpen={isCreateFactionModalOpen} onClose={() => { setIsCreateFactionModalOpen(false); setEditingFaction(null); }} onSubmit={handleFactionSubmit} editFaction={editingFaction} />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />
      <StyleManagerModal isOpen={isStyleManagerOpen} onClose={() => setIsStyleManagerOpen(false)} onCreateNew={() => { setIsStyleManagerOpen(false); setIsCreateStyleOpen(true); }} />
      <CreateStyleModal isOpen={isCreateStyleOpen} onClose={() => setIsCreateStyleOpen(false)} />
      <SummaryModal chapter={summaryModalChapter} isOpen={!!summaryModalChapter} onClose={() => setSummaryModalChapter(null)} />
      <DeleteConfirmDialog chapter={deleteModalChapter} isOpen={!!deleteModalChapter} onClose={() => setDeleteModalChapter(null)} onConfirm={handleConfirmDelete} isDeleting={deleteChapterMutation.isPending} />
      <DeleteLoreConfirmDialog loreEntry={deletingLoreEntry} isOpen={!!deletingLoreEntry} onClose={() => setDeletingLoreEntry(null)} onConfirm={handleConfirmDeleteLoreEntry} isDeleting={deleteLoreEntryMutation.isPending} />
      <EditActNameModal isOpen={!!editActNameModal} onClose={() => setEditActNameModal(null)} onSave={handleSaveActName} currentName={editActNameModal?.currentName} actNumber={editActNameModal?.act || 1} />
      <DeleteActConfirmDialog act={deleteActModal?.act || null} actName={deleteActModal?.actName} isOpen={!!deleteActModal} onClose={() => setDeleteActModal(null)} onConfirm={handleConfirmDeleteAct} isDeleting={deleteActMutation.isPending} />
      <LoreTemplateModal work={work} isOpen={isLoreTemplateModalOpen} onClose={() => setIsLoreTemplateModalOpen(false)} />
      <ActSynopsisModal act={actSynopsisModalAct} workId={workIdNum} isOpen={!!actSynopsisModalAct} onClose={() => setActSynopsisModalAct(null)} onSynopsisUpdated={handleActSynopsisUpdated} />
      {/* Mobile Bottom Tab Bar for Synopsis Page */}
      {activeTab === 'synopsis' && (
        <div className="fixed bottom-0 left-0 right-0 md:hidden bg-dark-surface border-t border-dark-border safe-area-bottom z-30">
          <div className="flex h-[60px]">
            <button
              onClick={() => setMobileSynopsisTab('synopsis')}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                mobileSynopsisTab === 'synopsis'
                  ? 'text-dark-primary bg-dark-primary/10'
                  : 'text-dark-text-muted'
              }`}
            >
              <FileText size={20} />
              <span className="text-xs">大纲</span>
            </button>
            <button
              onClick={() => setMobileSynopsisTab('chat')}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                mobileSynopsisTab === 'chat'
                  ? 'text-dark-primary bg-dark-primary/10'
                  : 'text-dark-text-muted'
              }`}
            >
              <MessageCircle size={20} />
              <span className="text-xs">AI助手</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
