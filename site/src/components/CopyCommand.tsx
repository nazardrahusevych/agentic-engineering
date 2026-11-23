import { useEffect, useRef, useState } from 'react';
import { en } from '../i18n/en.ts';

interface Props {
  command: string;
  /** Visible button text, e.g. "Copy install". */
  label: string;
  /** Extra words for screen readers, e.g. the artifact name. */
  context?: string;
  /** Show the command next to the button. */
  showCommand?: boolean;
}

const CONFIRM_MS = 2000;

/**
 * Copies a command to the clipboard and confirms for about two seconds (AC-20). Without clipboard access it shows
 * the command in a focused, selected read-only field for manual copying (AC-21).
 */
export default function CopyCommand({ command, label, context, showCommand = false }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state === 'manual') {
      input.current?.focus();
      input.current?.select();
    }
    if (state !== 'copied') return undefined;
    const timer = setTimeout(() => setState('idle'), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(command);
      setState('copied');
    } catch {
      setState('manual');
    }
  };

  return (
    <div className="copy-command">
      {state === 'manual' ? (
        <>
          <input
            ref={input}
            type="text"
            readOnly
            value={command}
            aria-label={en.copy.fieldLabel(context ? `${label} ${context}` : label)}
            onFocus={(event) => event.currentTarget.select()}
          />
          <span className="copy-hint">{en.copy.manualHint}</span>
        </>
      ) : (
        <>
          {showCommand && <code>{command}</code>}
          <button type="button" className="secondary" onClick={copy}>
            {label}
            {context && <span className="visually-hidden"> {context}</span>}
          </button>
        </>
      )}
      <span className="copy-status" role="status" aria-live="polite">
        {state === 'copied' ? en.copy.copied : ''}
      </span>
    </div>
  );
}
