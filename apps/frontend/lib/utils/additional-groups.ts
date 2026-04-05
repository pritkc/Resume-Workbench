import type {
  AdditionalGroup,
  AdditionalInfo,
  ResumeData,
} from '@/components/dashboard/resume-component';

type Translator = (key: string, params?: Record<string, string | number>) => string;

export const DEFAULT_ADDITIONAL_GROUP_SPECS = [
  {
    id: 'technicalSkills',
    label: 'Technical Skills',
    translationKey: 'resume.additionalDefaults.technicalSkills',
  },
  {
    id: 'languages',
    label: 'Languages',
    translationKey: 'resume.additionalDefaults.languages',
  },
  {
    id: 'certificationsTraining',
    label: 'Training & Certifications',
    translationKey: 'resume.additionalDefaults.certificationsTraining',
  },
  {
    id: 'awards',
    label: 'Awards',
    translationKey: 'resume.additionalDefaults.awards',
  },
] as const;

type DefaultAdditionalGroupId = (typeof DEFAULT_ADDITIONAL_GROUP_SPECS)[number]['id'];

const DEFAULT_LABEL_BY_ID = Object.fromEntries(
  DEFAULT_ADDITIONAL_GROUP_SPECS.map((spec) => [spec.id, spec.label])
) as Record<DefaultAdditionalGroupId, string>;

const DEFAULT_TRANSLATION_KEY_BY_ID = Object.fromEntries(
  DEFAULT_ADDITIONAL_GROUP_SPECS.map((spec) => [spec.id, spec.translationKey])
) as Record<DefaultAdditionalGroupId, string>;

type AdditionalInfoInput = AdditionalInfo | null | undefined;

function isDefaultGroupId(value: string): value is DefaultAdditionalGroupId {
  return value in DEFAULT_LABEL_BY_ID;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: string[] = [];
  for (const item of value) {
    const text = typeof item === 'string' ? item.trim() : '';
    if (text) {
      normalized.push(text);
    }
  }
  return normalized;
}

export function createDefaultAdditionalGroups(): AdditionalGroup[] {
  return DEFAULT_ADDITIONAL_GROUP_SPECS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    items: [],
  }));
}

export function createDefaultAdditionalInfo(): AdditionalInfo {
  return {
    groups: createDefaultAdditionalGroups(),
  };
}

export function generateAdditionalGroupId(
  groups: Array<Pick<AdditionalGroup, 'id' | 'label'>> = [],
  preferredLabel = 'Additional'
): string {
  const existingIds = new Set(
    groups
      .map((group) => (typeof group.id === 'string' ? group.id.trim() : ''))
      .filter(Boolean)
      .map((id) => id.toLowerCase())
  );

  const normalizedBase = preferredLabel
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = normalizedBase || 'additional';

  let candidate = base;
  let counter = 2;
  while (existingIds.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function buildLegacyGroups(additional: AdditionalInfoInput): AdditionalGroup[] {
  if (!additional || typeof additional !== 'object') {
    return [];
  }

  const groups: AdditionalGroup[] = [];

  for (const spec of DEFAULT_ADDITIONAL_GROUP_SPECS) {
    const rawItems = (additional as Record<string, unknown>)[spec.id];
    if (rawItems !== undefined) {
      groups.push({
        id: spec.id,
        label: spec.label,
        items: toStringList(rawItems),
      });
    }
  }

  return groups;
}

export function normalizeAdditionalGroups(
  additional: AdditionalInfoInput,
  options: { seedDefaultsIfEmpty?: boolean } = {}
): AdditionalGroup[] {
  const { seedDefaultsIfEmpty = true } = options;

  const groupedInput =
    additional && typeof additional === 'object' && Array.isArray(additional.groups)
      ? additional.groups
      : null;

  const sourceGroups =
    groupedInput?.map((group) => {
      if (!group || typeof group !== 'object') {
        return null;
      }

      const rawGroup = group as Partial<AdditionalGroup>;
      return {
        id: typeof rawGroup.id === 'string' ? rawGroup.id.trim() : '',
        label: typeof rawGroup.label === 'string' ? rawGroup.label : '',
        items: toStringList(rawGroup.items),
      };
    }) ?? buildLegacyGroups(additional);

  const normalized: AdditionalGroup[] = [];
  const existingIds = new Set<string>();

  for (const source of sourceGroups) {
    if (!source) {
      continue;
    }

    const nextId = source.id || generateAdditionalGroupId(normalized, source.label || 'Additional');
    const dedupedId = existingIds.has(nextId.toLowerCase())
      ? generateAdditionalGroupId(normalized, nextId)
      : nextId;
    existingIds.add(dedupedId.toLowerCase());

    normalized.push({
      id: dedupedId,
      label:
        source.label ||
        (isDefaultGroupId(dedupedId)
          ? DEFAULT_LABEL_BY_ID[dedupedId]
          : prettifyGroupLabel(dedupedId)),
      items: source.items,
    });
  }

  if (normalized.length === 0 && seedDefaultsIfEmpty) {
    return createDefaultAdditionalGroups();
  }

  return normalized;
}

export function normalizeAdditionalInfo(
  additional: AdditionalInfoInput,
  options: { seedDefaultsIfEmpty?: boolean } = {}
): AdditionalInfo {
  return {
    groups: normalizeAdditionalGroups(additional, options),
  };
}

export function normalizeResumeAdditional<T extends { additional?: AdditionalInfoInput }>(
  resumeData: T,
  options: { seedDefaultsIfEmpty?: boolean } = {}
): T {
  return {
    ...resumeData,
    additional: normalizeAdditionalInfo(resumeData.additional, options),
  };
}

export function flattenAdditionalItems(additional: AdditionalInfoInput): string[] {
  return normalizeAdditionalGroups(additional, { seedDefaultsIfEmpty: false }).flatMap(
    (group) => group.items
  );
}

export function parseAdditionalGroupItems(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatAdditionalGroupItems(items?: string[]): string {
  return Array.isArray(items) ? items.join('\n') : '';
}

export function getDefaultAdditionalGroupLabel(
  groupId: string,
  t?: Translator
): string | undefined {
  if (!isDefaultGroupId(groupId)) {
    return undefined;
  }

  if (!t) {
    return DEFAULT_LABEL_BY_ID[groupId];
  }

  return t(DEFAULT_TRANSLATION_KEY_BY_ID[groupId]);
}

export function getAdditionalGroupDisplayLabel(group: AdditionalGroup, t?: Translator): string {
  const rawLabel = typeof group.label === 'string' ? group.label : '';
  const normalizedRawLabel = rawLabel.trim();
  const defaultLabel = getDefaultAdditionalGroupLabel(group.id, t);
  const defaultEnglish = isDefaultGroupId(group.id) ? DEFAULT_LABEL_BY_ID[group.id] : undefined;

  if (!normalizedRawLabel) {
    return defaultLabel || prettifyGroupLabel(group.id);
  }

  if (defaultLabel && defaultEnglish && rawLabel === defaultEnglish) {
    return defaultLabel;
  }

  return rawLabel;
}

export function hasAdditionalContent(additional: AdditionalInfoInput): boolean {
  return normalizeAdditionalGroups(additional, { seedDefaultsIfEmpty: false }).some(
    (group) => group.items.length > 0
  );
}

export function getAdditionalGroupsWithContent(additional: AdditionalInfoInput): AdditionalGroup[] {
  return normalizeAdditionalGroups(additional, { seedDefaultsIfEmpty: false }).filter(
    (group) => group.items.length > 0
  );
}

export function prettifyGroupLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function buildRegenerateItemIdForGroup(groupId: string): string {
  return `additional_${groupId}`;
}

export function normalizeResumeData(resumeData: ResumeData): ResumeData {
  return normalizeResumeAdditional(resumeData);
}
