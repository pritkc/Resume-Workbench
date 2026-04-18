'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export const EducationForm: React.FC<EducationFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();

  const sensors = useSensors(
    useSensor(PointerSensor),
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="xs"
          onClick={handleAdd}
          className="rounded-none border-black/15 transition-colors hover:border-gray-900 hover:bg-gray-900 hover:text-white"
        >
          <Plus className="mr-2 h-4 w-4" /> {t('builder.forms.education.addSchool')}
        </Button>
      </div>

      {data.length === 0 ? (
        <div className="border border-dashed border-black/20 bg-gray-50/80 px-3 py-4 text-center">
          <p className="mb-2 text-[11px] text-gray-600">
            {t('builder.genericItemForm.noEntries', { label: t('resume.sections.education') })}
          </p>
          <Button
            variant="outline"
            size="xs"
            onClick={handleAdd}
            className="rounded-none border-black"
          >
            <Plus className="mr-2 h-4 w-4" /> {t('builder.forms.education.addFirstSchool')}
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={data.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {data.map((item) => {
                const highlights = getEducationHighlights(item);

                return (
                  <DraggableListItem key={item.id} id={item.id}>
                    <div className="group relative border border-black/15 bg-white px-2.5 py-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('common.delete')}
                        className="absolute right-2 top-2 text-destructive opacity-60 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        onClick={() => handleRemove(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>

                      <div className="mb-3 grid grid-cols-1 gap-3 pr-7 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-[11px] font-medium text-gray-700">
                            {t('builder.forms.education.fields.institution')}
                          </Label>
                          <Input
                            value={item.institution || ''}
                            onChange={(e) =>
                              handleFieldChange(item.id, 'institution', e.target.value)
                            }
                            placeholder={t('builder.forms.education.placeholders.institution')}
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[11px] font-medium text-gray-700">
                            {t('builder.forms.education.fields.degree')}
                          </Label>
                          <Input
                            value={item.degree || ''}
                            onChange={(e) => handleFieldChange(item.id, 'degree', e.target.value)}
                            placeholder={t('builder.forms.education.placeholders.degree')}
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[11px] font-medium text-gray-700">
                            {t('builder.forms.education.fields.area')}
                          </Label>
                          <Input
                            value={item.area || ''}
                            onChange={(e) => handleFieldChange(item.id, 'area', e.target.value)}
                            placeholder={t('builder.forms.education.placeholders.area')}
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[11px] font-medium text-gray-700">
                            {t('builder.genericItemForm.fields.location')}
                          </Label>
                          <Input
                            value={item.location || ''}
                            onChange={(e) => handleFieldChange(item.id, 'location', e.target.value)}
                            placeholder={t('builder.forms.education.placeholders.location')}
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[11px] font-medium text-gray-700">
                            Start Date
                          </Label>
                          <Input
                            value={item.start_date || ''}
                            onChange={(e) =>
                              handleFieldChange(item.id, 'start_date', e.target.value)
                            }
                            placeholder="2014"
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[11px] font-medium text-gray-700">End Date</Label>
                          <Input
                            value={item.end_date || ''}
                            onChange={(e) => handleFieldChange(item.id, 'end_date', e.target.value)}
                            placeholder="2018 or present"
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-[11px] font-medium text-gray-700">
                            {t('builder.genericItemForm.fields.date')}
                          </Label>
                          <Input
                            value={getEducationExplicitDate(item)}
                            onChange={(e) => handleFieldChange(item.id, 'date', e.target.value)}
                            placeholder={t('builder.forms.education.placeholders.date')}
                            className="rounded-none border-black/15 bg-white"
                          />
                          <p className="text-[11px] text-gray-500">
                            Optional override. If blank, the preview uses start and end dates.
                          </p>
                        </div>
                      </div>

                      <div className="mb-3 space-y-2">
                        <Label className="text-[11px] font-medium text-gray-700">
                          {t('builder.genericItemForm.fields.summaryOptional')}
                        </Label>
                        <Textarea
                          value={getEducationSummary(item)}
                          onChange={(e) => handleFieldChange(item.id, 'summary', e.target.value)}
                          className="min-h-[56px] rounded-none border-black/15 bg-white text-[13px] text-gray-900"
                          placeholder={t('builder.forms.education.placeholders.summary')}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-medium text-gray-700">
                            {t('builder.genericItemForm.fields.highlights')}
                          </Label>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleAddHighlight(item.id)}
                            className="px-2 text-[11px] text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                          >
                            <Plus className="mr-1 h-3 w-3" />{' '}
                            {t('builder.genericItemForm.actions.addPoint')}
                          </Button>
                        </div>
                        {highlights.map((highlight, idx) => (
                          <div key={idx} className="flex gap-2">
                            <Textarea
                              value={highlight}
                              onChange={(e) => handleHighlightChange(item.id, idx, e.target.value)}
                              className="min-h-[56px] flex-1 rounded-none border-black/15 bg-white text-[13px] text-gray-900"
                              placeholder={t('builder.forms.education.placeholders.highlight')}
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('common.delete')}
                              onClick={() => handleRemoveHighlight(item.id, idx)}
                              className="self-end text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
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
