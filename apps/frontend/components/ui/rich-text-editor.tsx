'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { RichTextToolbar } from './rich-text-toolbar';
import { LinkDialog } from './link-dialog';
import { cn } from '@/lib/utils';
import { normalizePastedSingleParagraph } from '@/lib/paste-plain-text';

interface RichTextEditorProps {
  /** HTML content string */
  value: string;
  /** Called when content changes with new HTML string */
  onChange: (html: string) => void;
  /** Placeholder text shown when editor is empty */
  placeholder?: string;
  /** Additional CSS classes for the container */
  className?: string;
  /** Minimum height of the editor */
  minHeight?: string;
  /** `full` toolbar, `hint` line, or `none` (editor only — use a section-level hint when needed). */
  toolbarMode?: 'full' | 'hint' | 'none';
  /** `card` = bordered box; `inline` = borderless resume-canvas style */
  surface?: 'card' | 'inline';
  /**
   * When true, paste uses text/plain and merges YAML-style wrapped lines.
   * Defaults to true when toolbarMode is `none`; set explicitly for full/hint toolbars.
   */
  plainTextPaste?: boolean;
}

/**
 * Rich Text Editor Component
 *
 * Swiss International Style WYSIWYG editor with formatting toolbar.
 * Supports bold, italic, underline, and links.
 *
 * Uses Tiptap (ProseMirror) under the hood for reliable editing.
 */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter text...',
  className,
  minHeight = '60px',
  toolbarMode = 'full',
  surface = 'card',
  plainTextPaste,
}) => {
  const usePlainTextPaste = plainTextPaste ?? toolbarMode === 'none';
  const plainTextPasteRef = useRef(usePlainTextPaste);
  const surfaceClass =
    surface === 'inline'
      ? 'rich-text-editor-shell w-full border-0 bg-transparent px-0 py-0 text-sm text-foreground rounded-none focus-within:ring-0'
      : 'w-full border border-border bg-card px-2.5 py-1.5 text-sm text-foreground rounded-none focus-within:ring-1 focus-within:ring-blue-700';

  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Track if we're doing an internal update to prevent loops (useRef to avoid re-renders)
  const isInternalUpdateRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: false,
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      isInternalUpdateRef.current = true;
      const html = editor.getHTML();
      // Convert <p> tags to plain content since we're in bullet mode
      const cleanHtml = html.replace(/<p>/g, '').replace(/<\/p>/g, '').trim();
      onChange(cleanHtml);
      // Reset flag after a tick to ensure it stays true through the render cycle
      setTimeout(() => {
        isInternalUpdateRef.current = false;
      }, 0);
    },
    editorProps: {
      attributes: {
        class: cn(
          'outline-none prose prose-sm max-w-none',
          'prose-strong:font-bold prose-em:italic prose-a:text-primary prose-a:underline'
        ),
        style:
          toolbarMode === 'none'
            ? `min-height: ${minHeight}`
            : `min-height: calc(${minHeight} - 24px)`,
      },
      handleKeyDown: (view, event) => {
        // Allow Enter key to work (stopPropagation per coding standards)
        if (event.key === 'Enter') {
          event.stopPropagation();
        }
        return false;
      },
      handlePaste: (view, event) => {
        if (!plainTextPasteRef.current) {
          return false;
        }
        const plain = event.clipboardData?.getData('text/plain');
        if (plain == null || plain === '') {
          return false;
        }
        event.preventDefault();
        const text = normalizePastedSingleParagraph(plain);
        const { state } = view;
        const { from, to } = state.selection;
        view.dispatch(state.tr.insertText(text, from, to));
        return true;
      },
    },
    // Immediately render without waiting for idle
    immediatelyRender: false,
  });

  // Handle mounting for SSR
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    plainTextPasteRef.current = usePlainTextPaste;
  }, [usePlainTextPaste]);

  // Sync external value changes (e.g., from parent reset)
  useEffect(() => {
    if (editor && !isInternalUpdateRef.current) {
      const currentContent = editor.getHTML().replace(/<p>/g, '').replace(/<\/p>/g, '').trim();

      if (value !== currentContent) {
        editor.commands.setContent(value || '');
      }
    }
  }, [value, editor]);

  // Handle link keyboard shortcut (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && editor?.isFocused) {
        e.preventDefault();
        setShowLinkDialog(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  const handleLinkClick = useCallback(() => {
    setShowLinkDialog(true);
  }, []);

  const handleLinkDialogClose = useCallback(() => {
    setShowLinkDialog(false);
    editor?.chain().focus().run();
  }, [editor]);

  // Show loading state during SSR
  if (!isMounted) {
    return (
      <div className={cn('space-y-1', className)}>
        {toolbarMode === 'full' ? (
          <div className="flex h-9 items-center gap-1 border border-border bg-secondary p-1" />
        ) : toolbarMode === 'hint' ? (
          <p className="font-mono text-[9px] leading-tight text-muted-foreground">
            Bold / italic / underline: ⌘B · ⌘I · ⌘U · Link: ⌘K (Ctrl on Windows)
          </p>
        ) : null}
        <div
          className={cn(
            surfaceClass,
            surface === 'card' && 'text-gray-400'
          )}
          style={{ minHeight }}
        >
          {placeholder}
        </div>
      </div>
    );
  }

  if (!editor) {
    return null;
  }

  return (
    <div className={cn('space-y-1', className)}>
      {toolbarMode === 'full' ? (
        <RichTextToolbar editor={editor} onLinkClick={handleLinkClick} />
      ) : toolbarMode === 'hint' ? (
        <p className="font-mono text-[9px] leading-tight text-muted-foreground">
          Bold / italic / underline: ⌘B · ⌘I · ⌘U · Link: ⌘K (Ctrl on Windows)
        </p>
      ) : null}
      <div
        className={cn(
          surfaceClass,
          '[&_.ProseMirror]:min-h-[32px] [&_.ProseMirror]:outline-none',
          '[&_.ProseMirror_p]:m-0',
          '[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline'
        )}
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
      {showLinkDialog && <LinkDialog editor={editor} onClose={handleLinkDialogClose} />}
    </div>
  );
};

export default RichTextEditor;
