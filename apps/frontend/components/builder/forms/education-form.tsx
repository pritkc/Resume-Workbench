'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Education } from '@/components/dashboard/resume-component';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import {
  DndContext,
  closestCenter,
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
  getEducationHighlights,
  getEducationSummary,
} from '@/lib/utils/rendercv-fields';
import { DraggableListItem } from '../draggable-list-item';

interface EducationFormProps {
  data: Education[];
  onChange: (data: Education[]) => void;
}

const fldLabel = 'block font-mono text-[10px] uppercase tracking-wider text-black/50';
const inp =
  'h-7 rounded-none border border-black/30 bg-white px-2 text-sm focus-visible:border-black focus-visible:ring-0';
const addTextBtn =
  'font-mono text-[11px] uppercase tracking-wide text-black/50 underline decoration-black/20 underline-offset-2 hover:text-black';

export const EducationForm: React.FC<EducationFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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
        return {
          ...item,
          date: value,
          years: value,
        };
      }

      if (field === 'summary') {
        const highlights = getEducationHighlights(item);
        return {
          ...item,
          summary: value,
          description: buildEducationDescription(value, highlights),
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
      const highlights = [...getEducationHighlights(item)];
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
      const highlights = [...getEducationHighlights(item), ''];
      return {
        ...item,
        highlights,
        description: buildEducationDescription(getEducationSummary(item), highlights),
      };
    });
  };

  const handleRemoveHighlight = (id: number, index: number) => {
    updateItem(id, (item) => {
      const highlights = [...getEducationHighlights(item)];
      highlights.splice(index, 1);

      return {
        ...item,
        highlights,
        description: buildEducationDescription(getEducationSummary(item), highlights),
      };
    });
  };

  return (
    <div className="space-y-2">
      {data.length === 0 ? (
        <div className="border border-dashed border-black/25 bg-white px-2 py-3 text-center">
          <p className="mb-1.5 font-mono text-[11px] text-black/45">
            {t('builder.genericItemForm.noEntries', { label: t('resume.sections.education') })}
          </p>
          <button type="button" onClick={handleAdd} className={addTextBtn}>
            <Plus className="mr-0.5 inline h-3 w-3 align-middle" />
            {t('builder.forms.education.addFirstSchool')}
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={data.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {data.map((item) => {
                const highlights = getEducationHighlights(item);

                return (
                  <DraggableListItem key={item.id} id={item.id}>
                    <div className="group entry-card-editor relative border border-black/20 bg-white">
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
                        <div>
                          <span className={fldLabel}>
                            {t('builder.forms.education.fields.institution')}
                          </span>
                          <Input
                            value={item.institution || ''}
                            onChange={(e) =>
                              handleFieldChange(item.id, 'institution', e.target.value)
                            }
                            placeholder={t('builder.forms.education.placeholders.institution')}
                            className={`mt-0.5 ${inp}`}
                          />
                        </div>
                        <div>
                          <span className={fldLabel}>
                            {t('builder.forms.education.fields.degree')}
                          </span>
                          <Input
                            value={item.degree || ''}
                            onChange={(e) => handleFieldChange(item.id, 'degree', e.target.value)}
                            placeholder={t('builder.forms.education.placeholders.degree')}
                            className={`mt-0.5 ${inp}`}
                          />
                        </div>
                        <div>
                          <span className={fldLabel}>
                            {t('builder.forms.education.fields.area')}
                          </span>
                          <Input
                            value={item.area || ''}
                            onChange={(e) => handleFieldChange(item.id, 'area', e.target.value)}
                            placeholder={t('builder.forms.education.placeholders.area')}
                            className={`mt-0.5 ${inp}`}
                          />
                        </div>
                        <div>
                          <span className={fldLabel}>
                            {t('builder.genericItemForm.fields.location')}
                          </span>
                          <Input
                            value={item.location || ''}
                            onChange={(e) => handleFieldChange(item.id, 'location', e.target.value)}
                            placeholder={t('builder.forms.education.placeholders.location')}
                            className={`mt-0.5 ${inp}`}
                          />
                        </div>
                        <div>
                          <span className={fldLabel}>Start Date</span>
                          <Input
                            value={item.start_date || ''}
                            onChange={(e) =>
                              handleFieldChange(item.id, 'start_date', e.target.value)
                            }
                            placeholder="2014"
                            className={`mt-0.5 ${inp}`}
                          />
                        </div>
                        <div>
                          <span className={fldLabel}>End Date</span>
                          <Input
                            value={item.end_date || ''}
                            onChange={(e) => handleFieldChange(item.id, 'end_date', e.target.value)}
                            placeholder="2018 or present"
                            className={`mt-0.5 ${inp}`}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <span className={fldLabel}>
                            {t('builder.genericItemForm.fields.date')}
                          </span>
                          <Input
                            value={getEducationExplicitDate(item)}
                            onChange={(e) => handleFieldChange(item.id, 'date', e.target.value)}
                            placeholder={t('builder.forms.education.placeholders.date')}
                            className={`mt-0.5 ${inp}`}
                          />
                          <p
                            className="mt-0.5 font-sans text-[11px] text-black/40"
                            title="If blank, the preview uses start and end dates."
                          >
                            If blank, the preview uses start and end dates.
                          </p>
                        </div>
                      </div>

                      <div className="mb-2">
                        <span className={fldLabel}>
                          {t('builder.genericItemForm.fields.summaryOptional')}
                        </span>
                        <Textarea
                          value={getEducationSummary(item)}
                          onChange={(e) => handleFieldChange(item.id, 'summary', e.target.value)}
                          className="mt-0.5 min-h-[44px] rounded-none border border-black/30 bg-white px-2 py-1.5 text-sm shadow-none focus-visible:border-black focus-visible:ring-0"
                          placeholder={t('builder.forms.education.placeholders.summary')}
                          rows={2}
                        />
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className={fldLabel}>
                            {t('builder.genericItemForm.fields.highlights')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddHighlight(item.id)}
                            className="shrink-0 font-mono text-[11px] text-black/50 underline decoration-black/20 underline-offset-2 hover:text-black"
                          >
                            <Plus className="mr-0.5 inline h-3 w-3 align-middle" />
                            {t('builder.genericItemForm.actions.addPoint')}
                          </button>
                        </div>
                        {highlights.map((highlight, idx) => (
                          <div key={idx} className="mb-1.5 flex gap-1.5 last:mb-0">
                            <Textarea
                              value={highlight}
                              onChange={(e) => handleHighlightChange(item.id, idx, e.target.value)}
                              className="min-h-[36px] flex-1 rounded-none border border-black/30 bg-white px-2 py-1 text-sm shadow-none focus-visible:border-black focus-visible:ring-0"
                              placeholder={t('builder.forms.education.placeholders.highlight')}
                              rows={2}
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('common.delete')}
                              onClick={() => handleRemoveHighlight(item.id, idx)}
                              className="h-7 w-7 shrink-0 self-end border border-black/15 text-black/40 hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
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
