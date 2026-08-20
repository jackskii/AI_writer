import type { LoreEntry } from '../types';

export function getLoreEntryTriggers(entry: LoreEntry): string[] {
  return [entry.name, ...(entry.triggers || []), ...(entry.extra_triggers || [])].filter(Boolean);
}

export function isLoreEntryTriggeredByText(entry: LoreEntry, text: string): boolean {
  const source = text || '';
  return getLoreEntryTriggers(entry).some((trigger) => source.includes(trigger));
}

export function getLoreEntriesTriggeredByText(entries: LoreEntry[], text: string): LoreEntry[] {
  return entries.filter((entry) => isLoreEntryTriggeredByText(entry, text));
}

export function getTriggeredLoreIds(entries: LoreEntry[], text: string): number[] {
  return getLoreEntriesTriggeredByText(entries, text).map((entry) => entry.id);
}
