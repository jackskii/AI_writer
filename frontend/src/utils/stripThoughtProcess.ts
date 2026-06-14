/**
 * Strip reasoning/thinking markers from AI output.
 * Used for auto-generation modals (not text editor, which shows thinking during stream).
 */
export function stripThoughtProcess(text: string): string {
  const thoughtPattern = /【思考过程】[\s\S]*?(?=【回答】|$)/g;
  let cleanedText = text.replace(thoughtPattern, '');
  cleanedText = cleanedText.replace(/【回答】\s*/g, '');
  return cleanedText.trim();
}

/**
 * Append a stream chunk while hiding content before 【回答】.
 */
export function appendAnswerOnlyChunk(accumulated: string, chunk: string): string {
  const combined = accumulated + chunk;
  if (combined.includes('【回答】')) {
    return stripThoughtProcess(combined);
  }
  if (combined.includes('【思考过程】')) {
    return accumulated;
  }
  return combined;
}
