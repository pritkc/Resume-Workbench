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
import { DraggableListItem } from '../draggable-list-item';

interface ExperienceFormProps {
  data: Experience[];
  onChange: (data: Experience[]) => void;
}

export const ExperienceForm: React.FC<ExperienceFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();

  // Configure drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handler for drag end event
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = data.findIndex((item) => item.id === active.id);
    const newIndex = data.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder the array using arrayMove from @dnd-kit
    const reordered = arrayMove(data, oldIndex, newIndex);
    onChange(reordered);
  };

  const handleAdd = () => {
    const newId = Math.max(...data.map((d) => d.id), 0) + 1;
    onChange([
      ...data,
      {
        id: newId,
        title: '',
        company: '',
        location: '',
        years: '',
        description: [''],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: keyof Experience, value: string | string[]) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const handleDescriptionChange = (id: number, index: number, value: string) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          const newDesc = [...(item.description || [])];
          newDesc[index] = value;
          return { ...item, description: newDesc };
        }
        return item;
      })
    );
  };

  const handleAddDescription = (id: number) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          return { ...item, description: [...(item.description || []), ''] };
        }
        return item;
      })
    );
  };

  const handleRemoveDescription = (id: number, index: number) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          const newDesc = [...(item.description || [])];
          newDesc.splice(index, 1);
          return { ...item, description: newDesc };
        }
        return item;
      })
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="xs"
          onClick={handleAdd}
          className="rounded-none border-black px-2.5 transition-colors hover:bg-black hover:text-white"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('builder.forms.experience.addJob')}
        </Button>
      </div>

      {data.length === 0 ? (
        <div className="border border-dashed border-black bg-gray-50 px-3 py-4 text-center">
          <p className="mb-2 font-mono text-[11px] text-gray-500">
            {t('builder.genericItemForm.noEntries', { label: t('resume.sections.experience') })}
          </p>
          <Button
            variant="outline"
            size="xs"
            onClick={handleAdd}
            className="rounded-none border-black"
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
              {data.map((item) => (
                <DraggableListItem key={item.id} id={item.id}>
                  <div className="group relative border border-black bg-gray-50 px-3 py-2.5">
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
                        <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                          {t('builder.forms.experience.fields.jobTitle')}
                        </Label>
                        <Input
                          value={item.title || ''}
                          onChange={(e) => handleChange(item.id, 'title', e.target.value)}
                          placeholder={t('builder.forms.experience.placeholders.jobTitle')}
                          className="rounded-none border-black bg-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                          {t('builder.forms.experience.fields.company')}
                        </Label>
                        <Input
                          value={item.company || ''}
                          onChange={(e) => handleChange(item.id, 'company', e.target.value)}
                          placeholder={t('builder.forms.experience.placeholders.company')}
                          className="rounded-none border-black bg-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                          {t('builder.genericItemForm.fields.location')}
                        </Label>
                        <Input
                          value={item.location || ''}
                          onChange={(e) => handleChange(item.id, 'location', e.target.value)}
                          placeholder={t('builder.forms.experience.placeholders.location')}
                          className="rounded-none border-black bg-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                          {t('builder.genericItemForm.fields.years')}
                        </Label>
                        <Input
                          value={item.years || ''}
                          onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                          placeholder={t('builder.forms.experience.placeholders.years')}
                          className="rounded-none border-black bg-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                          {t('builder.genericItemForm.fields.descriptionPoints')}
                        </Label>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleAddDescription(item.id)}
                          className="px-2 text-[11px] text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                        >
                          <Plus className="mr-1 h-3 w-3" />{' '}
                          {t('builder.genericItemForm.actions.addPoint')}
                        </Button>
                      </div>
                      {item.description?.map((desc, idx) => (
                        <div key={idx} className="flex gap-2">
                          <div className="flex-1">
                            <RichTextEditor
                              value={desc}
                              onChange={(html) => handleDescriptionChange(item.id, idx, html)}
                              placeholder={t('builder.forms.experience.placeholders.description')}
                              minHeight="48px"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('common.delete')}
                            onClick={() => handleRemoveDescription(item.id, idx)}
                            className="self-end text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </DraggableListItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};
