import type {
  ResumeData,
  SkillGroup,
  SkillsSection,
} from '@/components/dashboard/resume-component';

type Translator = (key: string, params?: Record<string, string | number>) => string;

export const DEFAULT_ADDITIONAL_GROUP_SPECS = [
  {
    label: 'Technical Skills',
    translationKey: 'resume.additionalDefaults.technicalSkills',
  },
  {
    label: 'Languages',
    translationKey: 'resume.additionalDefaults.languages',
  },
  {
    label: 'Training & Certifications',
    translationKey: 'resume.additionalDefaults.certificationsTraining',
  },
  {
    label: 'Awards',
    translationKey: 'resume.additionalDefaults.awards',
  },
] as const;

type DefaultAdditionalGroupLabel = (typeof DEFAULT_ADDITIONAL_GROUP_SPECS)[number]['label'];

const DEFAULT_TRANSLATION_KEY_BY_LABEL = Object.fromEntries(
  DEFAULT_ADDITIONAL_GROUP_SPECS.map((spec) => [spec.label, spec.translationKey])
) as Record<DefaultAdditionalGroupLabel, string>;

const DEFAULT_LABELS: Set<string> = new Set(
  DEFAULT_ADDITIONAL_GROUP_SPECS.map((spec) => spec.label)
);

type SkillsSectionInput = SkillsSection | null | undefined;

const LEGACY_ID_TO_LABEL: Record<string, string> = {
  technicalSkills: 'Technical Skills',
  languages: 'Languages',
  certificationsTraining: 'Training & Certifications',
  awards: 'Awards',
};

function isDefaultLabel(value: string): value is DefaultAdditionalGroupLabel {
  return DEFAULT_LABELS.has(value);
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

function prettifyLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildLegacyGroups(skills: SkillsSectionInput): SkillGroup[] {
  if (!skills || typeof skills !== 'object') {
    return [];
  }

  const groups: SkillGroup[] = [];

  for (const spec of DEFAULT_ADDITIONAL_GROUP_SPECS) {
    const legacyKey = Object.entries(LEGACY_ID_TO_LABEL).find(
      ([, label]) => label === spec.label
    )?.[0];
    if (legacyKey) {
      const rawItems = (skills as Record<string, unknown>)[legacyKey];
      if (rawItems !== undefined) {
        groups.push({
          label: spec.label,
          values: toStringList(rawItems),
        });
      }
    }
  }

  return groups;
}

function resolveLabel(rawLabel: string, rawId?: string): string {
  if (rawLabel) return rawLabel;
  if (rawId) {
    if (rawId in LEGACY_ID_TO_LABEL) return LEGACY_ID_TO_LABEL[rawId];
    return prettifyLabel(rawId);
  }
  return '';
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

      const rawGroup = group as Partial<SkillGroup> & { id?: string; items?: unknown };
      const rawLabel = typeof rawGroup.label === 'string' ? rawGroup.label.trim() : '';
      const rawId = typeof rawGroup.id === 'string' ? rawGroup.id.trim() : '';
      return {
        label: resolveLabel(rawLabel, rawId),
        values: toStringList(rawGroup.values ?? rawGroup.items),
      };
    }) ?? buildLegacyGroups(skills);

  const normalized: SkillGroup[] = [];
  const seenLabels = new Set<string>();

  for (const source of sourceGroups) {
    if (!source) {
      continue;
    }

    const label = source.label || 'Skills';
    const labelKey = label.toLowerCase();
    if (seenLabels.has(labelKey)) continue;
    seenLabels.add(labelKey);

    normalized.push({
      label,
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
  label: string,
  t?: Translator
): string | undefined {
  if (!isDefaultLabel(label)) {
    return undefined;
  }

  if (!t) {
    return label;
  }

  return t(DEFAULT_TRANSLATION_KEY_BY_LABEL[label]);
}

export function getAdditionalGroupDisplayLabel(group: SkillGroup, t?: Translator): string {
  const rawLabel = typeof group.label === 'string' ? group.label : '';
  const normalizedRawLabel = rawLabel.trim();
  const defaultLabel = getDefaultAdditionalGroupLabel(normalizedRawLabel, t);
  const defaultEnglish = isDefaultLabel(normalizedRawLabel) ? normalizedRawLabel : undefined;

  if (!normalizedRawLabel) {
    return 'Skills';
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
  return prettifyLabel(value);
}

export function buildRegenerateItemIdForGroup(group: SkillGroup): string {
  const slug = group.label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `additional_${slug || 'group'}`;
}

export function normalizeResumeData(resumeData: ResumeData): ResumeData {
  return normalizeResumeSkills(resumeData);
}

/** @deprecated Use label-based approach. Kept for backward compatibility only. */
export function generateAdditionalGroupId(
  groups: Array<Pick<SkillGroup, 'label'>> = [],
  preferredLabel = 'Skills'
): string {
  const existingLabels = new Set(
    groups.map((g) => g.label.trim().toLowerCase())
  );
  const base = preferredLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'skills';
  let candidate = base;
  let counter = 2;
  while (existingLabels.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}
