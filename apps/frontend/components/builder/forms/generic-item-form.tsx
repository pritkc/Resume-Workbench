'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Plus, Trash2 } from 'lucide-react';
import type { CustomSectionItem } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface GenericItemFormProps {
  items: CustomSectionItem[];
  onChange: (items: CustomSectionItem[]) => void;
  itemLabel?: string;
  addLabel?: string;
  showSubtitle?: boolean;
  showLocation?: boolean;
  showYears?: boolean;
  titlePlaceholder?: string;
  subtitlePlaceholder?: string;
  locationPlaceholder?: string;
  yearsPlaceholder?: string;
  descriptionPlaceholder?: string;
}

const fldLabel = 'block font-mono text-[10px] uppercase tracking-wider text-black/50';
const inp =
  'h-7 rounded-none border border-black/30 bg-white px-2 text-sm focus-visible:border-black focus-visible:ring-0';
const addTextBtn =
  'font-mono text-[11px] uppercase tracking-wide text-black/50 underline decoration-black/20 underline-offset-2 hover:text-black';

/**
 * Generic Item Form Component
 *
 * Used for ITEM_LIST type sections (like Experience, Education, Projects).
 * Renders a list of items with configurable fields.
 */
export const GenericItemForm: React.FC<GenericItemFormProps> = ({
  items,
  onChange,
  itemLabel,
  addLabel,
  showSubtitle = true,
  showLocation = true,
  showYears = true,
  titlePlaceholder,
  subtitlePlaceholder,
  locationPlaceholder,
  yearsPlaceholder,
  descriptionPlaceholder,
}) => {
  const { t } = useTranslations();

  const finalItemLabel = itemLabel ?? t('builder.genericItemForm.itemLabel');
  const finalAddLabel =
    addLabel ?? t('builder.genericItemForm.addItemLabel', { label: finalItemLabel });

  const finalTitlePlaceholder = titlePlaceholder ?? t('builder.genericItemForm.placeholders.title');
  const finalSubtitlePlaceholder =
    subtitlePlaceholder ?? t('builder.genericItemForm.placeholders.organization');
  const finalLocationPlaceholder =
    locationPlaceholder ?? t('builder.genericItemForm.placeholders.location');
  const finalYearsPlaceholder = yearsPlaceholder ?? t('builder.genericItemForm.placeholders.years');
  const finalDescriptionPlaceholder =
    descriptionPlaceholder ?? t('builder.genericItemForm.placeholders.description');

  const handleAdd = () => {
    const newId = Math.max(...items.map((d) => d.id), 0) + 1;
    onChange([
      ...items,
      {
        id: newId,
        title: '',
        subtitle: '',
        location: '',
        years: '',
        description: [''],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: keyof CustomSectionItem, value: string | string[]) => {
    onChange(
      items.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const handleDescriptionChange = (id: number, index: number, value: string) => {
    onChange(
      items.map((item) => {
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
      items.map((item) => {
        if (item.id === id) {
          return { ...item, description: [...(item.description || []), ''] };
        }
        return item;
      })
    );
  };

  const handleRemoveDescription = (id: number, index: number) => {
    onChange(
      items.map((item) => {
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
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" onClick={handleAdd} className={addTextBtn}>
          <Plus className="mr-0.5 inline h-3 w-3 align-middle" />
          {finalAddLabel}
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="group entry-card-editor relative border border-black/20 bg-white"
          >
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
                <span className={fldLabel}>{t('builder.genericItemForm.fields.title')}</span>
                <Input
                  pasteMode="plainTextSingleParagraph"
                  value={item.title || ''}
                  onChange={(e) => handleChange(item.id, 'title', e.target.value)}
                  placeholder={finalTitlePlaceholder}
                  className={`mt-0.5 ${inp}`}
                />
              </div>
              {showSubtitle && (
                <div>
                  <span className={fldLabel}>
                    {t('builder.genericItemForm.fields.organization')}
                  </span>
                  <Input
                    pasteMode="plainTextSingleParagraph"
                    value={item.subtitle || ''}
                    onChange={(e) => handleChange(item.id, 'subtitle', e.target.value)}
                    placeholder={finalSubtitlePlaceholder}
                    className={`mt-0.5 ${inp}`}
                  />
                </div>
              )}
              {showLocation && (
                <div>
                  <span className={fldLabel}>{t('builder.genericItemForm.fields.location')}</span>
                  <Input
                    pasteMode="plainTextSingleParagraph"
                    value={item.location || ''}
                    onChange={(e) => handleChange(item.id, 'location', e.target.value)}
                    placeholder={finalLocationPlaceholder}
                    className={`mt-0.5 ${inp}`}
                  />
                </div>
              )}
              {showYears && (
                <div>
                  <span className={fldLabel}>{t('builder.genericItemForm.fields.years')}</span>
                  <Input
                    pasteMode="plainTextSingleParagraph"
                    value={item.years || ''}
                    onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                    placeholder={finalYearsPlaceholder}
                    className={`mt-0.5 ${inp}`}
                  />
                </div>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={fldLabel}>
                  {t('builder.genericItemForm.fields.descriptionPoints')}
                </span>
                <button
                  type="button"
                  onClick={() => handleAddDescription(item.id)}
                  className="shrink-0 font-mono text-[11px] text-black/50 underline decoration-black/20 underline-offset-2 hover:text-black"
                >
                  <Plus className="mr-0.5 inline h-3 w-3 align-middle" />
                  {t('builder.genericItemForm.actions.addPoint')}
                </button>
              </div>
              {item.description?.map((desc, idx) => (
                <div key={idx} className="mb-1.5 flex gap-1.5 last:mb-0">
                  <div className="min-w-0 flex-1">
                    <RichTextEditor
                      value={desc}
                      onChange={(html) => handleDescriptionChange(item.id, idx, html)}
                      placeholder={finalDescriptionPlaceholder}
                      minHeight="36px"
                      plainTextPaste
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.delete')}
                    onClick={() => handleRemoveDescription(item.id, idx)}
                    className="h-7 w-7 shrink-0 self-end border border-black/15 text-black/40 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="border border-dashed border-black/25 bg-white px-2 py-3 text-center">
            <p className="mb-1.5 font-mono text-[11px] text-black/45">
              {t('builder.genericItemForm.noEntries', { label: finalItemLabel })}
            </p>
            <button type="button" onClick={handleAdd} className={addTextBtn}>
              <Plus className="mr-0.5 inline h-3 w-3 align-middle" />
              {t('builder.genericItemForm.addFirstItem', { label: finalItemLabel })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
