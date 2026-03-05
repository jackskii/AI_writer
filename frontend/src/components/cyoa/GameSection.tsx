import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Calendar, User } from 'lucide-react';
import { gameEventsApi, gameCharactersApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { CreateGameEventModal } from '../modals/CreateGameEventModal';
import { CreateGameCharacterModal } from '../modals/CreateGameCharacterModal';
import { GameCharacterEditModal } from './GameCharacterEditModal';
import type { GameEvent, GameCharacter } from '../../types';

interface GameSectionProps {
  workId: number;
}

export const GameSection: React.FC<GameSectionProps> = ({ workId }) => {
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [characterModalOpen, setCharacterModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<GameEvent | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<GameCharacter | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<GameEvent | null>(null);
  const [deletingCharacter, setDeletingCharacter] = useState<GameCharacter | null>(null);
  const [editCharacterModalOpen, setEditCharacterModalOpen] = useState(false);

  const { data: events = [], refetch: refetchEvents } = useQuery({
    queryKey: ['game-events', workId],
    queryFn: async () => {
      const res = await gameEventsApi.list(workId);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!workId,
  });

  const { data: characters = [], refetch: refetchCharacters } = useQuery({
    queryKey: ['game-characters', workId],
    queryFn: async () => {
      const res = await gameCharactersApi.list(workId);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!workId,
  });

  const openCreateEvent = () => {
    setEditingEvent(null);
    setEventModalOpen(true);
  };
  const openEditEvent = (e: GameEvent) => {
    setEditingEvent(e);
    setEventModalOpen(true);
  };
  const openCreateCharacter = () => {
    setEditingCharacter(null);
    setCharacterModalOpen(true);
  };
  const openEditCharacter = (c: GameCharacter) => {
    setEditingCharacter(c);
    setEditCharacterModalOpen(true);
  };

  const onEventModalSuccess = () => {
    refetchEvents();
  };
  const onCharacterModalSuccess = () => {
    refetchCharacters();
  };

  const deleteEventMutation = useMutation({
    mutationFn: (id: number) => gameEventsApi.delete(workId, id),
    onSuccess: () => {
      refetchEvents();
      setDeletingEvent(null);
    },
  });
  const deleteCharacterMutation = useMutation({
    mutationFn: (id: number) => gameCharactersApi.delete(workId, id),
    onSuccess: () => {
      refetchCharacters();
      setDeletingCharacter(null);
    },
  });

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-text flex items-center gap-2">
            <Calendar size={20} /> 事件
          </h3>
          <Button size="sm" onClick={openCreateEvent} className="flex items-center gap-2">
            <Plus size={16} /> 新建事件
          </Button>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-dark-text-muted text-sm">暂无事件。创建事件后，在创建章节时可选择事件与角色状态。</p>
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-dark-bg/50 border border-dark-border"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-dark-text">{ev.name}</span>
                    {ev.goal && (
                      <p className="text-sm text-dark-text-muted truncate mt-0.5">{ev.goal}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditEvent(ev)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeletingEvent(ev)}>
                      <Trash2 size={14} className="text-red-400" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-text flex items-center gap-2">
            <User size={20} /> 角色
          </h3>
          <Button size="sm" onClick={openCreateCharacter} className="flex items-center gap-2">
            <Plus size={16} /> 新建角色
          </Button>
        </CardHeader>
        <CardContent>
          {characters.length === 0 ? (
            <p className="text-dark-text-muted text-sm">暂无角色。创建角色后可定义状态与阶段，在创建章节时选择。</p>
          ) : (
            <ul className="space-y-2">
              {characters.map((ch) => (
                <li
                  key={ch.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-dark-bg/50 border border-dark-border"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-dark-text">{ch.name}</span>
                    {ch.age && <span className="text-sm text-dark-text-muted ml-2">({ch.age})</span>}
                    {Array.isArray(ch.state_definitions) && ch.state_definitions.length > 0 && (
                      <p className="text-xs text-dark-text-muted mt-0.5">
                        状态：{ch.state_definitions.map((s) => s.name).filter(Boolean).join('、') || '无'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditCharacter(ch)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeletingCharacter(ch)}>
                      <Trash2 size={14} className="text-red-400" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CreateGameEventModal
        workId={workId}
        isOpen={eventModalOpen}
        onClose={() => { setEventModalOpen(false); setEditingEvent(null); }}
        onSuccess={onEventModalSuccess}
        editEvent={editingEvent}
      />
      <CreateGameCharacterModal
        workId={workId}
        isOpen={characterModalOpen}
        onClose={() => { setCharacterModalOpen(false); setEditingCharacter(null); }}
        onSuccess={onCharacterModalSuccess}
        editCharacter={null}
      />
      {editingCharacter && (
        <GameCharacterEditModal
          workId={workId}
          character={editingCharacter}
          isOpen={editCharacterModalOpen}
          onClose={() => { setEditCharacterModalOpen(false); setEditingCharacter(null); }}
          onSuccess={onCharacterModalSuccess}
        />
      )}
      {deletingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="text-lg font-semibold text-dark-text">删除事件</h3>
            </CardHeader>
            <CardContent>
              <p className="text-dark-text mb-4">确定要删除事件「{deletingEvent.name}」吗？</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeletingEvent(null)} disabled={deleteEventMutation.isPending}>取消</Button>
                <Button onClick={() => deleteEventMutation.mutate(deletingEvent.id)} disabled={deleteEventMutation.isPending}>
                  {deleteEventMutation.isPending ? '删除中...' : '删除'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {deletingCharacter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="text-lg font-semibold text-dark-text">删除角色</h3>
            </CardHeader>
            <CardContent>
              <p className="text-dark-text mb-4">确定要删除角色「{deletingCharacter.name}」吗？</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeletingCharacter(null)} disabled={deleteCharacterMutation.isPending}>取消</Button>
                <Button onClick={() => deleteCharacterMutation.mutate(deletingCharacter.id)} disabled={deleteCharacterMutation.isPending}>
                  {deleteCharacterMutation.isPending ? '删除中...' : '删除'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
