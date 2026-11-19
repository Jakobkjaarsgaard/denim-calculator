import type {
  MeasurementConvention,
  StoredMeasurement,
  Unit,
} from './types'

export const CM_PER_INCH = 2.54

/**
 * Rounds a number to one decimal place and suppresses negative zero (-0 -> 0).
 */
export function roundToOneDecimal(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10
  return Object.is(rounded, -0) || rounded === 0 ? 0 : rounded
}

export type ParseInputResult =
  | { kind: 'blank' }
  | {
      kind: 'valid'
      numericValue: number
      cm: number
      rawInput: string
      enteredUnit: Unit
      convention: MeasurementConvention
      conversionNote?: string
    }
  | {
      kind: 'error'
      error: string
    }

const TAG_SIZE_PATTERN =
  /^(?:tag(?:ged)?\s*)?(?:size\s*)?(?:w\s*\d{2}(?:\s*[/xX-]?\s*l?\s*\d{2})?|l\s*\d{2}|\d{2}\s*[xX/]\s*\d{2})$/i
const BODY_OR_TAG_KEYWORD = /\b(?:tag(?:ged)?|body\s*waist|jeans\s*size|w\d{2}|l\d{2})\b/i

/**
 * Parses a numeric string that may be an integer, decimal (dot or comma),
 * or ordinary fraction (e.g. "12 1/2", "8 1/2", "3/4").
 */
export function parseRawNumberString(
  input: string
): { ok: true; value: number } | { ok: false; reason: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, reason: 'Empty value.' }
  }

  if (TAG_SIZE_PATTERN.test(trimmed) || BODY_OR_TAG_KEYWORD.test(trimmed)) {
    return {
      ok: false,
      reason:
        'Tagged sizes (like W32), body waist, and garment waist are distinct. Never infer a garment measurement from a tag—measure the garment laid flat.',
    }
  }

  if (/^(?:nan|inf(?:inity)?|-inf(?:inity)?)$/i.test(trimmed)) {
    return {
      ok: false,
      reason: 'Enter a finite positive measurement number.',
    }
  }

  // Check for negative sign first
  if (trimmed.startsWith('-')) {
    return {
      ok: false,
      reason: 'Measurement cannot be negative. Enter a positive flat garment measurement.',
    }
  }

  // Check for mixed fraction: e.g. "12 1/2" or "12-1/2"
  const mixedFractionMatch = trimmed.match(/^(\d+)(?:\s+|-)(\d+)\s*\/\s*(\d+)$/)
  if (mixedFractionMatch) {
    const whole = Number(mixedFractionMatch[1])
    const numerator = Number(mixedFractionMatch[2])
    const denominator = Number(mixedFractionMatch[3])
    if (!Number.isFinite(whole) || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
      return { ok: false, reason: 'Malformed fraction measurement.' }
    }
    if (denominator <= 0) {
      return { ok: false, reason: 'Fraction denominator must be greater than zero.' }
    }
    const value = whole + numerator / denominator
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, reason: 'Measurement must be greater than zero.' }
    }
    return { ok: true, value }
  }

  // Check for simple fraction: e.g. "1/2" or "3/4"
  const simpleFractionMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (simpleFractionMatch) {
    const numerator = Number(simpleFractionMatch[1])
    const denominator = Number(simpleFractionMatch[2])
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
      return { ok: false, reason: 'Malformed fraction measurement.' }
    }
    if (denominator <= 0) {
      return { ok: false, reason: 'Fraction denominator must be greater than zero.' }
    }
    const value = numerator / denominator
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, reason: 'Measurement must be greater than zero.' }
    }
    return { ok: true, value }
  }

  // If contains slash but didn't match valid fraction format
  if (trimmed.includes('/')) {
    return {
      ok: false,
      reason: 'Malformed fraction. Use an ordinary fraction like "12 1/2" or a decimal like "12.5".',
    }
  }

  // Standard integer or decimal (supporting decimal comma or decimal point, but not multiple separators)
  if (!/^\d+(?:[.,]\d+)?$/.test(trimmed)) {
    return {
      ok: false,
      reason:
        'Enter a valid positive number (e.g. 42, 41.5, 41,5, or 12 1/2). Letters and malformed symbols are not allowed.',
    }
  }

  const normalized = trimmed.replace(',', '.')
  const numericValue = Number(normalized)

  if (!Number.isFinite(numericValue)) {
    return {
      ok: false,
      reason: 'Measurement must be a finite number.',
    }
  }

  if (numericValue <= 0) {
    return {
      ok: false,
      reason: 'Measurement must be greater than zero.',
    }
  }

  return { ok: true, value: numericValue }
}

export interface ParseMeasurementOptions {
  halveCircumference?: boolean
  convention?: MeasurementConvention
  conventionNote?: string
}

/**
 * Validates and converts a raw measurement string into canonical centimetres (converted once using 1 in = 2.54 cm).
 */
export function parseMeasurementInput(
  raw: string,
  unit: Unit,
  options: ParseMeasurementOptions = {}
): ParseInputResult {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { kind: 'blank' }
  }

  const parsed = parseRawNumberString(trimmed)
  if (!parsed.ok) {
    return { kind: 'error', error: parsed.reason }
  }

  const rawValue = parsed.value
  const shouldHalve = Boolean(options.halveCircumference)
  const effectiveValueInUnit = shouldHalve ? rawValue / 2 : rawValue
  const cm =
    unit === 'in' ? effectiveValueInUnit * CM_PER_INCH : effectiveValueInUnit

  const convention: MeasurementConvention = shouldHalve
    ? 'circumference_halved'
    : (options.convention ?? 'standard')

  const conversionNote = shouldHalve
    ? `Halved from ${trimmed} ${unit} waistband circumference to ${roundToOneDecimal(effectiveValueInUnit)} ${unit} (${roundToOneDecimal(cm)} cm) flat width`
    : undefined

  return {
    kind: 'valid',
    numericValue: effectiveValueInUnit,
    cm,
    rawInput: trimmed,
    enteredUnit: unit,
    convention,
    conversionNote,
  }
}

/**
 * Creates a StoredMeasurement directly from a validated input.
 */
export function createStoredMeasurement(
  raw: string,
  unit: Unit,
  options: ParseMeasurementOptions & { confirmed?: boolean } = {}
): StoredMeasurement | null {
  const result = parseMeasurementInput(raw, unit, options)
  if (result.kind !== 'valid') {
    return null
  }
  return {
    cm: result.cm,
    rawInput: result.rawInput,
    enteredUnit: result.enteredUnit,
    convention: result.convention,
    conventionNote: options.conventionNote,
    conversionNote: result.conversionNote,
    confirmed: options.confirmed ?? true,
  }
}

/**
 * Formats a stored measurement for read-only display in the requested display unit.
 * Never mutates the stored measurement.
 */
export function formatStoredMeasurement(
  measurement: StoredMeasurement | undefined,
  displayUnit: Unit
): string {
  if (!measurement) {
    return '—'
  }
  if (displayUnit === 'cm') {
    return `${roundToOneDecimal(measurement.cm)} cm`
  }
  const inches = roundToOneDecimal(measurement.cm / CM_PER_INCH)
  const cmText = `${roundToOneDecimal(measurement.cm)} cm`
  return `${inches} in (${cmText})`
}

/**
 * Formats an input box display value when the user toggles display units.
 * If the displayUnit matches the original enteredUnit (and it wasn't halved from circumference),
 * returns the original rawInput so fractions ("8 1/2") and decimal commas ("41,5") remain intact.
 * Never mutates the stored canonical cm.
 */
export function getDisplayInputString(
  measurement: StoredMeasurement | undefined,
  displayUnit: Unit
): string {
  if (!measurement) {
    return ''
  }
  if (
    measurement.enteredUnit === displayUnit &&
    measurement.convention !== 'circumference_halved'
  ) {
    return measurement.rawInput
  }
  if (displayUnit === 'cm') {
    return String(roundToOneDecimal(measurement.cm))
  }
  return String(roundToOneDecimal(measurement.cm / CM_PER_INCH))
}
