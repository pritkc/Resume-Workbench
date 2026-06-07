'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Experience } from '@/components/dashboard/resume-component';
import { Plus, Trash2 } from 'lucide-react';
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
  buildExperienceDescription,
  getExperienceExplicitDateEditor,
  getExperienceHighlightsEditor,
  getExperiencePositionEditor,
  getExperienceTechStackEditor,
} from '@/lib/utils/rendercv-fields';
import { DraggableListItem } from '../draggable-list-item';
import { HighlightBulletsRichTextDnd } from '../highlight-bullets-dnd';
import { BuilderHelpCallout } from '../builder-help-callout';
import { InlineResumeField, ResumeCanvasAddLink } from '../inline-resume-field';
import { DRAG_ACTIVATION_LIST_PX, resumeSortableCollision } from '@/lib/builder/drag-settings';

interface ExperienceFormProps {
  data: Experience[];
  onChange: (data: Experience[]) => void;
}

export const ExperienceForm: React.FC<ExperienceFormProps> = ({ data, onChange }) => {
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

  const updateItem = (id: number, updater: (item: Experience) => Experience) => {
    onChange(data.map((item) => (item.id === id ? updater(item) : item)));
  };

  const handleAdd = () => {
    const newId = Math.max(...data.map((d) => d.id), 0) + 1;
    onChange([
      ...data,
      {
        id: newId,
        position: '',
        title: '',
        company: '',
        location: '',
        start_date: '',
        end_date: '',
        date: '',
        years: '',
        techStack: '',
        description: [],
        highlights: [],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleTextFieldChange = (
    id: number,
    field: 'company' | 'location' | 'position' | 'date' | 'start_date' | 'end_date' | 'techStack',
    value: string
  ) => {
    updateItem(id, (item) => {
      if (field === 'position') {
        return { ...item, position: value, title: value };
      }
      if (field === 'date') {
        return { ...item, date: value, years: value };
      }
      if (field === 'techStack') {
        const highlights = getExperienceHighlightsEditor(item);
        return {
          ...item,
          techStack: value,
          description: buildExperienceDescription(value, highlights),
        };
      }
      return { ...item, [field]: value };
    });
  };

  const handleHighlightChange = (id: number, index: number, value: string) => {
    updateItem(id, (item) => {
      const highlights = [...getExperienceHighlightsEditor(item)];
      highlights[index] = value;
      return {
        ...item,
        highlights,
        description: buildExperienceDescription(getExperienceTechStackEditor(item), highlights),
      };
    });
  };

  const handleAddHighlight = (id: number) => {
    updateItem(id, (item) => {
      const highlights = [...getExperienceHighlightsEditor(item), ''];
      return {
        ...item,
        highlights,
        description: buildExperienceDescription(getExperienceTechStackEditor(item), highlights),
      };
    });
  };

  const handleRemoveHighlight = (id: number, index: number) => {
    updateItem(id, (item) => {
      const highlights = [...getExperienceHighlightsEditor(item)];
      highlights.splice(index, 1);
      return {
        ...item,
        highlights,
        description: buildExperienceDescription(getExperienceTechStackEditor(item), highlights),
      };
    });
  };

  const handleReorderHighlights = (id: number, from: number, to: number) => {
    if (from === to) return;
    updateItem(id, (item) => {
      const highlights = [...getExperienceHighlightsEditor(item)];
      const next = arrayMove(highlights, from, to);
      return {
        ...item,
        highlights: next,
        description: buildExperienceDescription(getExperienceTechStackEditor(item), next),
      };
    });
  };

  if (data.length === 0) {
    return (
      <div className="py-2 text-center">
        <p className="mb-1 text-[11px] text-muted-foreground">
          {t('builder.genericItemForm.noEntries', { label: t('resume.sections.experience') })}
        </p>
        <ResumeCanvasAddLink onClick={handleAdd}>
          <Plus className="inline h-3 w-3" aria-hidden />
          {t('builder.forms.experience.addFirstJob')}
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
        <SortableContext items={data.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0">
            {data.map((item) => {
              const highlights = getExperienceHighlightsEditor(item);
              const techStack = getExperienceTechStackEditor(item);

              return (
                <DraggableListItem key={item.id} id={item.id}>
                  <div className="resume-canvas-entry pr-6">
                    <div className="resume-canvas-entry-actions">
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
                        value={getExperiencePositionEditor(item)}
                        onChange={(e) => handleTextFieldChange(item.id, 'position', e.target.value)}
                        placeholder={t('builder.forms.experience.placeholders.position')}
                        className="resume-canvas-field-title min-w-0 flex-1"
                        aria-label={t('builder.forms.experience.fields.position')}
                      />
                      <InlineResumeField
                        pasteMode="plainTextSingleParagraph"
                        value={getExperienceExplicitDateEditor(item)}
                        onChange={(e) => handleTextFieldChange(item.id, 'date', e.target.value)}
                        placeholder={t('builder.forms.experience.placeholders.date')}
                        fieldSize="small"
                        align="right"
                        className="resume-canvas-field-meta w-auto max-w-[9rem] shrink-0 justify-self-end"
                        aria-label={t('builder.genericItemForm.fields.date')}
                      />
                    </div>

                    <div className="resume-canvas-meta-row">
                      <InlineResumeField
                        pasteMode="plainTextSingleParagraph"
                        value={item.company || ''}
                        onChange={(e) => handleTextFieldChange(item.id, 'company', e.target.value)}
                        placeholder={t('builder.forms.experience.placeholders.company')}
                        fieldSize="small"
                        className="resume-canvas-field-title min-w-0"
                        aria-label={t('builder.forms.experience.fields.company')}
                      />
                      <InlineResumeField
                        pasteMode="plainTextSingleParagraph"
                        value={item.location || ''}
                        onChange={(e) => handleTextFieldChange(item.id, 'location', e.target.value)}
                        placeholder={t('builder.forms.experience.placeholders.location')}
                        fieldSize="small"
                        align="right"
                        className="resume-canvas-field-meta w-auto max-w-[11rem] shrink-0"
                        aria-label={t('builder.genericItemForm.fields.location')}
                      />
                    </div>

                    <div className="resume-canvas-stack-row">
                      <span className="resume-canvas-inline-label">Stack</span>
                      <div className="resume-canvas-rich min-w-0 flex-1">
                        <RichTextEditor
                          value={techStack}
                          onChange={(html) => handleTextFieldChange(item.id, 'techStack', html)}
                          placeholder={t('builder.forms.experience.placeholders.techStack')}
                          minHeight="20px"
                          toolbarMode="none"
                          surface="inline"
                        />
                      </div>
                    </div>

                    <HighlightBulletsRichTextDnd
                      scopeId={`xp-${item.id}`}
                      highlights={highlights}
                      onReorder={(from, to) => handleReorderHighlights(item.id, from, to)}
                      onChangeLine={(idx, html) => handleHighlightChange(item.id, idx, html)}
                      onRemoveLine={(idx) => handleRemoveHighlight(item.id, idx)}
                      placeholder={t('builder.forms.experience.placeholders.highlight')}
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
                      <summary>Start / end dates · bullet tips</summary>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <InlineResumeField
                          pasteMode="plainTextSingleParagraph"
                          value={item.start_date || ''}
                          onChange={(e) =>
                            handleTextFieldChange(item.id, 'start_date', e.target.value)
                          }
                          placeholder="2021-01"
                          fieldSize="small"
                          aria-label="Start Date"
                        />
                        <InlineResumeField
                          pasteMode="plainTextSingleParagraph"
                          value={item.end_date || ''}
                          onChange={(e) =>
                            handleTextFieldChange(item.id, 'end_date', e.target.value)
                          }
                          placeholder="present"
                          fieldSize="small"
                          aria-label="End Date"
                        />
                      </div>
                      <BuilderHelpCallout
                        id={`experience-bullets-${item.id}`}
                        title={t('builder.forms.experience.bulletsHelpTitle')}
                        className="mt-2"
                      >
                        <p>{t('builder.forms.experience.bulletsHelpBody')}</p>
                      </BuilderHelpCallout>
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
        {t('builder.forms.experience.addJob')}
      </ResumeCanvasAddLink>
    </div>
  );
};
