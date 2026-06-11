/** Adjust character-offset ranges after a single edit at changeStart. */
export function adjustPositionMap(
  positions: Map<number, { start: number; end: number }>,
  oldContent: string,
  newContent: string
): Map<number, { start: number; end: number }> {
  if (oldContent === newContent) return positions;

  let changeStart = 0;
  while (
    changeStart < Math.min(oldContent.length, newContent.length) &&
    oldContent[changeStart] === newContent[changeStart]
  ) {
    changeStart++;
  }

  const oldAfterChange = oldContent.slice(changeStart);
  const newAfterChange = newContent.slice(changeStart);
  const lengthDiff = newAfterChange.length - oldAfterChange.length;

  const updated = new Map(positions);
  for (const [id, position] of updated) {
    if (position.start > changeStart) {
      updated.set(id, {
        start: Math.max(changeStart, position.start + lengthDiff),
        end: Math.max(changeStart, position.end + lengthDiff),
      });
    } else if (position.end > changeStart) {
      updated.set(id, {
        start: position.start,
        end: Math.max(position.start, position.end + lengthDiff),
      });
    }
  }
  return updated;
}
