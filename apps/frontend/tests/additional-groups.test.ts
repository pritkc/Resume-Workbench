import { describe, expect, it } from 'vitest';
import {
  getAdditionalGroupDisplayLabel,
  normalizeAdditionalGroups,
} from '@/lib/utils/additional-groups';

describe('additional group utils', () => {
  it('preserves label spaces while editing', () => {
    const [group] = normalizeAdditionalGroups(
      {
        groups: [
          {
            id: 'ml',
            label: 'Machine Learning',
            items: [],
          },
        ],
      },
      { seedDefaultsIfEmpty: false }
    );

    expect(group.label).toBe('Machine Learning');
    expect(getAdditionalGroupDisplayLabel(group)).toBe('Machine Learning');
  });

  it('keeps trailing spaces instead of snapping back to the default translated label', () => {
    const label = getAdditionalGroupDisplayLabel(
      {
        id: 'technicalSkills',
        label: 'Technical Skills ',
        items: [],
      },
      (key) =>
        key === 'resume.additionalDefaults.technicalSkills' ? 'Compétences techniques' : key
    );

    expect(label).toBe('Technical Skills ');
  });
});
