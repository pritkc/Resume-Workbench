'use client';

import React from 'react';
import type { SkillsSection } from '@/components/dashboard/resume-component';
import { AdditionalGroupsForm } from './additional-groups-form';

interface AdditionalFormProps {
  data: SkillsSection;
  onChange: (data: SkillsSection) => void;
}

export const AdditionalForm: React.FC<AdditionalFormProps> = ({ data, onChange }) => {
  return <AdditionalGroupsForm data={data} onChange={onChange} />;
};

export default AdditionalForm;
