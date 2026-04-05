import React from 'react';
import type { AdditionalInfo } from '@/components/dashboard/resume-component';
import {
  getAdditionalGroupDisplayLabel,
  getAdditionalGroupsWithContent,
} from '@/lib/utils/additional-groups';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface AdditionalGroupSectionProps {
  additional?: AdditionalInfo | null;
  displayName?: string;
  className?: string;
  headingClassName?: string;
  bodyClassName?: string;
  rowClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
}

export function AdditionalGroupSection({
  additional,
  displayName,
  className,
  headingClassName,
  bodyClassName,
  rowClassName,
  labelClassName,
  valueClassName,
}: AdditionalGroupSectionProps) {
  const { t } = useTranslations();
  const groups = getAdditionalGroupsWithContent(additional);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <h3 className={headingClassName}>{displayName || t('resume.sections.skills')}</h3>
      <div className={bodyClassName}>
        {groups.map((group) => (
          <div key={group.id} className={cn('flex', rowClassName)}>
            <span className={labelClassName}>{getAdditionalGroupDisplayLabel(group, t)}:</span>
            <span className={valueClassName}>{group.items.join(', ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdditionalGroupSection;
