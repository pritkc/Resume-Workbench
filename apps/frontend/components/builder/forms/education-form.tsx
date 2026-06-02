'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Education } from '@/components/dashboard/resume-component';
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
  buildEducationDescription,
  getEducationExplicitDate,
  getEducationHighlightsEditor,
  getEducationSummary,
} from '@/lib/utils/rendercv-fields';
import { DraggableListItem } from '../draggable-list-item';
import { InlineResumeField, InlineResumeTextarea, ResumeCanvasAddLink } from '../inline-resume-field';
import { DRAG_ACTIVATION_LIST_PX, resumeSortableCollision } from '@/lib/builder/drag-settings';

interface EducationFormProps {
  data: Education[];
  onChange: (data: Education[]) => void;
}

export const EducationForm: React.FC<EducationFormProps> = ({ data, onChange }) => {
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

  const updateItem = (id: number, updater: (item: Education) => Education) => {
    onChange(data.map((item) => (item.id === id ? updater(item) : item)));
  };

  const handleAdd = () => {
    const newId = Math.max(...data.map((d) => d.id), 0) + 1;
    onChange([
      ...data,
      {
        id: newId,
        institution: '',
        degree: '',
        area: '',
        location: '',
        start_date: '',
        end_date: '',
        date: '',
        years: '',
        summary: '',
        description: '',
        highlights: [],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleFieldChange = (
    id: number,
    field:
      | 'institution'
      | 'degree'
      | 'area'
      | 'location'
      | 'date'
      | 'start_date'
      | 'end_date'
      | 'summary',
    value: string
  ) => {
    updateItem(id, (item) => {
      if (field === 'date') {
        return { ...item, date: value, years: value };
      }
      if (field === 'summary') {
        const highlights = getEducationHighlightsEditor(item);
        return {
          ...item,
          summary: value,
          description: buildEducationDescription(value, highlights),
        };
      }
      return { ...item, [field]: value };
    });
  };

  const handleHighlightChange = (id: number, index: number, value: string) => {
    updateItem(id, (item) => {
      const highlights = [...getEducationHighlightsEditor(item)];
      highlights[index] = value;
      return {
        ...item,
        highlights,
        description: buildEducationDescription(getEducationSummary(item), highlights),
      };
    });
  };

  const handleAddHighlight = (id: number) => {
    updateItem(id, (item) => {
      const highlights = [...getEducationHighlightsEditor(item), ''];
      return {
        ...item,
        highlights,
        description: buildEducationDescription(getEducationSummary(item), highlights),
      };
    });
  };

  const handleRemoveHighlight = (id: number, index: number) => {
    updateItem(id, (item) => {
      const highlights = [...getEducationHighlightsEditor(item)];
      highlights.splice(index, 1);
      return {
        ...item,
        highlights,
        description: buildEducationDescription(getEducationSummary(item), highlights),
      };
    });
  };

  if (data.length === 0) {
    return (
      <div className="py-2 text-center">
        <p className="mb-1 text-[11px] text-muted-foreground">
          {t('builder.genericItemForm.noEntries', { label: t('resume.sections.education') })}
        </p>
        <ResumeCanvasAddLink onClick={handleAdd}>
          <Plus className="inline h-3 w-3" aria-hidden />
          {t('builder.forms.education.addFirstSchool')}
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
              const highlights = getEducationHighlightsEditor(item);

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
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1">
                        <InlineResumeField
                          pasteMode="plainTextSingleParagraph"
                          value={item.degree || ''}
                          onChange={(e) => handleFieldChange(item.id, 'degree', e.target.value)}
                          placeholder={t('builder.forms.education.placeholders.degree')}
                          className="resume-canvas-field-title w-auto max-w-full"
                          aria-label={t('builder.forms.education.fields.degree')}
                        />
                        <span className="text-muted-foreground/40">,</span>
                        <InlineResumeField
                          pasteMode="plainTextSingleParagraph"
                          value={item.area || ''}
                          onChange={(e) => handleFieldChange(item.id, 'area', e.target.value)}
                          placeholder={t('builder.forms.education.placeholders.area')}
                          className="resume-canvas-field-title w-auto max-w-full"
                          aria-label={t('builder.forms.education.fields.area')}
                        />
                      </div>
                      <InlineResumeField
                        pasteMode="plainTextSingleParagraph"
                        value={getEducationExplicitDate(item)}
                        onChange={(e) => handleFieldChange(item.id, 'date', e.target.value)}
                        placeholder={t('builder.forms.education.placeholders.date')}
                        fieldSize="small"
                        align="right"
                        className="resume-canvas-field-meta w-auto max-w-[9rem] shrink-0 justify-self-end"
                        aria-label={t('builder.genericItemForm.fields.date')}
                      />
                    </div>

                    <InlineResumeField
                      pasteMode="plainTextSingleParagraph"
                      value={item.institution || ''}
                      onChange={(e) => handleFieldChange(item.id, 'institution', e.target.value)}
                      placeholder={t('builder.forms.education.placeholders.institution')}
                      fieldSize="small"
                      className="resume-canvas-field-meta"
                      aria-label={t('builder.forms.education.fields.institution')}
                    />

                    <InlineResumeTextarea
                      pasteMode="plainTextMultiline"
                      value={getEducationSummary(item)}
                      onChange={(e) => handleFieldChange(item.id, 'summary', e.target.value)}
                      placeholder={t('builder.forms.education.placeholders.summary')}
                      fieldSize="small"
                      rows={1}
                      className="mt-0.5 min-h-[1.5rem] text-muted-foreground"
                      aria-label={t('builder.genericItemForm.fields.summaryOptional')}
                    />

                    {highlights.length > 0 ? (
                      <div className="resume-canvas-bullets">
                        {highlights.map((highlight, idx) => (
                          <div key={idx} className="resume-canvas-bullet-row group/hl">
                            <InlineResumeTextarea
                              pasteMode="plainTextMultiline"
                              value={highlight}
                              onChange={(e) => handleHighlightChange(item.id, idx, e.target.value)}
                              placeholder={t('builder.forms.education.placeholders.highlight')}
                              fieldSize="small"
                              rows={1}
                              className="min-h-[1.5rem] min-w-0 flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('common.delete')}
                              onClick={() => handleRemoveHighlight(item.id, idx)}
                              className="absolute right-0 top-0 h-6 w-6 text-muted-foreground opacity-0 hover:text-red-600 group-hover/hl:opacity-100 group-focus-within/hl:opacity-100"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <ResumeCanvasAddLink
                      className="mt-1"
                      onClick={() => handleAddHighlight(item.id)}
                    >
                      <Plus className="inline h-3 w-3" aria-hidden />
                      {t('builder.genericItemForm.actions.addPoint')}
                    </ResumeCanvasAddLink>

                    <details className="resume-canvas-advanced">
                      <summary>Location · start / end dates</summary>
                      <div className="mt-1 space-y-1">
                        <InlineResumeField
                          pasteMode="plainTextSingleParagraph"
                          value={item.location || ''}
                          onChange={(e) => handleFieldChange(item.id, 'location', e.target.value)}
                          placeholder={t('builder.forms.education.placeholders.location')}
                          fieldSize="small"
                          aria-label={t('builder.genericItemForm.fields.location')}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <InlineResumeField
                            pasteMode="plainTextSingleParagraph"
                            value={item.start_date || ''}
                            onChange={(e) =>
                              handleFieldChange(item.id, 'start_date', e.target.value)
                            }
                            placeholder="2014"
                            fieldSize="small"
                            aria-label="Start Date"
                          />
                          <InlineResumeField
                            pasteMode="plainTextSingleParagraph"
                            value={item.end_date || ''}
                            onChange={(e) => handleFieldChange(item.id, 'end_date', e.target.value)}
                            placeholder="2018"
                            fieldSize="small"
                            aria-label="End Date"
                          />
                        </div>
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
        {t('builder.forms.education.addSchool')}
      </ResumeCanvasAddLink>
    </div>
  );
};
