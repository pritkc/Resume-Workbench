'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Project } from '@/components/dashboard/resume-component';
import { Plus, Trash2, Github, Globe } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

interface ProjectsFormProps {
  data: Project[];
  onChange: (data: Project[]) => void;
}

export const ProjectsForm: React.FC<ProjectsFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();

  const handleAdd = () => {
    const newId = Math.max(...data.map((d) => d.id), 0) + 1;
    onChange([
      ...data,
      {
        id: newId,
        name: '',
        role: '',
        years: '',
        github: '',
        website: '',
        description: [''],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: keyof Project, value: string | string[]) => {
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
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('builder.forms.projects.addProject')}
        </Button>
      </div>

      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.id} className="group relative border border-black bg-gray-50 px-3 py-2.5">
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
                  {t('builder.forms.projects.fields.projectName')}
                </Label>
                <Input
                  value={item.name || ''}
                  onChange={(e) => handleChange(item.id, 'name', e.target.value)}
                  placeholder={t('builder.forms.projects.placeholders.projectName')}
                  className="rounded-none border-black bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                  {t('builder.forms.projects.fields.role')}
                </Label>
                <Input
                  value={item.role || ''}
                  onChange={(e) => handleChange(item.id, 'role', e.target.value)}
                  placeholder={t('builder.forms.projects.placeholders.role')}
                  className="rounded-none border-black bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                  {t('builder.genericItemForm.fields.years')}{' '}
                  <span className="text-gray-400">({t('common.optional')})</span>
                </Label>
                <Input
                  value={item.years || ''}
                  onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                  placeholder={t('builder.forms.projects.placeholders.years')}
                  className="rounded-none border-black bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                  <Github className="w-3 h-3 inline mr-1" />
                  GitHub <span className="text-gray-400">({t('common.optional')})</span>
                </Label>
                <Input
                  value={item.github || ''}
                  onChange={(e) => handleChange(item.id, 'github', e.target.value)}
                  placeholder={t('builder.forms.projects.placeholders.github')}
                  className="rounded-none border-black bg-white"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                  <Globe className="w-3 h-3 inline mr-1" />
                  {t('builder.forms.projects.fields.website')}{' '}
                  <span className="text-gray-400">({t('common.optional')})</span>
                </Label>
                <Input
                  value={item.website || ''}
                  onChange={(e) => handleChange(item.id, 'website', e.target.value)}
                  placeholder={t('builder.forms.projects.placeholders.website')}
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
                  <Plus className="mr-1 h-3 w-3" /> {t('builder.genericItemForm.actions.addPoint')}
                </Button>
              </div>
              {item.description?.map((desc, idx) => (
                <div key={idx} className="flex gap-2">
                  <div className="flex-1">
                    <RichTextEditor
                      value={desc}
                      onChange={(html) => handleDescriptionChange(item.id, idx, html)}
                      placeholder={t('builder.forms.projects.placeholders.description')}
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
        ))}

        {data.length === 0 && (
          <div className="border border-dashed border-black bg-gray-50 px-3 py-4 text-center">
            <p className="mb-2 font-mono text-[11px] text-gray-500">
              {t('builder.genericItemForm.noEntries', { label: t('resume.sections.projects') })}
            </p>
            <Button
              variant="outline"
              size="xs"
              onClick={handleAdd}
              className="rounded-none border-black"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('builder.forms.projects.addFirstProject')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
