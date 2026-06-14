import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Square, Wand2, Check, RotateCcw, Settings } from 'lucide-react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { useMobile } from '../../hooks/useMobile';
import type { Work, Act, Chapter, Faction, LoreEntry, WritingStyle } from '../../types';
import { editPrefillsApi, type EditPrefill } from '../../services/api';
import { EditPrefillModal } from './EditPrefillModal';
import { stripThoughtProcess } from '../../utils/stripThoughtProcess';

interface AutoEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  work: Work;
  chapter: Chapter;
  onAccept: (editedText: string) => void;
  onRevert: (originalText: string) => void;
  onGenerateEdit: (
    originalText: string,
    context: AutoEditContext,
    onChunk: (chunk: string) => void,
    onEnd: () => void,
    onError: (error: string) => void,
    signal?: AbortSignal
  ) => Promise<void>;
  isMobile?: boolean;
  defaultEditRequirement?: string;
}

export interface AutoEditContext {
  chapterSelection: 'all' | 'custom' | 'none';
  customChapterCount?: number;
  selectedLoreEntries: number[]; // IDs of selected lore entries
  selectedFactions?: number[]; // IDs of selected factions
  reasoningMode?: boolean;
  useNsfwStyle?: boolean;
  editRequirement?: string; // Editing requirement/instruction
  styleId?: number; // Optional writing style ID
}

interface AutoEditVersion {
  text: string;
  timestamp: Date;
}

export const AutoEditModal: React.FC<AutoEditModalProps> = ({
  isOpen,
  onClose,
  originalText: initialOriginalText,
  work,
  chapter,
  onAccept,
  onRevert,
  onGenerateEdit,
  isMobile: isMobileProp,
  defaultEditRequirement,
}) => {
  const FACTION_FILTER_GROUP = '__factions__' as const;

  // Mobile detection - use prop if provided, otherwise detect
  const isMobileHook = useMobile();
  const isMobile = isMobileProp !== undefined ? isMobileProp : isMobileHook;
  const selectedPrefillStorageKey = 'autoEdit_selectedPrefillId';
  const titleText = initialOriginalText ? '自动编辑' : 'AI 生成文本';
  const originalTextLabel = initialOriginalText ? '原始文本' : '提示词（可选）';
  const originalTextPlaceholder = initialOriginalText ? '原始文本...' : '输入提示词来引导 AI 生成（可留空）...';
  const guideLabel = '编辑指引';
  const guidePlaceholder = '输入编辑要求...';
  const outputLabel = '编辑文本';
  const generateButtonText = initialOriginalText ? '自动编辑' : 'AI 生成';

  // State for text boxes
  const [originalText, setOriginalText] = useState(initialOriginalText);
  const [editedVersions, setEditedVersions] = useState<AutoEditVersion[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1); // -1 means no version yet
  const [currentEditedText, setCurrentEditedText] = useState('');

  // State for streaming
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedTextRef = useRef<string>('');
  const streamInactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamMaxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStreamTimers = () => {
    if (streamInactivityTimerRef.current) {
      clearTimeout(streamInactivityTimerRef.current);
      streamInactivityTimerRef.current = null;
    }
    if (streamMaxDurationTimerRef.current) {
      clearTimeout(streamMaxDurationTimerRef.current);
      streamMaxDurationTimerRef.current = null;
    }
  };

  const stopGenerationSafely = () => {
    clearStreamTimers();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    const cleanedText = cleanAutoEditOutput(accumulatedTextRef.current);
    setCurrentEditedText(cleanedText);
    setEditedVersions(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[updated.length - 1] = { ...updated[updated.length - 1], text: cleanedText };
      }
      return updated;
    });
    setIsGenerating(false);
  };

  // Helper to clean up trailing "---" and newline before it from auto-edit output
  const cleanAutoEditOutput = (text: string): string => {
    // Remove trailing "---" with optional newline before it
    return text.replace(/\n?---\s*$/, '').trimEnd();
  };

  // State for customize panel
  const [showCustomize, setShowCustomize] = useState(false);
  const [mobileView, setMobileView] = useState<'input' | 'output'>('input');
  const [chapterSelection, setChapterSelection] = useState<'all' | 'custom' | 'none'>('custom');
  const [customChapterCount, setCustomChapterCount] = useState(1);
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [factions, setFactions] = useState<Faction[]>([]);
  
  // Sort factions: 无归属 (top) → normal factions (by order) → 世界观 (bottom)
  const sortedFactions = React.useMemo(() => {
    return [...factions].sort((a, b) => {
      if (a.faction_type === 'no_faction') return -1;
      if (b.faction_type === 'no_faction') return 1;
      if (a.faction_type === 'worldbuilding') return 1;
      if (b.faction_type === 'worldbuilding') return -1;
      return a.order - b.order;
    });
  }, [factions]);
  const selectableContextFactions = React.useMemo(
    () => sortedFactions.filter((faction) => faction.faction_type === 'normal'),
    [sortedFactions]
  );
  
  const [selectedFactionFilter, setSelectedFactionFilter] = useState<number | 'all' | typeof FACTION_FILTER_GROUP>('all');
  const [selectedFactionIds, setSelectedFactionIds] = useState<number[]>([]);
  const [selectedLoreIds, setSelectedLoreIds] = useState<number[]>([]);
  const [loreCurrentPage, setLoreCurrentPage] = useState(1);
  const [isReasoningMode, setIsReasoningMode] = useState(() =>
    localStorage.getItem('autoEdit_reasoningMode') === 'true'
  );
  const [isUseNsfwStyle, setIsUseNsfwStyle] = useState(() =>
    localStorage.getItem('autoEdit_useNsfwStyle') === 'true'
  );
  const LORE_PAGE_SIZE = 8; // 4x2 grid

  // State for editing requirement
  const [editRequirement, setEditRequirement] = useState('');

  // Prefill options fetched from backend
  const [prefills, setPrefills] = useState<EditPrefill[]>([]);
  const [isLoadingPrefills, setIsLoadingPrefills] = useState(true);
  const [showEditPrefillModal, setShowEditPrefillModal] = useState(false);

  // Writing styles
  const [styles, setStyles] = useState<WritingStyle[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(() => {
    const saved = localStorage.getItem('autoEdit_selectedStyleId');
    return saved ? parseInt(saved, 10) : null;
  });

  const regularStyles = styles.filter(s => !s.is_nsfw);
  const nsfwStyle = styles.find(s => s.is_nsfw);
  const hasNsfwStyleContent = Boolean(nsfwStyle?.style_data?.trim());

  useEffect(() => {
    if (!hasNsfwStyleContent && isUseNsfwStyle) {
      setIsUseNsfwStyle(false);
      localStorage.setItem('autoEdit_useNsfwStyle', 'false');
    }
  }, [hasNsfwStyleContent, isUseNsfwStyle]);

  const handleReasoningModeChange = (checked: boolean) => {
    setIsReasoningMode(checked);
    localStorage.setItem('autoEdit_reasoningMode', checked ? 'true' : 'false');
  };

  const handleUseNsfwStyleChange = (checked: boolean) => {
    setIsUseNsfwStyle(checked);
    localStorage.setItem('autoEdit_useNsfwStyle', checked ? 'true' : 'false');
  };

  // All chapters for accurate prompt length calculation
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  // All acts for accurate prompt length calculation
  const [allActs, setAllActs] = useState<Act[]>([]);

  const [selectedPrefillId, setSelectedPrefillId] = useState<number | null>(() => {
    const saved = localStorage.getItem(selectedPrefillStorageKey);
    return saved ? parseInt(saved, 10) : null;
  });

  // Load prefills from backend on mount (filtered by scope)
  const loadPrefills = async () => {
    try {
      const response = await editPrefillsApi.list('auto_edit');
      setPrefills(response.data);
      // Use saved prefill ID or find default
      const savedId = localStorage.getItem(selectedPrefillStorageKey);
      let selectedPrefill: EditPrefill | undefined;
      
      if (savedId) {
        const id = parseInt(savedId, 10);
        selectedPrefill = response.data.find(p => p.id === id);
      }
      
      if (!selectedPrefill) {
        selectedPrefill = response.data.find(p => p.is_default) ||
                         response.data.find(p => p.name === '修改') ||
                         response.data[0];
      }
      
      if (selectedPrefill) {
        setSelectedPrefillId(selectedPrefill.id);
        setEditRequirement(selectedPrefill.prompt_text);
        localStorage.setItem(selectedPrefillStorageKey, selectedPrefill.id.toString());
      } else if (defaultEditRequirement) {
        // Fallback to provided default if no prefill found
        setEditRequirement(defaultEditRequirement);
      }
    } catch (error) {
      console.error('Failed to load prefills:', error);
      setPrefills([]);
      if (defaultEditRequirement) {
        setEditRequirement(defaultEditRequirement);
      }
    } finally {
      setIsLoadingPrefills(false);
    }
  };

  useEffect(() => {
    loadPrefills();
  }, [selectedPrefillStorageKey]);

  // Load writing styles when modal opens
  useEffect(() => {
    if (isOpen) {
      const loadStyles = async () => {
        try {
          const { stylesApi } = await import('../../services/api');
          const response = await stylesApi.list();
          // Handle both paginated and non-paginated responses
          const stylesList = Array.isArray(response.data) ? response.data : ((response.data as any)?.results || []);
          setStyles(stylesList);
        } catch (error) {
          console.error('Failed to load styles:', error);
          setStyles([]);
        }
      };
      loadStyles();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedStyleId && styles.length > 0) {
      const selected = styles.find(s => s.id === selectedStyleId);
      if (selected?.is_nsfw) {
        setSelectedStyleId(null);
        localStorage.removeItem('autoEdit_selectedStyleId');
      }
    }
  }, [styles, selectedStyleId]);

  // Load all chapters and acts when modal opens for accurate prompt length calculation
  useEffect(() => {
    if (isOpen && work?.id) {
      const loadData = async () => {
        try {
          const { chaptersApi, actsApi } = await import('../../services/api');
          const [chaptersResponse, actsResponse] = await Promise.all([
            chaptersApi.list(work.id),
            actsApi.list(work.id)
          ]);
          // Handle both array and paginated response formats
          const chaptersData = Array.isArray(chaptersResponse.data) 
            ? chaptersResponse.data 
            : ((chaptersResponse.data as any)?.results || []);
          const actsData = Array.isArray(actsResponse.data) 
            ? actsResponse.data 
            : ((actsResponse.data as any)?.results || []);
          setAllChapters(chaptersData);
          setAllActs(actsData);
        } catch (error) {
          console.error('Failed to load chapters/acts:', error);
          setAllChapters([]);
          setAllActs([]);
        }
      };
      loadData();
    }
  }, [isOpen, work?.id]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && !isLoadingPrefills) {
      setOriginalText(initialOriginalText);
      setEditedVersions([]);
      setCurrentVersionIndex(-1);
      setCurrentEditedText('');
      setIsGenerating(false);
      setMobileView('input');
      clearStreamTimers();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      const selectedPrefill = prefills.find(p => p.id === selectedPrefillId) ||
                              prefills.find(p => p.is_default) ||
                              prefills[0];
      if (selectedPrefill) {
        setEditRequirement(selectedPrefill.prompt_text);
      } else if (defaultEditRequirement) {
        // Only use defaultEditRequirement as fallback if no prefill is available
        setEditRequirement(defaultEditRequirement);
      }
      // Default customize context to previous 1 chapter.
      setChapterSelection('custom');
      setCustomChapterCount(1);
      setSelectedFactionFilter('all'); // Reset faction filter
      setSelectedFactionIds([]);
      loadLoreEntries();
      preselectTriggeredContextEntries(initialOriginalText);
    }
  }, [isOpen, initialOriginalText, isLoadingPrefills, prefills, defaultEditRequirement, selectedPrefillId]);

  // Lock background editor scroll when mobile auto-edit is open.
  useEffect(() => {
    if (!isOpen || !isMobile) return;
    const scrollY = window.scrollY;
    const { style } = document.body;
    const prev = {
      overflow: style.overflow,
      position: style.position,
      top: style.top,
      width: style.width,
    };

    style.overflow = 'hidden';
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.width = '100%';

    return () => {
      style.overflow = prev.overflow;
      style.position = prev.position;
      style.top = prev.top;
      style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen, isMobile]);

  // Update edit requirement when prefill selection changes (without resetting modal)
  useEffect(() => {
    if (isOpen && !isLoadingPrefills && prefills.length > 0 && selectedPrefillId) {
      const selectedPrefill = prefills.find(p => p.id === selectedPrefillId);
      if (selectedPrefill) {
        setEditRequirement(selectedPrefill.prompt_text);
      }
    }
  }, [selectedPrefillId, isOpen, isLoadingPrefills, prefills]);

  // Load lore entries and factions for the work
  const loadLoreEntries = async () => {
    try {
      const { loreApi, factionsApi } = await import('../../services/api');
      
      // Load lore entries
      const loreResponse = await loreApi.list(work.id);
      const loreData = loreResponse.data;

      // Handle both array and paginated response formats
      if (Array.isArray(loreData)) {
        setLoreEntries(loreData);
      } else if ((loreData as any).results && Array.isArray((loreData as any).results)) {
        setLoreEntries((loreData as any).results);
      } else {
        console.warn('Unexpected lore entries format:', loreData);
        setLoreEntries([]);
      }

      // Load factions
      const factionsResponse = await factionsApi.list(work.id);
      const factionsData = factionsResponse.data;
      if (Array.isArray(factionsData)) {
        setFactions(factionsData);
      } else if ((factionsData as any).results && Array.isArray((factionsData as any).results)) {
        setFactions((factionsData as any).results);
      } else {
        setFactions([]);
      }
    } catch (error) {
      console.error('Failed to load lore entries:', error);
      setLoreEntries([]);
      setFactions([]);
    }
  };

  // Auto-select lore/faction context triggered by text.
  // Lore keys include name + triggers; faction keys include faction name.
  const preselectTriggeredContextEntries = (sourceText: string) => {
    const text = sourceText || '';
    const triggeredLoreIds: number[] = [];
    const triggeredFactionIds: number[] = [];

    loreEntries.forEach(entry => {
      const allTriggers = [entry.name, ...(entry.triggers || []), ...(entry.extra_triggers || [])]
        .filter(Boolean);
      const isTriggered = allTriggers.some(trigger => text.includes(trigger));
      if (isTriggered) {
        triggeredLoreIds.push(entry.id);
      }
    });

    selectableContextFactions.forEach(faction => {
      if (faction.name && text.includes(faction.name)) {
        triggeredFactionIds.push(faction.id);
      }
    });

    setSelectedLoreIds(triggeredLoreIds);
    setSelectedFactionIds(triggeredFactionIds);
  };

  useEffect(() => {
    if (loreEntries.length > 0 || factions.length > 0) {
      preselectTriggeredContextEntries(initialOriginalText);
    }
  }, [loreEntries, selectableContextFactions, initialOriginalText]);

  // Real-time trigger detection as user types in originalText
  useEffect(() => {
    if (loreEntries.length === 0) return;

    const newTriggeredIds: number[] = [];
    loreEntries.forEach(entry => {
      const allTriggers = [entry.name, ...(entry.triggers || []), ...(entry.extra_triggers || [])].filter(Boolean);
      const isTriggered = allTriggers.some(trigger =>
        originalText.includes(trigger)
      );
      if (isTriggered) {
        newTriggeredIds.push(entry.id);
      }
    });

    // Find newly triggered entries (not already selected)
    const newlyTriggered = newTriggeredIds.filter(id => !selectedLoreIds.includes(id));

    if (newlyTriggered.length > 0) {
      // Auto-select newly triggered entries (silently, without opening panel)
      setSelectedLoreIds(prev => [...new Set([...prev, ...newlyTriggered])]);
    }
  }, [originalText, loreEntries]);

  // Real-time faction auto-selection by faction name mention.
  useEffect(() => {
    if (selectableContextFactions.length === 0) return;
    const newTriggeredFactionIds = selectableContextFactions
      .filter(faction => faction.name && originalText.includes(faction.name))
      .map(faction => faction.id);

    const newlyTriggered = newTriggeredFactionIds.filter(id => !selectedFactionIds.includes(id));
    if (newlyTriggered.length > 0) {
      setSelectedFactionIds(prev => [...new Set([...prev, ...newlyTriggered])]);
    }
  }, [originalText, selectableContextFactions, selectedFactionIds]);

  // Handle generate auto edit
  const handleGenerateEdit = async () => {
    if (isGenerating) {
      stopGenerationSafely();
      return;
    }

    setIsGenerating(true);
    if (isMobile) {
      setMobileView('output');
    }
    setCurrentEditedText(''); // Clear current text
    accumulatedTextRef.current = ''; // Reset accumulated text ref

    // Create new version entry immediately before generation
    const newIndex = editedVersions.length;
    setEditedVersions(prev => [...prev, { text: '', timestamp: new Date() }]);
    setCurrentVersionIndex(newIndex);

    const effectiveRequirement = editRequirement.trim() || (defaultEditRequirement || '修改');
    const context: AutoEditContext = {
      chapterSelection,
      customChapterCount: chapterSelection === 'custom' ? customChapterCount : undefined,
      selectedLoreEntries: selectedLoreIds,
      selectedFactions: selectedFactionIds,
      reasoningMode: isReasoningMode,
      useNsfwStyle: isUseNsfwStyle && hasNsfwStyleContent,
      editRequirement: effectiveRequirement,
      styleId: selectedStyleId || undefined,
    };

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const resetInactivityTimer = () => {
      if (streamInactivityTimerRef.current) {
        clearTimeout(streamInactivityTimerRef.current);
      }
      // If no chunk arrives for 45s, consider stream stale and unlock UI.
      streamInactivityTimerRef.current = setTimeout(() => {
        console.warn('Auto-edit stream inactive for too long, stopping safely.');
        stopGenerationSafely();
      }, 45000);
    };
    resetInactivityTimer();

    // Hard cap to prevent modal from getting stuck in generating state indefinitely.
    streamMaxDurationTimerRef.current = setTimeout(() => {
      console.warn('Auto-edit stream exceeded max duration, stopping safely.');
      stopGenerationSafely();
    }, 8 * 60 * 1000);

    await onGenerateEdit(
      originalText,
      context,
      (chunk: string) => {
        resetInactivityTimer();
        accumulatedTextRef.current += chunk;
        setCurrentEditedText(cleanAutoEditOutput(accumulatedTextRef.current));
      },
      () => {
        // On end - clean up text, version already exists
        clearStreamTimers();
        const cleanedText = cleanAutoEditOutput(accumulatedTextRef.current);
        setCurrentEditedText(cleanedText);
        setEditedVersions(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = { ...updated[updated.length - 1], text: cleanedText };
          }
          return updated;
        });
        setIsGenerating(false);
        abortControllerRef.current = null;
      },
      (error: string) => {
        // On error - clean up version with whatever text we have
        clearStreamTimers();
        console.error('Auto edit error:', error);
        const cleanedText = cleanAutoEditOutput(accumulatedTextRef.current);
        if (cleanedText.trim()) {
          setEditedVersions(prev => {
            const updated = [...prev];
            if (updated.length > 0) {
              updated[updated.length - 1] = { ...updated[updated.length - 1], text: cleanedText };
            }
            return updated;
          });
        }
        setIsGenerating(false);
        abortControllerRef.current = null;
      },
      abortController.signal
    );
  };

  // Handle version navigation
  const handlePreviousVersion = () => {
    if (currentVersionIndex > 0) {
      const newIndex = currentVersionIndex - 1;
      setCurrentVersionIndex(newIndex);
      setCurrentEditedText(editedVersions[newIndex].text);
    }
  };

  const handleNextVersion = () => {
    if (currentVersionIndex < editedVersions.length - 1) {
      const newIndex = currentVersionIndex + 1;
      setCurrentVersionIndex(newIndex);
      setCurrentEditedText(editedVersions[newIndex].text);
    }
  };

  // Handle accept
  const handleAccept = () => {
    const fullText =
      currentVersionIndex >= 0
        ? editedVersions[currentVersionIndex]?.text ?? currentEditedText
        : currentEditedText;
    const cleanedText = stripThoughtProcess(fullText);
    if (!cleanedText.trim()) return;
    onAccept(cleanedText);
    onClose();
  };

  // Handle revert
  const handleRevert = () => {
    onRevert(originalText);
    onClose();
  };

  // Handle close - with confirmation if there's unsaved work
  const handleClose = () => {
    if (isGenerating) {
      stopGenerationSafely();
    }
    if (editedVersions.length > 0) {
      if (confirm('你有未保存的编辑内容。确定要关闭吗？')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  useEffect(() => {
    return () => {
      clearStreamTimers();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Handle lore entry toggle
  const toggleLoreEntry = (id: number) => {
    setSelectedLoreIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleFactionContext = (id: number) => {
    setSelectedFactionIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Filter and paginate lore entries by faction
  const safeLoreeEntries = Array.isArray(loreEntries) ? loreEntries : [];
  const isFactionAsEntriesMode = selectedFactionFilter === FACTION_FILTER_GROUP;
  const filteredLoreEntries = selectedFactionFilter === 'all' || isFactionAsEntriesMode
    ? safeLoreeEntries
    : safeLoreeEntries.filter(entry => entry.factions?.includes(selectedFactionFilter as number));
  const contextItems = isFactionAsEntriesMode
    ? selectableContextFactions.map(faction => ({
        id: faction.id,
        name: faction.name,
        description: faction.description || '',
        itemType: 'faction' as const,
      }))
    : filteredLoreEntries.map(entry => ({
        id: entry.id,
        name: entry.name,
        description: entry.description || '',
        itemType: 'lore' as const,
      }));
  const totalLorePages = Math.ceil(contextItems.length / LORE_PAGE_SIZE);
  const paginatedContextItems = contextItems.slice(
    (loreCurrentPage - 1) * LORE_PAGE_SIZE,
    loreCurrentPage * LORE_PAGE_SIZE
  );

  // Reset page when faction filter changes
  useEffect(() => {
    setLoreCurrentPage(1);
  }, [selectedFactionFilter]);

  // Calculate actual prompt character count using real data
  const calculatePromptLength = (): number => {
    let length = 0;

    // Add writing style if selected (actual)
    if (selectedStyleId) {
      const selectedStyle = regularStyles.find(s => s.id === selectedStyleId);
      if (selectedStyle?.style_data) {
        length += selectedStyle.style_data.length + 30; // +30 for "写作风格参考：\n\n" and "---\n\n"
      }
    }

    if (isUseNsfwStyle && hasNsfwStyleContent && nsfwStyle?.style_data) {
      length += nsfwStyle.style_data.length + 30; // +30 for "NSFW风格参考：\n\n" and "---\n\n"
    }

    // Add work synopsis (actual)
    if (work.synopsis) {
      length += work.synopsis.length + 20; // +20 for "作品大纲：" etc
    }

    // Add selected lore entries (actual)
    const selectedLore = safeLoreeEntries.filter(entry => selectedLoreIds.includes(entry.id));
    if (selectedLore.length > 0) {
      length += 20; // "世界观条目：\n\n"
      selectedLore.forEach(entry => {
        length += entry.name.length + entry.description.length + 20; // +20 for "【】\n\n" formatting
      });
      length += 10; // "---\n\n"
    }

    // Add selected factions as context entries (actual)
    const selectedFactions = (Array.isArray(factions) ? factions : []).filter(f => selectedFactionIds.includes(f.id));
    if (selectedFactions.length > 0) {
      length += 20; // "阵营条目：\n\n"
      selectedFactions.forEach(faction => {
        length += faction.name.length + (faction.description?.length || 0) + 20; // +20 for "【】\n\n"
      });
      length += 10; // "---\n\n"
    }

    // Ensure allActs is an array
    const safeActs = Array.isArray(allActs) ? allActs : [];
    
    // Check if this is a side chapter
    const currentAct = safeActs.find(a => a.id === chapter.act);
    const isSideChapter = currentAct?.act_type === 'side_chapters';

    if (isSideChapter) {
      // For side chapters: include all normal act synopses
      const normalActs = safeActs
        .filter(a => a.act_type === 'normal' && a.synopsis)
        .sort((a, b) => a.order - b.order);
      
      if (normalActs.length > 0) {
        length += 20; // "正文章节摘要：\n\n"
        normalActs.forEach(act => {
          length += act.name.length + (act.synopsis?.length || 0) + 20; // +20 for "【】\n\n" formatting
        });
        length += 10; // "---\n\n"
      }
    } else {
      // For normal chapters: include previous act synopses
      if (currentAct) {
        const previousActs = safeActs
          .filter(a => a.act_type === 'normal' && a.order < currentAct.order && a.synopsis)
          .sort((a, b) => a.order - b.order);
        
        if (previousActs.length > 0) {
          length += 20; // "前卷摘要：\n\n"
          previousActs.forEach(act => {
            length += act.name.length + (act.synopsis?.length || 0) + 20; // +20 for "【】\n\n" formatting
          });
          length += 10; // "---\n\n"
        }
      }

      // Calculate previous chapters from current act only (sorted by chapter_number ascending)
      const previousChapters = allChapters
        .filter(ch => ch.act === chapter.act && ch.chapter_number < chapter.chapter_number)
        .sort((a, b) => a.chapter_number - b.chapter_number);

      // Always include all previous act synopses and chapter synopses
      // If chapterSelection is not 'none', replace last x chapters with full text
      let chaptersToReplaceWithFullText: Chapter[] = [];
      if (chapterSelection === 'none') {
        chaptersToReplaceWithFullText = [];
      } else if (chapterSelection === 'all') {
        chaptersToReplaceWithFullText = previousChapters;
      } else if (chapterSelection === 'custom') {
        // Get last x chapters (most recent, highest chapter numbers)
        chaptersToReplaceWithFullText = previousChapters.slice(-customChapterCount);
      }

      // Add chapter summaries (or full text for replaced chapters)
      if (previousChapters.length > 0) {
        length += 20; // "本卷前文章节：\n\n"
        
        previousChapters.forEach(ch => {
          if (chaptersToReplaceWithFullText.includes(ch)) {
            // Full text length - use content if available, otherwise word_count (for Chinese, word_count ≈ char count)
            const chapterTitle = `第${ch.chapter_number}章《${ch.title}》\n\n`;
            const contentLength = ch.content?.length || ch.word_count || 0;
            length += chapterTitle.length + contentLength + 10; // +10 for "\n\n---\n\n"
          } else if (ch.summary) {
            // Summary length
            const chapterTitle = `第${ch.chapter_number}章《${ch.title}》摘要：`;
            length += chapterTitle.length + ch.summary.length + 5; // +5 for "\n\n"
          }
          // If no summary and not replaced, skip (don't include)
        });
        
        length += 10; // "---\n\n"
      }
    }

    // Add current chapter content (actual)
    if (chapter.content) {
      const currentChapterTitle = `当前章节《${chapter.title}》全文：\n\n`;
      length += currentChapterTitle.length + chapter.content.length + 10; // +10 for "\n\n---\n\n"
    }

    // Add original text (actual)
    length += originalText.length;

    // Add edit requirement (actual)
    length += editRequirement.length;

    // Add system prompt and formatting overhead (for auto-edit prompt structure)
    length += 1000; // System prompt + formatting overhead

    return length;
  };

  const promptCharCount = calculatePromptLength();

  // Calculate actual number of previous chapters in current act for display/validation
  const availablePreviousChapters = allChapters.filter(
    ch => ch.act === chapter.act && ch.chapter_number < chapter.chapter_number
  ).length;

  if (!isOpen) return null;

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-dark-surface flex flex-col">
        {/* Mobile Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-dark-text">
            {titleText}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-dark-text-muted hover:text-dark-text transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        {/* Mobile Writing Style Selector */}
        <div className="px-4 py-2 border-b border-dark-border bg-dark-bg flex-shrink-0">
          <select
            value={selectedStyleId || ''}
            onChange={(e) => {
              const newStyleId = e.target.value ? parseInt(e.target.value) : null;
              setSelectedStyleId(newStyleId);
              if (newStyleId) {
                localStorage.setItem('autoEdit_selectedStyleId', newStyleId.toString());
              } else {
                localStorage.removeItem('autoEdit_selectedStyleId');
              }
            }}
            className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-dark-primary"
          >
            <option value="">无风格 (默认)</option>
            {regularStyles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
        </div>

        {/* Mobile Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          {mobileView === 'input' ? (
            <div className="space-y-4">
              {/* Prompt Page Header */}
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-dark-text">
                  {originalTextLabel}
                </label>
                <button
                  onClick={() => setMobileView('output')}
                  className="p-1 rounded border border-dark-border text-dark-text-muted hover:text-dark-text hover:border-dark-primary"
                  title="查看编辑文本"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <Textarea
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                className="font-mono text-sm resize-none w-full"
                style={{ minHeight: '260px' }}
                placeholder={originalTextPlaceholder}
              />

              {/* 编辑指引 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-dark-text">
                    {guideLabel}
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEditPrefillModal(true)}
                    className="text-xs"
                  >
                    <Settings size={14} className="mr-1" />
                    设置
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {prefills.map(prefill => (
                    <button
                      key={prefill.id}
                      onClick={() => {
                        setEditRequirement(prefill.prompt_text);
                        setSelectedPrefillId(prefill.id);
                        localStorage.setItem(selectedPrefillStorageKey, prefill.id.toString());
                      }}
                      className={`px-3 py-1.5 text-sm rounded transition-colors ${
                        selectedPrefillId === prefill.id
                          ? 'bg-dark-primary text-white'
                          : 'bg-dark-bg text-dark-text border border-dark-border'
                      }`}
                    >
                      {prefill.name}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={editRequirement}
                  onChange={(e) => setEditRequirement(e.target.value)}
                  className="font-mono text-sm resize-none w-full"
                  style={{ minHeight: '260px' }}
                  placeholder={guidePlaceholder}
                  maxLength={50000}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMobileView('input')}
                    className="p-1 rounded border border-dark-border text-dark-text-muted hover:text-dark-text hover:border-dark-primary"
                    title="返回提示词"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <label className="text-sm font-medium text-dark-text">{outputLabel}</label>
                </div>
                {/* Version Navigation */}
                {editedVersions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePreviousVersion}
                      disabled={currentVersionIndex <= 0}
                      className="p-1 hover:bg-dark-bg rounded disabled:opacity-50"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="text-xs text-dark-text-muted">
                      {currentVersionIndex + 1}/{editedVersions.length}
                    </span>
                    <button
                      onClick={handleNextVersion}
                      disabled={currentVersionIndex >= editedVersions.length - 1}
                      className="p-1 hover:bg-dark-bg rounded disabled:opacity-50"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>
              <Textarea
                value={currentEditedText}
                onChange={(e) => setCurrentEditedText(e.target.value)}
                className="font-mono text-sm resize-none w-full leading-relaxed flex-1"
                style={{ minHeight: 'calc(100vh - 300px)' }}
                placeholder={isGenerating ? "生成中..." : "编辑文本将在这里显示..."}
                disabled={isGenerating}
              />
            </div>
          )}
        </div>

        {/* Mobile Customize Overlay - Bottom Sheet Style (2/3 height) */}
        {showCustomize && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-[60] bg-black/40"
              onClick={() => setShowCustomize(false)}
            />
            {/* Bottom Sheet */}
            <div className="fixed bottom-0 left-0 right-0 z-[70] bg-dark-surface flex flex-col h-[66vh] rounded-t-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
                <h3 className="text-lg font-medium text-dark-text">自定义上下文</h3>
                <button
                  onClick={() => setShowCustomize(false)}
                  className="p-2 text-dark-text-muted hover:text-dark-text"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-6 space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isReasoningMode}
                    onChange={(e) => handleReasoningModeChange(e.target.checked)}
                    className="text-dark-primary"
                  />
                  <span className="text-sm text-dark-text">启用推理模式（自动使用当前 provider 的推理能力）</span>
                </label>
                <label className={`flex items-center gap-2 ${!hasNsfwStyleContent ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isUseNsfwStyle && hasNsfwStyleContent}
                    onChange={(e) => handleUseNsfwStyleChange(e.target.checked)}
                    disabled={!hasNsfwStyleContent}
                    className="text-dark-primary"
                  />
                  <span className="text-sm text-dark-text">使用NSFW风格</span>
                </label>
                {!hasNsfwStyleContent && (
                  <p className="text-xs text-dark-text-muted pl-6">请先在风格管理器中配置NSFW风格</p>
                )}
              </div>

              {/* Chapter Selection */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-dark-text mb-2">
                  章节选择 <span className="text-xs text-dark-text-muted">(可用: {availablePreviousChapters} 章)</span>
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'none'}
                      onChange={() => setChapterSelection('none')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">不使用前文章节（仅摘要）</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'custom'}
                      onChange={() => setChapterSelection('custom')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">使用前</span>
                    <input
                      type="number"
                      min={0}
                      max={availablePreviousChapters}
                      value={customChapterCount}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (isNaN(value)) {
                          setCustomChapterCount(0);
                        } else {
                          const maxVal = Math.max(0, availablePreviousChapters);
                          setCustomChapterCount(Math.min(Math.max(0, value), maxVal));
                          if (value > maxVal) {
                            setCustomChapterCount(maxVal);
                          }
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      className="w-16 px-2 py-1 text-sm border border-dark-border rounded bg-dark-bg text-dark-text text-center"
                    />
                    <span className="text-sm text-dark-text">章（替换为全文）</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'all'}
                      onChange={() => setChapterSelection('all')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">使用所有前文章节 ({availablePreviousChapters} 章)</span>
                  </label>
                </div>
                <p className="text-xs text-dark-text-muted mt-2">
                  提示：始终包含所有前卷摘要和本卷前文章节摘要。选择"使用前x章"或"使用所有前文章节"时，将用全文替换对应章节的摘要。
                </p>
              </div>

              {/* Lore/Faction Context Entries */}
              <div>
                <h4 className="text-sm font-medium text-dark-text mb-2">世界观条目</h4>
                {/* Faction Filter Dropdown */}
                {sortedFactions.length > 0 && (
                  <select
                    value={selectedFactionFilter}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'all' || value === FACTION_FILTER_GROUP) {
                        setSelectedFactionFilter(value);
                      } else {
                        setSelectedFactionFilter(parseInt(value));
                      }
                    }}
                    className="w-full mb-3 bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-dark-primary"
                  >
                    <option value="all">全部阵营</option>
                    {sortedFactions.filter((f) => f.faction_type !== 'worldbuilding').map((faction) => (
                      <option key={faction.id} value={faction.id}>{faction.name}</option>
                    ))}
                    <option value={FACTION_FILTER_GROUP}>阵营</option>
                    {sortedFactions.filter((f) => f.faction_type === 'worldbuilding').map((faction) => (
                      <option key={faction.id} value={faction.id}>{faction.name}</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {paginatedContextItems.map(item => (
                    <label
                      key={`${item.itemType}-${item.id}`}
                      className="flex items-start gap-2 p-2 bg-dark-bg rounded border border-dark-border cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={item.itemType === 'faction' ? selectedFactionIds.includes(item.id) : selectedLoreIds.includes(item.id)}
                        onChange={() => item.itemType === 'faction' ? toggleFactionContext(item.id) : toggleLoreEntry(item.id)}
                        className="mt-0.5"
                      />
                      <span className="text-xs text-dark-text line-clamp-2">
                        {item.name}
                        {item.description ? `：${item.description}` : ''}
                      </span>
                    </label>
                  ))}
                </div>
                {contextItems.length === 0 && (
                  <p className="text-xs text-dark-text-muted text-center py-2">该阵营暂无条目</p>
                )}
                {totalLorePages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setLoreCurrentPage(p => Math.max(1, p - 1))}
                      disabled={loreCurrentPage === 1}
                      className="px-2 py-1 border border-dark-border rounded disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-dark-text-muted">
                      {loreCurrentPage} / {totalLorePages}
                    </span>
                    <button
                      onClick={() => setLoreCurrentPage(p => Math.min(totalLorePages, p + 1))}
                      disabled={loreCurrentPage === totalLorePages}
                      className="px-2 py-1 border border-dark-border rounded disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 p-4 border-t border-dark-border">
              <Button onClick={() => setShowCustomize(false)} className="w-full">
                完成
              </Button>
            </div>
          </div>
          </>
        )}

        {/* Mobile Bottom Action Bar - Icon Only */}
        <div className="flex-shrink-0 border-t border-dark-border bg-dark-bg px-3 py-2 safe-area-bottom">
          <div className="flex items-center justify-between">
            {/* Left: Customize + Prompt Length */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCustomize(true)}
                className="p-2 rounded border border-dark-border text-dark-text-muted hover:text-dark-text hover:border-dark-primary transition-colors"
                title="自定义"
              >
                <Settings size={20} />
              </button>
              <div className="flex flex-col items-center text-xs text-dark-text-muted">
                <span>提示词长度</span>
                <span className="font-medium text-dark-text">{promptCharCount.toLocaleString()}</span>
              </div>
            </div>

            {/* Middle: Generate */}
            <div>
              {!isGenerating ? (
                <button
                  onClick={handleGenerateEdit}
                  className="p-2 rounded bg-dark-primary text-white hover:bg-dark-primary/80 transition-colors"
                  title={generateButtonText}
                >
                  <Wand2 size={20} />
                </button>
              ) : (
                <button
                  onClick={handleGenerateEdit}
                  className="p-2 rounded border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                  title="停止生成"
                >
                  <Square size={20} />
                </button>
              )}
            </div>

            {/* Right: Revert + Accept */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleRevert}
                className="p-2 rounded border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                title="还原"
              >
                <RotateCcw size={20} />
              </button>
              <button
                onClick={handleAccept}
                disabled={!currentEditedText.trim()}
                className="p-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="接受"
              >
                <Check size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout (unchanged)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-dark-surface rounded-lg shadow-xl border border-dark-border max-w-7xl w-full mx-4 h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border flex-shrink-0">
          <h2 className="text-xl font-semibold text-dark-text">
            {titleText}
          </h2>
          <button
            onClick={handleClose}
            className="text-dark-text-muted hover:text-dark-text transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Writing Style Selector */}
        <div className="px-6 py-3 border-b border-dark-border bg-dark-bg flex-shrink-0">
          <label className="flex items-center gap-3">
            <span className="text-sm font-medium text-dark-text">写作风格:</span>
            <select
              value={selectedStyleId || ''}
              onChange={(e) => {
                const newStyleId = e.target.value ? parseInt(e.target.value) : null;
                setSelectedStyleId(newStyleId);
                if (newStyleId) {
                  localStorage.setItem('autoEdit_selectedStyleId', newStyleId.toString());
                } else {
                  localStorage.removeItem('autoEdit_selectedStyleId');
                }
              }}
              className="flex-1 bg-dark-surface border border-dark-border rounded px-3 py-1.5 text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-dark-primary"
            >
              <option value="">无风格 (默认)</option>
              {regularStyles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Customize Panel (Left) */}
          {showCustomize && (
            <div className="w-80 border-r border-dark-border p-4 overflow-y-auto">
              <h3 className="text-lg font-medium text-dark-text mb-4">自定义上下文</h3>

              <div className="mb-6 space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isReasoningMode}
                    onChange={(e) => handleReasoningModeChange(e.target.checked)}
                    className="text-dark-primary"
                  />
                  <span className="text-sm text-dark-text">启用推理模式（自动使用当前 provider 的推理能力）</span>
                </label>
                <label className={`flex items-center gap-2 ${!hasNsfwStyleContent ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isUseNsfwStyle && hasNsfwStyleContent}
                    onChange={(e) => handleUseNsfwStyleChange(e.target.checked)}
                    disabled={!hasNsfwStyleContent}
                    className="text-dark-primary"
                  />
                  <span className="text-sm text-dark-text">使用NSFW风格</span>
                </label>
                {!hasNsfwStyleContent && (
                  <p className="text-xs text-dark-text-muted pl-6">请先在风格管理器中配置NSFW风格</p>
                )}
              </div>

              {/* Chapter Selection */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-dark-text mb-2">
                  章节选择 <span className="text-xs text-dark-text-muted">(可用前文: {availablePreviousChapters} 章)</span>
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'none'}
                      onChange={() => setChapterSelection('none')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">不使用前文章节（仅摘要）</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'custom'}
                      onChange={() => setChapterSelection('custom')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">使用前</span>
                    <input
                      type="number"
                      min={0}
                      max={availablePreviousChapters}
                      value={customChapterCount}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (isNaN(value)) {
                          setCustomChapterCount(0);
                        } else {
                          const maxVal = Math.max(0, availablePreviousChapters);
                          setCustomChapterCount(Math.min(Math.max(0, value), maxVal));
                          if (value > maxVal) {
                            setCustomChapterCount(maxVal);
                          }
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      className="w-16 px-2 py-1 text-sm border border-dark-border rounded bg-dark-bg text-dark-text text-center"
                    />
                    <span className="text-sm text-dark-text">章（替换为全文）</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'all'}
                      onChange={() => setChapterSelection('all')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">使用所有前文章节 ({availablePreviousChapters} 章)</span>
                  </label>
                </div>
                <p className="text-xs text-dark-text-muted mt-2">
                  提示：始终包含所有前卷摘要和本卷前文章节摘要。选择"使用前x章"或"使用所有前文章节"时，将用全文替换对应章节的摘要。
                </p>
              </div>

              {/* Lore Entries Selection */}
              <div>
                <h4 className="text-sm font-medium text-dark-text mb-2">世界观条目</h4>
                {/* Faction Filter Dropdown */}
                {sortedFactions.length > 0 && (
                  <select
                    value={selectedFactionFilter}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'all' || value === FACTION_FILTER_GROUP) {
                        setSelectedFactionFilter(value);
                      } else {
                        setSelectedFactionFilter(parseInt(value));
                      }
                    }}
                    className="w-full mb-3 bg-dark-surface border border-dark-border rounded px-3 py-1.5 text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-dark-primary"
                  >
                    <option value="all">全部阵营</option>
                    {sortedFactions.filter((f) => f.faction_type !== 'worldbuilding').map((faction) => (
                      <option key={faction.id} value={faction.id}>{faction.name}</option>
                    ))}
                    <option value={FACTION_FILTER_GROUP}>阵营</option>
                    {sortedFactions.filter((f) => f.faction_type === 'worldbuilding').map((faction) => (
                      <option key={faction.id} value={faction.id}>{faction.name}</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {paginatedContextItems.map(item => (
                    <label
                      key={`${item.itemType}-${item.id}`}
                      className="flex items-start gap-2 p-2 bg-dark-bg rounded border border-dark-border hover:border-dark-primary transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={item.itemType === 'faction' ? selectedFactionIds.includes(item.id) : selectedLoreIds.includes(item.id)}
                        onChange={() => item.itemType === 'faction' ? toggleFactionContext(item.id) : toggleLoreEntry(item.id)}
                        className="mt-0.5"
                      />
                      <span className="text-xs text-dark-text line-clamp-2">
                        {item.name}
                        {item.description ? `：${item.description}` : ''}
                      </span>
                    </label>
                  ))}
                </div>

                {contextItems.length === 0 && (
                  <p className="text-xs text-dark-text-muted text-center py-2">该阵营暂无条目</p>
                )}

                {/* Pagination */}
                {totalLorePages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setLoreCurrentPage(p => Math.max(1, p - 1))}
                      disabled={loreCurrentPage === 1}
                      className="px-2 py-1 text-xs border border-dark-border rounded disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-dark-text-muted">
                      {loreCurrentPage} / {totalLorePages}
                    </span>
                    <button
                      onClick={() => setLoreCurrentPage(p => Math.min(totalLorePages, p + 1))}
                      disabled={loreCurrentPage === totalLorePages}
                      className="px-2 py-1 text-xs border border-dark-border rounded disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Auto Edit Panel */}
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            {/* Text Boxes */}
            <div className="flex gap-4 mb-4" style={{ height: 'calc(100% - 80px)' }}>
              {/* Original Text (Left) */}
              <div className="flex-1 flex flex-col min-w-0">
                <label className="text-sm font-medium text-dark-text mb-2 flex-shrink-0">
                  {originalTextLabel}
                </label>
                <Textarea
                  value={originalText}
                  onChange={(e) => setOriginalText(e.target.value)}
                  className="font-mono text-sm resize-none"
                  style={{ minHeight: '150px', flex: '0 0 auto' }}
                  placeholder={originalTextPlaceholder}
                />

                {/* Editing Guide Section */}
                <div className="mt-3 flex flex-col">
                  <div className="flex items-center justify-between mb-2 flex-shrink-0">
                    <label className="text-sm font-medium text-dark-text">
                      {guideLabel}
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowEditPrefillModal(true)}
                      className="text-xs h-6"
                    >
                      <Settings size={12} className="mr-1" />
                      设置
                    </Button>
                  </div>
                  <div className="flex gap-2 mb-2 flex-shrink-0 flex-wrap">
                    {prefills.map(prefill => (
                      <button
                        key={prefill.id}
                        onClick={() => {
                          setEditRequirement(prefill.prompt_text);
                          setSelectedPrefillId(prefill.id);
                          localStorage.setItem(selectedPrefillStorageKey, prefill.id.toString());
                        }}
                        className={`px-3 py-1 text-sm rounded transition-colors ${
                          selectedPrefillId === prefill.id
                            ? 'bg-dark-primary text-white'
                            : 'bg-dark-bg text-dark-text border border-dark-border hover:border-dark-primary'
                        }`}
                      >
                        {prefill.name}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={editRequirement}
                    onChange={(e) => setEditRequirement(e.target.value)}
                    className="font-mono text-sm resize-none"
                    style={{ height: '225px', minHeight: '225px', maxHeight: '225px' }}
                    placeholder={guidePlaceholder}
                    maxLength={50000}
                  />
                </div>
              </div>

              {/* Edited Text (Right) */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <label className="text-sm font-medium text-dark-text">{outputLabel}</label>
                  {/* Version Navigation */}
                  {editedVersions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePreviousVersion}
                        disabled={currentVersionIndex <= 0}
                        className="p-1 hover:bg-dark-bg rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title="上一个版本"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="text-xs text-dark-text-muted">
                        {currentVersionIndex + 1} / {editedVersions.length}
                      </span>
                      <button
                        onClick={handleNextVersion}
                        disabled={currentVersionIndex >= editedVersions.length - 1}
                        className="p-1 hover:bg-dark-bg rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title="下一个版本"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  )}
                </div>
                <Textarea
                  value={currentEditedText}
                  onChange={(e) => setCurrentEditedText(e.target.value)}
                  className="font-mono text-sm resize-none"
                  style={{ height: '415px', minHeight: '415px', maxHeight: '415px' }}
                  placeholder={isGenerating ? "生成中..." : "编辑文本将在这里显示..."}
                  disabled={isGenerating}
                />
              </div>
            </div>

            {/* Bottom Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-dark-border">
              {/* Left: Customize and Character Count */}
              <div className="flex items-center gap-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCustomize(!showCustomize)}
                  className="flex items-center gap-2"
                >
                  <Settings size={16} />
                  自定义
                </Button>
                <div className="text-sm text-dark-text-muted">
                  提示词长度: <span className="font-medium text-dark-text">{promptCharCount.toLocaleString()}</span> 字符
                </div>
              </div>

              {/* Middle: Generate and Stop buttons */}
              <div className="flex items-center gap-2">
                {!isGenerating ? (
                  <Button
                    size="sm"
                    onClick={handleGenerateEdit}
                    className="flex items-center gap-2"
                  >
                    <Wand2 size={16} />
                    {generateButtonText}
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={handleGenerateEdit}
                      variant="outline"
                      className="flex items-center gap-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                    >
                      <Square size={16} />
                      停止生成
                    </Button>
                    <div className="flex items-center gap-1 text-sm text-dark-text-muted">
                      <div className="animate-pulse">生成中...</div>
                    </div>
                  </>
                )}
              </div>

              {/* Right: Accept and Revert */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRevert}
                  className="flex items-center gap-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                >
                  <RotateCcw size={16} />
                  还原
                </Button>
                <Button
                  size="sm"
                  onClick={handleAccept}
                  disabled={!currentEditedText.trim()}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Check size={16} />
                  接受
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Prefill Modal */}
      <EditPrefillModal
        isOpen={showEditPrefillModal}
        onClose={() => setShowEditPrefillModal(false)}
        onPrefillsUpdated={() => {
          loadPrefills();
        }}
        scope="auto_edit"
      />
    </div>
  );
};
