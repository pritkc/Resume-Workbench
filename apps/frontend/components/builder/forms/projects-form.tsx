'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Project } from '@/components/dashboard/resume-component';
import { Plus, Trash2, Github, Globe } from 'lucide-react';
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
import { DRAG_ACTIVATION_LIST_PX, resumeSortableCollision } from '@/lib/builder/drag-settings';

interface ProjectsFormProps {
  data: Project[];
  onChange: (data: Project[]) => void;
}

const fldLabel = 'block font-mono text-[10px] uppercase tracking-wider text-black/50';
const inp =
  'h-7 rounded-none border border-black/30 bg-white px-2 text-sm focus-visible:border-black focus-visible:ring-0';
const addTextBtn =
  'font-mono text-[11px] uppercase tracking-wide text-black/50 underline decoration-black/20 underline-offset-2 hover:text-black';

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
        summary: '',
        role: '',
        date: '',
        years: '',
        github: '',
        website: '',
        description: [],
        highlights: [],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleFieldChange = (
    id: number,
    field: 'name' | 'summary' | 'date' | 'github' | 'website',
    value: string
  ) => {
    updateItem(id, (item) => {
      if (field === 'summary') {
        return {
          ...item,
          summary: value,
          role: value,
        };
      }

      if (field === 'date') {
        return {
          ...item,
          date: value,
          years: value,
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
      const highlights = [...getProjectHighlightsEditor(item)];
      highlights[index] = value;

      return {
        ...item,
        highlights,
        description: buildProjectDescription(highlights),
      };
    });
  };

  const handleAddHighlight = (id: number) => {
    updateItem(id, (item) => {
      const highlights = [...getProjectHighlightsEditor(item), ''];
      return {
        ...item,
        highlights,
        description: buildProjectDescription(highlights),
      };
    });
  };

  const handleRemoveHighlight = (id: number, index: number) => {
    updateItem(id, (item) => {
      const highlights = [...getProjectHighlightsEditor(item)];
      highlights.splice(index, 1);

      return {
        ...item,
        highlights,
        description: buildProjectDescription(highlights),
      };
    });
  };

  const handleReorderHighlights = (id: number, from: number, to: number) => {
    if (from === to) return;
    updateItem(id, (item) => {
      const highlights = [...getProjectHighlightsEditor(item)];
      const next = arrayMove(highlights, from, to);
      return {
        ...item,
        highlights: next,
        description: buildProjectDescription(next),
      };
    });
  };

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {data.length > 0 ? (
          <p className="font-mono text-[9px] leading-snug text-black/40">
            Rich text: ⌘B / ⌘I / ⌘U — link ⌘K (Ctrl on Windows). Hover the grip on each bullet or project
            card to reorder.
          </p>
        ) : null}
        {data.length > 0 ? (
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
                {data.map((item) => {
                  const highlights = getProjectHighlightsEditor(item);

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
                  <span className={fldLabel}>{t('builder.forms.projects.fields.projectName')}</span>
                  <Input
                    value={item.name || ''}
                    onChange={(e) => handleFieldChange(item.id, 'name', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.projectName')}
                    className={`mt-0.5 ${inp}`}
                  />
                </div>
                <div>
                  <span className={fldLabel}>{t('builder.genericItemForm.fields.date')}</span>
                  <Input
                    value={getProjectDate(item)}
                    onChange={(e) => handleFieldChange(item.id, 'date', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.date')}
                    className={`mt-0.5 ${inp}`}
                  />
                </div>
                <div className="md:col-span-2">
                  <span className={fldLabel}>
                    {t('builder.forms.projects.fields.techStackOptional')}
                  </span>
                  <Textarea
                    value={getProjectTechStack(item)}
                    onChange={(e) => handleFieldChange(item.id, 'summary', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.techStack')}
                    className="mt-0.5 min-h-[72px] rounded-none border border-black/30 bg-white px-2 py-1.5 text-sm shadow-none focus-visible:border-black focus-visible:ring-0"
                  />
                </div>
                <div>
                  <span className={fldLabel}>
                    <Github className="mr-1 inline h-3 w-3 align-text-bottom" />
                    Repo
                  </span>
                  <Input
                    value={item.github || ''}
                    onChange={(e) => handleFieldChange(item.id, 'github', e.target.value)}
                    placeholder="github.com/org/repo"
                    className={`mt-0.5 ${inp}`}
                  />
                </div>
                <div>
                  <span className={fldLabel}>
                    <Globe className="mr-1 inline h-3 w-3 align-text-bottom" />
                    Link
                  </span>
                  <Input
                    value={item.website || ''}
                    onChange={(e) => handleFieldChange(item.id, 'website', e.target.value)}
                    placeholder="your-project.com"
                    className={`mt-0.5 ${inp}`}
                  />
                </div>
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
                          <HighlightBulletsRichTextDnd
                            scopeId={`pr-${item.id}`}
                            highlights={highlights}
                            onReorder={(from, to) => handleReorderHighlights(item.id, from, to)}
                            onChangeLine={(idx, html) => handleHighlightChange(item.id, idx, html)}
                            onRemoveLine={(idx) => handleRemoveHighlight(item.id, idx)}
                            placeholder={t('builder.forms.projects.placeholders.highlight')}
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
        ) : null}

        {data.length === 0 && (
          <div className="border border-dashed border-black/25 bg-white px-2 py-3 text-center">
            <p className="mb-1.5 font-mono text-[11px] text-black/45">
              {t('builder.genericItemForm.noEntries', { label: t('resume.sections.projects') })}
            </p>
            <button type="button" onClick={handleAdd} className={addTextBtn}>
              <Plus className="mr-0.5 inline h-3 w-3 align-middle" />
              {t('builder.forms.projects.addFirstProject')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
