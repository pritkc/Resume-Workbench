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
  Columns2,
  Eye,
  GripVertical,
  Pencil,
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
import {
  buildResumePdfFilename,
  downloadBlobAsFile,
  openUrlInNewTab,
  sanitizeFilename,
} from '@/lib/utils/download';
import { cn } from '@/lib/utils';
import {
  buildRegenerateItemIdForGroup,
  createDefaultSkillsSection,
  getAdditionalGroupDisplayLabel,
  getAdditionalGroupsWithContent,
  normalizeResumeSkills,
} from '@/lib/utils/additional-groups';
import {
  getExperienceHighlights,
  getExperiencePosition,
  getProjectHighlights,
  getProjectSummary,
} from '@/lib/utils/rendercv-fields';
import type { RegenerateItemInput } from '@/lib/api/enrichment';

type TabId = 'resume' | 'cover-letter' | 'outreach' | 'jd-match';
type EditorSection = 'cv' | 'design' | 'locale' | 'settings';
type EditorMode = 'visual' | 'raw';
type PaneMode = 'editor' | 'split' | 'preview';
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
const UI_LAYOUT_STORAGE_KEY = 'resume_builder_ui_layout';
const AUTOSAVE_DEBOUNCE_MS = 1000;
const HISTORY_COMMIT_DEBOUNCE_MS = 350;

type Translate = (key: string, params?: Record<string, string | number>) => string;

const buildInitialData = (t: Translate): ResumeData => ({
  personalInfo: {
    name: t('builder.personalInfoForm.placeholders.name'),
    headline: t('builder.personalInfoForm.placeholders.title'),
    title: t('builder.personalInfoForm.placeholders.title'),
    email: t('builder.personalInfoForm.placeholders.email'),
    phone: t('builder.personalInfoForm.placeholders.phone'),
    location: t('builder.personalInfoForm.placeholders.location'),
    website: '',
    linkedin: '',
    github: '',
    photo: null,
    photoUrl: null,
    profileLinks: [],
    socialNetworks: [],
    customConnections: [],
  },
  summary: t('builder.placeholders.summary'),
  workExperience: [],
  education: [],
  personalProjects: [],
  skills: createDefaultSkillsSection(),
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

function clampPaneRatio(value: number): number {
  return Math.min(72, Math.max(28, Math.round(value)));
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
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [paneMode, setPaneMode] = useState<PaneMode>('split');
  const [paneRatio, setPaneRatio] = useState(52);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isResizingPane, setIsResizingPane] = useState(false);
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

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const syncViewport = () => setIsDesktop(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    const savedLayout = localStorage.getItem(UI_LAYOUT_STORAGE_KEY);
    if (!savedLayout) {
      return;
    }

    try {
      const parsed = JSON.parse(savedLayout) as {
        paneMode?: PaneMode;
        paneRatio?: number;
      };

      if (
        parsed.paneMode === 'editor' ||
        parsed.paneMode === 'split' ||
        parsed.paneMode === 'preview'
      ) {
        setPaneMode(parsed.paneMode);
      }
      if (typeof parsed.paneRatio === 'number') {
        setPaneRatio(clampPaneRatio(parsed.paneRatio));
      }
    } catch {
      localStorage.removeItem(UI_LAYOUT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      UI_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        paneMode,
        paneRatio,
      })
    );
  }, [paneMode, paneRatio]);

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

  useEffect(() => {
    if (!isResizingPane) {
      return;
    }

    const handlePointerMove = (event: MouseEvent) => {
      const container = workspaceRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const nextRatio = ((event.clientX - rect.left) / rect.width) * 100;
      setPaneRatio(clampPaneRatio(nextRatio));
    };

    const stopResizing = () => {
      setIsResizingPane(false);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', stopResizing);
    window.addEventListener('blur', stopResizing);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('blur', stopResizing);
    };
  }, [isResizingPane]);

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
  const [resumeCode, setResumeCode] = useState<string | null>(null);

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
        setResumeCode(data.resume_code ?? null);
        if (data.processed_resume) {
          const nextResumeData = normalizeResumeSkills(data.processed_resume as ResumeData);
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
      title: getExperiencePosition(exp),
      subtitle: exp.company || undefined,
      current_content: getExperienceHighlights(exp),
    }));
  }, [resumeData.workExperience]);

  const projectItemsForRegenerate: RegenerateItemInput[] = useMemo(() => {
    return (resumeData.personalProjects || []).map((proj, idx) => ({
      item_id: `proj_${idx}`,
      item_type: 'project' as const,
      title: proj.name ?? '',
      subtitle: getProjectSummary(proj) || undefined,
      current_content: getProjectHighlights(proj),
    }));
  }, [resumeData.personalProjects]);

  const additionalGroupItemsForRegenerate: RegenerateItemInput[] = useMemo(() => {
    return getAdditionalGroupsWithContent(resumeData.skills ?? resumeData.additional).map(
      (group) => ({
        item_id: buildRegenerateItemIdForGroup(group),
        item_type: 'additionalGroup' as const,
        title: getAdditionalGroupDisplayLabel(group, t),
        group_id: group.label,
        current_content: group.values,
      })
    );
  }, [resumeData.skills, resumeData.additional, t]);

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
    if (!improvedData?.data?.theme_settings && !improvedData?.data?.bold_keywords?.length) {
      return;
    }
    const boldKeywords = improvedData?.data?.bold_keywords;
    const newSettings =
      boldKeywords && boldKeywords.length > 0
        ? {
            ...improvedThemeSettings,
            bold_keywords: true,
            settings: { ...improvedThemeSettings.settings, bold_keywords: boldKeywords },
          }
        : improvedThemeSettings;
    setThemeSettings(newSettings);
    setLastSavedThemeSettings(newSettings);
    setYamlNeedsSync(true);
  }, [
    improvedData?.data?.theme_settings,
    improvedData?.data?.bold_keywords,
    improvedThemeSettings,
  ]);

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
          setResumeCode(data.resume_code ?? null);
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
            const nextResumeData = normalizeResumeSkills(data.processed_resume as ResumeData);
            setResumeData(nextResumeData);
            setLastSavedData(nextResumeData);
            setAutosaveState('saved');
            setYamlNeedsSync(true);
            seedHistory(
              buildDraftSnapshot({
                resumeData: nextResumeData,
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
              const parsed = normalizeResumeSkills(JSON.parse(data.raw_resume.content));
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
        const nextResumeData = normalizeResumeSkills(improvedPreview);
        setResumeData(nextResumeData);
        setLastSavedData(nextResumeData);
        // Also load cover letter and outreach if present
        if (improvedCoverLetter) {
          setCoverLetter(improvedCoverLetter);
        }
        if (improvedOutreach) {
          setOutreachMessage(improvedOutreach);
        }
        // Persist to localStorage as backup
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextResumeData));
        setAutosaveState('saved');
        setYamlNeedsSync(true);
        seedHistory(
          buildDraftSnapshot({
            resumeData: nextResumeData,
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
          const parsed = normalizeResumeSkills(JSON.parse(savedDraft));
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
      const normalizedData = normalizeResumeSkills(newData);
      setResumeData(normalizedData);
      setRawYamlIssue(null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedData));
      markDraftDirty('visual');
      queueHistoryCommit(
        buildDraftSnapshot({
          resumeData: normalizedData,
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
      const filename = buildResumePdfFilename({
        fullName: resumeData.personalInfo?.name ?? null,
        resumeCode,
        fallbackId: resumeId,
      });
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

  const mobilePaneMode: Exclude<PaneMode, 'split'> = paneMode === 'preview' ? 'preview' : 'editor';
  const showEditorPane = isDesktop ? paneMode !== 'preview' : mobilePaneMode === 'editor';
  const showPreviewPane = isDesktop ? paneMode !== 'editor' : mobilePaneMode === 'preview';
  const editorPaneWidth =
    isDesktop && paneMode === 'split'
      ? `${paneRatio}%`
      : isDesktop && paneMode === 'editor'
        ? '100%'
        : undefined;
  const previewPaneWidth =
    isDesktop && paneMode === 'split'
      ? `${100 - paneRatio}%`
      : isDesktop && paneMode === 'preview'
        ? '100%'
        : undefined;

  const handlePaneModeChange = useCallback((nextMode: PaneMode) => {
    setPaneMode(nextMode);
  }, []);

  const handlePaneResizeStart = useCallback(() => {
    setPaneMode('split');
    setIsResizingPane(true);
  }, []);

  const handlePaneSeparatorKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPaneRatio((value) => clampPaneRatio(value - 4));
      setPaneMode('split');
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPaneRatio((value) => clampPaneRatio(value + 4));
      setPaneMode('split');
    }
  }, []);

  const topLevelTabs = [
    { id: 'resume', label: t('builder.previewTabs.resume') },
    {
      id: 'cover-letter',
      label: t('builder.previewTabs.coverLetter'),
      shortLabel: t('builder.previewTabs.coverLetter'),
      disabled: !coverLetter,
    },
    {
      id: 'outreach',
      label: t('builder.previewTabs.outreach'),
      shortLabel: t('builder.previewTabs.outreach'),
      disabled: !outreachMessage,
    },
    {
      id: 'jd-match',
      label: t('builder.previewTabs.jdMatch'),
      shortLabel: t('builder.previewTabs.jdMatch'),
      disabled: !jobDescription,
    },
  ] satisfies Array<{
    id: TabId;
    label: string;
    shortLabel?: string;
    disabled?: boolean;
  }>;

  const resumeEditorTabs = [
    { id: 'cv', label: 'CV' },
    { id: 'design', label: 'Design' },
    { id: 'locale', label: 'Locale' },
    { id: 'settings', label: 'Settings' },
  ] satisfies Array<{ id: EditorSection; label: string }>;

  const toolbarIconButtonClass = 'text-gray-700';
  const builderHeading = resumeTitle ?? t('nav.builder');

  return (
    <div
      className="h-[100dvh] overflow-hidden bg-[#F0F0E8] p-3 md:p-4"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.08) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden border border-black bg-[#F0F0E8] shadow-[6px_6px_0px_0px_rgba(0,0,0,0.08)]">
        <div className="sticky top-0 z-30 border-b border-black bg-[#F0F0E8]/95 backdrop-blur-sm no-print">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 md:px-4">
            <div className="flex min-w-0 items-start gap-3">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => router.push('/dashboard')}
                aria-label={t('nav.backToDashboard')}
                title={t('nav.backToDashboard')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <div className="min-w-0">
                <h1 className="truncate font-serif text-xl uppercase tracking-tight md:text-2xl">
                  {builderHeading}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                    {resumeId ? t('builder.editMode') : t('builder.createAndPreview')}
                  </span>
                  {hasUnsavedChanges && (
                    <span className="flex items-center gap-1 border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      {t('builder.unsavedDraft')}
                    </span>
                  )}
                  <span className="flex items-center gap-1 border border-black bg-white px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gray-700">
                    {autosaveState === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {autosaveLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {isDesktop ? (
                <>
                  <Button
                    variant={paneMode === 'editor' ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    onClick={() => handlePaneModeChange('editor')}
                    aria-label="Show editor only"
                    title="Show editor only"
                    className={toolbarIconButtonClass}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={paneMode === 'split' ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    onClick={() => handlePaneModeChange('split')}
                    aria-label="Show split view"
                    title="Show split view"
                    className={toolbarIconButtonClass}
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={paneMode === 'preview' ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    onClick={() => handlePaneModeChange('preview')}
                    aria-label="Show preview only"
                    title="Show preview only"
                    className={toolbarIconButtonClass}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={mobilePaneMode === 'editor' ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    onClick={() => handlePaneModeChange('editor')}
                    aria-label="Show editor"
                    title="Show editor"
                    className={toolbarIconButtonClass}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={mobilePaneMode === 'preview' ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    onClick={() => handlePaneModeChange('preview')}
                    aria-label="Show preview"
                    title="Show preview"
                    className={toolbarIconButtonClass}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}

              {activeTab === 'resume' && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => regenerateWizard.startRegenerate()}
                    disabled={!resumeId}
                    aria-label={t('builder.regenerate.buttonLabel')}
                    title={t('builder.regenerate.buttonLabel')}
                    className={toolbarIconButtonClass}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleUndoHistory}
                    disabled={!canUndo}
                    aria-label="Undo"
                    title="Undo"
                    className={toolbarIconButtonClass}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleRedoHistory}
                    disabled={!canRedo}
                    aria-label="Redo"
                    title="Redo"
                    className={toolbarIconButtonClass}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleReset}
                    disabled={!hasUnsavedChanges}
                    aria-label={t('common.reset')}
                    title={t('common.reset')}
                    className={toolbarIconButtonClass}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="xs" onClick={handleSave} disabled={!resumeId || isSaving}>
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? t('common.saving') : t('common.save')}
                  </Button>
                  <Button
                    variant="success"
                    size="xs"
                    onClick={handleDownload}
                    disabled={!resumeId || isDownloading}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isDownloading ? t('common.generating') : t('common.download')}
                  </Button>
                </>
              )}

              {activeTab === 'cover-letter' && coverLetter && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleGenerateCoverLetter}
                    disabled={isGeneratingCoverLetter}
                    aria-label={t('coverLetter.regenerate')}
                    title={t('coverLetter.regenerate')}
                    className={toolbarIconButtonClass}
                  >
                    {isGeneratingCoverLetter ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="success"
                    size="xs"
                    onClick={handleDownloadCoverLetter}
                    disabled={!resumeId || isDownloading}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isDownloading ? t('common.generating') : t('common.download')}
                  </Button>
                </>
              )}

              {activeTab === 'outreach' && outreachMessage && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleGenerateOutreach}
                    disabled={isGeneratingOutreach}
                    aria-label={t('outreach.regenerate')}
                    title={t('outreach.regenerate')}
                    className={toolbarIconButtonClass}
                  >
                    {isGeneratingOutreach ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleCopyOutreach}
                    disabled={!outreachMessage}
                    aria-label={isCopied ? t('outreach.copied') : t('outreach.copyToClipboard')}
                    title={isCopied ? t('outreach.copied') : t('outreach.copyToClipboard')}
                    className={toolbarIconButtonClass}
                  >
                    {isCopied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-black bg-[#E5E5E0] px-3 md:px-4">
            <RetroTabs
              tabs={topLevelTabs}
              activeTab={activeTab}
              onTabChange={(id) => setActiveTab(id as TabId)}
              size="compact"
            />
          </div>
        </div>

        <div ref={workspaceRef} className="flex flex-1 min-h-0 overflow-hidden bg-black">
          {showEditorPane && (
            <div
              style={editorPaneWidth ? { width: editorPaneWidth } : undefined}
              className={cn(
                'min-w-0 overflow-hidden bg-[#F0F0E8] no-print',
                isDesktop && paneMode === 'split' ? 'shrink-0' : 'flex-1'
              )}
            >
              <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-3 pb-4 pt-3 md:px-4">
                <div className="mx-auto flex max-w-4xl flex-col gap-3">
                  {activeTab === 'resume' && (
                    <div className="sticky top-0 z-20 border border-black bg-[#F8F7F1]/95 backdrop-blur-sm">
                      <div className="flex flex-col gap-2 px-3 py-2.5 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-gray-700">
                            {editorMode === 'raw'
                              ? 'RenderCV YAML'
                              : editorSection === 'cv'
                                ? 'Resume Content'
                                : editorSection === 'design'
                                  ? 'Theme Design'
                                  : editorSection === 'locale'
                                    ? 'Locale Copy'
                                    : 'Runtime Settings'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-600">
                            {editorMode === 'raw'
                              ? 'Direct section editing with live validation.'
                              : 'Compact visual editing focused on fast iteration.'}
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={editorMode === 'raw'}
                          onCheckedChange={(checked) => void handleEditorModeChange(checked)}
                          label="Raw YAML"
                          density="compact"
                        />
                      </div>
                      <RetroTabs
                        tabs={resumeEditorTabs}
                        activeTab={editorSection}
                        onTabChange={(id) => setEditorSection(id as EditorSection)}
                        size="compact"
                      />
                    </div>
                  )}

                  {activeTab === 'resume' && editorMode === 'visual' && editorSection === 'cv' && (
                    <ResumeForm resumeData={resumeData} onUpdate={handleUpdate} />
                  )}
                  {activeTab === 'resume' &&
                    editorMode === 'visual' &&
                    editorSection === 'design' && (
                      <RenderThemeControls
                        settings={themeSettings}
                        onChange={handleSettingsChange}
                      />
                    )}
                  {activeTab === 'resume' &&
                    editorMode === 'visual' &&
                    editorSection === 'locale' && (
                      <RenderLocaleControls
                        settings={themeSettings}
                        onChange={handleSettingsChange}
                      />
                    )}
                  {activeTab === 'resume' &&
                    editorMode === 'visual' &&
                    editorSection === 'settings' && (
                      <RenderRuntimeSettingsControls
                        settings={themeSettings}
                        onChange={handleSettingsChange}
                      />
                    )}
                  {activeTab === 'resume' && editorMode === 'raw' && (
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

                  {activeTab === 'jd-match' && (
                    <div className="space-y-3">
                      <div className="border border-black bg-white px-4 py-3">
                        <h3 className="font-mono text-xs font-bold uppercase tracking-wider">
                          {t('builder.jdMatch.aboutTitle')}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                          {t('builder.jdMatch.aboutDescription')}
                        </p>
                      </div>
                      <div className="border border-black bg-[#F8F7F1] px-4 py-3">
                        <h3 className="font-mono text-xs font-bold uppercase tracking-wider">
                          {t('builder.jdMatch.highlightedKeywordsTitle')}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
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
                      <div className="border border-black bg-white px-4 py-3">
                        <h3 className="font-mono text-xs font-bold uppercase tracking-wider">
                          {t('builder.jdMatch.tipsTitle')}
                        </h3>
                        <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-gray-600">
                          <li>{t('builder.jdMatch.tips.items.addMissingKeywords')}</li>
                          <li>{t('builder.jdMatch.tips.items.focusTechnicalSkills')}</li>
                          <li>{t('builder.jdMatch.tips.items.matchActionVerbs')}</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {isDesktop && paneMode === 'split' && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor and preview panes"
              tabIndex={0}
              onMouseDown={handlePaneResizeStart}
              onKeyDown={handlePaneSeparatorKeyDown}
              className="group flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-[#D8D8D2] no-print"
            >
              <GripVertical className="h-4 w-4 text-gray-500 transition group-hover:text-black" />
            </div>
          )}

          {showPreviewPane && (
            <div
              style={previewPaneWidth ? { width: previewPaneWidth } : undefined}
              className={cn(
                'min-w-0 overflow-hidden bg-[#E5E5E0] no-print',
                isDesktop && paneMode === 'split' ? 'shrink-0' : 'flex-1'
              )}
            >
              <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
                {activeTab === 'resume' && (
                  <RenderPreviewPanel
                    resumeId={resumeId}
                    settings={themeSettings}
                    draftRequest={previewDraftRequest}
                    initialArtifacts={improvedArtifacts}
                    stale={false}
                  />
                )}

                {activeTab === 'cover-letter' &&
                  (coverLetter && resumeData.personalInfo ? (
                    <div className="p-3 md:p-4">
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

                {activeTab === 'outreach' &&
                  (outreachMessage ? (
                    <div className="p-3 md:p-4">
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

                {activeTab === 'jd-match' && jobDescription && (
                  <JDComparisonView jobDescription={jobDescription} resumeData={resumeData} />
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-black bg-[#F0F0E8] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-blue-700 no-print">
          <span className="flex items-center gap-1.5 font-bold">
            <Image
              src="/logo.svg"
              alt="Resume Matcher"
              width={16}
              height={16}
              className="h-4 w-4"
            />
            {t('builder.footer.moduleLabel')}
          </span>
          <div className="flex items-center gap-3">
            <span>
              {RENDER_THEME_OPTIONS.find((option) => option.id === themeSettings.theme_id)?.label ??
                themeSettings.theme_id}
            </span>
            <span className="text-gray-400">|</span>
            <span>{themeSettings.page_size === 'A4' ? 'A4' : t('builder.pageSize.usLetter')}</span>
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
        additionalGroupItems={additionalGroupItemsForRegenerate}
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
