import { describe, expect, it, vi } from 'vitest';
import { COST_INPUT_RULES, parseAverageCost } from './average-cost';
import { assets, getAmountInputRules, parseAmount } from './conversion';
import { bindNumericInput, numericInputError } from './numeric-input';
import type { NumericInputRules } from './numeric-input';

describe('global input editing with the same native-event guard', () => {
  it('blocks incorrect separators, symbols and excess precision while preserving the current value', () => {
    const { input, insert, onReject } = setup('12', () => getAmountInputRules('usd', 'global'));
    expect(insert(',').defaultPrevented).toBe(true); expect(input.value).toBe('12'); expect(onReject).toHaveBeenLastCalledWith(expect.stringContaining('decimal point'));
    insert('.'); insert('50'); expect(input.value).toBe('12.50');
    expect(insert('1').defaultPrevented).toBe(true); expect(input.value).toBe('12.50');
    expect(insert('x').defaultPrevented).toBe(true); expect(onReject).toHaveBeenLastCalledWith(expect.stringContaining('digits'));
  });
  it('validates a pasted global value including the selected text being replaced', () => {
    const { input, paste } = setup('12', () => getAmountInputRules('usd', 'global'));
    input.setSelectionRange(0, 2); expect(paste('1,000.50').defaultPrevented).toBe(true); expect(input.value).toBe('12');
    paste(' 1000.50 '); expect(input.value).toBe('1000.50');
  });
  it('requires whole IBIT units, and restores invalid edits from keyboards without beforeinput', () => {
    const { input, insert } = setup('2', () => getAmountInputRules('ibit', 'global'));
    expect(insert('.').defaultPrevented).toBe(true); expect(input.value).toBe('2');
    input.value = '2.5'; input.dispatchEvent(new Event('input')); expect(input.value).toBe('2');
  });
});

// Native EventTarget exercises cancellation and fallback without adding a DOM dependency.
class TestInput extends EventTarget {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  constructor(value: string) {
    super(); this.value = value; this.selectionStart = this.selectionEnd = value.length;
  }
  setSelectionRange(start: number, end: number) { this.selectionStart = start; this.selectionEnd = end; }
}

function setup(value = '', rules: () => NumericInputRules = () => getAmountInputRules('ars'), replaceInitialZero = false) {
  const input = new TestInput(value);
  const onAccept = vi.fn();
  const onReject = vi.fn();
  const guard = bindNumericInput(input as unknown as HTMLInputElement, { rules, onAccept, onReject, replaceInitialZero });
  function insert(text: string, cancelable = true) {
    const event = Object.assign(new Event('beforeinput', { cancelable }), { inputType: 'insertText', data: text });
    input.dispatchEvent(event);
    if (!event.defaultPrevented) {
      const start = input.selectionStart;
      input.value = input.value.slice(0, start) + text + input.value.slice(input.selectionEnd);
      input.setSelectionRange(start + text.length, start + text.length);
      input.dispatchEvent(new Event('input'));
    }
    return event;
  }
  function paste(text: string) {
    const event = Object.assign(new Event('paste', { cancelable: true }), { clipboardData: { getData: () => text } });
    input.dispatchEvent(event);
    if (!event.defaultPrevented) insert(text);
    return event;
  }
  return { input, onAccept, onReject, guard, insert, paste };
}

describe('mensajes numéricos específicos', () => {
  it.each(assets)('%s rechaza letras, símbolos, signos, espacios internos y exponentes', asset => {
    for (const value of ['abc', '12a', 'NaN', 'Infinity', '１２', '١٢', '$12', '12%', '🙂', '+12', '/', '12\u0000']) {
      expect(() => parseAmount(value, asset)).toThrow('solo números del 0 al 9');
    }
    for (const value of ['-1', '-0', '−1']) expect(() => parseAmount(value, asset)).toThrow('negativos');
    for (const value of ['1 2', '1\t2', '1\n2', '1\u00a02']) expect(() => parseAmount(value, asset)).toThrow('espacios');
    for (const value of ['1e3', '1E+3', '1e-3']) expect(() => parseAmount(value, asset)).toThrow('notación científica');
  });
  it.each(['ibit', 'ars', 'usd', 'usd_ccl'] as const)('%s explica comas repetidas y separadores mezclados', asset => {
    for (const value of ['1,,2', '1,2,3', ',,', '1,00,']) expect(() => parseAmount(value, asset)).toThrow('una sola coma');
    for (const value of ['1.2', '1.000,50', '1,000.50']) expect(() => parseAmount(value, asset)).toThrow('Usá coma decimal');
  });
  it('BTC explica puntos repetidos, coma y el número incompleto', () => {
    for (const value of ['1..2', '1.2.3', '..', '.1.']) expect(() => parseAmount(value, 'btc')).toThrow('un solo punto');
    expect(() => parseAmount('0,1', 'btc')).toThrow('Usá punto decimal');
    expect(() => parseAmount('.', 'btc')).toThrow('Completá el número');
  });
  it('distingue longitud, cero y máximo del precio promedio', () => {
    expect(() => parseAverageCost('0')).toThrow('mayor que cero');
    expect(() => parseAverageCost('1' + '0'.repeat(30) + ',01')).toThrow('máximo');
    expect(() => parseAverageCost('0'.repeat(49))).toThrow('48 caracteres');
    expect(() => parseAverageCost('4,,37')).toThrow('una sola coma');
    expect(() => parseAverageCost('4.37')).toThrow('coma decimal para el precio promedio');
  });
});

describe('bloqueo de la edición completa', () => {
  it.each(['a', '$', '%', '+', '-', ' ', '\t', '1e3', '.', ',,', ',123', '1'.repeat(49)])('rechaza escribir %j y conserva cantidad y cursor', text => {
    const { input, insert, onReject, onAccept } = setup('12');
    input.setSelectionRange(1, 1);
    expect(insert(text).defaultPrevented).toBe(true);
    expect(input.value).toBe('12');
    expect(input.selectionStart).toBe(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledOnce();
  });
  it.each(assets)('%s usa sus reglas también al escribir', asset => {
    const { input, insert, onReject } = setup('', () => getAmountInputRules(asset));
    const decimal = asset === 'btc' ? '.' : ',';
    insert('1');
    insert(decimal);
    if (asset === 'cedear' || asset === 'sats') {
      expect(input.value).toBe('1'); expect(onReject).toHaveBeenCalled();
    } else {
      insert('2'); insert(decimal);
      expect(input.value).toBe(`1${decimal}2`);
      expect(onReject).toHaveBeenLastCalledWith(expect.stringContaining(asset === 'btc' ? 'un solo punto' : 'una sola coma'));
    }
  });
  it('evalúa la selección reemplazada para permitir corregir separador y decimales', () => {
    const { input, insert, paste, onReject } = setup('12,34');
    input.setSelectionRange(2, 3);
    insert(',');
    expect(input.value).toBe('12,34');
    input.setSelectionRange(3, 5);
    paste('50');
    expect(input.value).toBe('12,50');
    input.setSelectionRange(0, 5);
    paste('9,25');
    expect(input.value).toBe('9,25');
    expect(onReject).not.toHaveBeenCalled();
  });
  it('bloquea un tercer decimal sin redondear ni modificar el valor', () => {
    const { input, insert, onReject } = setup('12,34');
    insert('5');
    expect(input.value).toBe('12,34');
    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('hasta 2 decimales'));
  });
  it('bloquea el noveno decimal de BTC, también si es cero', () => {
    const { input, insert, onReject } = setup('0.00000001', () => getAmountInputRules('btc'));
    insert('0');
    expect(input.value).toBe('0.00000001');
    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('hasta 8 decimales'));
  });
  it('rechaza el pegado de nueve decimales de BTC y de un precio con tres', () => {
    for (const [rules, initial, pasted] of [[getAmountInputRules('btc'), '0.1', '0.123456789'], [COST_INPUT_RULES, '4,37', '4,371']] as const) {
      const { input, paste, onReject } = setup(initial, () => rules);
      input.setSelectionRange(0, initial.length);
      paste(pasted);
      expect(input.value).toBe(initial);
      expect(onReject).toHaveBeenCalledWith(rules.precisionMessage);
    }
  });
  it.each(assets)('%s bloquea superar su máximo', asset => {
    const rules = getAmountInputRules(asset);
    const { input, insert, onReject } = setup(rules.maximum.toFixed(), () => rules);
    insert('0');
    expect(input.value).toBe(rules.maximum.toFixed());
    expect(onReject).toHaveBeenCalledWith(rules.maximumMessage);
  });
  it('permite empezar con coma o punto y completar la fracción', () => {
    for (const asset of ['ars', 'btc'] as const) {
      const rules = getAmountInputRules(asset);
      const { input, insert, onReject } = setup('', () => rules);
      insert(rules.separator!); insert('5');
      expect(parseAmount(input.value, asset)!.toFixed()).toBe('0.5');
      expect(onReject).not.toHaveBeenCalled();
    }
  });
  it('el precio permite escribir 0,01 aunque cero por sí solo no sea un precio válido', () => {
    const { input, insert, onReject } = setup('', () => COST_INPUT_RULES);
    for (const text of ['0', ',', '0', '1']) insert(text);
    expect(input.value).toBe('0,01');
    expect(parseAverageCost(input.value)!.toFixed()).toBe('0.01');
    expect(onReject).not.toHaveBeenCalled();
  });
  it('solo reemplaza el cero inicial cuando la nueva entrada es válida', () => {
    const { input, insert, paste } = setup('0', () => getAmountInputRules('cedear'), true);
    insert('a1'); expect(input.value).toBe('0');
    paste('12,3'); expect(input.value).toBe('0');
    insert('1'); expect(input.value).toBe('1');
  });
  it('revalida con el origen actual y sincroniza los cambios programáticos', () => {
    let rules = getAmountInputRules('ars');
    const { input, guard, insert } = setup('12,34', () => rules);
    rules = getAmountInputRules('btc');
    input.value = '0.01'; input.setSelectionRange(4, 4); guard.sync();
    insert(','); expect(input.value).toBe('0.01');
    insert('2'); expect(input.value).toBe('0.012');
  });
});

describe('pegado y rutas alternativas de entrada', () => {
  it.each(['abc', '12a', '1,,2', '1.000,50', '1,000.50', '1 000', '1\n2', '-1', '1e3', '12,345', '1'.repeat(49)])('rechaza el pegado completo de %j sin extraer dígitos', text => {
    const { input, paste, onReject, onAccept } = setup('12,34');
    input.setSelectionRange(0, 5);
    expect(paste(text).defaultPrevented).toBe(true);
    expect(input.value).toBe('12,34');
    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledOnce();
  });
  it('un pegado válido también debe ser válido combinado con el texto existente', () => {
    const { input, paste, onReject } = setup('12,34');
    paste(',5');
    expect(input.value).toBe('12,34');
    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('una sola coma'));
  });
  it('recorta espacios exteriores de un número pegado y conserva la selección', () => {
    const { input, paste, onReject } = setup('12');
    input.setSelectionRange(0, 2);
    paste(' \n4,37\t ');
    expect(input.value).toBe('4,37');
    expect(input.selectionStart).toBe(4);
    expect(onReject).not.toHaveBeenCalled();
  });
  it('pegar solo espacios no elimina el número seleccionado', () => {
    const { input, paste } = setup('12');
    input.setSelectionRange(0, 2);
    paste(' \t ');
    expect(input.value).toBe('12');
  });
  it.each(['12a', '1,,2', '12.34', '12,345', '-1', '1000000000001'])('revierte autocompletado, arrastre o input sin beforeinput: %s', text => {
    const { input, guard, onReject, onAccept } = setup('12,34');
    input.setSelectionRange(2, 2); guard.sync();
    input.value = text;
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('12,34');
    expect(input.selectionStart).toBe(2);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledOnce();
  });
  it('revierte un beforeinput que el navegador no permite cancelar', () => {
    const { input, insert, onReject } = setup('12');
    insert('a', false);
    expect(input.value).toBe('12');
    expect(onReject).toHaveBeenCalledOnce();
  });
  it('valida el input final si beforeinput no expone el texto insertado', () => {
    const { input, onReject } = setup('12');
    input.dispatchEvent(Object.assign(new Event('beforeinput', { cancelable: true }), { inputType: 'insertReplacementText', data: null }));
    input.value = 'abc';
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('12');
    expect(onReject).toHaveBeenCalledOnce();
  });
  it('borrar un separador no puede transformar BTC en una cantidad fuera del límite', () => {
    const { input, onReject } = setup('1.00000000', () => getAmountInputRules('btc'));
    input.setSelectionRange(1, 2);
    input.dispatchEvent(Object.assign(new Event('beforeinput'), { inputType: 'deleteContentBackward', data: null }));
    input.value = '100000000';
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('1.00000000');
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 2]);
    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('21.000.000 BTC'));
  });
  it('permite borrar, deshacer y rehacer valores válidos', () => {
    const { input, onAccept, onReject } = setup('12,34');
    for (const value of ['12,3', '12,', '12', '', '12,34']) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      expect(input.value).toBe(value);
    }
    expect(onAccept).toHaveBeenCalledTimes(5);
    expect(onReject).not.toHaveBeenCalled();
  });
  it('no publica composición incompleta y valida al terminar', () => {
    const { input, onAccept, onReject } = setup('12');
    input.dispatchEvent(new Event('compositionstart'));
    input.value = '12あ';
    input.dispatchEvent(Object.assign(new Event('input'), { isComposing: true }));
    expect(onAccept).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('compositionend'));
    expect(input.value).toBe('12');
    expect(onReject).toHaveBeenCalledOnce();
  });
  it('el separador incompleto se admite solo durante la edición', () => {
    expect(numericInputError(',', COST_INPUT_RULES, true)).toBeNull();
    expect(numericInputError(',', COST_INPUT_RULES)).toContain('Completá el número');
  });
});
