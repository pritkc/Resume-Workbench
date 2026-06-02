import { describe, expect, it } from 'vitest';
import {
  buildFieldIndex,
  filterFieldIndex,
} from '@/components/builder/jump-map/build-field-index';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { DEFAULT_SECTION_META } from '@/lib/utils/section-helpers';
import { createDefaultAdditionalInfo } from '@/lib/utils/additional-groups';

const sampleResume: ResumeData = {
  personalInfo: {
    name: 'Jane Doe',
    headline: 'Software Engineer',
    email: 'jane@example.com',
    location: 'San Diego, CA',
  },
  summary: 'Backend engineer with API experience.',
  workExperience: [
    {
      id: 1,
      company: 'Acme Corp',
      position: 'Senior Developer',
      date: '2020 - Present',
      highlights: ['Built payment API'],
    },
  ],
  education: [
    {
      id: 1,
      institution: 'State University',
      degree: 'BS Computer Science',
      date: '2016 - 2020',
    },
  ],
  personalProjects: [
    {
      id: 1,
      name: 'Resume Matcher',
      techStack: 'Next.js, Python',
      highlights: ['Open source tool'],
    },
  ],
  skills: createDefaultAdditionalInfo(),
  sectionMeta: DEFAULT_SECTION_META,
};

describe('buildFieldIndex', () => {
  it('indexes header, summary, and experience fields with stable ids', () => {
    const items = buildFieldIndex(sampleResume);

    expect(items.find((item) => item.id === 'personal.name')?.value).toBe('Jane Doe');
    expect(items.find((item) => item.id === 'summary')?.value).toContain('Backend engineer');
    expect(items.some((item) => item.id === 'experience.1.company' && item.value === 'Acme Corp')).toBe(
      true
    );
    expect(items.some((item) => item.group === 'education')).toBe(true);
    expect(items.some((item) => item.group === 'projects')).toBe(true);
  });

  it('filters items by company, bullet text, and section label', () => {
    const items = buildFieldIndex(sampleResume);

    expect(filterFieldIndex(items, 'acme').length).toBeGreaterThan(0);
    expect(filterFieldIndex(items, 'payment api').length).toBeGreaterThan(0);
    expect(filterFieldIndex(items, 'education').length).toBeGreaterThan(0);
    expect(filterFieldIndex(items, 'zzzz-no-match')).toHaveLength(0);
  });
});
