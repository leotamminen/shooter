export function findById<T extends { id: string }>(list: T[], id: string): T {
  const item = list.find((entry) => entry.id === id);
  if (!item) throw new Error(`No entry found with id "${id}"`);
  return item;
}
