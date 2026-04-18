'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { SkillGroup, SkillsSection } from '@/components/dashboard/resume-component';
import {
  formatAdditionalGroupItems,
  getAdditionalGroupDisplayLabel,
  normalizeAdditionalGroups,
  normalizeAdditionalInfo,
  parseAdditionalGroupItems,
} from '@/lib/utils/additional-groups';
import { useTranslations } from '@/lib/i18n';

interface AdditionalGroupsFormProps {
  data: SkillsSection;
  onChange: (data: SkillsSection) => void;
}

function updateGroups(groups: SkillGroup[], onChange: (data: SkillsSection) => void): void {
  onChange(
    normalizeAdditionalInfo(
      {
        groups,
      },
      { seedDefaultsIfEmpty: false }
    )
  );
}

export const AdditionalGroupsForm: React.FC<AdditionalGroupsFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();
  const groups = React.useMemo(() => normalizeAdditionalGroups(data), [data]);

  const handleLabelChange = (index: number, label: string) => {
    updateGroups(
      groups.map((group, currentIndex) =>
        currentIndex === index
          ? {
              ...group,
              label,
            }
          : group
      ),
      onChange
    );
  };

  const handleItemsChange = (index: number, value: string) => {
    updateGroups(
      groups.map((group, currentIndex) =>
        currentIndex === index
          ? {
              ...group,
              values: parseAdditionalGroupItems(value),
            }
          : group
      ),
      onChange
    );
  };

  const handleRemove = (index: number) => {
    updateGroups(
      groups.filter((_, currentIndex) => currentIndex !== index),
      onChange
    );
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= groups.length) {
      return;
    }

    const nextGroups = [...groups];
    const [movedGroup] = nextGroups.splice(index, 1);
    nextGroups.splice(targetIndex, 0, movedGroup);
    updateGroups(nextGroups, onChange);
  };

  const handleAdd = () => {
    const nextGroups = [
      ...groups,
      {
        label: t('builder.additionalForm.newGroupLabel'),
        values: [],
      },
    ];
    updateGroups(nextGroups, onChange);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.stopPropagation();
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-snug text-gray-600">
        {t('builder.additionalForm.instructions')}
      </p>

      <div className="space-y-4">
        {groups.map((group, index) => {
          const displayLabel = getAdditionalGroupDisplayLabel(group, t);

          return (
            <div key={`${group.label}-${index}`} className="border border-black/15 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-black/10 bg-gray-50/80 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Label className="text-[11px] font-medium text-gray-700">
                    {t('builder.additionalForm.groupLabel')}
                  </Label>
                  <Input
                    value={displayLabel}
                    onChange={(event) => handleLabelChange(index, event.target.value)}
                    placeholder={t('builder.additionalForm.groupLabelPlaceholder')}
                    className="mt-1.5 border-black/15 bg-white"
                  />
                </div>

                <div className="flex shrink-0 items-center gap-2 pt-5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0}
                    aria-label={t('builder.additionalForm.moveUp')}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => handleMove(index, 1)}
                    disabled={index === groups.length - 1}
                    aria-label={t('builder.additionalForm.moveDown')}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    onClick={() => handleRemove(index)}
                    aria-label={t('builder.additionalForm.removeGroup')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="p-3">
                <Label
                  htmlFor={`additional-group-items-${index}`}
                  className="text-[11px] font-medium text-gray-700"
                >
                  {t('builder.additionalForm.groupValues')}
                </Label>
                <Textarea
                  id={`additional-group-items-${index}`}
                  value={formatAdditionalGroupItems(group.values)}
                  onChange={(event) => handleItemsChange(index, event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('builder.additionalForm.groupValuesPlaceholder')}
                  className="mt-1.5 min-h-[96px] rounded-none border-black/15 bg-white text-[13px] text-gray-900 focus-visible:border-blue-700 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </div>
          );
        })}
      </div>

      {groups.length === 0 && (
        <div className="border border-dashed border-black/20 bg-gray-50/50 px-3 py-5 text-center">
          <p className="text-[12px] text-gray-600">{t('builder.additionalForm.emptyState')}</p>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={handleAdd}
        className="rounded-none border-black/15"
      >
        <Plus className="h-4 w-4" />
        {t('builder.additionalForm.addGroup')}
      </Button>
    </div>
  );
};

export default AdditionalGroupsForm;
