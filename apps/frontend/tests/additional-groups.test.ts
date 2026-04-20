import { describe, expect, it } from 'vitest';
import {
  getAdditionalGroupDisplayLabel,
  normalizeAdditionalGroups,
} from '@/lib/utils/additional-groups';

describe('additional group utils', () => {
  it('preserves label spaces while editing', () => {
    const [group] = normalizeAdditionalGroups(
      {
        groups: [{ id: 'ml-1', label: 'Machine Learning', values: [] }],
      },
      { seedDefaultsIfEmpty: false }
    );

    expect(group.label).toBe('Machine Learning');
    expect(getAdditionalGroupDisplayLabel(group)).toBe('Machine Learning');
  });

  it('preserves trailing spaces through normalizeAdditionalGroups (autosave path)', () => {
    const [group] = normalizeAdditionalGroups(
      {
        groups: [{ id: 'g1', label: 'Section Name ', values: [] }],
      },
      { seedDefaultsIfEmpty: false }
    );
    expect(group.label).toBe('Section Name ');
  });

  it('keeps trailing spaces instead of snapping back to the default translated label', () => {
    const label = getAdditionalGroupDisplayLabel(
      {
        id: 'technicalSkills',
        label: 'Technical Skills ',
        values: [],
      },
      (key) =>
        key === 'resume.additionalDefaults.technicalSkills' ? 'Compétences techniques' : key
    );

    expect(label).toBe('Technical Skills ');
  });
});
