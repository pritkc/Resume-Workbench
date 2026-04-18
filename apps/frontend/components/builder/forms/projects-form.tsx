'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Textarea } from '@/components/ui/textarea';
import { Project } from '@/components/dashboard/resume-component';
import { Plus, Trash2, Github, Globe } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import {
  buildProjectDescription,
  getProjectDate,
  getProjectHighlights,
  getProjectSummary,
} from '@/lib/utils/rendercv-fields';

interface ProjectsFormProps {
  data: Project[];
  onChange: (data: Project[]) => void;
}

export const ProjectsForm: React.FC<ProjectsFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();

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
      const highlights = [...getProjectHighlights(item)];
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
      const highlights = [...getProjectHighlights(item), ''];
      return {
        ...item,
        highlights,
        description: buildProjectDescription(highlights),
      };
    });
  };

  const handleRemoveHighlight = (id: number, index: number) => {
    updateItem(id, (item) => {
      const highlights = [...getProjectHighlights(item)];
      highlights.splice(index, 1);

      return {
        ...item,
        highlights,
        description: buildProjectDescription(highlights),
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
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('builder.forms.projects.addProject')}
        </Button>
      </div>

      <div className="space-y-3">
        {data.map((item) => {
          const highlights = getProjectHighlights(item);

          return (
            <div
              key={item.id}
              className="group relative border border-black/15 bg-white px-2.5 py-2"
            >
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
                    {t('builder.forms.projects.fields.projectName')}
                  </Label>
                  <Input
                    value={item.name || ''}
                    onChange={(e) => handleFieldChange(item.id, 'name', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.projectName')}
                    className="rounded-none border-black/15 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-gray-700">
                    {t('builder.genericItemForm.fields.date')}{' '}
                    <span className="text-gray-400">({t('common.optional')})</span>
                  </Label>
                  <Input
                    value={getProjectDate(item)}
                    onChange={(e) => handleFieldChange(item.id, 'date', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.date')}
                    className="rounded-none border-black/15 bg-white"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-[11px] font-medium text-gray-700">
                    {t('builder.genericItemForm.fields.summaryOptional')}
                  </Label>
                  <Textarea
                    value={getProjectSummary(item)}
                    onChange={(e) => handleFieldChange(item.id, 'summary', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.summary')}
                    className="min-h-[56px] rounded-none border-black/15 bg-white text-[13px] text-gray-900"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-gray-700">
                    <Github className="mr-1 inline h-3 w-3" />
                    Repo Link <span className="text-gray-400">({t('common.optional')})</span>
                  </Label>
                  <Input
                    value={item.github || ''}
                    onChange={(e) => handleFieldChange(item.id, 'github', e.target.value)}
                    placeholder="github.com/org/repo"
                    className="rounded-none border-black/15 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-gray-700">
                    <Globe className="mr-1 inline h-3 w-3" />
                    Live Link <span className="text-gray-400">({t('common.optional')})</span>
                  </Label>
                  <Input
                    value={item.website || ''}
                    onChange={(e) => handleFieldChange(item.id, 'website', e.target.value)}
                    placeholder="your-project.com"
                    className="rounded-none border-black/15 bg-white"
                  />
                </div>
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
                        placeholder={t('builder.forms.projects.placeholders.highlight')}
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
          );
        })}

        {data.length === 0 && (
          <div className="border border-dashed border-black/20 bg-gray-50/80 px-3 py-3 text-center">
            <p className="mb-2 text-[11px] text-gray-600">
              {t('builder.genericItemForm.noEntries', { label: t('resume.sections.projects') })}
            </p>
            <Button
              variant="outline"
              size="xs"
              onClick={handleAdd}
              className="rounded-none border-black/15"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('builder.forms.projects.addFirstProject')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
