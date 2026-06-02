'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Project } from '@/components/dashboard/resume-component';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  buildProjectDescription,
  getProjectDate,
  getProjectHighlightsEditor,
  getProjectTechStack,
} from '@/lib/utils/rendercv-fields';
import { DraggableListItem } from '../draggable-list-item';
import { HighlightBulletsRichTextDnd } from '../highlight-bullets-dnd';
import { InlineResumeField, InlineResumeTextarea, ResumeCanvasAddLink } from '../inline-resume-field';
import { DRAG_ACTIVATION_LIST_PX, resumeSortableCollision } from '@/lib/builder/drag-settings';

interface ProjectsFormProps {
  data: Project[];
  onChange: (data: Project[]) => void;
}

export const ProjectsForm: React.FC<ProjectsFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();
  const listDndId = React.useId();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_LIST_PX } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = data.findIndex((item) => item.id === active.id);
    const newIndex = data.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(data, oldIndex, newIndex));
  };

  const updateItem = (id: number, updater: (item: Project) => Project) => {
    onChange(data.map((item) => (item.id === id ? updater(item) : item)));
  };

  const handleAdd = () => {
    const newId = Math.max(...data.map((d) => d.id), 0) + 1;
    onChange([
      ...data,
      {
        id: newId,
        name: '',
        techStack: '',
        role: '',
        date: '',
        years: '',
        github: '',
        website: '',
        description: [],
        highlights: [],
        includeInResume: true,
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleFieldChange = (
    id: number,
    field: 'name' | 'techStack' | 'date' | 'github' | 'website',
    value: string
  ) => {
    updateItem(id, (item) => {
      if (field === 'techStack') {
        return { ...item, techStack: value, role: value };
      }
      if (field === 'date') {
        return { ...item, date: value, years: value };
      }
      return { ...item, [field]: value };
    });
  };

  const handleHighlightChange = (id: number, index: number, value: string) => {
    updateItem(id, (item) => {
      const highlights = [...getProjectHighlightsEditor(item)];
      highlights[index] = value;
      return { ...item, highlights, description: buildProjectDescription(highlights) };
    });
  };

  const handleAddHighlight = (id: number) => {
    updateItem(id, (item) => {
      const highlights = [...getProjectHighlightsEditor(item), ''];
      return { ...item, highlights, description: buildProjectDescription(highlights) };
    });
  };

  const handleRemoveHighlight = (id: number, index: number) => {
    updateItem(id, (item) => {
      const highlights = [...getProjectHighlightsEditor(item)];
      highlights.splice(index, 1);
      return { ...item, highlights, description: buildProjectDescription(highlights) };
    });
  };

  const handleReorderHighlights = (id: number, from: number, to: number) => {
    if (from === to) return;
    updateItem(id, (item) => {
      const highlights = [...getProjectHighlightsEditor(item)];
      const next = arrayMove(highlights, from, to);
      return { ...item, highlights: next, description: buildProjectDescription(next) };
    });
  };

  if (data.length === 0) {
    return (
      <div className="py-2 text-center">
        <p className="mb-1 text-[11px] text-muted-foreground">
          {t('builder.genericItemForm.noEntries', { label: t('resume.sections.projects') })}
        </p>
        <ResumeCanvasAddLink onClick={handleAdd}>
          <Plus className="inline h-3 w-3" aria-hidden />
          {t('builder.forms.projects.addFirstProject')}
        </ResumeCanvasAddLink>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <DndContext
        id={listDndId}
        sensors={sensors}
        collisionDetection={resumeSortableCollision}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={data.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-0">
            {data.map((item) => {
              const highlights = getProjectHighlightsEditor(item);

              return (
                <DraggableListItem key={item.id} id={item.id}>
                  <div
                    className={`resume-canvas-entry pr-8 ${item.includeInResume === false ? 'opacity-60' : ''}`}
                  >
                    <div className="resume-canvas-entry-actions flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        aria-label={
                          item.includeInResume === false
                            ? t('builder.forms.projects.actions.showOnResume')
                            : t('builder.forms.projects.actions.hideFromResume')
                        }
                        className="h-6 w-6 text-muted-foreground"
                        onClick={() =>
                          updateItem(item.id, (row) => ({
                            ...row,
                            includeInResume: row.includeInResume === false,
                          }))
                        }
                      >
                        {item.includeInResume === false ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('common.delete')}
                        className="h-6 w-6 text-red-600/80 hover:text-red-600"
                        onClick={() => handleRemove(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="resume-canvas-role-row">
                      <InlineResumeField
                        pasteMode="plainTextSingleParagraph"
                        value={item.name || ''}
                        onChange={(e) => handleFieldChange(item.id, 'name', e.target.value)}
                        placeholder={t('builder.forms.projects.placeholders.projectName')}
                        className="resume-canvas-field-title min-w-0 flex-1"
                        aria-label={t('builder.forms.projects.fields.projectName')}
                      />
                      <InlineResumeField
                        pasteMode="plainTextSingleParagraph"
                        value={getProjectDate(item)}
                        onChange={(e) => handleFieldChange(item.id, 'date', e.target.value)}
                        placeholder={t('builder.forms.projects.placeholders.date')}
                        fieldSize="small"
                        align="right"
                        className="resume-canvas-field-meta w-auto max-w-[9rem] shrink-0 justify-self-end"
                        aria-label={t('builder.genericItemForm.fields.date')}
                      />
                    </div>

                    <div className="resume-canvas-stack-row">
                      <span className="resume-canvas-inline-label">Stack</span>
                      <InlineResumeTextarea
                        pasteMode="plainTextMultiline"
                        value={getProjectTechStack(item)}
                        onChange={(e) => handleFieldChange(item.id, 'techStack', e.target.value)}
                        placeholder={t('builder.forms.projects.placeholders.techStack')}
                        fieldSize="small"
                        rows={1}
                        className="resume-canvas-field-meta min-h-[1.5rem] min-w-0 flex-1 italic"
                        aria-label={t('builder.forms.projects.fields.techStackOptional')}
                      />
                    </div>

                    <HighlightBulletsRichTextDnd
                        scopeId={`pr-${item.id}`}
                        highlights={highlights}
                        onReorder={(from, to) => handleReorderHighlights(item.id, from, to)}
                        onChangeLine={(idx, html) => handleHighlightChange(item.id, idx, html)}
                        onRemoveLine={(idx) => handleRemoveHighlight(item.id, idx)}
                        placeholder={t('builder.forms.projects.placeholders.highlight')}
                        deleteAriaLabel={t('common.delete')}
                    />
                    <ResumeCanvasAddLink
                      className="mt-1"
                      onClick={() => handleAddHighlight(item.id)}
                    >
                      <Plus className="inline h-3 w-3" aria-hidden />
                      {t('builder.genericItemForm.actions.addPoint')}
                    </ResumeCanvasAddLink>

                    <details className="resume-canvas-advanced">
                      <summary>GitHub · website</summary>
                      <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                        <InlineResumeField
                          pasteMode="plainTextSingleParagraph"
                          value={item.github || ''}
                          onChange={(e) => handleFieldChange(item.id, 'github', e.target.value)}
                          placeholder="github.com/org/repo"
                          fieldSize="small"
                          aria-label="GitHub"
                        />
                        <InlineResumeField
                          pasteMode="plainTextSingleParagraph"
                          value={item.website || ''}
                          onChange={(e) => handleFieldChange(item.id, 'website', e.target.value)}
                          placeholder="your-project.com"
                          fieldSize="small"
                          aria-label="Website"
                        />
                      </div>
                    </details>
                  </div>
                </DraggableListItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      <ResumeCanvasAddLink onClick={handleAdd} className="mt-1">
        <Plus className="inline h-3 w-3" aria-hidden />
        {t('builder.forms.projects.addProject')}
      </ResumeCanvasAddLink>
    </div>
  );
};
