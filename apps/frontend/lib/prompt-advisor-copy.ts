/** Minimal clipboard for an external advisor: short rule + section markers + blueprint. */
export function buildPromptAdvisorClipboardText(input: {
  systemText: string;
  userText: string;
}): string {
  return [
    'Keep every placeholder that starts with $ exactly as written (same names).',
    'Reply only with the two revised blocks below (replace their inner content).',
    '',
    '---- revised system ----',
    '',
    '---- end revised system ----',
    '---- revised user ----',
    '',
    '---- end revised user ----',
    '',
    '---- system ----',
    input.systemText,
    '---- end system ----',
    '---- user ----',
    input.userText,
    '---- end user ----',
  ].join('\n');
}
