'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Linkedin, Mail } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

export interface OutreachPreviewProps {
  /** Outreach message content */
  content: string;
  /** Additional class names */
  className?: string;
}

export function OutreachPreview({ content, className }: OutreachPreviewProps) {
  const { t } = useTranslations();
  return (
    <div
      className={cn(
        'border border-black bg-white',
        'shadow-[2px_2px_0px_0px_#000000]',
        'overflow-hidden',
        className
      )}
    >
      {/* Preview Header */}
      <div className="border-b border-black bg-[#F5F5F0] px-3 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Linkedin className="w-4 h-4 text-[#0077B5]" />
            <span className="font-mono text-xs uppercase">
              {t('outreach.preview.channels.linkedin')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-600" />
            <span className="font-mono text-xs uppercase">
              {t('outreach.preview.channels.email')}
            </span>
          </div>
        </div>
      </div>

      {/* Message Preview */}
      <div className="p-4 md:p-5">
        {content ? (
          <div className="space-y-4">
            {/* Message Bubble Style */}
            <div className="border border-black bg-[#F5F5F0] p-3 shadow-[2px_2px_0px_0px_#000000]">
              <p className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
            </div>

            {/* Usage Tips */}
            <div className="pt-4 border-t border-gray-200">
              <p className="font-mono text-xs text-gray-500 uppercase mb-2">
                {t('outreach.preview.howToUseTitle')}
              </p>
              <ul className="font-mono text-xs text-gray-500 space-y-1">
                <li>{t('outreach.preview.steps.step1')}</li>
                <li>{t('outreach.preview.steps.step2')}</li>
                <li>{t('outreach.preview.steps.step3')}</li>
                <li>{t('outreach.preview.steps.step4')}</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <p className="font-mono text-sm">{t('outreach.preview.emptyTitle')}</p>
            <p className="font-mono text-xs mt-2">{t('outreach.preview.emptyDescription')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
