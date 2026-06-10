'use client';

import React from 'react';
import type { SkillsSection } from '@/components/dashboard/resume-component';
import { AdditionalGroupsForm } from './additional-groups-form';

interface AdditionalFormProps {
  data: SkillsSection;
  onChange: (data: SkillsSection) => void;
  hideFooterAdd?: boolean;
}

export const AdditionalForm: React.FC<AdditionalFormProps> = ({
  data,
  onChange,
  hideFooterAdd,
}) => {
  return <AdditionalGroupsForm data={data} onChange={onChange} hideFooterAdd={hideFooterAdd} />;
};

export default AdditionalForm;
