'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
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
  getExperienceExplicitDate,
  getExperienceHighlightsEditor,
  getExperiencePosition,
  getExperienceTechStack,
} from '@/lib/utils/rendercv-fields';
import { DraggableListItem } from '../draggable-list-item';
import { HighlightBulletsRichTextDnd } from '../highlight-bullets-dnd';
import { BuilderFormField } from '../builder-form-field';
import { BuilderHelpCallout } from '../builder-help-callout';
import { DRAG_ACTIVATION_LIST_PX, resumeSortableCollision } from '@/lib/builder/drag-settings';

interface ExperienceFormProps {
  data: Experience[];
  onChange: (data: Experience[]) => void;
}

const inp = 'builder-field-input w-full';
const addTextBtn =
  'builder-field-caption inline-flex items-center underline decoration-black/20 underline-offset-2 hover:text-foreground';

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
        return {
          ...item,
          position: value,
          title: value,
        };
      }

      if (field === 'date') {
        return {
          ...item,
          date: value,
          years: value,
        };
      }

      if (field === 'techStack') {
        const highlights = getExperienceHighlightsEditor(item);
        return {
          ...item,
          techStack: value,
          description: buildExperienceDescription(value, highlights),
        };
      }

      return {
        ...item,
        [field]: value,
      };
    });
  };

  const handleHighlightChange = (id: number, index: number, value: string) => {
    updateItem(id, (item) => {
      const highlights = [...getExperienceHighlightsEditor(item)];
      highlights[index] = value;

      return {
        ...item,
        highlights,
        description: buildExperienceDescription(getExperienceTechStack(item), highlights),
      };
    });
  };

  const handleAddHighlight = (id: number) => {
    updateItem(id, (item) => {
      const highlights = [...getExperienceHighlightsEditor(item), ''];
      return {
        ...item,
        highlights,
        description: buildExperienceDescription(getExperienceTechStack(item), highlights),
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
        description: buildExperienceDescription(getExperienceTechStack(item), highlights),
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
        description: buildExperienceDescription(getExperienceTechStack(item), next),
      };
    });
  };

  return (
    <div className="space-y-2">
      {data.length === 0 ? (
        <div className="border border-dashed border-border bg-card px-2 py-3 text-center">
          <p className="mb-1.5 font-mono text-[11px] text-muted-foreground">
            {t('builder.genericItemForm.noEntries', { label: t('resume.sections.experience') })}
          </p>
          <button type="button" onClick={handleAdd} className={addTextBtn}>
            <Plus className="mr-0.5 inline h-3 w-3 align-middle" />
            {t('builder.forms.experience.addFirstJob')}
          </button>
        </div>
      ) : (
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
            <div className="space-y-2">
              <BuilderHelpCallout
                id="experience-bullets"
                title={t('builder.forms.experience.bulletsHelpTitle')}
              >
                <p>{t('builder.forms.experience.bulletsHelpBody')}</p>
              </BuilderHelpCallout>
              {data.map((item) => {
                const highlights = getExperienceHighlightsEditor(item);
                const techStack = getExperienceTechStack(item);

                return (
                  <DraggableListItem key={item.id} id={item.id}>
                    <div className="group entry-card-editor relative">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('common.delete')}
                        className="absolute right-1 top-1 h-7 w-7 border border-red-600/25 text-red-600 opacity-70 hover:bg-red-600/[0.06] group-hover:opacity-100"
                        onClick={() => handleRemove(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>

                      <div className="mb-2 grid grid-cols-1 gap-2 pr-8 md:grid-cols-2">
                        <BuilderFormField label={t('builder.forms.experience.fields.position')}>
                          <Input
                            pasteMode="plainTextSingleParagraph"
                            value={getExperiencePosition(item)}
                            onChange={(e) =>
                              handleTextFieldChange(item.id, 'position', e.target.value)
                            }
                            placeholder={t('builder.forms.experience.placeholders.position')}
                            className={inp}
                          />
                        </BuilderFormField>
                        <BuilderFormField label={t('builder.forms.experience.fields.company')}>
                          <Input
                            pasteMode="plainTextSingleParagraph"
                            value={item.company || ''}
                            onChange={(e) =>
                              handleTextFieldChange(item.id, 'company', e.target.value)
                            }
                            placeholder={t('builder.forms.experience.placeholders.company')}
                            className={inp}
                          />
                        </BuilderFormField>
                        <BuilderFormField label={t('builder.genericItemForm.fields.location')}>
                          <Input
                            pasteMode="plainTextSingleParagraph"
                            value={item.location || ''}
                            onChange={(e) =>
                              handleTextFieldChange(item.id, 'location', e.target.value)
                            }
                            placeholder={t('builder.forms.experience.placeholders.location')}
                            className={inp}
                          />
                        </BuilderFormField>
                        <BuilderFormField label="Start Date">
                          <Input
                            pasteMode="plainTextSingleParagraph"
                            value={item.start_date || ''}
                            onChange={(e) =>
                              handleTextFieldChange(item.id, 'start_date', e.target.value)
                            }
                            placeholder="2021-01"
                            className={inp}
                          />
                        </BuilderFormField>
                        <BuilderFormField label="End Date">
                          <Input
                            pasteMode="plainTextSingleParagraph"
                            value={item.end_date || ''}
                            onChange={(e) =>
                              handleTextFieldChange(item.id, 'end_date', e.target.value)
                            }
                            placeholder="present or 2024-03"
                            className={inp}
                          />
                        </BuilderFormField>
                        <BuilderFormField
                          label={t('builder.genericItemForm.fields.date')}
                          hint={t('builder.forms.experience.dateFieldHint')}
                          className="md:col-span-2"
                        >
                          <Input
                            pasteMode="plainTextSingleParagraph"
                            value={getExperienceExplicitDate(item)}
                            onChange={(e) => handleTextFieldChange(item.id, 'date', e.target.value)}
                            placeholder={t('builder.forms.experience.placeholders.date')}
                            className={inp}
                          />
                        </BuilderFormField>
                      </div>

                      <BuilderFormField
                        label={t('builder.forms.experience.fields.techStackOptional')}
                        className="mb-2"
                      >
                        <RichTextEditor
                          value={techStack}
                          onChange={(html) => handleTextFieldChange(item.id, 'techStack', html)}
                          placeholder={t('builder.forms.experience.placeholders.techStack')}
                          minHeight="40px"
                          toolbarMode="none"
                        />
                      </BuilderFormField>

                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="builder-field-label block">
                            {t('builder.genericItemForm.fields.highlights')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddHighlight(item.id)}
                            className="builder-field-caption shrink-0 underline decoration-black/20 underline-offset-2 hover:text-foreground"
                          >
                            <Plus className="mr-0.5 inline h-3 w-3 align-middle" />
                            {t('builder.genericItemForm.actions.addPoint')}
                          </button>
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
                      </div>
                    </div>
                  </DraggableListItem>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};
