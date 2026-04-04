'use client';

import React, { useState, useEffect, Suspense, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { type ResumeData } from '@/components/dashboard/resume-component';
import { ResumeForm } from './resume-form';
import { RawYamlEditor } from './raw-yaml-editor';
import { CoverLetterEditor } from './cover-letter-editor';
import { OutreachEditor } from './outreach-editor';
import { CoverLetterPreview } from './cover-letter-preview';
import { OutreachPreview } from './outreach-preview';
import { GeneratePrompt } from './generate-prompt';
import { Button } from '@/components/ui/button';
import { RetroTabs } from '@/components/ui/retro-tabs';
import { ConfirmDialog, type ConfirmDialogProps } from '@/components/ui/confirm-dialog';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import {
  Download,
  Save,
  AlertTriangle,
  ArrowLeft,
  RotateCcw,
  Undo2,
  Redo2,
  Copy,
  Check,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import { RenderThemeControls } from '@/components/rendercv/render-theme-controls';
import { RenderLocaleControls } from '@/components/rendercv/render-locale-controls';
import { RenderRuntimeSettingsControls } from '@/components/rendercv/render-runtime-settings-controls';
import { RenderPreviewPanel } from '@/components/rendercv/render-preview-panel';
import {
  downloadResumePdf,
  downloadCoverLetterPdf,
  getResumePdfUrl,
  getCoverLetterPdfUrl,
  fetchResume,
  updateCoverLetter,
  updateOutreachMessage,
  generateCoverLetter,
  generateOutreachMessage,
  fetchJobDescription,
  normalizeResumeDraft,
  saveResumeDraft,
  isDraftRequestError,
  type DraftValidationDetail,
  type RawYamlSections,
  type ResumeDraftRequest,
  type ResumeDraftResponse,
} from '@/lib/api/resume';
import { JDComparisonView } from './jd-comparison-view';
import { RegenerateWizard } from './regenerate-wizard';
import { useRegenerateWizard } from '@/hooks/use-regenerate-wizard';
import { useTranslations } from '@/lib/i18n';
import {
  DEFAULT_RENDER_THEME_SETTINGS,
  RENDER_THEME_OPTIONS,
  normalizeRenderThemeSettings,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import { useLanguage } from '@/lib/context/language-context';
import { downloadBlobAsFile, openUrlInNewTab, sanitizeFilename } from '@/lib/utils/download';
import type { RegenerateItemInput } from '@/lib/api/enrichment';

type TabId = 'resume' | 'cover-letter' | 'outreach' | 'jd-match';
type EditorSection = 'cv' | 'design' | 'locale' | 'settings';
type EditorMode = 'visual' | 'raw';
type AutosaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'invalid';
type DraftSnapshot = {
  resumeData: ResumeData;
  themeSettings: RenderThemeSettings;
  rawYamlSections: RawYamlSections;
  yamlNeedsSync: boolean;
  editorMode: EditorMode;
  editorSection: EditorSection;
};

const STORAGE_KEY = 'resume_builder_draft';
const SETTINGS_STORAGE_KEY = 'resume_builder_settings';
const YAML_STORAGE_KEY = 'resume_builder_raw_yaml';
const AUTOSAVE_DEBOUNCE_MS = 1000;
const HISTORY_COMMIT_DEBOUNCE_MS = 350;

type Translate = (key: string, params?: Record<string, string | number>) => string;

const buildInitialData = (t: Translate): ResumeData => ({
  personalInfo: {
    name: t('builder.personalInfoForm.placeholders.name'),
    title: t('builder.personalInfoForm.placeholders.title'),
    email: t('builder.personalInfoForm.placeholders.email'),
    phone: t('builder.personalInfoForm.placeholders.phone'),
    location: t('builder.personalInfoForm.placeholders.location'),
    website: t('builder.personalInfoForm.placeholders.website'),
    linkedin: t('builder.personalInfoForm.placeholders.linkedin'),
    github: t('builder.personalInfoForm.placeholders.github'),
  },
  summary: t('builder.placeholders.summary'),
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {
    technicalSkills: [],
    languages: [],
    certificationsTraining: [],
    awards: [],
  },
});

const EMPTY_RAW_YAML: RawYamlSections = {
  cv: 'cv: {}\n',
  design: 'design: {}\n',
  locale: 'locale: {}\n',
  settings: 'settings: {}\n',
};

function buildFullYaml(sections: RawYamlSections): string {
  return [
    sections.cv.trimEnd(),
    sections.design.trimEnd(),
    sections.locale.trimEnd(),
    sections.settings.trimEnd(),
  ]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n');
}

function cloneDraftSnapshot(snapshot: DraftSnapshot): DraftSnapshot {
  if (typeof structuredClone === 'function') {
    return structuredClone(snapshot);
  }
  return JSON.parse(JSON.stringify(snapshot)) as DraftSnapshot;
}

function serializeDraftSnapshot(snapshot: DraftSnapshot): string {
  return JSON.stringify({
    resumeData: snapshot.resumeData,
    themeSettings: snapshot.themeSettings,
    yamlNeedsSync: snapshot.yamlNeedsSync,
    rawYamlSections: snapshot.yamlNeedsSync ? null : snapshot.rawYamlSections,
  });
}

const ResumeBuilderContent = () => {
  const { t } = useTranslations();
  const { uiLanguage, contentLanguage } = useLanguage();
  const [notificationDialog, setNotificationDialog] = useState<{
    title: string;
    description: string;
    variant: NonNullable<ConfirmDialogProps['variant']>;
  } | null>(null);

  const showNotification = useCallback(
    (
      description: string,
      variant: NonNullable<ConfirmDialogProps['variant']> = 'default',
      title?: string
    ) => {
      const fallbackTitle = variant === 'success' ? t('common.success') : t('common.error');
      setNotificationDialog({
        title: title ?? fallbackTitle,
        description,
        variant,
      });
    },
    [t]
  );

  const initialData = useMemo(() => buildInitialData(t), [t]);
  const [resumeData, setResumeData] = useState<ResumeData>(() => initialData);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<ResumeData>(() => initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [themeSettings, setThemeSettings] = useState<RenderThemeSettings>(
    DEFAULT_RENDER_THEME_SETTINGS
  );
  const [lastSavedThemeSettings, setLastSavedThemeSettings] = useState<RenderThemeSettings>(
    DEFAULT_RENDER_THEME_SETTINGS
  );
  const [activeTab, setActiveTab] = useState<TabId>('resume');
  const [editorSection, setEditorSection] = useState<EditorSection>('cv');
  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const [rawYamlSections, setRawYamlSections] = useState<RawYamlSections>(EMPTY_RAW_YAML);
  const [rawYamlIssue, setRawYamlIssue] = useState<DraftValidationDetail | null>(null);
  const [yamlNeedsSync, setYamlNeedsSync] = useState(true);
  const [isPreparingRawMode, setIsPreparingRawMode] = useState(false);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [historyNonce, setHistoryNonce] = useState(0);
  const draftVersionRef = useRef(0);
  const lastSavedRawYamlSectionsRef = useRef<RawYamlSections>(EMPTY_RAW_YAML);
  const historyPastRef = useRef<DraftSnapshot[]>([]);
  const historyFutureRef = useRef<DraftSnapshot[]>([]);
  const historyCurrentRef = useRef<DraftSnapshot | null>(null);
  const historyCommitTimeoutRef = useRef<number | null>(null);
  const resumeDataRef = useRef(resumeData);
  const themeSettingsRef = useRef(themeSettings);
  const rawYamlSectionsRef = useRef(rawYamlSections);
  const yamlNeedsSyncRef = useRef(yamlNeedsSync);
  const editorModeRef = useRef(editorMode);
  const editorSectionRef = useRef(editorSection);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const lastSavedDataRef = useRef(lastSavedData);
  const lastSavedThemeSettingsRef = useRef(lastSavedThemeSettings);
  const { improvedData } = useResumePreview();
  const improvedPreview = improvedData?.data?.resume_preview;
  const improvedCoverLetter = improvedData?.data?.cover_letter;
  const improvedOutreach = improvedData?.data?.outreach_message;
  const improvedArtifacts = improvedData?.data?.artifacts ?? [];
  const improvedThemeSettings = useMemo(
    () => normalizeRenderThemeSettings(improvedData?.data?.theme_settings),
    [improvedData?.data?.theme_settings]
  );
  const searchParams = useSearchParams();
  const router = useRouter();
  const resumeId = searchParams.get('id');
  const currentDraftSnapshot = useMemo<DraftSnapshot>(
    () => ({
      resumeData,
      themeSettings,
      rawYamlSections,
      yamlNeedsSync,
      editorMode,
      editorSection,
    }),
    [editorMode, editorSection, rawYamlSections, resumeData, themeSettings, yamlNeedsSync]
  );

  useEffect(() => {
    resumeDataRef.current = resumeData;
  }, [resumeData]);

  useEffect(() => {
    themeSettingsRef.current = themeSettings;
  }, [themeSettings]);

  useEffect(() => {
    rawYamlSectionsRef.current = rawYamlSections;
  }, [rawYamlSections]);

  useEffect(() => {
    yamlNeedsSyncRef.current = yamlNeedsSync;
  }, [yamlNeedsSync]);

  useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);

  useEffect(() => {
    editorSectionRef.current = editorSection;
  }, [editorSection]);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    lastSavedDataRef.current = lastSavedData;
  }, [lastSavedData]);

  useEffect(() => {
    lastSavedThemeSettingsRef.current = lastSavedThemeSettings;
  }, [lastSavedThemeSettings]);

  const buildDraftSnapshot = useCallback(
    (overrides: Partial<DraftSnapshot> = {}): DraftSnapshot => ({
      resumeData: overrides.resumeData ?? resumeDataRef.current,
      themeSettings: overrides.themeSettings ?? themeSettingsRef.current,
      rawYamlSections: overrides.rawYamlSections ?? rawYamlSectionsRef.current,
      yamlNeedsSync: overrides.yamlNeedsSync ?? yamlNeedsSyncRef.current,
      editorMode: overrides.editorMode ?? editorModeRef.current,
      editorSection: overrides.editorSection ?? editorSectionRef.current,
    }),
    []
  );

  const replaceCurrentHistorySnapshot = useCallback((snapshot: DraftSnapshot) => {
    historyCurrentRef.current = cloneDraftSnapshot(snapshot);
    setHistoryNonce((value) => value + 1);
  }, []);

  const seedHistory = useCallback((snapshot: DraftSnapshot) => {
    if (historyCommitTimeoutRef.current) {
      window.clearTimeout(historyCommitTimeoutRef.current);
      historyCommitTimeoutRef.current = null;
    }
    historyPastRef.current = [];
    historyFutureRef.current = [];
    historyCurrentRef.current = cloneDraftSnapshot(snapshot);
    setHistoryNonce((value) => value + 1);
  }, []);

  const commitHistorySnapshot = useCallback(
    (snapshot: DraftSnapshot) => {
      const committedSnapshot = historyCurrentRef.current;
      if (!committedSnapshot) {
        seedHistory(snapshot);
        return;
      }
      if (serializeDraftSnapshot(committedSnapshot) === serializeDraftSnapshot(snapshot)) {
        return;
      }

      historyPastRef.current.push(cloneDraftSnapshot(committedSnapshot));
      if (historyPastRef.current.length > 60) {
        historyPastRef.current.shift();
      }
      historyFutureRef.current = [];
      historyCurrentRef.current = cloneDraftSnapshot(snapshot);
      setHistoryNonce((value) => value + 1);
    },
    [seedHistory]
  );

  const queueHistoryCommit = useCallback(
    (snapshot: DraftSnapshot) => {
      if (historyFutureRef.current.length > 0) {
        historyFutureRef.current = [];
        setHistoryNonce((value) => value + 1);
      }
      if (historyCommitTimeoutRef.current) {
        window.clearTimeout(historyCommitTimeoutRef.current);
      }
      historyCommitTimeoutRef.current = window.setTimeout(() => {
        commitHistorySnapshot(snapshot);
        historyCommitTimeoutRef.current = null;
      }, HISTORY_COMMIT_DEBOUNCE_MS);
    },
    [commitHistorySnapshot]
  );

  const isSnapshotSaved = useCallback((snapshot: DraftSnapshot) => {
    const structuredSnapshot = JSON.stringify({
      resumeData: snapshot.resumeData,
      themeSettings: snapshot.themeSettings,
    });
    const savedStructuredSnapshot = JSON.stringify({
      resumeData: lastSavedDataRef.current,
      themeSettings: lastSavedThemeSettingsRef.current,
    });

    if (structuredSnapshot !== savedStructuredSnapshot) {
      return false;
    }

    if (snapshot.yamlNeedsSync) {
      return true;
    }

    return (
      JSON.stringify(snapshot.rawYamlSections) ===
      JSON.stringify(lastSavedRawYamlSectionsRef.current)
    );
  }, []);

  const applyHistorySnapshot = useCallback(
    (snapshot: DraftSnapshot) => {
      setResumeData(snapshot.resumeData);
      setThemeSettings(snapshot.themeSettings);
      setRawYamlSections(snapshot.rawYamlSections);
      setYamlNeedsSync(snapshot.yamlNeedsSync);
      setEditorMode(snapshot.editorMode);
      setEditorSection(snapshot.editorSection);
      setRawYamlIssue(null);
      setAutosaveError(null);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot.resumeData));
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(snapshot.themeSettings));
      localStorage.setItem(YAML_STORAGE_KEY, JSON.stringify(snapshot.rawYamlSections));

      if (isSnapshotSaved(snapshot)) {
        setHasUnsavedChanges(false);
        setAutosaveState('saved');
      } else {
        setHasUnsavedChanges(true);
        setAutosaveState('dirty');
      }
    },
    [isSnapshotSaved]
  );

  const handleUndoHistory = useCallback(() => {
    if (historyCommitTimeoutRef.current) {
      window.clearTimeout(historyCommitTimeoutRef.current);
      historyCommitTimeoutRef.current = null;
    }

    const committedSnapshot = historyCurrentRef.current;
    if (!committedSnapshot) {
      return;
    }

    if (
      serializeDraftSnapshot(currentDraftSnapshot) !== serializeDraftSnapshot(committedSnapshot)
    ) {
      historyFutureRef.current.unshift(cloneDraftSnapshot(currentDraftSnapshot));
      applyHistorySnapshot(committedSnapshot);
      setHistoryNonce((value) => value + 1);
      return;
    }

    const previousSnapshot = historyPastRef.current.pop();
    if (!previousSnapshot) {
      return;
    }

    historyFutureRef.current.unshift(cloneDraftSnapshot(currentDraftSnapshot));
    historyCurrentRef.current = cloneDraftSnapshot(previousSnapshot);
    applyHistorySnapshot(previousSnapshot);
    setHistoryNonce((value) => value + 1);
  }, [applyHistorySnapshot, currentDraftSnapshot]);

  const handleRedoHistory = useCallback(() => {
    if (historyCommitTimeoutRef.current) {
      window.clearTimeout(historyCommitTimeoutRef.current);
      historyCommitTimeoutRef.current = null;
    }

    const nextSnapshot = historyFutureRef.current.shift();
    if (!nextSnapshot) {
      return;
    }

    const committedSnapshot = historyCurrentRef.current ?? currentDraftSnapshot;
    historyPastRef.current.push(cloneDraftSnapshot(committedSnapshot));
    if (historyPastRef.current.length > 60) {
      historyPastRef.current.shift();
    }
    historyCurrentRef.current = cloneDraftSnapshot(nextSnapshot);
    applyHistorySnapshot(nextSnapshot);
    setHistoryNonce((value) => value + 1);
  }, [applyHistorySnapshot, currentDraftSnapshot]);

  const canUndo = useMemo(() => {
    void historyNonce;
    const committedSnapshot = historyCurrentRef.current;
    if (!committedSnapshot) {
      return false;
    }
    return (
      historyPastRef.current.length > 0 ||
      serializeDraftSnapshot(currentDraftSnapshot) !== serializeDraftSnapshot(committedSnapshot)
    );
  }, [currentDraftSnapshot, historyNonce]);

  const canRedo = useMemo(() => {
    void historyNonce;
    return historyFutureRef.current.length > 0;
  }, [historyNonce]);

  const markDraftDirty = useCallback(
    (nextMode: EditorMode) => {
      draftVersionRef.current += 1;
      setHasUnsavedChanges(true);
      setAutosaveState(nextMode === 'raw' && rawYamlIssue ? 'invalid' : 'dirty');
      setAutosaveError(null);
      if (nextMode === 'visual') {
        setYamlNeedsSync(true);
      }
    },
    [rawYamlIssue]
  );

  const applyDraftResponse = useCallback(
    (response: ResumeDraftResponse, version: number) => {
      const nextData = (response.data.processed_resume || resumeData) as ResumeData;
      const nextThemeSettings = response.data.theme_settings
        ? normalizeRenderThemeSettings(response.data.theme_settings)
        : themeSettings;

      setLastSavedData(nextData);
      setLastSavedThemeSettings(nextThemeSettings);
      lastSavedRawYamlSectionsRef.current = response.yaml_sections;

      if (draftVersionRef.current === version) {
        setResumeData(nextData);
        setThemeSettings(nextThemeSettings);
        setRawYamlSections(response.yaml_sections);
        setRawYamlIssue(null);
        setYamlNeedsSync(false);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextThemeSettings));
        localStorage.setItem(YAML_STORAGE_KEY, JSON.stringify(response.yaml_sections));
        setHasUnsavedChanges(false);
        setAutosaveState('saved');
        setAutosaveError(null);
        replaceCurrentHistorySnapshot(
          buildDraftSnapshot({
            resumeData: nextData,
            themeSettings: nextThemeSettings,
            rawYamlSections: response.yaml_sections,
            yamlNeedsSync: false,
          })
        );
      } else {
        setAutosaveState('dirty');
      }
    },
    [buildDraftSnapshot, replaceCurrentHistorySnapshot, resumeData, themeSettings]
  );

  const structuredDraftRequest = useMemo<ResumeDraftRequest>(
    () => ({
      resume_id: resumeId,
      processed_resume: resumeData,
      theme_settings: themeSettings,
    }),
    [resumeData, resumeId, themeSettings]
  );

  const rawDraftRequest = useMemo<ResumeDraftRequest | null>(
    () =>
      editorMode === 'raw'
        ? {
            resume_id: resumeId,
            yaml_sections: rawYamlSections,
            theme_settings: themeSettings,
          }
        : null,
    [editorMode, rawYamlSections, resumeId, themeSettings]
  );

  const previewDraftRequest = useMemo<ResumeDraftRequest>(
    () => rawDraftRequest ?? structuredDraftRequest,
    [rawDraftRequest, structuredDraftRequest]
  );

  const autosaveLabel = useMemo(() => {
    if (!resumeId) {
      return 'Draft lives locally until this resume exists on the server.';
    }
    if (autosaveState === 'saving') {
      return 'Autosaving...';
    }
    if (autosaveState === 'saved') {
      return 'All changes saved.';
    }
    if (autosaveState === 'invalid') {
      return 'Autosave paused until the YAML is valid.';
    }
    if (autosaveState === 'error') {
      return autosaveError || 'Autosave failed.';
    }
    if (autosaveState === 'dirty') {
      return 'Changes pending autosave.';
    }
    return 'Autosave is ready.';
  }, [autosaveError, autosaveState, resumeId]);

  useEffect(() => {
    if (resumeId || hasUnsavedChanges || improvedPreview) {
      return;
    }
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    if (savedDraft) {
      return;
    }
    setResumeData(initialData);
    setLastSavedData(initialData);
    seedHistory(
      buildDraftSnapshot({
        resumeData: initialData,
        themeSettings: themeSettingsRef.current,
        yamlNeedsSync: true,
        editorMode: 'visual',
      })
    );
  }, [buildDraftSnapshot, hasUnsavedChanges, improvedPreview, initialData, resumeId, seedHistory]);

  // Cover letter & outreach state
  const [coverLetter, setCoverLetter] = useState('');
  const [outreachMessage, setOutreachMessage] = useState('');
  const [isCoverLetterSaving, setIsCoverLetterSaving] = useState(false);
  const [isOutreachSaving, setIsOutreachSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [resumeTitle, setResumeTitle] = useState<string | null>(null);

  // On-demand generation state
  const [isTailoredResume, setIsTailoredResume] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState<
    'cover-letter' | 'outreach' | null
  >(null);

  // JD comparison state
  const [jobDescription, setJobDescription] = useState<string | null>(null);

  // AI Regenerate wizard
  const regenerateWizard = useRegenerateWizard({
    resumeId: resumeId || '',
    outputLanguage: contentLanguage,
    onSuccess: async () => {
      // Reload resume data after applying changes
      if (!resumeId) {
        return;
      }

      try {
        const data = await fetchResume(resumeId);
        // Update resume title for downloads
        setResumeTitle(data.title ?? null);
        if (data.processed_resume) {
          const nextResumeData = data.processed_resume as ResumeData;
          const nextThemeSettings = data.theme_settings
            ? normalizeRenderThemeSettings(data.theme_settings)
            : themeSettingsRef.current;
          setResumeData(nextResumeData);
          setLastSavedData(nextResumeData);
          setThemeSettings(nextThemeSettings);
          setLastSavedThemeSettings(nextThemeSettings);
          setHasUnsavedChanges(false);
          setAutosaveState('saved');
          setYamlNeedsSync(true);
          seedHistory(
            buildDraftSnapshot({
              resumeData: nextResumeData,
              themeSettings: nextThemeSettings,
              yamlNeedsSync: true,
              editorMode: 'visual',
            })
          );
        }
      } catch (error) {
        console.error('Failed to reload resume after applying regenerated changes:', error);
        showNotification(t('builder.alerts.reloadFailed'), 'danger');
        throw error;
      }
    },
    onError: (errorMessage) => {
      console.error('Error during regeneration or applying regenerated changes:', errorMessage);

      if (/network|fetch/i.test(errorMessage) || errorMessage.includes('Failed to fetch')) {
        showNotification(t('builder.regenerate.errors.networkError'), 'danger');
        return;
      }

      if (/resume content changed|uniquely matched|please regenerate/i.test(errorMessage)) {
        showNotification(t('builder.regenerate.errors.resumeChanged'), 'danger');
        return;
      }

      if (/generate/i.test(errorMessage)) {
        showNotification(t('builder.regenerate.errors.generationFailed'), 'danger');
        return;
      }

      showNotification(t('builder.regenerate.errors.applyFailed'), 'danger');
    },
  });

  // Build regenerate items from resume data
  const experienceItemsForRegenerate: RegenerateItemInput[] = useMemo(() => {
    return (resumeData.workExperience || []).map((exp, idx) => ({
      item_id: `exp_${idx}`,
      item_type: 'experience' as const,
      title: exp.title ?? '',
      subtitle: exp.company || undefined,
      current_content: Array.isArray(exp.description) ? exp.description : [],
    }));
  }, [resumeData.workExperience]);

  const projectItemsForRegenerate: RegenerateItemInput[] = useMemo(() => {
    return (resumeData.personalProjects || []).map((proj, idx) => ({
      item_id: `proj_${idx}`,
      item_type: 'project' as const,
      title: proj.name ?? '',
      subtitle: proj.role || undefined,
      current_content: Array.isArray(proj.description) ? proj.description : [],
    }));
  }, [resumeData.personalProjects]);

  const skillsItemForRegenerate: RegenerateItemInput | null = useMemo(() => {
    const skills = resumeData.additional?.technicalSkills;
    if (skills && skills.length > 0) {
      return {
        item_id: 'skills',
        item_type: 'skills' as const,
        title: t('builder.regenerate.selectDialog.skills'),
        current_content: skills,
      };
    }
    return null;
  }, [resumeData.additional?.technicalSkills, t]);

  // Load template settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setThemeSettings(normalizeRenderThemeSettings(parsed));
      } catch {
        setThemeSettings(DEFAULT_RENDER_THEME_SETTINGS);
      }
    }

    const savedYaml = localStorage.getItem(YAML_STORAGE_KEY);
    if (savedYaml) {
      try {
        setRawYamlSections(JSON.parse(savedYaml) as RawYamlSections);
        setYamlNeedsSync(false);
      } catch {
        localStorage.removeItem(YAML_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(themeSettings));
  }, [themeSettings]);

  useEffect(() => {
    if (!improvedData?.data?.theme_settings) {
      return;
    }
    setThemeSettings(improvedThemeSettings);
    setLastSavedThemeSettings(improvedThemeSettings);
    setYamlNeedsSync(true);
  }, [improvedData?.data?.theme_settings, improvedThemeSettings]);

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges || autosaveState === 'saving' || autosaveState === 'invalid') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [autosaveState, hasUnsavedChanges]);

  useEffect(() => {
    const loadResumeData = async () => {
      setLoadingState('loading');

      // Priority 1: Fetch from API if ID is in URL (most reliable)
      if (resumeId) {
        try {
          const data = await fetchResume(resumeId);
          // Track if this is a tailored resume (has parent_id)
          setIsTailoredResume(Boolean(data.parent_id));
          // Store resume title for downloads
          setResumeTitle(data.title ?? null);
          if (data.theme_settings) {
            const normalizedThemeSettings = normalizeRenderThemeSettings(data.theme_settings);
            setThemeSettings(normalizedThemeSettings);
            setLastSavedThemeSettings(normalizedThemeSettings);
          }
          // Load cover letter and outreach message if available
          if (data.cover_letter) {
            setCoverLetter(data.cover_letter);
          }
          if (data.outreach_message) {
            setOutreachMessage(data.outreach_message);
          }
          // Prefer processed_resume if available
          if (data.processed_resume) {
            setResumeData(data.processed_resume as ResumeData);
            setLastSavedData(data.processed_resume as ResumeData);
            setAutosaveState('saved');
            setYamlNeedsSync(true);
            seedHistory(
              buildDraftSnapshot({
                resumeData: data.processed_resume as ResumeData,
                themeSettings: data.theme_settings
                  ? normalizeRenderThemeSettings(data.theme_settings)
                  : themeSettingsRef.current,
                yamlNeedsSync: true,
                editorMode: 'visual',
              })
            );
            setLoadingState('loaded');
            return;
          }
          // Fallback to parsing raw content
          if (data.raw_resume?.content) {
            try {
              const parsed = JSON.parse(data.raw_resume.content);
              setResumeData(parsed);
              setLastSavedData(parsed);
              setAutosaveState('saved');
              setYamlNeedsSync(true);
              seedHistory(
                buildDraftSnapshot({
                  resumeData: parsed,
                  themeSettings: data.theme_settings
                    ? normalizeRenderThemeSettings(data.theme_settings)
                    : themeSettingsRef.current,
                  yamlNeedsSync: true,
                  editorMode: 'visual',
                })
              );
              setLoadingState('loaded');
              return;
            } catch {
              // Raw content is markdown, not JSON
            }
          }
        } catch (err) {
          console.error('Failed to load resume from API:', err);
        }
      }

      // Priority 2: Improved Data from Context (Tailor Flow)
      if (improvedPreview) {
        setResumeData(improvedPreview);
        setLastSavedData(improvedPreview);
        // Also load cover letter and outreach if present
        if (improvedCoverLetter) {
          setCoverLetter(improvedCoverLetter);
        }
        if (improvedOutreach) {
          setOutreachMessage(improvedOutreach);
        }
        // Persist to localStorage as backup
        localStorage.setItem(STORAGE_KEY, JSON.stringify(improvedPreview));
        setAutosaveState('saved');
        setYamlNeedsSync(true);
        seedHistory(
          buildDraftSnapshot({
            resumeData: improvedPreview,
            themeSettings: improvedThemeSettings,
            yamlNeedsSync: true,
            editorMode: 'visual',
          })
        );
        setLoadingState('loaded');
        return;
      }

      // Priority 3: Restore from localStorage (browser refresh recovery)
      const savedDraft = localStorage.getItem(STORAGE_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setResumeData(parsed);
          setLastSavedData(parsed);
          setHasUnsavedChanges(true); // Mark as unsaved since it's a draft
          setAutosaveState('dirty');
          setYamlNeedsSync(true);
          seedHistory(
            buildDraftSnapshot({
              resumeData: parsed,
              themeSettings: themeSettingsRef.current,
              rawYamlSections: rawYamlSectionsRef.current,
              yamlNeedsSync: true,
              editorMode: 'visual',
            })
          );
          setLoadingState('loaded');
          return;
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      // Fallback: Use initial data
      setLoadingState('loaded');
    };

    loadResumeData();
  }, [
    buildDraftSnapshot,
    improvedCoverLetter,
    improvedOutreach,
    improvedPreview,
    improvedThemeSettings,
    resumeId,
    seedHistory,
  ]);

  // Fetch job description when we have a tailored resume
  useEffect(() => {
    let cancelled = false;

    const loadJobDescription = async () => {
      if (isTailoredResume && resumeId) {
        try {
          const data = await fetchJobDescription(resumeId);
          if (!cancelled) {
            setJobDescription(data.content);
          }
        } catch (err) {
          // JD might not be available for older resumes
          if (!cancelled) {
            console.warn('Could not fetch job description:', err);
            setJobDescription(null);
          }
        }
      } else {
        // Clear job description when switching to non-tailored resume
        setJobDescription(null);
      }
    };

    loadJobDescription();
    return () => {
      cancelled = true;
    };
  }, [isTailoredResume, resumeId]);

  const syncRawYamlFromStructured = useCallback(async () => {
    setIsPreparingRawMode(true);
    try {
      const response = await normalizeResumeDraft(structuredDraftRequest);
      setRawYamlSections(response.yaml_sections);
      setRawYamlIssue(null);
      setYamlNeedsSync(false);
      localStorage.setItem(YAML_STORAGE_KEY, JSON.stringify(response.yaml_sections));
      if (!hasUnsavedChangesRef.current) {
        lastSavedRawYamlSectionsRef.current = response.yaml_sections;
      }
      replaceCurrentHistorySnapshot(
        buildDraftSnapshot({
          rawYamlSections: response.yaml_sections,
          yamlNeedsSync: false,
          editorMode: 'raw',
        })
      );
    } catch (error) {
      const issue =
        isDraftRequestError(error) && error.detail
          ? error.detail
          : {
              message:
                error instanceof Error
                  ? error.message
                  : 'Failed to build YAML from the current draft.',
            };
      setRawYamlIssue(issue);
      if (issue.section) {
        setEditorSection(issue.section);
      }
    } finally {
      setIsPreparingRawMode(false);
    }
  }, [buildDraftSnapshot, replaceCurrentHistorySnapshot, structuredDraftRequest]);

  const persistDraft = useCallback(
    async ({ manual, version }: { manual: boolean; version: number }) => {
      if (!resumeId) {
        return false;
      }

      const payload =
        editorMode === 'raw'
          ? ({
              resume_id: resumeId,
              yaml_sections: rawYamlSections,
              theme_settings: themeSettings,
            } satisfies ResumeDraftRequest)
          : structuredDraftRequest;

      try {
        if (manual) {
          setIsSaving(true);
        } else {
          setAutosaveState('saving');
          setAutosaveError(null);
        }

        const response = await saveResumeDraft(resumeId, payload);
        applyDraftResponse(response, version);
        return true;
      } catch (error) {
        const issue =
          isDraftRequestError(error) && error.detail
            ? error.detail
            : {
                message: error instanceof Error ? error.message : 'Failed to save draft.',
              };
        const message = issue.message;
        if (!manual && draftVersionRef.current !== version) {
          return false;
        }
        if (editorMode === 'raw') {
          setRawYamlIssue(issue);
          if (issue.section) {
            setEditorSection(issue.section);
          }
          setAutosaveState('invalid');
        } else {
          setAutosaveState('error');
        }
        setAutosaveError(message);
        if (manual) {
          showNotification(message, 'danger');
        }
        return false;
      } finally {
        if (manual) {
          setIsSaving(false);
        }
      }
    },
    [
      applyDraftResponse,
      editorMode,
      rawYamlSections,
      resumeId,
      showNotification,
      structuredDraftRequest,
      themeSettings,
    ]
  );

  useEffect(() => {
    if (!resumeId || !hasUnsavedChanges) {
      return;
    }

    const version = draftVersionRef.current;
    const timeout = window.setTimeout(() => {
      void persistDraft({ manual: false, version });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [
    editorMode,
    hasUnsavedChanges,
    persistDraft,
    rawYamlSections,
    resumeData,
    resumeId,
    themeSettings,
  ]);

  const handleUpdate = useCallback(
    (newData: ResumeData) => {
      setResumeData(newData);
      setRawYamlIssue(null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
      markDraftDirty('visual');
      queueHistoryCommit(
        buildDraftSnapshot({
          resumeData: newData,
          yamlNeedsSync: true,
          editorMode: 'visual',
        })
      );
    },
    [buildDraftSnapshot, markDraftDirty, queueHistoryCommit]
  );

  const handleSettingsChange = useCallback(
    (newSettings: RenderThemeSettings) => {
      setThemeSettings(newSettings);
      setRawYamlIssue(null);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
      markDraftDirty('visual');
      queueHistoryCommit(
        buildDraftSnapshot({
          themeSettings: newSettings,
          yamlNeedsSync: true,
          editorMode: 'visual',
        })
      );
    },
    [buildDraftSnapshot, markDraftDirty, queueHistoryCommit]
  );

  const handleRawYamlChange = useCallback(
    (section: EditorSection, value: string) => {
      const nextSections = {
        ...rawYamlSections,
        [section]: value,
      };
      setRawYamlSections(nextSections);
      setRawYamlIssue(null);
      localStorage.setItem(YAML_STORAGE_KEY, JSON.stringify(nextSections));
      markDraftDirty('raw');
      queueHistoryCommit(
        buildDraftSnapshot({
          rawYamlSections: nextSections,
          yamlNeedsSync: false,
          editorMode: 'raw',
          editorSection: section,
        })
      );
    },
    [buildDraftSnapshot, markDraftDirty, queueHistoryCommit, rawYamlSections]
  );

  const handleEditorModeChange = useCallback(
    async (checked: boolean) => {
      const nextMode: EditorMode = checked ? 'raw' : 'visual';
      setEditorMode(nextMode);
      if (nextMode === 'visual') {
        setRawYamlIssue(null);
      }

      if (nextMode === 'raw' && yamlNeedsSync) {
        await syncRawYamlFromStructured();
      }
    },
    [syncRawYamlFromStructured, yamlNeedsSync]
  );

  const handleSave = async () => {
    if (!resumeId) {
      showNotification(t('builder.alerts.saveNotAvailable'), 'warning');
      return;
    }

    const success = await persistDraft({
      manual: true,
      version: draftVersionRef.current,
    });
    if (success) {
      showNotification('Resume saved.', 'success');
    }
  };

  const handleReset = async () => {
    setResumeData(lastSavedData);
    setThemeSettings(lastSavedThemeSettings);
    setRawYamlIssue(null);
    setHasUnsavedChanges(false);
    setAutosaveState('saved');
    setAutosaveError(null);
    setYamlNeedsSync(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lastSavedData));
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(lastSavedThemeSettings));
    if (editorMode === 'raw') {
      try {
        const response = await normalizeResumeDraft({
          resume_id: resumeId,
          processed_resume: lastSavedData,
          theme_settings: lastSavedThemeSettings,
        });
        setRawYamlSections(response.yaml_sections);
        setYamlNeedsSync(false);
        localStorage.setItem(YAML_STORAGE_KEY, JSON.stringify(response.yaml_sections));
        lastSavedRawYamlSectionsRef.current = response.yaml_sections;
        seedHistory(
          buildDraftSnapshot({
            resumeData: lastSavedData,
            themeSettings: lastSavedThemeSettings,
            rawYamlSections: response.yaml_sections,
            yamlNeedsSync: false,
          })
        );
      } catch (error) {
        const issue =
          isDraftRequestError(error) && error.detail
            ? error.detail
            : {
                message:
                  error instanceof Error
                    ? error.message
                    : 'Failed to rebuild YAML from saved data.',
              };
        setRawYamlIssue(issue);
        if (issue.section) {
          setEditorSection(issue.section);
        }
      }
      return;
    }
    seedHistory(
      buildDraftSnapshot({
        resumeData: lastSavedData,
        themeSettings: lastSavedThemeSettings,
        yamlNeedsSync: true,
        editorMode: 'visual',
      })
    );
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeTab !== 'resume') {
        return;
      }

      const usesUndoModifier = event.metaKey || event.ctrlKey;
      if (!usesUndoModifier || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedoHistory();
        } else {
          handleUndoHistory();
        }
      } else if (key === 'y' && event.ctrlKey) {
        event.preventDefault();
        handleRedoHistory();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleRedoHistory, handleUndoHistory]);

  useEffect(() => {
    return () => {
      if (historyCommitTimeoutRef.current) {
        window.clearTimeout(historyCommitTimeoutRef.current);
      }
    };
  }, []);

  const handleDownload = async () => {
    if (!resumeId) {
      showNotification(t('builder.alerts.downloadNotAvailable'), 'warning');
      return;
    }
    try {
      if (hasUnsavedChanges) {
        const saved = await persistDraft({
          manual: true,
          version: draftVersionRef.current,
        });
        if (!saved) {
          return;
        }
      }
      setIsDownloading(true);
      const blob = await downloadResumePdf(resumeId, themeSettings, uiLanguage);
      const filename = sanitizeFilename(resumeTitle, resumeId, 'resume');
      downloadBlobAsFile(blob, filename);
      showNotification(t('builder.alerts.downloadSuccess'), 'success');
    } catch (error) {
      console.error('Failed to download resume:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const fallbackUrl = getResumePdfUrl(resumeId, themeSettings, uiLanguage, true);
        const didOpen = openUrlInNewTab(fallbackUrl);
        if (!didOpen) {
          showNotification(t('common.popupBlocked', { url: fallbackUrl }), 'warning');
        }
        return;
      }
      let errorMessage = t('builder.alerts.downloadFailed');
      if (error instanceof Error && error.message) {
        errorMessage = `${t('builder.alerts.downloadFailed')}: ${error.message}`;
      }
      showNotification(errorMessage, 'danger');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyCurrentYamlSection = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawYamlSections[editorSection]);
      showNotification('Copied YAML section.', 'success');
    } catch (error) {
      console.error('Failed to copy YAML section:', error);
      showNotification('Failed to copy YAML section.', 'danger');
    }
  }, [editorSection, rawYamlSections, showNotification]);

  const handleCopyFullYaml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildFullYaml(rawYamlSections));
      showNotification('Copied full YAML.', 'success');
    } catch (error) {
      console.error('Failed to copy full YAML:', error);
      showNotification('Failed to copy full YAML.', 'danger');
    }
  }, [rawYamlSections, showNotification]);

  const handleResyncYaml = useCallback(async () => {
    await syncRawYamlFromStructured();
  }, [syncRawYamlFromStructured]);

  // Cover letter handlers
  const handleSaveCoverLetter = async () => {
    if (!resumeId) return;
    try {
      setIsCoverLetterSaving(true);
      await updateCoverLetter(resumeId, coverLetter);
      showNotification(t('builder.alerts.coverLetterSaveSuccess'), 'success');
    } catch (error) {
      console.error('Failed to save cover letter:', error);
      showNotification(t('builder.alerts.coverLetterSaveFailed'), 'danger');
    } finally {
      setIsCoverLetterSaving(false);
    }
  };

  const handleDownloadCoverLetter = async () => {
    if (!resumeId) {
      showNotification(t('builder.alerts.coverLetterDownloadRequiresResume'), 'warning');
      return;
    }
    if (!coverLetter) {
      showNotification(t('builder.alerts.coverLetterMissing'), 'warning');
      return;
    }
    try {
      setIsDownloading(true);
      const blob = await downloadCoverLetterPdf(resumeId, themeSettings.page_size, uiLanguage);
      const filename = sanitizeFilename(resumeTitle, resumeId, 'cover-letter');
      downloadBlobAsFile(blob, filename);
    } catch (error) {
      console.error('Failed to download cover letter:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const fallbackUrl = getCoverLetterPdfUrl(resumeId, themeSettings.page_size, uiLanguage);
        const didOpen = openUrlInNewTab(fallbackUrl);
        if (!didOpen) {
          showNotification(t('common.popupBlocked', { url: fallbackUrl }), 'warning');
        }
        return;
      }
      const errorMessage = error instanceof Error ? error.message : t('common.unknown');
      showNotification(
        t('builder.alerts.coverLetterDownloadFailed', { error: errorMessage }),
        'danger'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  // Outreach handlers
  const handleSaveOutreach = async () => {
    if (!resumeId) return;
    try {
      setIsOutreachSaving(true);
      await updateOutreachMessage(resumeId, outreachMessage);
      showNotification(t('builder.alerts.outreachSaveSuccess'), 'success');
    } catch (error) {
      console.error('Failed to save outreach message:', error);
      showNotification(t('builder.alerts.outreachSaveFailed'), 'danger');
    } finally {
      setIsOutreachSaving(false);
    }
  };

  const handleCopyOutreach = async () => {
    try {
      await navigator.clipboard.writeText(outreachMessage);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // On-demand generation handlers
  const doGenerateCoverLetter = async () => {
    if (!resumeId) return;
    setIsGeneratingCoverLetter(true);
    setShowRegenerateDialog(null);
    try {
      const content = await generateCoverLetter(resumeId);
      setCoverLetter(content);
    } catch (error) {
      console.error('Failed to generate cover letter:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showNotification(
        t('builder.alerts.coverLetterGenerateFailed', { error: errorMessage }),
        'danger'
      );
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handleGenerateCoverLetter = () => {
    if (!resumeId) return;
    // If content exists, show confirmation dialog
    if (coverLetter) {
      setShowRegenerateDialog('cover-letter');
      return;
    }
    doGenerateCoverLetter();
  };

  const doGenerateOutreach = async () => {
    if (!resumeId) return;
    setIsGeneratingOutreach(true);
    setShowRegenerateDialog(null);
    try {
      const content = await generateOutreachMessage(resumeId);
      setOutreachMessage(content);
    } catch (error) {
      console.error('Failed to generate outreach message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showNotification(
        t('builder.alerts.outreachGenerateFailed', { error: errorMessage }),
        'danger'
      );
    } finally {
      setIsGeneratingOutreach(false);
    }
  };

  const handleGenerateOutreach = () => {
    if (!resumeId) return;
    // If content exists, show confirmation dialog
    if (outreachMessage) {
      setShowRegenerateDialog('outreach');
      return;
    }
    doGenerateOutreach();
  };

  return (
    <div
      className="h-screen w-full bg-[#F0F0E8] flex justify-center items-center p-4 md:p-8"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      {/* Main Container */}
      <div className="w-full h-full max-w-[90%] md:max-w-[95%] xl:max-w-[1800px] border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] flex flex-col">
        {/* Header Section */}
        <div className="border-b border-black p-6 md:p-8 bg-[#F0F0E8] no-print">
          {/* Top Row: Back button and Actions */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <Button
                variant="link"
                onClick={() => router.push('/dashboard')}
                className="mb-2 -ml-1"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('nav.backToDashboard')}
              </Button>
              <h1 className="font-serif text-3xl md:text-5xl text-black tracking-tight leading-[0.95] uppercase">
                {t('nav.builder')}
              </h1>
              <div className="mt-3 flex items-center gap-3">
                <p className="text-sm font-mono text-blue-700 uppercase tracking-wide font-bold">
                  {'// '}
                  {resumeId ? t('builder.editMode') : t('builder.createAndPreview')}
                </p>
                {hasUnsavedChanges && (
                  <span className="flex items-center gap-1 text-xs font-mono text-amber-600 bg-amber-50 px-2 py-1 border border-amber-200">
                    <AlertTriangle className="w-3 h-3" />
                    {t('builder.unsavedDraft')}
                  </span>
                )}
                <span className="flex items-center gap-1 border border-black bg-white px-2 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-gray-700">
                  {autosaveState === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {autosaveLabel}
                </span>
              </div>
            </div>

            <div className="flex gap-3 mt-4 md:mt-0">
              {/* Resume tab actions */}
              {activeTab === 'resume' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => regenerateWizard.startRegenerate()}
                    disabled={!resumeId}
                  >
                    <Sparkles className="w-4 h-4" />
                    {t('builder.regenerate.buttonLabel')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleUndoHistory}
                    disabled={!canUndo}
                  >
                    <Undo2 className="w-4 h-4" />
                    Undo
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRedoHistory}
                    disabled={!canRedo}
                  >
                    <Redo2 className="w-4 h-4" />
                    Redo
                  </Button>
                  <Button
                    variant="warning"
                    size="sm"
                    onClick={handleReset}
                    disabled={!hasUnsavedChanges}
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('common.reset')}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={!resumeId || isSaving}>
                    <Save className="w-4 h-4" />
                    {isSaving ? t('common.saving') : t('common.save')}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!resumeId || isDownloading}
                  >
                    <Download className="w-4 h-4" />
                    {isDownloading ? t('common.generating') : t('common.download')}
                  </Button>
                </>
              )}

              {/* Cover letter tab actions */}
              {activeTab === 'cover-letter' && coverLetter && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateCoverLetter}
                    disabled={isGeneratingCoverLetter}
                  >
                    {isGeneratingCoverLetter ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {t('coverLetter.regenerate')}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={handleDownloadCoverLetter}
                    disabled={!resumeId || isDownloading}
                  >
                    <Download className="w-4 h-4" />
                    {isDownloading ? t('common.generating') : t('common.download')}
                  </Button>
                </>
              )}

              {/* Outreach tab actions */}
              {activeTab === 'outreach' && outreachMessage && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateOutreach}
                    disabled={isGeneratingOutreach}
                  >
                    {isGeneratingOutreach ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {t('outreach.regenerate')}
                  </Button>
                  <Button variant="success" size="sm" onClick={handleCopyOutreach}>
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4" />
                        {t('outreach.copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        {t('outreach.copyToClipboard')}
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 bg-black gap-[1px] flex-1 min-h-0">
          {/* Left Panel: Editor */}
          <div className="bg-[#F0F0E8] p-6 md:p-8 overflow-y-auto no-print">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex items-center gap-2 border-b-2 border-black pb-2">
                <div className="w-3 h-3 bg-blue-700"></div>
                <h2 className="font-mono text-lg font-bold uppercase tracking-wider">
                  {activeTab === 'resume' &&
                    (editorMode === 'raw'
                      ? 'RenderCV YAML'
                      : editorSection === 'cv'
                        ? 'RenderCV Resume'
                        : editorSection === 'design'
                          ? 'RenderCV Design'
                          : editorSection === 'locale'
                            ? 'RenderCV Locale'
                            : 'RenderCV Settings')}
                  {activeTab === 'cover-letter' && t('builder.leftPanel.coverLetterEditor')}
                  {activeTab === 'outreach' && t('builder.leftPanel.outreachEditor')}
                  {activeTab === 'jd-match' && t('builder.leftPanel.jdMatchAnalysis')}
                </h2>
              </div>

              {/* Resume Editor */}
              {activeTab === 'resume' && (
                <>
                  <div className="border border-black bg-[#F8F7F1] px-4 py-3">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-700">
                          RenderCV Editor Tabs
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          {editorMode === 'raw'
                            ? 'Edit the same CV, Design, Locale, and Settings data directly as RenderCV-style YAML.'
                            : 'Use `CV` for resume content, then switch to `Design`, `Locale`, or `Settings` for the hosted RenderCV controls.'}
                        </p>
                      </div>
                      <div className="min-w-[240px]">
                        <ToggleSwitch
                          checked={editorMode === 'raw'}
                          onCheckedChange={(checked) => void handleEditorModeChange(checked)}
                          label="Raw YAML"
                          description="Switch between visual controls and editable YAML."
                        />
                      </div>
                    </div>
                  </div>
                  <RetroTabs
                    tabs={[
                      { id: 'cv', label: 'CV' },
                      { id: 'design', label: 'Design' },
                      { id: 'locale', label: 'Locale' },
                      { id: 'settings', label: 'Settings' },
                    ]}
                    activeTab={editorSection}
                    onTabChange={(id) => setEditorSection(id as EditorSection)}
                  />
                  {editorMode === 'visual' && editorSection === 'cv' && (
                    <ResumeForm resumeData={resumeData} onUpdate={handleUpdate} />
                  )}
                  {editorMode === 'visual' && editorSection === 'design' && (
                    <RenderThemeControls settings={themeSettings} onChange={handleSettingsChange} />
                  )}
                  {editorMode === 'visual' && editorSection === 'locale' && (
                    <RenderLocaleControls
                      settings={themeSettings}
                      onChange={handleSettingsChange}
                    />
                  )}
                  {editorMode === 'visual' && editorSection === 'settings' && (
                    <RenderRuntimeSettingsControls
                      settings={themeSettings}
                      onChange={handleSettingsChange}
                    />
                  )}
                  {editorMode === 'raw' && (
                    <RawYamlEditor
                      section={editorSection}
                      value={rawYamlSections[editorSection]}
                      statusLabel={autosaveLabel}
                      error={rawYamlIssue}
                      isLoading={isPreparingRawMode}
                      onChange={(value) => handleRawYamlChange(editorSection, value)}
                      onCopySection={() => void handleCopyCurrentYamlSection()}
                      onCopyAll={() => void handleCopyFullYaml()}
                      onResync={() => void handleResyncYaml()}
                      onFocusErrorSection={
                        rawYamlIssue?.section
                          ? () => setEditorSection(rawYamlIssue.section as EditorSection)
                          : undefined
                      }
                    />
                  )}
                </>
              )}

              {/* Cover Letter Editor */}
              {activeTab === 'cover-letter' &&
                (coverLetter ? (
                  <CoverLetterEditor
                    content={coverLetter}
                    onChange={setCoverLetter}
                    onSave={handleSaveCoverLetter}
                    isSaving={isCoverLetterSaving}
                  />
                ) : (
                  <GeneratePrompt
                    type="cover-letter"
                    isGenerating={isGeneratingCoverLetter}
                    onGenerate={handleGenerateCoverLetter}
                    isTailoredResume={isTailoredResume}
                  />
                ))}

              {/* Outreach Editor */}
              {activeTab === 'outreach' &&
                (outreachMessage ? (
                  <OutreachEditor
                    content={outreachMessage}
                    onChange={setOutreachMessage}
                    onSave={handleSaveOutreach}
                    isSaving={isOutreachSaving}
                  />
                ) : (
                  <GeneratePrompt
                    type="outreach"
                    isGenerating={isGeneratingOutreach}
                    onGenerate={handleGenerateOutreach}
                    isTailoredResume={isTailoredResume}
                  />
                ))}

              {/* JD Match Info Panel */}
              {activeTab === 'jd-match' && (
                <div className="space-y-4">
                  <div className="border-2 border-black bg-white p-4">
                    <h3 className="font-mono text-sm font-bold uppercase mb-2">
                      {t('builder.jdMatch.aboutTitle')}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {t('builder.jdMatch.aboutDescription')}
                    </p>
                  </div>

                  <div className="border-2 border-black bg-[#F0F0E8] p-4">
                    <h3 className="font-mono text-sm font-bold uppercase mb-2">
                      {t('builder.jdMatch.highlightedKeywordsTitle')}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {(() => {
                        const template = t(
                          'builder.jdMatch.highlightedKeywordsDescriptionTemplate'
                        );
                        const parts = template.split('__COLOR__');
                        if (parts.length < 2) return template;
                        return (
                          <>
                            {parts[0]}
                            <mark className="bg-yellow-200 px-1">
                              {t('builder.jdMatch.highlightColor')}
                            </mark>
                            {parts.slice(1).join('__COLOR__')}
                          </>
                        );
                      })()}
                    </p>
                  </div>

                  <div className="border-2 border-black bg-white p-4">
                    <h3 className="font-mono text-sm font-bold uppercase mb-2">
                      {t('builder.jdMatch.tipsTitle')}
                    </h3>
                    <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                      <li>{t('builder.jdMatch.tips.items.addMissingKeywords')}</li>
                      <li>{t('builder.jdMatch.tips.items.focusTechnicalSkills')}</li>
                      <li>{t('builder.jdMatch.tips.items.matchActionVerbs')}</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Preview with Tabs */}
          <div className="bg-[#E5E5E0] overflow-hidden flex flex-col no-print">
            {/* Tabs Header */}
            <div className="px-6 pt-3 shrink-0 bg-[#E5E5E0]">
              <RetroTabs
                tabs={[
                  { id: 'resume', label: t('builder.previewTabs.resume') },
                  {
                    id: 'cover-letter',
                    label: t('builder.previewTabs.coverLetter'),
                    disabled: !coverLetter,
                  },
                  {
                    id: 'outreach',
                    label: t('builder.previewTabs.outreach'),
                    disabled: !outreachMessage,
                  },
                  {
                    id: 'jd-match',
                    label: t('builder.previewTabs.jdMatch'),
                    disabled: !jobDescription,
                  },
                ]}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as TabId)}
              />
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Resume Preview */}
              {activeTab === 'resume' && (
                <RenderPreviewPanel
                  resumeId={resumeId}
                  settings={themeSettings}
                  draftRequest={previewDraftRequest}
                  initialArtifacts={improvedArtifacts}
                  stale={false}
                />
              )}

              {/* Cover Letter Preview */}
              {activeTab === 'cover-letter' &&
                (coverLetter && resumeData.personalInfo ? (
                  <div className="p-6">
                    <CoverLetterPreview
                      content={coverLetter}
                      personalInfo={resumeData.personalInfo}
                      pageSize={themeSettings.page_size}
                    />
                  </div>
                ) : (
                  <GeneratePrompt
                    type="cover-letter"
                    isGenerating={isGeneratingCoverLetter}
                    onGenerate={handleGenerateCoverLetter}
                    isTailoredResume={isTailoredResume}
                  />
                ))}

              {/* Outreach Preview */}
              {activeTab === 'outreach' &&
                (outreachMessage ? (
                  <div className="p-6">
                    <OutreachPreview content={outreachMessage} />
                  </div>
                ) : (
                  <GeneratePrompt
                    type="outreach"
                    isGenerating={isGeneratingOutreach}
                    onGenerate={handleGenerateOutreach}
                    isTailoredResume={isTailoredResume}
                  />
                ))}

              {/* JD Match Comparison */}
              {activeTab === 'jd-match' && jobDescription && (
                <JDComparisonView jobDescription={jobDescription} resumeData={resumeData} />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#F0F0E8] flex justify-between items-center font-mono text-xs text-blue-700 border-t border-black no-print">
          <span className="uppercase font-bold flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Resume Matcher"
              width={20}
              height={20}
              className="w-5 h-5"
            />
            {t('builder.footer.moduleLabel')}
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-700"></div>
              <span className="uppercase">
                {RENDER_THEME_OPTIONS.find((option) => option.id === themeSettings.theme_id)
                  ?.label ?? themeSettings.theme_id}
              </span>
            </div>
            <span className="text-gray-400">|</span>
            <span className="uppercase">
              {themeSettings.page_size === 'A4' ? 'A4' : t('builder.pageSize.usLetter')}
            </span>
          </div>
        </div>
      </div>

      {/* Regenerate Confirmation Dialog */}
      <ConfirmDialog
        open={showRegenerateDialog !== null}
        onOpenChange={(open) => !open && setShowRegenerateDialog(null)}
        title={t('builder.regenerateDialog.title', {
          title:
            showRegenerateDialog === 'cover-letter' ? t('coverLetter.title') : t('outreach.title'),
        })}
        description={t('builder.regenerateDialog.description', {
          title:
            showRegenerateDialog === 'cover-letter' ? t('coverLetter.title') : t('outreach.title'),
        })}
        confirmLabel={
          showRegenerateDialog === 'cover-letter'
            ? t('coverLetter.regenerate')
            : t('outreach.regenerate')
        }
        cancelLabel={t('common.cancel')}
        variant="warning"
        onConfirm={
          showRegenerateDialog === 'cover-letter' ? doGenerateCoverLetter : doGenerateOutreach
        }
      />

      {/* Notification Dialog (replaces native alert()) */}
      <ConfirmDialog
        open={notificationDialog !== null}
        onOpenChange={(open) => !open && setNotificationDialog(null)}
        title={notificationDialog?.title ?? ''}
        description={notificationDialog?.description ?? ''}
        confirmLabel={t('common.ok')}
        showCancelButton={false}
        variant={notificationDialog?.variant ?? 'default'}
        onConfirm={() => setNotificationDialog(null)}
      />

      {/* AI Regenerate Wizard */}
      <RegenerateWizard
        step={regenerateWizard.step}
        onStepChange={regenerateWizard.setStep}
        experienceItems={experienceItemsForRegenerate}
        projectItems={projectItemsForRegenerate}
        skillsItem={skillsItemForRegenerate}
        selectedItems={regenerateWizard.selectedItems}
        onSelectionChange={regenerateWizard.setSelectedItems}
        instruction={regenerateWizard.instruction}
        onInstructionChange={regenerateWizard.setInstruction}
        regeneratedItems={regenerateWizard.regeneratedItems}
        regenerateErrors={regenerateWizard.regenerateErrors}
        isGenerating={regenerateWizard.isGenerating}
        isApplying={regenerateWizard.isApplying}
        error={regenerateWizard.error}
        onGenerate={regenerateWizard.generate}
        onAccept={regenerateWizard.acceptChanges}
        onReject={regenerateWizard.rejectAndRegenerate}
        onClose={regenerateWizard.reset}
      />
    </div>
  );
};

export const ResumeBuilder = () => {
  const { t } = useTranslations();
  return (
    <Suspense fallback={<div>{t('common.loading')}</div>}>
      <ResumeBuilderContent />
    </Suspense>
  );
};
