import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RawYamlEditor } from '@/components/builder/raw-yaml-editor';

describe('RawYamlEditor', () => {
  it('renders line-aware validation details for the active section', () => {
    render(
      <RawYamlEditor
        section="cv"
        value={`cv:\n  name: Jane Doe\n`}
        statusLabel="Autosave paused until the YAML is valid."
        error={{
          section: 'cv',
          line: 2,
          column: 3,
          message: 'CV YAML is invalid: unexpected indent',
        }}
        onChange={() => {}}
        onCopySection={() => {}}
        onCopyAll={() => {}}
        onResync={() => {}}
      />
    );

    expect(screen.getByText('Jump To Line')).toBeInTheDocument();
    expect(screen.getAllByText(/line 2/i)).toHaveLength(2);
    expect(screen.getByLabelText('CV raw YAML editor')).toBeInTheDocument();
  });

  it('applies tab indentation inside the editor', () => {
    const handleChange = vi.fn();

    render(
      <RawYamlEditor
        section="cv"
        value={`cv:\nname: Jane Doe\n`}
        statusLabel="Autosave is ready."
        onChange={handleChange}
        onCopySection={() => {}}
        onCopyAll={() => {}}
        onResync={() => {}}
      />
    );

    const textarea = screen.getByLabelText('CV raw YAML editor') as HTMLTextAreaElement;
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = 0;

    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(handleChange).toHaveBeenCalledWith(`  cv:\nname: Jane Doe\n`);
  });
});
