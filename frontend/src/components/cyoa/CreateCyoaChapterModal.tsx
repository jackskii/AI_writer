import React, { useState, useEffect } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { chaptersApi, gameEventsApi, gameCharactersApi, aiApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { Act, CyoaSession } from '../../types';

interface CreateCyoaChapterModalProps {
  workId: number;
  acts: Act[];
  defaultActId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CharacterStateRow {
  character_id: number;
  character_version_id: number | null;
  states: Record<string, string>;
}

export const CreateCyoaChapterModal: React.FC<CreateCyoaChapterModalProps> = ({
  workId,
  acts,
  defaultActId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [actId, setActId] = useState(defaultActId);
  const [eventId, setEventId] = useState<number | ''>('');
  const [characterRows, setCharacterRows] = useState<CharacterStateRow[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const { data: events = [] } = useQuery({
    queryKey: ['game-events', workId],
    queryFn: async () => {
      const res = await gameEventsApi.list(workId);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: isOpen && !!workId,
  });

  const { data: characters = [] } = useQuery({
    queryKey: ['game-characters', workId],
    queryFn: async () => {
      const res = await gameCharactersApi.list(workId);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: isOpen && !!workId,
  });

  useEffect(() => {
    if (!isOpen) return;
    setActId(defaultActId);
    setEventId(events.length > 0 ? events[0].id : '');
    const nextNum = 1; // could pass from parent
    setTitle(`第${nextNum}章`);
    setCharacterRows([]);
    setCreateError('');
  }, [isOpen, defaultActId, events]);

  const handleCreateWithIntro = async (data: { title: string; act: number; cyoa_session: CyoaSession }) => {
    setIsCreating(true);
    setCreateError('');
    try {
      const createRes = await chaptersApi.create(workId, data);
      const chapter = createRes.data as { id: number };
      const { introduction } = await aiApi.cyoaIntroduction(workId, chapter.id);
      await chaptersApi.update(workId, chapter.id, { content: introduction });
      onSuccess();
      onClose();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '创建或生成开场白失败');
    } finally {
      setIsCreating(false);
    }
  };

  const addCharacter = () => {
    const firstChar = characters[0];
    if (!firstChar) return;
    const states: Record<string, string> = {};
    (firstChar.state_definitions || []).forEach((s) => {
      const firstStage = s.stages?.[0]?.label;
      states[s.name] = firstStage || '';
    });
    setCharacterRows((prev) => [...prev, { character_id: firstChar.id, character_version_id: null, states }]);
  };

  const removeCharacterRow = (index: number) => {
    setCharacterRows((prev) => prev.filter((_, i) => i !== index));
  };

  const setRowCharacter = (index: number, characterId: number) => {
    const char = characters.find((c) => c.id === characterId);
    if (!char) return;
    const states: Record<string, string> = {};
    (char.state_definitions || []).forEach((s) => {
      const firstStage = s.stages?.[0]?.label;
      states[s.name] = firstStage || '';
    });
    setCharacterRows((prev) => {
      const next = [...prev];
      next[index] = { character_id: characterId, character_version_id: null, states };
      return next;
    });
  };

  const setRowCharacterVersion = (index: number, versionId: number | null) => {
    setCharacterRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], character_version_id: versionId };
      return next;
    });
  };

  const versionQueries = useQueries({
    queries: characterRows.map((row) => ({
      queryKey: ['game-character-versions', workId, row.character_id],
      queryFn: async () => {
        const res = await gameCharactersApi.listVersions(workId, row.character_id);
        return Array.isArray(res.data) ? res.data : [];
      },
      enabled: isOpen && !!workId && !!row.character_id,
    })),
  });

  const setRowStateStage = (rowIndex: number, stateName: string, stageLabel: string) => {
    setCharacterRows((prev) => {
      const next = [...prev];
      next[rowIndex] = {
        ...next[rowIndex],
        states: { ...next[rowIndex].states, [stateName]: stageLabel },
      };
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !eventId || typeof eventId !== 'number' || isCreating) return;
    const character_states = characterRows
      .filter((r) => r.character_id && Object.keys(r.states).length > 0)
      .map((r) => ({
        character_id: r.character_id,
        character_version_id: r.character_version_id ?? undefined,
        states: r.states,
      }));
    handleCreateWithIntro({
      title: title.trim(),
      act: actId,
      cyoa_session: { event_id: eventId, character_states },
    });
  };

  if (!isOpen) return null;

  const sortedActs = [...acts].sort((a, b) => a.order - b.order);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-dark-surface border border-dark-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h3 className="text-lg font-semibold text-dark-text">创建 CYOA 章节</h3>
          {(!isCreating || createError) && (
            <button type="button" onClick={onClose} className="p-1 text-dark-text-muted hover:text-dark-text">
              <X size={20} />
            </button>
          )}
        </div>
        {isCreating && !createError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 size={40} className="animate-spin text-dark-primary" />
            <p className="text-dark-text">正在创建章节并生成开场白...</p>
          </div>
        ) : createError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12 px-4">
            <p className="text-red-400 text-sm text-center">{createError}</p>
            <Button onClick={onClose}>关闭</Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-text mb-1">章节标题</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="第1章" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-text mb-1">所属卷</label>
                <select
                  value={actId}
                  onChange={(e) => setActId(Number(e.target.value))}
                  className="w-full rounded border border-dark-border bg-dark-bg text-dark-text px-3 py-2"
                >
                  {sortedActs.map((act) => (
                    <option key={act.id} value={act.id}>{act.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">事件</label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded border border-dark-border bg-dark-bg text-dark-text px-3 py-2"
                required
              >
                <option value="">请选择事件</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-dark-text">参与角色与状态</label>
                <Button type="button" variant="outline" size="sm" onClick={addCharacter} disabled={characters.length === 0}>
                  <Plus size={14} /> 添加角色
                </Button>
              </div>
              {characters.length === 0 && (
                <p className="text-sm text-dark-text-muted">请先在 CYOA 页签中创建角色。</p>
              )}
              <div className="space-y-3">
                {characterRows.map((row, rowIndex) => {
                  const char = characters.find((c) => c.id === row.character_id);
                  const versions = versionQueries[rowIndex]?.data ?? [];
                  const stateDefs = (() => {
                    if (row.character_version_id && versions.length > 0) {
                      const ver = versions.find((v: { id: number }) => v.id === row.character_version_id);
                      return ver?.state_definitions ?? char?.state_definitions ?? [];
                    }
                    return char?.state_definitions ?? [];
                  })();
                  return (
                    <div key={rowIndex} className="border border-dark-border rounded p-3 bg-dark-bg/50 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={row.character_id}
                          onChange={(e) => setRowCharacter(rowIndex, Number(e.target.value))}
                          className="flex-1 min-w-[120px] rounded border border-dark-border bg-dark-bg text-dark-text px-3 py-2"
                        >
                          {characters.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {char && (
                          <select
                            value={row.character_version_id ?? ''}
                            onChange={(e) => setRowCharacterVersion(rowIndex, e.target.value ? Number(e.target.value) : null)}
                            className="rounded border border-dark-border bg-dark-bg text-dark-text px-3 py-2 text-sm"
                            title="版本"
                          >
                            <option value="">Origin - {char.name}</option>
                            {versions.map((v: { id: number; display_name: string }) => (
                              <option key={v.id} value={v.id}>{v.display_name}</option>
                            ))}
                          </select>
                        )}
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeCharacterRow(rowIndex)}>
                          <Trash2 size={16} />
                        </Button>
                      </div>
                      {char && stateDefs.map((state: { name: string; stages?: { label: string }[] }) => (
                        <div key={state.name} className="flex items-center gap-2 pl-2">
                          <span className="text-sm text-dark-text-muted w-24">{state.name}</span>
                          <select
                            value={row.states[state.name] ?? ''}
                            onChange={(e) => setRowStateStage(rowIndex, state.name, e.target.value)}
                            className="flex-1 rounded border border-dark-border bg-dark-bg text-dark-text px-3 py-1.5 text-sm"
                          >
                            {(state.stages || []).map((st: { label: string }) => (
                              <option key={st.label} value={st.label}>{st.label}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border">
            <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
            <Button
              type="submit"
              disabled={!title.trim() || !eventId}
            >
              创建章节
            </Button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
