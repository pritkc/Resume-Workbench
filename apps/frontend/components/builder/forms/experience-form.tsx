'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Experience } from '@/components/dashboard/resume-component';
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
  buildExperienceDescription,
  getExperienceExplicitDate,
  getExperienceHighlights,
  getExperiencePosition,
  getExperienceSummary,
} from '@/lib/utils/rendercv-fields';
import { DraggableListItem } from '../draggable-list-item';

interface ExperienceFormProps {
  data: Experience[];
  onChange: (data: Experience[]) => void;
}

export const ExperienceForm: React.FC<ExperienceFormProps> = ({ data, onChange }) => {
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
        summary: '',
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
    field: 'company' | 'location' | 'position' | 'date' | 'start_date' | 'end_date' | 'summary',
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

      if (field === 'summary') {
        const highlights = getExperienceHighlights(item);
        return {
          ...item,
          summary: value,
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
      const highlights = [...getExperienceHighlights(item)];
      highlights[index] = value;

      return {
        ...item,
        highlights,
        description: buildExperienceDescription(getExperienceSummary(item), highlights),
      };
    });
  };

  const handleAddHighlight = (id: number) => {
    updateItem(id, (item) => {
      const highlights = [...getExperienceHighlights(item), ''];
      return {
        ...item,
        highlights,
        description: buildExperienceDescription(getExperienceSummary(item), highlights),
      };
    });
  };

  const handleRemoveHighlight = (id: number, index: number) => {
    updateItem(id, (item) => {
      const highlights = [...getExperienceHighlights(item)];
      highlights.splice(index, 1);

      return {
        ...item,
        highlights,
        description: buildExperienceDescription(getExperienceSummary(item), highlights),
      };
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="xs"
          onClick={handleAdd}
          className="rounded-none border-black/15 px-2.5 transition-colors hover:border-gray-900 hover:bg-gray-900 hover:text-white"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('builder.forms.experience.addJob')}
        </Button>
      </div>

      {data.length === 0 ? (
        <div className="border border-dashed border-black/20 bg-gray-50/80 px-3 py-3 text-center">
          <p className="mb-2 text-[11px] text-gray-600">
            {t('builder.genericItemForm.noEntries', { label: t('resume.sections.experience') })}
          </p>
          <Button
            variant="outline"
            size="xs"
            onClick={handleAdd}
            className="rounded-none border-black/15"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('builder.forms.experience.addFirstJob')}
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={data.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {data.map((item) => {
                const highlights = getExperienceHighlights(item);
                const summary = getExperienceSummary(item);

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

                      <div className="mb-2.5 grid grid-cols-1 gap-2.5 pr-7 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-medium text-gray-700">
                            {t('builder.forms.experience.fields.position')}
                          </Label>
                          <Input
                            value={getExperiencePosition(item)}
                            onChange={(e) =>
                              handleTextFieldChange(item.id, 'position', e.target.value)
                            }
                            placeholder={t('builder.forms.experience.placeholders.position')}
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-medium text-gray-700">
                            {t('builder.forms.experience.fields.company')}
                          </Label>
                          <Input
                            value={item.company || ''}
                            onChange={(e) =>
                              handleTextFieldChange(item.id, 'company', e.target.value)
                            }
                            placeholder={t('builder.forms.experience.placeholders.company')}
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-medium text-gray-700">
                            {t('builder.genericItemForm.fields.location')}
                          </Label>
                          <Input
                            value={item.location || ''}
                            onChange={(e) =>
                              handleTextFieldChange(item.id, 'location', e.target.value)
                            }
                            placeholder={t('builder.forms.experience.placeholders.location')}
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-medium text-gray-700">
                            Start Date
                          </Label>
                          <Input
                            value={item.start_date || ''}
                            onChange={(e) =>
                              handleTextFieldChange(item.id, 'start_date', e.target.value)
                            }
                            placeholder="2021-01"
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-medium text-gray-700">End Date</Label>
                          <Input
                            value={item.end_date || ''}
                            onChange={(e) =>
                              handleTextFieldChange(item.id, 'end_date', e.target.value)
                            }
                            placeholder="present or 2024-03"
                            className="rounded-none border-black/15 bg-white"
                          />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <Label className="text-[11px] font-medium text-gray-700">
                            {t('builder.genericItemForm.fields.date')}
                          </Label>
                          <Input
                            value={getExperienceExplicitDate(item)}
                            onChange={(e) => handleTextFieldChange(item.id, 'date', e.target.value)}
                            placeholder={t('builder.forms.experience.placeholders.date')}
                            className="rounded-none border-black/15 bg-white"
                          />
                          <p className="font-mono text-[11px] text-gray-500">
                            Optional override. If blank, the preview uses start and end dates.
                          </p>
                        </div>
                      </div>

                      <div className="mb-2.5 space-y-1.5">
                        <Label className="text-[11px] font-medium text-gray-700">
                          {t('builder.genericItemForm.fields.summaryOptional')}
                        </Label>
                        <RichTextEditor
                          value={summary}
                          onChange={(html) => handleTextFieldChange(item.id, 'summary', html)}
                          placeholder={t('builder.forms.experience.placeholders.summary')}
                          minHeight="56px"
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
                            <div className="flex-1">
                              <RichTextEditor
                                value={highlight}
                                onChange={(html) => handleHighlightChange(item.id, idx, html)}
                                placeholder={t('builder.forms.experience.placeholders.highlight')}
                                minHeight="48px"
                              />
                            </div>
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
