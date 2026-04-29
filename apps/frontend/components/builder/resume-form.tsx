'use client';

import React, { useEffect, useId, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  ResumeData,
  PersonalInfo,
  SectionMeta,
  SectionType,
  CustomSection,
  Experience,
  Education,
  Project,
} from '@/components/dashboard/resume-component';
import { PersonalInfoForm } from './forms/personal-info-form';
import { SummaryForm } from './forms/summary-form';
import { ExperienceForm } from './forms/experience-form';
import { EducationForm } from './forms/education-form';
import { ProjectsForm } from './forms/projects-form';
import { AdditionalForm } from './forms/additional-form';
import { SectionHeader } from './section-header';
import { GenericTextForm } from './forms/generic-text-form';
import { GenericItemForm } from './forms/generic-item-form';
import { GenericListForm } from './forms/generic-list-form';
import { AddSectionButton } from './add-section-dialog';
import { DraggableSectionWrapper } from './draggable-section-wrapper';

function CvSectionJumpNav({
  sections,
}: {
  sections: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="sticky top-0 z-[12] mb-0 border-b border-black/15 bg-[#F0F0E8]/95 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] backdrop-blur-sm">
      <p className="sr-only">Jump to section</p>
      <div className="flex gap-1.5 overflow-x-auto py-0.5 pl-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() =>
              document.getElementById(`cv-section-${id}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              })
            }
            className="shrink-0 whitespace-nowrap rounded-none border border-black/15 bg-white/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-black/55 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] hover:border-black/25 hover:text-black"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
import {
  getSectionMeta,
  getAllSections,
  createCustomSection,
  DEFAULT_SECTION_META,
} from '@/lib/utils/section-helpers';
import {
  createDefaultAdditionalInfo,
  newSkillGroupId,
  normalizeAdditionalGroups,
  normalizeAdditionalInfo,
} from '@/lib/utils/additional-groups';
import { useTranslations } from '@/lib/i18n';
import { DRAG_ACTIVATION_SECTION_PX, resumeSortableCollision } from '@/lib/builder/drag-settings';

interface ResumeFormProps {
  resumeData: ResumeData;
  onUpdate: (data: ResumeData) => void;
}

export const ResumeForm: React.FC<ResumeFormProps> = ({ resumeData, onUpdate }) => {
  const { t } = useTranslations();
  /** Stable `id` for nested @dnd-kit `DndContext`s (avoids global counter → hydration mismatch). */
  const sectionOrderDndId = useId();
  /** Avoid SSR for @dnd-kit (aria-describedby IDs differ server vs client → hydration mismatch). */
  const [dndMounted, setDndMounted] = useState(false);
  useEffect(() => {
    setDndMounted(true);
  }, []);

  // Get section metadata, falling back to defaults
  const allSections = getSectionMeta(resumeData);
  // Use getAllSections for form - shows ALL sections including hidden ones
  // (Hidden sections are editable but marked with visual indicator)
  const sortedAllSections = getAllSections(resumeData);

  // Handle section metadata updates
  const handleSectionMetaUpdate = (sections: SectionMeta[]) => {
    onUpdate({
      ...resumeData,
      sectionMeta: sections,
    });
  };

  // Handle adding a new custom section
  const handleAddSection = (displayName: string, sectionType: SectionType) => {
    const newSection = createCustomSection(allSections, displayName, sectionType);

    // Initialize section metadata if not present
    const currentMeta = resumeData.sectionMeta?.length
      ? resumeData.sectionMeta
      : DEFAULT_SECTION_META;

    // Initialize custom section data
    const newCustomSection: CustomSection = {
      sectionType,
      text: sectionType === 'text' ? '' : undefined,
      items: sectionType === 'itemList' ? [] : undefined,
      strings: sectionType === 'stringList' ? [] : undefined,
    };

    onUpdate({
      ...resumeData,
      sectionMeta: [...currentMeta, newSection],
      customSections: {
        ...resumeData.customSections,
        [newSection.key]: newCustomSection,
      },
    });
  };

  // Handler for section rename
  const handleRename = (sectionId: string, newName: string) => {
    const updatedSections = allSections.map((s) =>
      s.id === sectionId ? { ...s, displayName: newName } : s
    );
    handleSectionMetaUpdate(updatedSections);
  };

  // Handler for section delete
  const handleDelete = (sectionId: string) => {
    const section = allSections.find((s) => s.id === sectionId);
    if (!section) return;

    if (section.isDefault) {
      // For default sections, just hide them
      handleToggleVisibility(sectionId);
    } else {
      // For custom sections, remove from both sectionMeta and customSections
      const updatedSections = allSections.filter((s) => s.id !== sectionId);
      const updatedCustomSections = { ...resumeData.customSections };
      delete updatedCustomSections[section.key];

      onUpdate({
        ...resumeData,
        sectionMeta: updatedSections,
        customSections: updatedCustomSections,
      });
    }
  };

  // Handler for section visibility toggle
  const handleToggleVisibility = (sectionId: string) => {
    const updatedSections = allSections.map((s) =>
      s.id === sectionId ? { ...s, isVisible: !s.isVisible } : s
    );
    handleSectionMetaUpdate(updatedSections);
  };

  const appendExperienceEntry = () => {
    const data = resumeData.workExperience || [];
    const newId = Math.max(0, ...data.map((d) => d.id)) + 1;
    const next: Experience = {
      id: newId,
      position: '',
      title: '',
      company: '',
      location: '',
      start_date: '',
      end_date: '',
      date: '',
      years: '',
      techStack: '',
      description: [],
      highlights: [],
    };
    onUpdate({ ...resumeData, workExperience: [...data, next] });
  };

  const appendEducationEntry = () => {
    const data = resumeData.education || [];
    const newId = Math.max(0, ...data.map((d) => d.id)) + 1;
    const next: Education = {
      id: newId,
      institution: '',
      degree: '',
      area: '',
      location: '',
      start_date: '',
      end_date: '',
      date: '',
      years: '',
      summary: '',
      description: '',
      highlights: [],
    };
    onUpdate({ ...resumeData, education: [...data, next] });
  };

  const appendProjectEntry = () => {
    const data = resumeData.personalProjects || [];
    const newId = Math.max(0, ...data.map((d) => d.id)) + 1;
    const next: Project = {
      id: newId,
      name: '',
      techStack: '',
      role: '',
      date: '',
      years: '',
      github: '',
      website: '',
      description: [],
      highlights: [],
      includeInResume: true,
    };
    onUpdate({ ...resumeData, personalProjects: [...data, next] });
  };

  const appendSkillGroup = () => {
    const base = normalizeAdditionalInfo(
      resumeData.skills || resumeData.additional || createDefaultAdditionalInfo(),
      {}
    );
    const groups = [
      ...normalizeAdditionalGroups(base),
      {
        id: newSkillGroupId(),
        label: t('builder.additionalForm.newGroupLabel'),
        values: [] as string[],
      },
    ];
    onUpdate({ ...resumeData, skills: normalizeAdditionalInfo({ ...base, groups }, {}) });
  };

  // Configure drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_SECTION_PX } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handler for drag end event
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const sorted = [...allSections].sort((a, b) => a.order - b.order);
    const oldIndex = sorted.findIndex((s) => s.id === active.id);
    const newIndex = sorted.findIndex((s) => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Prevent moving above personalInfo
    if (sorted[newIndex].id === 'personalInfo') return;

    // Create new order by swapping the order values
    const updatedSections = allSections.map((section) => {
      if (section.id === active.id) {
        return { ...section, order: sorted[newIndex].order };
      }
      if (oldIndex < newIndex) {
        // Moving down: shift items up
        if (section.order > sorted[oldIndex].order && section.order <= sorted[newIndex].order) {
          return { ...section, order: section.order - 1 };
        }
      } else {
        // Moving up: shift items down
        if (section.order >= sorted[newIndex].order && section.order < sorted[oldIndex].order) {
          return { ...section, order: section.order + 1 };
        }
      }
      return section;
    });

    handleSectionMetaUpdate(updatedSections);
  };

  const jumpSectionTargets = sortedAllSections.map((s) => ({
    id: s.id,
    label: s.displayName,
  }));

  // Render default section forms
  const renderDefaultSection = (section: SectionMeta) => {
    const isPersonalInfo = section.id === 'personalInfo';

    // Render content based on section key
    const renderContent = () => {
      switch (section.key) {
        case 'personalInfo':
          return (
            <PersonalInfoForm
              data={resumeData.personalInfo || ({} as PersonalInfo)}
              onChange={(data) => onUpdate({ ...resumeData, personalInfo: data })}
            />
          );

        case 'summary':
          return (
            <SummaryForm
              value={resumeData.summary || ''}
              onChange={(value) => onUpdate({ ...resumeData, summary: value })}
            />
          );

        case 'workExperience':
          return (
            <ExperienceForm
              data={resumeData.workExperience || []}
              onChange={(data) => onUpdate({ ...resumeData, workExperience: data })}
            />
          );

        case 'education':
          return (
            <EducationForm
              data={resumeData.education || []}
              onChange={(data) => onUpdate({ ...resumeData, education: data })}
            />
          );

        case 'personalProjects':
          return (
            <ProjectsForm
              data={resumeData.personalProjects || []}
              onChange={(data) => onUpdate({ ...resumeData, personalProjects: data })}
            />
          );

        case 'skills':
          return (
            <AdditionalForm
              data={normalizeAdditionalInfo(
                resumeData.skills || resumeData.additional || createDefaultAdditionalInfo()
              )}
              onChange={(data) =>
                onUpdate({ ...resumeData, skills: normalizeAdditionalInfo(data) })
              }
              hideFooterAdd
            />
          );

        default:
          return null;
      }
    };

    if (isPersonalInfo) {
      return (
        <div id={`cv-section-${section.id}`} className="scroll-mt-[4.5rem] pl-3">
          <SectionHeader
            section={section}
            onRename={(name) => handleRename(section.id, name)}
            onDelete={() => handleDelete(section.id)}
            onToggleVisibility={() => handleToggleVisibility(section.id)}
            canDelete={false}
          >
            {renderContent()}
          </SectionHeader>
        </div>
      );
    }

    let addEntry: { label: string; onClick: () => void } | undefined;
    if (section.key === 'workExperience') {
      addEntry = { label: t('builder.forms.experience.addJob'), onClick: appendExperienceEntry };
    } else if (section.key === 'education') {
      addEntry = { label: t('builder.forms.education.addSchool'), onClick: appendEducationEntry };
    } else if (section.key === 'personalProjects') {
      addEntry = { label: t('builder.forms.projects.addProject'), onClick: appendProjectEntry };
    } else if (section.key === 'skills') {
      addEntry = { label: t('builder.additionalForm.addGroup'), onClick: appendSkillGroup };
    }

    return (
      <SectionHeader
        section={section}
        onRename={(name) => handleRename(section.id, name)}
        onDelete={() => handleDelete(section.id)}
        onToggleVisibility={() => handleToggleVisibility(section.id)}
        canDelete={!section.isDefault}
        addEntry={addEntry}
      >
        {renderContent()}
      </SectionHeader>
    );
  };

  // Render custom section forms
  const renderCustomSection = (section: SectionMeta) => {
    const customSection = resumeData.customSections?.[section.key];

    const updateCustomSection = (updates: Partial<CustomSection>) => {
      onUpdate({
        ...resumeData,
        customSections: {
          ...resumeData.customSections,
          [section.key]: {
            ...customSection,
            sectionType: section.sectionType,
            ...updates,
          } as CustomSection,
        },
      });
    };

    const renderContent = () => {
      switch (section.sectionType) {
        case 'text':
          return (
            <GenericTextForm
              value={customSection?.text || ''}
              onChange={(value) => updateCustomSection({ text: value })}
              label={t('builder.customSections.contentLabel')}
              placeholder={t('builder.customSections.contentPlaceholder', {
                name: section.displayName,
              })}
            />
          );

        case 'itemList':
          return (
            <GenericItemForm
              items={customSection?.items || []}
              onChange={(items) => updateCustomSection({ items })}
              itemLabel={t('builder.customSections.entryLabel')}
              addLabel={t('builder.customSections.addEntryLabel')}
            />
          );

        case 'stringList':
          return (
            <GenericListForm
              items={customSection?.strings || []}
              onChange={(strings) => updateCustomSection({ strings })}
              label={t('builder.customSections.itemsLabel')}
              placeholder={t('builder.customSections.itemsPlaceholder')}
            />
          );

        default:
          return (
            <div className="text-gray-500">
              {t('builder.customSections.unknownSectionType', { type: section.sectionType })}
            </div>
          );
      }
    };

    return (
      <SectionHeader
        section={section}
        onRename={(name) => handleRename(section.id, name)}
        onDelete={() => handleDelete(section.id)}
        onToggleVisibility={() => handleToggleVisibility(section.id)}
        canDelete={true}
      >
        {renderContent()}
      </SectionHeader>
    );
  };

  const sectionRows = sortedAllSections.map((section) => {
    const isPersonalInfo = section.id === 'personalInfo';
    const sectionContent = section.isDefault
      ? renderDefaultSection(section)
      : renderCustomSection(section);
    return { section, isPersonalInfo, sectionContent };
  });

  if (!dndMounted) {
    return (
      <div className="space-y-3 pb-10">
        <CvSectionJumpNav sections={jumpSectionTargets} />
        {sectionRows.map(({ section, isPersonalInfo, sectionContent }) => (
          <div
            key={section.id}
            id={isPersonalInfo ? undefined : `cv-section-${section.id}`}
            className={`relative scroll-mt-[4.5rem] ${isPersonalInfo ? '' : 'pl-3'}`}
          >
            {sectionContent}
          </div>
        ))}
        <AddSectionButton onAdd={handleAddSection} />
      </div>
    );
  }

  return (
    <DndContext
      id={sectionOrderDndId}
      sensors={sensors}
      collisionDetection={resumeSortableCollision}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortedAllSections.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3 pb-10">
          <CvSectionJumpNav sections={jumpSectionTargets} />
          {sectionRows.map(({ section, isPersonalInfo, sectionContent }) =>
            isPersonalInfo ? (
              <div key={section.id} className="relative">
                {sectionContent}
              </div>
            ) : (
              <DraggableSectionWrapper key={section.id} id={section.id}>
                {sectionContent}
              </DraggableSectionWrapper>
            )
          )}

          <AddSectionButton onAdd={handleAddSection} />
        </div>
      </SortableContext>
    </DndContext>
  );
};
