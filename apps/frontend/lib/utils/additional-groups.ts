import type {
  ResumeData,
  SkillGroup,
  SkillsSection,
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

type SkillsSectionInput = SkillsSection | null | undefined;

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

export function createDefaultSkillGroups(): SkillGroup[] {
  return DEFAULT_ADDITIONAL_GROUP_SPECS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    values: [],
  }));
}

export function createDefaultSkillsSection(): SkillsSection {
  return {
    groups: createDefaultSkillGroups(),
  };
}

export const createDefaultAdditionalGroups = createDefaultSkillGroups;
export const createDefaultAdditionalInfo = createDefaultSkillsSection;

export function generateAdditionalGroupId(
  groups: Array<Pick<SkillGroup, 'id' | 'label'>> = [],
  preferredLabel = 'Skills'
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
  const base = normalizedBase || 'skills';

  let candidate = base;
  let counter = 2;
  while (existingIds.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function buildLegacyGroups(skills: SkillsSectionInput): SkillGroup[] {
  if (!skills || typeof skills !== 'object') {
    return [];
  }

  const groups: SkillGroup[] = [];

  for (const spec of DEFAULT_ADDITIONAL_GROUP_SPECS) {
    const rawItems = (skills as Record<string, unknown>)[spec.id];
    if (rawItems !== undefined) {
      groups.push({
        id: spec.id,
        label: spec.label,
        values: toStringList(rawItems),
      });
    }
  }

  return groups;
}

export function normalizeAdditionalGroups(
  skills: SkillsSectionInput,
  options: { seedDefaultsIfEmpty?: boolean } = {}
): SkillGroup[] {
  const { seedDefaultsIfEmpty = true } = options;

  const groupedInput =
    skills && typeof skills === 'object'
      ? Array.isArray(skills.groups)
        ? skills.groups
        : Array.isArray((skills as { groups?: unknown[] }).groups)
          ? (skills as { groups?: unknown[] }).groups
          : null
      : null;

  const sourceGroups =
    groupedInput?.map((group) => {
      if (!group || typeof group !== 'object') {
        return null;
      }

      const rawGroup = group as Partial<SkillGroup> & { items?: unknown };
      return {
        id: typeof rawGroup.id === 'string' ? rawGroup.id.trim() : '',
        label: typeof rawGroup.label === 'string' ? rawGroup.label : '',
        values: toStringList(rawGroup.values ?? rawGroup.items),
      };
    }) ?? buildLegacyGroups(skills);

  const normalized: SkillGroup[] = [];
  const existingIds = new Set<string>();

  for (const source of sourceGroups) {
    if (!source) {
      continue;
    }

    const nextId = source.id || generateAdditionalGroupId(normalized, source.label || 'Skills');
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
      values: source.values,
    });
  }

  if (normalized.length === 0 && seedDefaultsIfEmpty) {
    return createDefaultSkillGroups();
  }

  return normalized;
}

export function normalizeAdditionalInfo(
  skills: SkillsSectionInput,
  options: { seedDefaultsIfEmpty?: boolean } = {}
): SkillsSection {
  return {
    groups: normalizeAdditionalGroups(skills, options),
  };
}

export function normalizeResumeSkills<
  T extends { skills?: SkillsSectionInput; additional?: SkillsSectionInput },
>(
  resumeData: T & { sectionMeta?: Array<{ id?: string; key?: string; displayName?: string }> },
  options: { seedDefaultsIfEmpty?: boolean } = {}
): T {
  const normalizedSkills = normalizeAdditionalInfo(
    resumeData.skills ?? resumeData.additional,
    options
  );
  const nextSectionMeta = Array.isArray(resumeData.sectionMeta)
    ? resumeData.sectionMeta.map((section) => ({
        ...section,
        id: section.id === 'additional' ? 'skills' : section.id,
        key: section.key === 'additional' ? 'skills' : section.key,
        displayName: section.displayName === 'Skills & Awards' ? 'Skills' : section.displayName,
      }))
    : resumeData.sectionMeta;
  return {
    ...resumeData,
    skills: normalizedSkills,
    sectionMeta: nextSectionMeta,
  };
}

export const normalizeResumeAdditional = normalizeResumeSkills;

export function flattenAdditionalItems(skills: SkillsSectionInput): string[] {
  return normalizeAdditionalGroups(skills, { seedDefaultsIfEmpty: false }).flatMap(
    (group) => group.values
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

export function getAdditionalGroupDisplayLabel(group: SkillGroup, t?: Translator): string {
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

export function hasAdditionalContent(skills: SkillsSectionInput): boolean {
  return normalizeAdditionalGroups(skills, { seedDefaultsIfEmpty: false }).some(
    (group) => group.values.length > 0
  );
}

export function getAdditionalGroupsWithContent(skills: SkillsSectionInput): SkillGroup[] {
  return normalizeAdditionalGroups(skills, { seedDefaultsIfEmpty: false }).filter(
    (group) => group.values.length > 0
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
  return normalizeResumeSkills(resumeData);
}
