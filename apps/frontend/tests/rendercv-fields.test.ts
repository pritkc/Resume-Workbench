import { describe, expect, it } from 'vitest';
import {
  getEducationExplicitDate,
  getEducationExplicitDateEditor,
  getEducationSummary,
  getEducationSummaryEditor,
  getExperienceExplicitDate,
  getExperienceExplicitDateEditor,
  getExperiencePosition,
  getExperiencePositionEditor,
  getExperienceTechStack,
  getExperienceTechStackEditor,
  getProjectDate,
  getProjectDateEditor,
  getProjectTechStack,
  getProjectTechStackEditor,
} from '@/lib/utils/rendercv-fields';

describe('rendercv field editor values', () => {
  it('preserves spaces while editing project fields', () => {
    const project = {
      techStack: 'React ',
      date: 'Jan 2025 ',
      role: 'Fallback stack',
      years: 'Fallback date',
    };

    expect(getProjectTechStackEditor(project)).toBe('React ');
    expect(getProjectDateEditor(project)).toBe('Jan 2025 ');
    expect(getProjectTechStack(project)).toBe('React');
    expect(getProjectDate(project)).toBe('Jan 2025');
  });

  it('preserves spaces while editing experience fields', () => {
    const experience = {
      position: 'Frontend ',
      title: 'Fallback title',
      date: '2024 - Present ',
      years: 'Fallback years',
      techStack: 'Next.js ',
    };

    expect(getExperiencePositionEditor(experience)).toBe('Frontend ');
    expect(getExperienceExplicitDateEditor(experience)).toBe('2024 - Present ');
    expect(getExperienceTechStackEditor(experience)).toBe('Next.js ');
    expect(getExperiencePosition(experience)).toBe('Frontend');
    expect(getExperienceExplicitDate(experience)).toBe('2024 - Present');
    expect(getExperienceTechStack(experience)).toBe('Next.js');
  });

  it('preserves spaces while editing education fields', () => {
    const education = {
      date: 'May 2022 ',
      years: 'Fallback years',
      summary: 'Machine learning coursework ',
    };

    expect(getEducationExplicitDateEditor(education)).toBe('May 2022 ');
    expect(getEducationSummaryEditor(education)).toBe('Machine learning coursework ');
    expect(getEducationExplicitDate(education)).toBe('May 2022');
    expect(getEducationSummary(education)).toBe('Machine learning coursework');
  });

  it('lets an intentionally empty editor field stay empty instead of restoring a fallback', () => {
    expect(getProjectTechStackEditor({ techStack: '', role: 'Old stack' })).toBe('');
    expect(getExperiencePositionEditor({ position: '', title: 'Old title' })).toBe('');
    expect(getEducationExplicitDateEditor({ date: '', years: 'Old years' })).toBe('');
  });
});
