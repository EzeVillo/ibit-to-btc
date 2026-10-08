import Decimal from 'decimal.js';
import { translator } from './i18n';
import { localeFor } from './market';
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
  let pendingText: string | null = null;

  function sync() {
    const rules = options.rules();
    const inputMode = rules.separator ? 'decimal' : 'numeric';
    const lang = rules.separator === '.' ? 'en-US' : rules.separator === ',' ? 'es-AR' : localeFor(rules.market ?? 'ar');
    // Leave the active keyboard alone unless this field's format actually changes.
    if (input.inputMode !== inputMode) input.inputMode = inputMode;
    if (input.lang !== lang) input.lang = lang;
    if (!composing && !numericInputError(input.value, rules, true)) {
      previous = { value: input.value, start: input.selectionStart, end: input.selectionEnd };
    }
  }

  // A decimal keyboard can ignore the field's language and use the device's separator.
  // Adapt only a single typed key; pasted or replaced numeric strings stay strict.
  function keyboardText(text: string, inputType: string) {
    const separator = options.rules().separator;
    return inputType === 'insertText' && separator && /^[.,]$/.test(text) ? separator : text;
  }

  function proposed(text: string) {
    const replaceZero = options.replaceInitialZero && /^0+$/.test(input.value) && /\d/.test(text);
    const start = replaceZero ? 0 : input.selectionStart ?? input.value.length;
    const end = replaceZero ? input.value.length : input.selectionEnd ?? start;
    return { value: input.value.slice(0, start) + text + input.value.slice(end), start, replaceZero };
  }

  function accept() {
    pendingText = null;
    options.onAccept();
    sync();
  }

  function checkCurrent(inputType = '', data: string | null = null) {
    let value = input.value;
    if (inputType === 'insertText' && (data == null || /^[.,]$/.test(data))) {
      let start = 0;
      while (start < previous.value.length && start < value.length && previous.value[start] === value[start]) start++;
      let end = value.length;
      let previousEnd = previous.value.length;
      while (end > start && previousEnd > start && value[end - 1] === previous.value[previousEnd - 1]) { end--; previousEnd--; }
      const inserted = value.slice(start, end);
      value = value.slice(0, start) + keyboardText(inserted, inputType) + value.slice(end);
    }
    const error = numericInputError(value, options.rules(), true);
    if (error) {
      input.value = previous.value;
      input.setSelectionRange(previous.start, previous.end);
      options.onReject(error);
    } else {
      if (value !== input.value) {
        const { selectionStart, selectionEnd } = input;
        input.value = value;
        input.setSelectionRange(selectionStart, selectionEnd);
      }
      accept();
    }
  }

  input.addEventListener('beforeinput', event => {
    const change = event as InputEvent;
    if (composing || change.isComposing) return;
    pendingText = null;
    sync();
    if (!change.inputType.startsWith('insert')) return;
    const raw = change.data ?? change.dataTransfer?.getData('text/plain');
    // Preserve known text when the subsequent input event omits its data.
    pendingText = raw ?? null;
    // Some keyboards, autofill and history operations only expose the final value in input.
    if (raw == null || !change.cancelable) return;
    const text = keyboardText(raw, change.inputType);
    const next = proposed(text);
    const error = numericInputError(next.value, options.rules(), true);
    if (error) { change.preventDefault(); pendingText = null; options.onReject(error); }
    else if (next.replaceZero || text !== raw) {
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
    const change = event as InputEvent;
    const data = change.data ?? pendingText;
    pendingText = null;
    if (!composing && !change.isComposing) checkCurrent(change.inputType, data);
  });
  input.addEventListener('compositionstart', () => { pendingText = null; sync(); composing = true; });
  input.addEventListener('compositionend', () => { composing = false; checkCurrent(); });
  input.addEventListener('select', () => { if (!composing && input.value === previous.value) sync(); });
  sync();
  return { sync };
}
