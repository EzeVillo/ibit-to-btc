import Decimal from 'decimal.js';
import { translator } from './i18n';
import type { Market } from './market';

export const MAX_INPUT_LENGTH = 48;

export interface NumericInputRules {
  market?: Market;
  separator: '.' | ',' | null;
  decimalPlaces: number;
  maximum: Decimal;
  separatorMessage: string;
  precisionMessage: string;
  maximumMessage: string;
  zeroMessage?: string;
}

/** Editing permits an unfinished decimal and zero while a positive price is being entered. */
export function numericInputError(value: string, rules: NumericInputRules, editing = false): string | null {
  const t = translator(rules.market ?? 'ar');
  if (!value) return null;
  if (value.length > MAX_INPUT_LENGTH) return t('tooLong', { maximum: MAX_INPUT_LENGTH });
  if (/^[+-]?[0-9.,]+[eE][+-]?\d+$/.test(value)) return t('scientific');
  if (value.includes('-') || value.includes('−')) return t('negative');
  if (/\s/.test(value)) return t('spaces');
  if (/[^0-9.,]/.test(value)) return t('digits');
  if (rules.separator === null ? /[.,]/.test(value) : value.includes(rules.separator === '.' ? ',' : '.')) {
    return rules.separatorMessage;
  }
  if (rules.separator) {
    const parts = value.split(rules.separator);
    if (parts.length > 2) return t(rules.separator === '.' ? 'singleDot' : 'singleComma');
    if (value === rules.separator) {
      return editing ? null : t(rules.separator === '.' ? 'completeDot' : 'completeComma');
    }
    if ((parts[1]?.length ?? 0) > rules.decimalPlaces) return rules.precisionMessage;
  }
  const number = new Decimal(value.replace(',', '.'));
  if (number.gt(rules.maximum)) return rules.maximumMessage;
  if (!editing && rules.zeroMessage && number.isZero()) return rules.zeroMessage;
  return null;
}

export function parseNumericInput(raw: string, rules: NumericInputRules): Decimal | null {
  const value = raw.trim();
  const error = numericInputError(value, rules);
  if (error) throw new Error(error);
  return value ? new Decimal(value.replace(',', '.')) : null;
}

interface NumericInputOptions {
  rules: () => NumericInputRules;
  onAccept: () => void;
  onReject: (message: string) => void;
  replaceInitialZero?: boolean;
}

/** Validate the entire proposed value, including the selection being replaced. */
export function bindNumericInput(input: HTMLInputElement, options: NumericInputOptions) {
  let previous = { value: input.value, start: input.selectionStart, end: input.selectionEnd };
  let composing = false;

  function sync() {
    if (!composing && !numericInputError(input.value, options.rules(), true)) {
      previous = { value: input.value, start: input.selectionStart, end: input.selectionEnd };
    }
  }

  function proposed(text: string) {
    const replaceZero = options.replaceInitialZero && /^0+$/.test(input.value) && /\d/.test(text);
    const start = replaceZero ? 0 : input.selectionStart ?? input.value.length;
    const end = replaceZero ? input.value.length : input.selectionEnd ?? start;
    return { value: input.value.slice(0, start) + text + input.value.slice(end), start, replaceZero };
  }

  function accept() {
    options.onAccept();
    sync();
  }

  function checkCurrent() {
    const error = numericInputError(input.value, options.rules(), true);
    if (error) {
      input.value = previous.value;
      input.setSelectionRange(previous.start, previous.end);
      options.onReject(error);
    } else accept();
  }

  input.addEventListener('beforeinput', event => {
    const change = event as InputEvent;
    if (composing || change.isComposing) return;
    sync();
    if (!change.inputType.startsWith('insert')) return;
    const text = change.data ?? change.dataTransfer?.getData('text/plain');
    // Some keyboards, autofill and history operations only expose the final value in input.
    if (text == null || !change.cancelable) return;
    const next = proposed(text);
    const error = numericInputError(next.value, options.rules(), true);
    if (error) { change.preventDefault(); options.onReject(error); }
    else if (next.replaceZero) {
      change.preventDefault();
      input.value = next.value;
      input.setSelectionRange(next.start + text.length, next.start + text.length);
      accept();
    }
  });

  input.addEventListener('paste', event => {
    const paste = event as ClipboardEvent;
    if (!paste.clipboardData) return;
    sync();
    const raw = paste.clipboardData.getData('text');
    const text = raw.trim();
    if (raw && !text) {
      paste.preventDefault();
      options.onReject(translator(options.rules().market ?? 'ar')('pasteEmpty'));
      return;
    }
    const next = proposed(text);
    const error = numericInputError(next.value, options.rules(), true);
    if (error) { paste.preventDefault(); options.onReject(error); }
    else if (raw !== text || next.replaceZero) {
      paste.preventDefault();
      input.value = next.value;
      input.setSelectionRange(next.start + text.length, next.start + text.length);
      accept();
    }
    // Ordinary valid edits retain the browser's native selection and undo behavior.
  });

  input.addEventListener('input', event => {
    if (!composing && !(event as InputEvent).isComposing) checkCurrent();
  });
  input.addEventListener('compositionstart', () => { sync(); composing = true; });
  input.addEventListener('compositionend', () => { composing = false; checkCurrent(); });
  input.addEventListener('select', () => { if (!composing && input.value === previous.value) sync(); });
  return { sync };
}
