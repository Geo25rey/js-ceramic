const registry: Record<string, number | undefined> = {
  tile: 0,
  'caip10-link': 1,
};

export function indexByName(name: string): number {
  const index = registry[name];
  if (typeof index !== 'undefined') {
    return index;
  } else {
    throw new Error(`No stream type registered for name ${name}`);
  }
}

export function nameByIndex(index: number): string {
  const pair = Object.entries(registry).find(([, v]) => v === index);
  if (pair) {
    return pair[0];
  } else {
    throw new Error(`No stream type registered for index ${index}`);
  }
}
