import { describe, expect, it } from 'vitest';
import { clearResumeDraftStorage, resumeStorageKey } from '@/lib/builder/resume-storage';

describe('resume draft storage', () => {
  it('scopes each draft key to its resume', () => {
    expect(resumeStorageKey('resume_builder_raw_yaml', 'resume-a')).toBe(
      'resume_builder_raw_yaml:resume-a'
    );
    expect(resumeStorageKey('resume_builder_raw_yaml', 'resume-b')).not.toBe(
      resumeStorageKey('resume_builder_raw_yaml', 'resume-a')
    );
  });

  it('clears legacy and per-resume draft keys without clearing unrelated layout', () => {
    const storage = window.localStorage;
    storage.setItem('resume_builder_draft:resume-a', 'a');
    storage.setItem('resume_builder_raw_yaml:resume-b', 'b');
    storage.setItem('resume_builder_settings', 'legacy');
    storage.setItem('resume_builder_ui_layout', 'layout');

    clearResumeDraftStorage(storage);

    expect(storage.getItem('resume_builder_draft:resume-a')).toBeNull();
    expect(storage.getItem('resume_builder_raw_yaml:resume-b')).toBeNull();
    expect(storage.getItem('resume_builder_settings')).toBeNull();
    expect(storage.getItem('resume_builder_ui_layout')).toBe('layout');
  });
});
