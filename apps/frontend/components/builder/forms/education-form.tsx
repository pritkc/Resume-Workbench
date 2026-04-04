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
import { DraggableListItem } from '../draggable-list-item';

interface EducationFormProps {
  data: Education[];
  onChange: (data: Education[]) => void;
}

export const EducationForm: React.FC<EducationFormProps> = ({ data, onChange }) => {
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
        institution: '',
        degree: '',
        years: '',
        description: '',
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: keyof Education, value: string) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="xs"
          onClick={handleAdd}
          className="rounded-none border-black transition-colors hover:bg-black hover:text-white"
        >
          <Plus className="w-4 h-4 mr-2" /> {t('builder.forms.education.addSchool')}
        </Button>
      </div>

      {data.length === 0 ? (
        <div className="border border-dashed border-black bg-gray-50 px-4 py-5 text-center">
          <p className="mb-3 font-mono text-xs text-gray-500">
            {t('builder.genericItemForm.noEntries', { label: t('resume.sections.education') })}
          </p>
          <Button
            variant="outline"
            size="xs"
            onClick={handleAdd}
            className="rounded-none border-black"
          >
            <Plus className="w-4 h-4 mr-2" /> {t('builder.forms.education.addFirstSchool')}
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={data.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {data.map((item) => (
                <DraggableListItem key={item.id} id={item.id}>
                  <div className="relative border border-black bg-gray-50 px-4 py-3 group">
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
                        <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                          {t('builder.forms.education.fields.institution')}
                        </Label>
                        <Input
                          value={item.institution || ''}
                          onChange={(e) => handleChange(item.id, 'institution', e.target.value)}
                          placeholder={t('builder.forms.education.placeholders.institution')}
                          className="rounded-none border-black bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                          {t('builder.forms.education.fields.degree')}
                        </Label>
                        <Input
                          value={item.degree || ''}
                          onChange={(e) => handleChange(item.id, 'degree', e.target.value)}
                          placeholder={t('builder.forms.education.placeholders.degree')}
                          className="rounded-none border-black bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                          {t('builder.genericItemForm.fields.years')}
                        </Label>
                        <Input
                          value={item.years || ''}
                          onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                          placeholder={t('builder.forms.education.placeholders.years')}
                          className="rounded-none border-black bg-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                        {t('builder.forms.education.fields.descriptionOptional')}
                      </Label>
                      <Textarea
                        value={item.description || ''}
                        onChange={(e) => handleChange(item.id, 'description', e.target.value)}
                        className="min-h-[48px] rounded-none border-black bg-white text-sm text-black"
                        placeholder={t('builder.forms.education.placeholders.description')}
                      />
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
