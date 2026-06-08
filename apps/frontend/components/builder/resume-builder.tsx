'use client';

import React, { useState, useEffect, Suspense, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { type ResumeData } from '@/components/dashboard/resume-component';
import { ResumeForm } from './resume-form';
import { RawYamlEditor } from './raw-yaml-editor';
import { CvMetadataPanel } from './cv-metadata-panel';
import { CoverLetterPreview } from './cover-letter-preview';
import { UtilitiesWorkspace } from './utilities-workspace';
import { GenerationObservabilityPanel } from './generation-observability-panel';
import { BuilderHelpCallout } from './builder-help-callout';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { AdditionalQuestionsPanel } from '@/components/application/additional-questions-panel';
import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/ui/link-button';
import { Input } from '@/components/ui/input';
import { RetroTabs } from '@/components/ui/retro-tabs';
import { ConfirmDialog, type ConfirmDialogProps } from '@/components/ui/confirm-dialog';
import {
  Download,
  Save,
  ArrowLeft,
  Columns2,
  Eye,
  Pencil,
  RotateCcw,
  Undo2,
  Redo2,
  Copy,
  Check,
  Sparkles,
  Loader2,
  Home,
  Settings,
  MoreHorizontal,
  Target,
  GitCompare,
  Activity,
  RefreshCcw,
} from 'lucide-react';
import { type ResumePreview, useResumePreview } from '@/components/common/resume_previewer_context';
import { TailorDiffReadonlyBody } from '@/components/tailor/diff-preview-modal';
import { RenderThemeControls } from '@/components/rendercv/render-theme-controls';
import { RenderLocaleControls } from '@/components/rendercv/render-locale-controls';
import { RenderRuntimeSettingsControls } from '@/components/rendercv/render-runtime-settings-controls';
import {
  RenderPreviewPanel,
  type RenderPreviewPanelHandle,
} from '@/components/rendercv/render-preview-panel';
import {
  downloadResumePdf,
  downloadCoverLetterPdf,
  getResumePdfUrl,
  getCoverLetterPdfUrl,
  physicalPageSizeForCoverLetter,
  fetchResume,
  updateCoverLetter,
  updateOutreachMessage,
  generateAuxiliaryPackage,
  fetchJobDescription,
  fetchJdTailorDiff,
  normalizeResumeDraft,
  renameResume,
  saveResumeDraft,
  isDraftRequestError,
  type DraftValidationDetail,
  type RawYamlSections,
  type ResumeDraftRequest,
  type ResumeDraftResponse,
  type JdTailorDiffData,
} from '@/lib/api/resume';
import { JDComparisonView } from './jd-comparison-view';
import { RegenerateWizard } from './regenerate-wizard';
import { useRegenerateWizard } from '@/hooks/use-regenerate-wizard';
import { useTranslations } from '@/lib/i18n';
import {
  DEFAULT_RENDER_THEME_SETTINGS,
  RENDER_THEME_OPTIONS,
  normalizeRenderThemeSettings,
  type ArtifactSummary,
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
  getProjectTechStack,
} from '@/lib/utils/rendercv-fields';
import type { RegenerateItemInput } from '@/lib/api/enrichment';
import {
  DEFAULT_METADATA_YAML,
  buildLlmClipboardBundle,
  tryParseLlmClipboardBundle,
  parseCvMetadataYaml,
} from '@/lib/cv-metadata';

type TabId =
  | 'resume'
  | 'utilities'
  | 'jd-match'
  | 'jd-tailor-diff'
  | 'additional-questions'
  | 'generation-trace';
type EditorSection = 'cv' | 'design' | 'locale' | 'settings' | 'metadata';
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
const EMPTY_IMPROVED_ARTIFACTS: ArtifactSummary[] = [];

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
  metadata: DEFAULT_METADATA_YAML,
};

function normalizeStoredRawYamlSections(raw: unknown): RawYamlSections {
  if (!raw || typeof raw !== 'object') {
    return EMPTY_RAW_YAML;
  }
  const o = raw as Record<string, unknown>;
  return {
    cv: typeof o.cv === 'string' ? o.cv : EMPTY_RAW_YAML.cv,
    design: typeof o.design === 'string' ? o.design : EMPTY_RAW_YAML.design,
    locale: typeof o.locale === 'string' ? o.locale : EMPTY_RAW_YAML.locale,
    settings: typeof o.settings === 'string' ? o.settings : EMPTY_RAW_YAML.settings,
    metadata: typeof o.metadata === 'string' ? o.metadata : DEFAULT_METADATA_YAML,
  };
}

function buildFullYaml(sections: RawYamlSections): string {
  return [
    sections.cv.trimEnd(),
    sections.design.trimEnd(),
    sections.locale.trimEnd(),
    sections.settings.trimEnd(),
    sections.metadata.trimEnd(),
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
  const { uiLanguage } = useLanguage();
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
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
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
  const improvedArtifacts = improvedData?.data?.artifacts ?? EMPTY_IMPROVED_ARTIFACTS;
  const improvedThemeSettings = useMemo(
    () => normalizeRenderThemeSettings(improvedData?.data?.theme_settings),
    [improvedData?.data?.theme_settings]
  );
  const searchParams = useSearchParams();
  const resumeId = searchParams.get('id');
  const isResumePreviewReady = !resumeId || loadingState === 'loaded' || Boolean(improvedPreview);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const previewPanelRef = useRef<RenderPreviewPanelHandle | null>(null);
  const [previewRefreshing, setPreviewRefreshing] = useState(false);
  const [paneMode, setPaneMode] = useState<PaneMode>('split');
  /** Default favors preview (more resume visibility in split view). */
  const [paneRatio, setPaneRatio] = useState(42);
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
    (nextMode: EditorMode, options?: { hasRawIssue?: boolean }) => {
      draftVersionRef.current += 1;
      setHasUnsavedChanges(true);
      const hasRawIssue = options?.hasRawIssue ?? Boolean(rawYamlIssue);
      setAutosaveState(nextMode === 'raw' && hasRawIssue ? 'invalid' : 'dirty');
      setAutosaveError(null);
      if (nextMode === 'visual') {
        setYamlNeedsSync(true);
      }
    },
    [rawYamlIssue]
  );

  const applyDraftResponse = useCallback(
    (response: ResumeDraftResponse, version: number, savedRawYamlSections?: RawYamlSections) => {
      const nextData = (response.data.processed_resume || resumeData) as ResumeData;
      const nextThemeSettings = response.data.theme_settings
        ? normalizeRenderThemeSettings(response.data.theme_settings)
        : themeSettings;
      const isRawSave = savedRawYamlSections != null;
      const nextRawYamlSections = isRawSave ? savedRawYamlSections : response.yaml_sections;

      setLastSavedData(nextData);
      setLastSavedThemeSettings(nextThemeSettings);
      lastSavedRawYamlSectionsRef.current = nextRawYamlSections;

      if (draftVersionRef.current === version) {
        setResumeData(nextData);
        setThemeSettings(nextThemeSettings);
        if (!isRawSave) {
          setRawYamlSections(response.yaml_sections);
        }
        setRawYamlIssue(null);
        setYamlNeedsSync(false);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextThemeSettings));
        localStorage.setItem(YAML_STORAGE_KEY, JSON.stringify(nextRawYamlSections));
        setHasUnsavedChanges(false);
        setAutosaveState('saved');
        setAutosaveError(null);
        replaceCurrentHistorySnapshot(
          buildDraftSnapshot({
            resumeData: nextData,
            themeSettings: nextThemeSettings,
            rawYamlSections: nextRawYamlSections,
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
  const [isEditingResumeTitle, setIsEditingResumeTitle] = useState(false);
  const [resumeTitleDraft, setResumeTitleDraft] = useState('');
  const [isSavingResumeTitle, setIsSavingResumeTitle] = useState(false);
  const resumeTitleInputRef = useRef<HTMLInputElement | null>(null);
  const resumeTitleCommitLockRef = useRef(false);

  // On-demand generation state
  const [isTailoredResume, setIsTailoredResume] = useState(false);
  const [isGeneratingAuxiliaryPackage, setIsGeneratingAuxiliaryPackage] = useState(false);

  // JD comparison state
  const [jobDescription, setJobDescription] = useState<string | null>(null);
  /** Job + pack context for application question answers (tailored resumes). */
  const [jobId, setJobId] = useState<string | null>(null);
  const [applicationPackId, setApplicationPackId] = useState<string | null>(null);
  const [generationRunId, setGenerationRunId] = useState<string | null>(null);
  const [llmTraceId, setLlmTraceId] = useState<string | null>(null);
  const [jdTailorDiffPayload, setJdTailorDiffPayload] = useState<JdTailorDiffData | null>(null);
  const [jdTailorDiffLoading, setJdTailorDiffLoading] = useState(false);
  const [jdTailorDiffError, setJdTailorDiffError] = useState<string | null>(null);

  // AI Regenerate wizard
  const regenerateWizard = useRegenerateWizard({
    resumeId: resumeId || '',
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
      subtitle: getProjectTechStack(proj) || undefined,
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
        setRawYamlSections(normalizeStoredRawYamlSections(JSON.parse(savedYaml)));
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
          setApplicationPackId(data.application_pack_id ?? null);
          setGenerationRunId(data.generation_run_id ?? null);
          setLlmTraceId(data.llm_trace_id ?? null);
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
        if (improvedData?.data) {
          setApplicationPackId(improvedData.data.application_pack_id ?? null);
          setJobId(improvedData.data.job_id ?? null);
          setGenerationRunId(improvedData.data.generation_run_id ?? null);
          setLlmTraceId(improvedData.data.request_id ?? null);
        }
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
    improvedData?.data,
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
            setJobId(data.job_id);
          }
        } catch (err) {
          // JD might not be available for older resumes
          if (!cancelled) {
            console.warn('Could not fetch job description:', err);
            setJobDescription(null);
            setJobId(null);
          }
        }
      } else {
        // Clear job description when switching to non-tailored resume
        setJobDescription(null);
        setJobId(null);
      }
    };

    loadJobDescription();
    return () => {
      cancelled = true;
    };
  }, [isTailoredResume, resumeId]);

  useEffect(() => {
    if (!isTailoredResume || !resumeId) {
      setJdTailorDiffPayload(null);
      setJdTailorDiffError(null);
      setJdTailorDiffLoading(false);
      return;
    }

    let cancelled = false;
    setJdTailorDiffLoading(true);
    setJdTailorDiffError(null);

    void fetchJdTailorDiff(resumeId, { generationRunId })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setJdTailorDiffPayload(payload.data);
        if (!payload.data && payload.unavailable_reason) {
          setJdTailorDiffError(payload.unavailable_reason);
        } else {
          setJdTailorDiffError(null);
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setJdTailorDiffPayload(null);
        setJdTailorDiffError(
          err instanceof Error ? err.message : t('builder.jdTailorDiff.loadError')
        );
      })
      .finally(() => {
        if (!cancelled) {
          setJdTailorDiffLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [generationRunId, isTailoredResume, resumeId, t]);

  useEffect(() => {
    if (!isTailoredResume && (activeTab === 'jd-tailor-diff' || activeTab === 'generation-trace')) {
      setActiveTab('resume');
    }
  }, [activeTab, isTailoredResume]);

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

        const rawSectionsAtSave = editorMode === 'raw' ? rawYamlSections : undefined;
        const response = await saveResumeDraft(resumeId, payload);
        applyDraftResponse(response, version, rawSectionsAtSave);
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
          if (manual && issue.section) {
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
      markDraftDirty('raw', { hasRawIssue: false });
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

    await persistDraft({
      manual: true,
      version: draftVersionRef.current,
    });
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

  const handleCopyLlmBundle = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        buildLlmClipboardBundle({
          cv: rawYamlSections.cv,
          metadata: rawYamlSections.metadata,
        })
      );
    } catch (error) {
      console.error('Failed to copy LLM bundle:', error);
      showNotification('Failed to copy.', 'danger');
    }
  }, [rawYamlSections.cv, rawYamlSections.metadata, showNotification]);

  const handleApplyLlmClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const { metadata, cv } = tryParseLlmClipboardBundle(text);
      if (!metadata && !cv) {
        showNotification(t('builder.metadata.applyClipboardEmpty'), 'warning');
        return;
      }
      let nextSections = { ...rawYamlSections };
      if (metadata) {
        nextSections = { ...nextSections, metadata };
      }
      if (cv) {
        nextSections = { ...nextSections, cv };
      }
      let nextTheme = themeSettings;
      if (metadata) {
        const parsed = parseCvMetadataYaml(metadata);
        nextTheme = normalizeRenderThemeSettings({
          ...themeSettings,
          bold_keywords: parsed.bold_keywords.length > 0,
          settings: { ...themeSettings.settings, bold_keywords: parsed.bold_keywords },
        });
        setThemeSettings(nextTheme);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextTheme));
      }
      setRawYamlSections(nextSections);
      localStorage.setItem(YAML_STORAGE_KEY, JSON.stringify(nextSections));

      setRawYamlIssue(null);
      markDraftDirty('raw', { hasRawIssue: false });
      queueHistoryCommit(
        buildDraftSnapshot({
          rawYamlSections: nextSections,
          themeSettings: nextTheme,
          yamlNeedsSync: false,
          editorMode: 'raw',
          editorSection: editorSectionRef.current,
        })
      );
    } catch (error) {
      console.error('Failed to apply clipboard:', error);
      showNotification('Failed to read clipboard.', 'danger');
    }
  }, [
    buildDraftSnapshot,
    markDraftDirty,
    queueHistoryCommit,
    rawYamlSections,
    showNotification,
    t,
    themeSettings,
  ]);

  const handleCvMetadataPanelChange = useCallback(
    (next: { metadataYaml: string; themeSettings: RenderThemeSettings }) => {
      const nextSections = { ...rawYamlSectionsRef.current, metadata: next.metadataYaml };
      const nextTheme = next.themeSettings;
      setRawYamlSections(nextSections);
      setThemeSettings(nextTheme);
      setRawYamlIssue(null);
      localStorage.setItem(YAML_STORAGE_KEY, JSON.stringify(nextSections));
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextTheme));
      markDraftDirty('visual');
      queueHistoryCommit(
        buildDraftSnapshot({
          rawYamlSections: nextSections,
          themeSettings: nextTheme,
          yamlNeedsSync: false,
          editorMode: 'visual',
          editorSection: 'metadata',
        })
      );
    },
    [buildDraftSnapshot, markDraftDirty, queueHistoryCommit]
  );

  const handleResyncYaml = useCallback(async () => {
    await syncRawYamlFromStructured();
  }, [syncRawYamlFromStructured]);

  // Cover letter handlers
  const handleSaveCoverLetter = async () => {
    if (!resumeId) return;
    try {
      setIsCoverLetterSaving(true);
      await updateCoverLetter(resumeId, coverLetter);
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
      const blob = await downloadCoverLetterPdf(
        resumeId,
        physicalPageSizeForCoverLetter(themeSettings.page_size, themeSettings.design?.page?.size),
        uiLanguage
      );
      const filename = sanitizeFilename(resumeTitle, resumeId, 'cover-letter');
      downloadBlobAsFile(blob, filename);
    } catch (error) {
      console.error('Failed to download cover letter:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const fallbackUrl = getCoverLetterPdfUrl(
          resumeId,
          physicalPageSizeForCoverLetter(themeSettings.page_size, themeSettings.design?.page?.size),
          uiLanguage
        );
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

  // On-demand merged CL + message generation handler
  const handleGenerateAuxiliaryPackage = async () => {
    if (!resumeId) return;
    setIsGeneratingAuxiliaryPackage(true);
    try {
      const payload = await generateAuxiliaryPackage(resumeId);
      setCoverLetter(payload.cover_letter);
      setOutreachMessage(payload.outreach_message);
    } catch (error) {
      console.error('Failed to generate CL + message package:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showNotification(`Failed to generate CL + message package: ${errorMessage}`, 'danger');
    } finally {
      setIsGeneratingAuxiliaryPackage(false);
    }
  };

  const mobilePaneMode: Exclude<PaneMode, 'split'> = paneMode === 'preview' ? 'preview' : 'editor';
  const showEditorPane =
    activeTab === 'generation-trace' ||
    (isDesktop ? paneMode !== 'preview' : mobilePaneMode === 'editor');
  const showPreviewPane =
    activeTab !== 'generation-trace' &&
    (isDesktop ? paneMode !== 'editor' : mobilePaneMode === 'preview');
  const showAdditionalQuestionsInEditor =
    activeTab === 'additional-questions' &&
    (isDesktop ? paneMode !== 'preview' : mobilePaneMode === 'editor');
  const showAdditionalQuestionsInPreview =
    activeTab === 'additional-questions' &&
    (isDesktop ? paneMode === 'preview' : mobilePaneMode === 'preview');
  const showGenerationTraceFullPage = activeTab === 'generation-trace';
  const editorPaneWidth =
    isDesktop && showGenerationTraceFullPage
      ? '100%'
      : isDesktop && paneMode === 'split'
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

  const topLevelTabs = useMemo(() => {
    const primary: Array<{
      id: TabId;
      label: string;
      shortLabel?: string;
      disabled?: boolean;
    }> = [
      { id: 'resume', label: t('builder.previewTabs.resume') },
      {
        id: 'utilities',
        label: t('builder.previewTabs.utilities'),
        shortLabel: t('builder.previewTabs.utilitiesShort'),
      },
      {
        id: 'additional-questions',
        label: t('builder.previewTabs.additionalQuestions'),
        shortLabel: t('builder.previewTabs.additionalQuestionsShort'),
      },
    ];

    const secondary: Array<{
      id: TabId;
      label: string;
      shortLabel?: string;
      disabled?: boolean;
      icon?: React.ReactNode;
      iconOnly?: boolean;
      ariaLabel?: string;
    }> = [
      {
        id: 'jd-match',
        label: t('builder.previewTabs.jdMatch'),
        ariaLabel: t('builder.previewTabs.jdMatch'),
        iconOnly: true,
        icon: <Target className="h-3.5 w-3.5 shrink-0" aria-hidden />,
      },
    ];

    if (isTailoredResume) {
      secondary.push({
        id: 'jd-tailor-diff',
        label: t('builder.previewTabs.jdTailorDiff'),
        ariaLabel: t('builder.previewTabs.jdTailorDiff'),
        iconOnly: true,
        icon: <GitCompare className="h-3.5 w-3.5 shrink-0" aria-hidden />,
      });
      secondary.push({
        id: 'generation-trace',
        label: t('builder.previewTabs.generationTrace'),
        ariaLabel: t('builder.previewTabs.generationTrace'),
        iconOnly: true,
        icon: <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden />,
      });
    }

    return { primary, secondary };
  }, [isTailoredResume, t]);

  const showPreviewRefresh =
    showPreviewPane && (activeTab === 'resume' || activeTab === 'jd-tailor-diff');

  const resumeEditorTabs = [
    { id: 'cv', label: 'CV' },
    { id: 'design', label: 'Design' },
    { id: 'locale', label: 'Locale' },
    { id: 'settings', label: 'Settings' },
    { id: 'metadata', label: 'Metadata' },
  ] satisfies Array<{ id: EditorSection; label: string }>;

  const statusChipLabel = useMemo(() => {
    const parts: string[] = [];
    parts.push(resumeId ? t('builder.editMode') : t('builder.createAndPreview'));
    if (resumeCode) {
      parts.push(resumeCode);
    }
    if (hasUnsavedChanges) {
      parts.push(t('builder.unsavedDraft'));
    } else {
      parts.push(autosaveLabel);
    }
    return parts.join(' · ');
  }, [autosaveLabel, hasUnsavedChanges, resumeCode, resumeId, t]);

  useEffect(() => {
    if (activeTab === 'jd-tailor-diff' && paneMode === 'split') {
      setPaneRatio((value) => (value < 55 ? 60 : value));
    }
  }, [activeTab, paneMode]);

  useEffect(() => {
    const handleTabShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
        return;
      }
      const tabOrder: TabId[] = [
        'resume',
        'utilities',
        'additional-questions',
        'jd-match',
        ...(isTailoredResume ? (['jd-tailor-diff', 'generation-trace'] as TabId[]) : []),
      ];
      const digit = Number(event.key);
      if (!Number.isInteger(digit) || digit < 1 || digit > tabOrder.length) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setActiveTab(tabOrder[digit - 1]);
    };

    window.addEventListener('keydown', handleTabShortcut);
    return () => window.removeEventListener('keydown', handleTabShortcut);
  }, [isTailoredResume]);

  const builderHeading = resumeTitle ?? t('nav.builder');

  const beginEditResumeTitle = useCallback(() => {
    if (!resumeId) return;
    setResumeTitleDraft(resumeTitle ?? '');
    setIsEditingResumeTitle(true);
    queueMicrotask(() => resumeTitleInputRef.current?.focus());
  }, [resumeId, resumeTitle]);

  const cancelEditResumeTitle = useCallback(() => {
    setIsEditingResumeTitle(false);
    setResumeTitleDraft('');
  }, []);

  const commitResumeTitle = useCallback(async () => {
    if (!resumeId || resumeTitleCommitLockRef.current) return;
    const next = resumeTitleDraft.trim();
    if (!next) {
      showNotification(t('builder.renameTitleEmpty'), 'danger');
      return;
    }
    if (next === (resumeTitle ?? '')) {
      setIsEditingResumeTitle(false);
      return;
    }
    resumeTitleCommitLockRef.current = true;
    setIsSavingResumeTitle(true);
    try {
      await renameResume(resumeId, next);
      setResumeTitle(next);
      setIsEditingResumeTitle(false);
    } catch {
      showNotification(t('builder.renameTitleError'), 'danger');
    } finally {
      setIsSavingResumeTitle(false);
      resumeTitleCommitLockRef.current = false;
    }
  }, [resumeId, resumeTitleDraft, resumeTitle, showNotification, t]);

  const toolbarIconButtonClass =
    'h-7 w-7 border border-border bg-transparent text-muted-foreground hover:border-primary hover:text-foreground';

  return (
    <div className="h-[100dvh] overflow-hidden bg-background p-0">
      <div className="flex h-full min-h-0 flex-col overflow-hidden border-0 bg-card shadow-none md:border md:border-border">
        <div className="sticky top-0 z-30 border-b border-border bg-card no-print">
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1.5 py-1 md:px-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <LinkButton
                href="/dashboard"
                variant="ghost"
                size="icon-sm"
                aria-label={t('nav.backToDashboard')}
                title={t('nav.backToDashboard')}
                className={toolbarIconButtonClass}
              >
                <ArrowLeft className="h-4 w-4" />
              </LinkButton>
              <div className="hidden items-center gap-1 md:flex">
                <LinkButton
                  href="/"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Go to main page"
                  title="Go to main page"
                  className={toolbarIconButtonClass}
                >
                  <Home className="h-3.5 w-3.5" />
                </LinkButton>
                <LinkButton
                  href="/settings"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('nav.settings')}
                  title={t('nav.settings')}
                  className={toolbarIconButtonClass}
                >
                  <Settings className="h-3.5 w-3.5" />
                </LinkButton>
              </div>
              <details className="relative md:hidden">
                <summary
                  className={cn(
                    toolbarIconButtonClass,
                    'inline-flex list-none cursor-pointer items-center justify-center [&::-webkit-details-marker]:hidden'
                  )}
                  aria-label={t('builder.overflowMenu')}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </summary>
                <div className="absolute left-0 top-full z-40 mt-1 min-w-[9rem] border border-border bg-card py-1 shadow-sm">
                  <Link
                    href="/"
                    className="block px-3 py-1.5 font-sans text-[12px] text-foreground hover:bg-accent"
                  >
                    {t('nav.home')}
                  </Link>
                  <Link
                    href="/settings"
                    className="block px-3 py-1.5 font-sans text-[12px] text-foreground hover:bg-accent"
                  >
                    {t('nav.settings')}
                  </Link>
                </div>
              </details>

              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0">
                {isEditingResumeTitle && resumeId ? (
                  <Input
                    pasteMode="plainTextSingleParagraph"
                    ref={resumeTitleInputRef}
                    value={resumeTitleDraft}
                    onChange={(e) => setResumeTitleDraft(e.target.value)}
                    onBlur={() => void commitResumeTitle()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void commitResumeTitle();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEditResumeTitle();
                      }
                    }}
                    disabled={isSavingResumeTitle}
                    className="h-7 max-w-md rounded-none border border-border font-mono text-sm font-bold uppercase focus-visible:border-primary focus-visible:ring-0"
                    aria-label={t('builder.renameTitleInputLabel')}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={beginEditResumeTitle}
                    disabled={!resumeId}
                    title={resumeId ? t('builder.renameTitleHint') : undefined}
                    className={cn(
                      'group flex max-w-full min-w-0 items-center gap-1 rounded-none text-left font-mono text-sm font-bold uppercase',
                      resumeId && 'cursor-pointer hover:text-foreground/80',
                      !resumeId && 'cursor-default'
                    )}
                  >
                    <span className="truncate">{builderHeading}</span>
                    {resumeId ? (
                      <Pencil
                        className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                )}
                <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-none border border-border bg-muted px-2 py-0.5 font-sans text-[11px] text-muted-foreground">
                  {autosaveState === 'saving' && (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                  )}
                  <span className="truncate">{statusChipLabel}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <ThemeToggle variant="icon" className="mr-0.5" />
              <div className="mr-0.5 flex items-center gap-0.5 border-r border-border pr-1">
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
              </div>

              {activeTab === 'resume' && (
                <div className="mr-0.5 flex items-center gap-0.5 border-r border-border pr-1">
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
                </div>
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
                    variant="builderOutline"
                    size="xs"
                    onClick={handleSave}
                    disabled={!resumeId || isSaving}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? t('common.saving') : t('common.save')}
                  </Button>
                  <Button
                    variant="builderCta"
                    size="xs"
                    onClick={handleDownload}
                    disabled={!resumeId || isDownloading}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isDownloading ? t('common.generating') : t('common.download')}
                  </Button>
                </>
              )}

              {activeTab === 'utilities' && (
                <>
                  {Boolean(isTailoredResume && resumeId) ? (
                    <Button
                      variant="builderOutline"
                      size="xs"
                      onClick={handleGenerateAuxiliaryPackage}
                      disabled={isGeneratingAuxiliaryPackage}
                      className="gap-1"
                    >
                      {isGeneratingAuxiliaryPackage ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {t('builder.generateClMessage.toolbarLabel')}
                    </Button>
                  ) : null}
                  <Button
                    variant="builderCta"
                    size="icon-sm"
                    onClick={handleDownloadCoverLetter}
                    disabled={!resumeId || isDownloading || !coverLetter}
                    aria-label={isDownloading ? t('common.generating') : t('common.download')}
                    title={isDownloading ? t('common.generating') : t('common.download')}
                    className={toolbarIconButtonClass}
                  >
                    <Download className="h-3.5 w-3.5" />
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

          <div className="flex flex-wrap items-end gap-x-0.5 bg-card px-1.5 md:px-2">
            {topLevelTabs.secondary.length > 0 ? (
              <RetroTabs
                tabs={topLevelTabs.secondary}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as TabId)}
                size="dense"
              />
            ) : null}
            <RetroTabs
              tabs={topLevelTabs.primary}
              activeTab={activeTab}
              onTabChange={(id) => setActiveTab(id as TabId)}
              size="compact"
              sentenceCase
              className={cn(topLevelTabs.secondary.length > 0 && 'border-l border-border pl-1')}
            />
            {showPreviewRefresh ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Refresh preview"
                title="Refresh preview"
                disabled={previewRefreshing}
                onClick={() => previewPanelRef.current?.refresh()}
                className="ml-auto h-7 w-7 shrink-0 border border-primary/40 bg-primary/10 text-primary hover:border-primary hover:bg-primary/20"
              >
                {previewRefreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : null}
          </div>
        </div>

        <div ref={workspaceRef} className="flex flex-1 min-h-0 overflow-hidden bg-background">
          {showEditorPane && (
            <div
              style={editorPaneWidth ? { width: editorPaneWidth } : undefined}
              className={cn(
                'min-w-0 overflow-hidden bg-background no-print',
                isDesktop && paneMode === 'split' ? 'shrink-0' : 'flex-1'
              )}
            >
              <div className="editor-panel flex h-full min-h-0 flex-col overflow-hidden overscroll-contain px-1.5 pb-2 pt-0 md:px-2">
                <div
                  className={cn(
                    'flex w-full max-w-none flex-col gap-1.5 pt-0.5 md:pt-1',
                    activeTab === 'jd-tailor-diff' || activeTab === 'generation-trace'
                      ? 'min-h-0 flex-1 overflow-hidden'
                      : 'min-h-0 flex-1 overflow-y-auto'
                  )}
                >
                  {activeTab === 'resume' && (
                    <div className="shrink-0 border-b border-border bg-card">
                      <div className="flex h-6 items-stretch">
                        <div className="min-w-0 flex-1 overflow-x-auto">
                          <RetroTabs
                            tabs={resumeEditorTabs}
                            activeTab={editorSection}
                            onTabChange={(id) => setEditorSection(id as EditorSection)}
                            size="dense"
                            sentenceCase
                            className="border-0"
                          />
                        </div>
                        <button
                          type="button"
                          aria-pressed={editorMode === 'raw'}
                          onClick={() => void handleEditorModeChange(editorMode !== 'raw')}
                          className={cn(
                            'shrink-0 self-center border border-border bg-card px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground shadow-[0_1px_0_0_rgba(0,0,0,0.06)] transition-colors hover:border-border hover:text-foreground',
                            editorMode === 'raw' &&
                              'border-primary/50 bg-accent font-semibold text-foreground'
                          )}
                        >
                          YAML
                        </button>
                      </div>
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
                  {activeTab === 'resume' &&
                    editorMode === 'visual' &&
                    editorSection === 'metadata' && (
                      <CvMetadataPanel
                        metadataYaml={rawYamlSections.metadata}
                        themeSettings={themeSettings}
                        onChange={handleCvMetadataPanelChange}
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
                      onCopyLlmBundle={() => void handleCopyLlmBundle()}
                      onApplyLlmClipboard={() => void handleApplyLlmClipboard()}
                      copyLlmLabel={t('builder.metadata.copyLlm')}
                      applyLlmLabel={t('builder.metadata.applyClipboard')}
                    />
                  )}

                  {activeTab === 'utilities' && (
                    <UtilitiesWorkspace
                      coverLetter={coverLetter}
                      outreachMessage={outreachMessage}
                      onCoverLetterChange={setCoverLetter}
                      onOutreachChange={setOutreachMessage}
                      onSaveCoverLetter={handleSaveCoverLetter}
                      onSaveOutreach={handleSaveOutreach}
                      isCoverLetterSaving={isCoverLetterSaving}
                      isOutreachSaving={isOutreachSaving}
                      canGeneratePackage={Boolean(isTailoredResume && resumeId)}
                      isGenerating={isGeneratingAuxiliaryPackage}
                      onGeneratePackage={handleGenerateAuxiliaryPackage}
                      resumeId={resumeId}
                    />
                  )}

                  {showAdditionalQuestionsInEditor && !jobId && (
                    <div className="border border-border bg-card px-2 py-2 font-sans text-sm leading-snug md:px-2.5">
                      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t('builder.tabPrerequisite.additionalBody')}
                      </p>
                      <Link
                        href="/tailor"
                        className="mt-2 inline-flex font-mono text-[11px] uppercase tracking-wider text-foreground underline underline-offset-2 hover:text-muted-foreground"
                      >
                        {t('builder.tabPrerequisite.additionalCta')}
                      </Link>
                    </div>
                  )}

                  {showAdditionalQuestionsInEditor && jobId && (
                    <AdditionalQuestionsPanel
                      title={t('builder.previewTabs.additionalQuestions')}
                      resumeId={resumeId}
                      jobId={jobId}
                      applicationPackId={applicationPackId}
                      generationRunId={null}
                      disabled={false}
                      disabledReason={t('builder.additionalQuestions.disabledReason')}
                    />
                  )}

                  {activeTab === 'jd-match' && !jobDescription && (
                    <div className="border border-border bg-card p-3 font-sans text-sm leading-snug">
                      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t('builder.tabPrerequisite.jdMatchBody')}
                      </p>
                      <Link
                        href="/tailor"
                        className="mt-2 inline-flex font-mono text-[11px] uppercase tracking-wider text-foreground underline underline-offset-2 hover:text-muted-foreground"
                      >
                        {t('builder.tabPrerequisite.jdMatchCta')}
                      </Link>
                    </div>
                  )}

                  {activeTab === 'jd-match' && jobDescription && (
                    <BuilderHelpCallout id="jd-match" title={t('builder.jdMatch.aboutTitle')}>
                      <p>{t('builder.jdMatch.aboutDescription')}</p>
                      <p>
                        {(() => {
                          const template = t(
                            'builder.jdMatch.highlightedKeywordsDescriptionTemplate'
                          );
                          const parts = template.split('__COLOR__');
                          if (parts.length < 2) return template;
                          return (
                            <>
                              {parts[0]}
                              <mark className="bg-yellow-200 px-0.5">
                                {t('builder.jdMatch.highlightColor')}
                              </mark>
                              {parts.slice(1).join('__COLOR__')}
                            </>
                          );
                        })()}
                      </p>
                      <ul className="list-disc space-y-0.5 pl-4">
                        <li>{t('builder.jdMatch.tips.items.addMissingKeywords')}</li>
                        <li>{t('builder.jdMatch.tips.items.focusTechnicalSkills')}</li>
                        <li>{t('builder.jdMatch.tips.items.matchActionVerbs')}</li>
                      </ul>
                    </BuilderHelpCallout>
                  )}

                  {activeTab === 'jd-tailor-diff' && (
                    <div className="flex min-h-0 flex-1 flex-col gap-2 border border-border bg-background pb-2">
                      <BuilderHelpCallout
                        id="jd-tailor-diff"
                        title={t('builder.jdTailorDiff.aboutTitle')}
                        className="mx-0"
                      >
                        <p>{t('builder.jdTailorDiff.aboutBody')}</p>
                      </BuilderHelpCallout>
                      {jdTailorDiffLoading && (
                        <div className="flex shrink-0 items-center gap-2 px-3 py-4 font-mono text-xs text-gray-600">
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                          {t('common.loading')}
                        </div>
                      )}
                      {!jdTailorDiffLoading && jdTailorDiffError && (
                        <div className="mx-3 shrink-0 border border-amber-600/40 bg-amber-50 px-3 py-2 font-mono text-[11px] leading-snug text-amber-950">
                          {jdTailorDiffError}
                        </div>
                      )}
                      {!jdTailorDiffLoading && jdTailorDiffPayload && (
                        <div className="flex min-h-0 flex-1 flex-col px-0 pt-1">
                          <p className="shrink-0 px-3 pb-2 font-mono text-[10px] uppercase tracking-wide text-gray-600">
                            {jdTailorDiffPayload.diff_source === 'stored_detailed_changes'
                              ? t('builder.jdTailorDiff.sourceStoredDetailed')
                              : jdTailorDiffPayload.diff_source ===
                                  'recomputed_confirmation_snapshot'
                                ? t('builder.jdTailorDiff.sourceRecomputedConfirmation')
                                : t('builder.jdTailorDiff.sourceLiveVsMaster')}
                          </p>
                          <div className="mx-3 flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-background">
                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2 md:px-2 md:py-3">
                              <TailorDiffReadonlyBody
                                detailedChanges={jdTailorDiffPayload.detailed_changes ?? []}
                                changeManifest={jdTailorDiffPayload.change_manifest}
                                changeBreakdown={jdTailorDiffPayload.change_breakdown ?? null}
                                artifacts={jdTailorDiffPayload.artifacts}
                                artifactGalleryTitle={t('builder.jdTailorDiff.artifactTitle')}
                                resumePreview={resumeData as unknown as ResumePreview}
                                skillsObservation={jdTailorDiffPayload.skills_observability}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'generation-trace' && (
                    <GenerationObservabilityPanel
                      traceId={llmTraceId}
                      generationRunId={generationRunId}
                      resumeId={resumeId}
                      resumeCode={resumeCode}
                    />
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
              className="group relative w-0 shrink-0 cursor-col-resize no-print"
            >
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/70" />
              <div className="absolute inset-y-0 -left-1 w-3" aria-hidden />
            </div>
          )}

          {showPreviewPane && (
            <div
              style={previewPaneWidth ? { width: previewPaneWidth } : undefined}
              className={cn(
                'min-w-0 overflow-hidden bg-background no-print',
                isDesktop && paneMode === 'split' ? 'shrink-0' : 'flex-1'
              )}
            >
              <div className="preview-panel-scroll h-full min-h-0 overflow-y-auto overscroll-contain px-0.5 py-0.5 md:px-1">
                {(activeTab === 'resume' || activeTab === 'jd-tailor-diff') &&
                  isResumePreviewReady && (
                    <RenderPreviewPanel
                      ref={previewPanelRef}
                      resumeId={resumeId}
                      settings={themeSettings}
                      draftRequest={previewDraftRequest}
                      initialArtifacts={improvedArtifacts}
                      stale={false}
                      onLoadingChange={setPreviewRefreshing}
                    />
                  )}

                {activeTab === 'utilities' && (
                  <div className="flex min-h-0 flex-1 justify-center py-1.5 md:py-2">
                    <div className="w-full max-w-[min(28rem,100%)] min-w-0 md:max-w-[min(32rem,96%)]">
                      {coverLetter && resumeData.personalInfo ? (
                        <CoverLetterPreview
                          content={coverLetter}
                          personalInfo={resumeData.personalInfo}
                          pageSize={themeSettings.page_size}
                        />
                      ) : (
                        <div
                          className="min-h-[160px] flex-1 bg-transparent"
                          role="status"
                          aria-label={t('builder.lettersPreview.coverLetterEmpty')}
                        />
                      )}
                    </div>
                  </div>
                )}

                {showAdditionalQuestionsInPreview && jobId && (
                  <div className="py-1.5 md:py-2">
                    <AdditionalQuestionsPanel
                      title={t('builder.previewTabs.additionalQuestions')}
                      resumeId={resumeId}
                      jobId={jobId}
                      applicationPackId={applicationPackId}
                      generationRunId={null}
                      disabled={false}
                      disabledReason={t('builder.additionalQuestions.disabledReason')}
                    />
                  </div>
                )}

                {activeTab === 'jd-match' && jobDescription && (
                  <JDComparisonView jobDescription={jobDescription} resumeData={resumeData} />
                )}
              </div>
            </div>
          )}
        </div>

        {paneMode !== 'split' ? (
          <div className="flex items-center justify-between border-t border-border bg-card/90 px-1.5 py-0.5 text-[10px] text-muted-foreground no-print md:px-2">
            <span className="truncate font-medium text-foreground/80">
              {t('builder.footer.moduleLabel')}
            </span>
            <span className="shrink-0 font-mono tabular-nums">
              {RENDER_THEME_OPTIONS.find((option) => option.id === themeSettings.theme_id)?.label ??
                themeSettings.theme_id}
              {' · '}
              {themeSettings.page_size === 'A4'
                ? 'A4'
                : themeSettings.page_size === 'FREEFLOW'
                  ? t('builder.pageSize.freeflow')
                  : t('builder.pageSize.usLetter')}
            </span>
          </div>
        ) : null}
      </div>

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
