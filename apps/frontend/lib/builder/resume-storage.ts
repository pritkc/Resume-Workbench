export const RESUME_DRAFT_KEYS = [
  'resume_builder_draft',
  'resume_builder_settings',
  'resume_builder_raw_yaml',
] as const;

export function resumeStorageKey(baseKey: string, resumeId: string | null): string {
  return `${baseKey}:${resumeId || 'new'}`;
}

export function clearResumeDraftStorage(storage: Storage): void {
  const prefixes = RESUME_DRAFT_KEYS.map((key) => `${key}:`);
  const legacyKeys = new Set<string>(RESUME_DRAFT_KEYS);
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && (legacyKeys.has(key) || prefixes.some((prefix) => key.startsWith(prefix)))) {
      storage.removeItem(key);
    }
  }
}
