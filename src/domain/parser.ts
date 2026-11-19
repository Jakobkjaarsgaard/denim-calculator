import type {
  DimensionKey,
  MeasurementConvention,
  StoredMeasurement,
  Unit,
} from './types'
import { CM_PER_INCH, parseRawNumberString, roundToOneDecimal } from './units'

export type WaistConventionChoice = 'flat' | 'circumference' | 'unconfirmed'

export interface ParsedProposal {
  id: string
  dimension: DimensionKey
  sourceLine: string
  sourceClause: string
  /** Raw numeric string proposed (e.g. "8 1/2", "42", "84") */
  rawNumber: string
  /** Detected unit, or null if bare number */
  detectedUnit: Unit | null
  /** User-selected or pre-populated unit in review */
  selectedUnit: Unit | null
  /** True if the source text had a bare number without cm/in */
  needsUnitConfirmation: boolean
  /** True if waist label did not specify flat vs circumference */
  needsConventionConfirmation: boolean
  /** Selected waist convention in review */
  waistConvention: WaistConventionChoice
  /** True if the source line had a range like "31 - 32 cm" */
  isRange: boolean
  /** Options if range or multiple values in one clause */
  valueOptions?: string[]
  /** True if multiple clauses in the listing proposed values for this same dimension */
  hasDuplicateDimension: boolean
  /** True if a clause contained conflicting unit values (e.g. "42 cm / 17 in") */
  hasConflictingUnits: boolean
  conflictingUnitOptions?: Array<{ rawNumber: string; unit: Unit; label: string }>
  /** Initial detected measuring convention */
  convention: MeasurementConvention
  /** Whether the measuring location/method was explicitly stated in the text */
  methodExplicitlyStated: boolean
  /** Note explaining the detected convention or ambiguity */
  conventionNote?: string
  /** Whether this proposal is checked for import in the review form */
  selectedForImport: boolean
}

export interface IgnoredLineItem {
  sourceLine: string
  reason: string
}

export interface ListingParseResult {
  proposals: ParsedProposal[]
  ignoredItems: IgnoredLineItem[]
  hasMixedUnitsAcrossListing: boolean
}

// Noise & exclusion regexes
const PRICE_CLAUSE_REGEX =
  /(?:[€$£¥]\s*\d+|\b\d+(?:[.,]\d+)?\s*(?:€|\$|£|¥|eur|usd|gbp|jpy|cad|aud)\b|\b(?:asking|price|retail|rrp|shipping|postage|shipped|obo)\s*[:=-]?\s*[€$£¥]?\s*\d+)/i

const TAG_ONLY_CLAUSE_REGEX =
  /\b(?:tag(?:ged)?(?:\s*size)?|size\s*tag|jeans\s*size|body\s*waist|labelled\s*size)\b|\b(?:w\s*\d{2}\s*[/xX-]?\s*l\s*\d{2}|\bw\d{2}\b|\bl\d{2}\b|\b\d{2}\s*[xX]\s*\d{2}\b)/i

const FABRIC_OR_ID_REGEX =
  /\b(?:\d+(?:[.,]\d+)?\s*oz\b|\d+%\s*cotton\b|listing\s*id\b|item\s*(?:id|#)|lot\s*#?\d+|model\s*#?\d+)/i

const IGNORED_DIMENSION_REGEX =
  /\b(?:back\s*rise|rear\s*rise|outseam|outside\s*leg|total\s*length|hip(?:s)?|seat\s*width)\b/i

interface DimensionMatch {
  dimension: DimensionKey
  isExplicitCircumference?: boolean
  isExplicitFlatWaist?: boolean
  isAmbiguousWaist?: boolean
  methodExplicitlyStated: boolean
  convention: MeasurementConvention
  conventionNote?: string
}

function detectDimensionInClause(clause: string): DimensionMatch | null {
  const lower = clause.toLowerCase()

  // Ignore back rise, outseam, hips
  if (IGNORED_DIMENSION_REGEX.test(lower)) {
    return null
  }

  // 1. Check Waist
  // Make sure we don't match "tag waist" or "body waist"
  if (/\b(?:tag(?:ged)?\s*waist|body\s*waist)\b/i.test(lower)) {
    return null
  }

  const isExplicitCircumference =
    /\b(?:waist(?:band)?\s*circumference|circumference\s*(?:at\s*|of\s*)?waist(?:band)?|waist(?:band)?\s*\(?\s*(?:all\s*around|around|full\s*circumference|circumference|360)\s*\)?)\b/i.test(
      lower
    )
  if (isExplicitCircumference) {
    return {
      dimension: 'waist',
      isExplicitCircumference: true,
      methodExplicitlyStated: true,
      convention: 'circumference_halved',
      conventionNote: 'Explicit waistband circumference (halved to flat width)',
    }
  }

  const isExplicitFlatWaist =
    /\b(?:flat\s*waist|waist\s*(?:width\s*)?\(?\s*(?:laid\s*flat|flat|across|straight\s*across|aligned|half|1\/2)\s*\)?|half\s*waist|1\/2\s*waist|laid\s*flat\s*waist)\b/i.test(
      lower
    )
  if (isExplicitFlatWaist) {
    const isStretched = /\b(?:pulled\s*tight|stretched|max\s*stretch)\b/i.test(lower)
    return {
      dimension: 'waist',
      isExplicitFlatWaist: true,
      methodExplicitlyStated: true,
      convention: isStretched ? 'incompatible' : 'standard',
      conventionNote: isStretched
        ? 'Measured stretched (incompatible with unstretched flat waist)'
        : 'Flat waist laid flat',
    }
  }

  if (/\b(?:waist(?:band)?)\b/i.test(lower)) {
    return {
      dimension: 'waist',
      isAmbiguousWaist: true,
      methodExplicitlyStated: false,
      convention: 'unknown',
      conventionNote: 'Waist convention not specified (confirm flat width vs circumference)',
    }
  }

  // 2. Check Thigh
  if (
    /\b(?:upper\s*thigh|thigh(?:\s*width)?(?:\s*laid\s*flat|\s*flat)?|width\s*at\s*thigh|crotch\s*\/\s*thigh)\b/i.test(
      lower
    )
  ) {
    const isStandard25cm =
      /\b(?:2[.,]5\s*cm|1\s*(?:in(?:ch)?|"))\s*(?:below|down|under|from)\s*(?:the\s*)?crotch/i.test(
        lower
      )
    const isIncompatibleCrotch =
      /\b(?:at\s*(?:the\s*)?crotch|crotch\s*seam|0\s*cm|(?:5\s*cm|2\s*(?:in(?:ch(?:es)?)?|"))\s*(?:below|down|under|from)\s*(?:the\s*)?crotch)\b/i.test(
        lower
      )

    if (isIncompatibleCrotch) {
      return {
        dimension: 'thigh',
        methodExplicitlyStated: true,
        convention: 'incompatible',
        conventionNote:
          'Measured at crotch or different offset (incompatible with 2.5 cm below crotch)',
      }
    }
    if (isStandard25cm) {
      return {
        dimension: 'thigh',
        methodExplicitlyStated: true,
        convention: 'standard',
        conventionNote: 'Measured 2.5 cm below crotch seam',
      }
    }
    return {
      dimension: 'thigh',
      methodExplicitlyStated: false,
      convention: 'standard',
      conventionNote: 'Thigh measuring offset not specified',
    }
  }

  // 3. Check Front rise
  if (/\b(?:front\s*rise|rise\s*\(?\s*front\s*\)?|f\.?\s*rise|rise)\b/i.test(lower)) {
    return {
      dimension: 'frontRise',
      methodExplicitlyStated: /\bfront\s*rise\b/i.test(lower),
      convention: 'standard',
      conventionNote: /\bfront\s*rise\b/i.test(lower)
        ? 'Front rise'
        : 'Rise (confirm front rise to top of waistband)',
    }
  }

  // 4. Check Knee
  if (/\b(?:knee(?:\s*width)?(?:\s*laid\s*flat|\s*flat)?|width\s*at\s*knee)\b/i.test(lower)) {
    const isStandard33cm =
      /\b(?:33\s*cm|13\s*(?:in(?:ch(?:es)?)?|"))\s*(?:below|down|from)/i.test(lower)
    const isIncompatibleKnee =
      /\b(?:(?:25|28|30|35|38|40)\s*cm|(?:10|11|12|14|15)\s*(?:in(?:ch(?:es)?)?|"))\s*(?:below|down|from)/i.test(
        lower
      )
    if (isIncompatibleKnee) {
      return {
        dimension: 'knee',
        methodExplicitlyStated: true,
        convention: 'incompatible',
        conventionNote: 'Knee measured at non-standard distance from crotch (not 33 cm)',
      }
    }
    return {
      dimension: 'knee',
      methodExplicitlyStated: isStandard33cm,
      convention: 'standard',
      conventionNote: isStandard33cm
        ? 'Measured 33 cm down inseam from crotch'
        : 'Knee measuring distance not specified',
    }
  }

  // 5. Check Hem / leg opening
  if (
    /\b(?:hem(?:\s*width)?(?:\s*laid\s*flat|\s*flat)?|leg\s*opening(?:\s*width)?(?:\s*laid\s*flat|\s*flat)?|ankle\s*opening|bottom\s*opening|cuff\s*(?:width|opening))\b/i.test(
      lower
    )
  ) {
    return {
      dimension: 'hem',
      methodExplicitlyStated: true,
      convention: 'standard',
      conventionNote: 'Measured straight across leg opening',
    }
  }

  // 6. Check Inseam
  if (
    /\b(?:inseam(?:\s*length)?|inside\s*(?:leg|seam)|inleg|inner\s*(?:leg|seam))\b/i.test(
      lower
    )
  ) {
    return {
      dimension: 'inseam',
      methodExplicitlyStated: true,
      convention: 'standard',
      conventionNote: 'Inseam from crotch intersection to hem',
    }
  }

  return null
}

/**
 * Strips known method substrings like "2.5 cm below crotch" or "33 cm down" or "1/2 waist"
 * before extracting the actual dimension measurement value from a clause.
 */
function stripMethodNumbersFromClause(clause: string): string {
  return clause
    .replace(
      /\(?\s*(?:measured\s*)?(?:at\s*)?(?:2[.,]5\s*cm|5\s*cm|30\s*cm|33\s*cm|35\s*cm|1\s*(?:in(?:ch)?|")|2\s*(?:in(?:ch(?:es)?)?|")|12\s*(?:in(?:ch(?:es)?)?|")|13\s*(?:in(?:ch(?:es)?)?|"))\s*(?:below|down|under|from)\s*(?:the\s*)?(?:crotch|inseam)(?:\s*seam)?\s*\)?/gi,
      ' '
    )
    .replace(/\b1\/2\s*waist\b/gi, 'flat waist')
}

interface ExtractedNumberToken {
  rawNumber: string
  unit: Unit | null
}

const NUMBER_WITH_OPTIONAL_UNIT_REGEX =
  /(\d+\s+\d+\/\d+|\d+-\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(cm|centimet(?:er|re)s?|cms|in(?:ch(?:es)?)?|ins|"|”|″)?/gi

function parseUnitToken(unitStr: string | undefined): Unit | null {
  if (!unitStr) return null
  const lower = unitStr.toLowerCase()
  if (lower.startsWith('cm') || lower.startsWith('centimet')) {
    return 'cm'
  }
  if (lower.startsWith('in') || lower === '"' || lower === '”' || lower === '″') {
    return 'in'
  }
  return null
}

function extractNumbersFromClause(cleanedClause: string): {
  tokens: ExtractedNumberToken[]
  isRange: boolean
} {
  // Check for explicit range pattern e.g. "31 - 32 cm" or "8 1/4 to 8 1/2 in"
  const rangeRegex =
    /(\d+\s+\d+\/\d+|\d+(?:[.,]\d+)?)\s*(cm|in(?:ch(?:es)?)?|")?\s*(?:-|–|—|~|\bto\b)\s*(\d+\s+\d+\/\d+|\d+(?:[.,]\d+)?)\s*(cm|in(?:ch(?:es)?)?|")?/i
  const rangeMatch = cleanedClause.match(rangeRegex)
  if (rangeMatch) {
    const firstNum = rangeMatch[1].trim()
    const firstUnit = parseUnitToken(rangeMatch[2])
    const secondNum = rangeMatch[3].trim()
    const secondUnit = parseUnitToken(rangeMatch[4])
    const sharedUnit = firstUnit ?? secondUnit
    return {
      isRange: true,
      tokens: [
        { rawNumber: firstNum, unit: firstUnit ?? sharedUnit },
        { rawNumber: secondNum, unit: secondUnit ?? sharedUnit },
      ],
    }
  }

  const tokens: ExtractedNumberToken[] = []
  for (const match of cleanedClause.matchAll(NUMBER_WITH_OPTIONAL_UNIT_REGEX)) {
    const rawNum = match[1].trim()
    const unit = parseUnitToken(match[2])
    const parsed = parseRawNumberString(rawNum)
    if (parsed.ok) {
      tokens.push({ rawNumber: rawNum, unit })
    }
  }

  return { tokens, isRange: false }
}

/**
 * Splits a single line into logical clauses while preserving decimal commas (e.g. "41,5 cm").
 */
function splitLineIntoClauses(line: string): string[] {
  return line
    .split(/[;|•]|,(?=\s*[a-zA-Z€$£¥])/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Pure function to parse listing text (or OCR text) into review proposals and ignored items.
 */
export function parseListingText(text: string): ListingParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const proposals: ParsedProposal[] = []
  const ignoredItems: IgnoredLineItem[] = []
  let proposalCounter = 0

  for (const line of lines) {
    const clauses = splitLineIntoClauses(line)

    for (const clause of clauses) {
      // Check if clause is purely price
      if (PRICE_CLAUSE_REGEX.test(clause) && !detectDimensionInClause(clause)) {
        ignoredItems.push({
          sourceLine: clause,
          reason: 'Ignored price / currency value',
        })
        continue
      }

      // Check if clause has a dimension label
      const dimMatch = detectDimensionInClause(clause)

      if (!dimMatch) {
        if (TAG_ONLY_CLAUSE_REGEX.test(clause)) {
          ignoredItems.push({
            sourceLine: clause,
            reason:
              'Ignored tagged size / body waist (never inferred as a garment measurement)',
          })
        } else if (FABRIC_OR_ID_REGEX.test(clause)) {
          ignoredItems.push({
            sourceLine: clause,
            reason: 'Ignored fabric weight, composition, or listing ID',
          })
        } else if (/\d/.test(clause)) {
          ignoredItems.push({
            sourceLine: clause,
            reason: 'Ignored unlabelled number',
          })
        }
        continue
      }

      // If clause mentions a tag size like "Waist tag W32" without a flat measurement
      if (
        dimMatch.dimension === 'waist' &&
        /\bw\s*\d{2}\b/i.test(clause) &&
        !dimMatch.isExplicitFlatWaist &&
        !dimMatch.isExplicitCircumference
      ) {
        ignoredItems.push({
          sourceLine: clause,
          reason: 'Ignored tagged waist size',
        })
        continue
      }

      const cleanedClause = stripMethodNumbersFromClause(clause)
      const { tokens, isRange } = extractNumbersFromClause(cleanedClause)

      if (tokens.length === 0) {
        continue
      }

      proposalCounter += 1
      const id = `prop-${proposalCounter}`

      // Check for conflicting units or range within the same clause
      const distinctUnits = new Set(
        tokens.map((t) => t.unit).filter((u): u is Unit => u !== null)
      )
      const hasConflictingUnits = distinctUnits.size > 1
      const hasMultipleNumbersInClause = tokens.length > 1

      const primaryToken = tokens[0]
      let rawNumber = primaryToken.rawNumber
      const detectedUnit = primaryToken.unit
      let convention = dimMatch.convention
      let conventionNote = dimMatch.conventionNote
      let needsConventionConfirmation = Boolean(dimMatch.isAmbiguousWaist)
      let waistConvention: WaistConventionChoice = dimMatch.isExplicitCircumference
        ? 'circumference'
        : dimMatch.isExplicitFlatWaist
          ? 'flat'
          : 'unconfirmed'

      // If explicit waist circumference with known number, we still keep rawNumber as the circumference
      // and waistConvention = 'circumference' so conversion halves it to flat width with a visible note!
      if (dimMatch.isExplicitCircumference) {
        needsConventionConfirmation = false
        waistConvention = 'circumference'
        convention = 'circumference_halved'
        const parsed = parseRawNumberString(rawNumber)
        if (parsed.ok && detectedUnit) {
          const halved = roundToOneDecimal(parsed.value / 2)
          const flatCm = roundToOneDecimal(
            (parsed.value / 2) * (detectedUnit === 'in' ? CM_PER_INCH : 1)
          )
          conventionNote = `Halved from ${rawNumber} ${detectedUnit} waistband circumference to ${halved} ${detectedUnit} (${flatCm} cm) flat width`
        }
      }

      const needsUnitConfirmation = detectedUnit === null

      const conflictingUnitOptions = hasConflictingUnits
        ? tokens
            .filter((t): t is { rawNumber: string; unit: Unit } => t.unit !== null)
            .map((t) => ({
              rawNumber: t.rawNumber,
              unit: t.unit,
              label: `${t.rawNumber} ${t.unit}`,
            }))
        : undefined

      const valueOptions =
        isRange || (hasMultipleNumbersInClause && !hasConflictingUnits)
          ? tokens.map((t) => t.rawNumber)
          : undefined

      if (isRange) {
        rawNumber = '' // Force buyer to pick one of the range values or enter manually
      }

      proposals.push({
        id,
        dimension: dimMatch.dimension,
        sourceLine: line,
        sourceClause: clause,
        rawNumber,
        detectedUnit,
        selectedUnit: detectedUnit,
        needsUnitConfirmation,
        needsConventionConfirmation,
        waistConvention,
        isRange: isRange || (hasMultipleNumbersInClause && !hasConflictingUnits),
        valueOptions,
        hasDuplicateDimension: false,
        hasConflictingUnits,
        conflictingUnitOptions,
        convention,
        methodExplicitlyStated: dimMatch.methodExplicitlyStated,
        conventionNote,
        selectedForImport: true,
      })
    }
  }

  // Detect duplicate proposals for the same dimension
  const countsByDimension = new Map<DimensionKey, number>()
  for (const p of proposals) {
    countsByDimension.set(p.dimension, (countsByDimension.get(p.dimension) ?? 0) + 1)
  }
  for (const p of proposals) {
    if ((countsByDimension.get(p.dimension) ?? 0) > 1) {
      p.hasDuplicateDimension = true
      p.selectedForImport = false // Buyer must explicitly choose which one to import
    }
  }

  // Check if listing mixes cm and in across proposals
  const allDetectedUnits = new Set(
    proposals
      .map((p) => p.detectedUnit)
      .filter((u): u is Unit => u !== null)
  )
  const hasMixedUnitsAcrossListing = allDetectedUnits.size > 1

  return {
    proposals,
    ignoredItems,
    hasMixedUnitsAcrossListing,
  }
}

/**
 * Checks if a parsed proposal has all ambiguities resolved and can be converted to a StoredMeasurement.
 */
export function resolveProposalToMeasurement(
  proposal: ParsedProposal
): { ok: true; measurement: StoredMeasurement } | { ok: false; error: string } {
  if (!proposal.rawNumber.trim()) {
    return {
      ok: false,
      error: 'Select or enter a measurement value for this field.',
    }
  }
  if (!proposal.selectedUnit) {
    return {
      ok: false,
      error: 'Confirm the unit (cm or in) for this bare number before applying.',
    }
  }
  if (
    proposal.dimension === 'waist' &&
    proposal.needsConventionConfirmation &&
    proposal.waistConvention === 'unconfirmed'
  ) {
    return {
      ok: false,
      error:
        'Confirm whether this waist number is a flat width (laid flat) or a full waistband circumference.',
    }
  }

  const parsed = parseRawNumberString(proposal.rawNumber)
  if (!parsed.ok) {
    return { ok: false, error: parsed.reason }
  }

  const shouldHalve =
    proposal.dimension === 'waist' && proposal.waistConvention === 'circumference'
  const effectiveValueInUnit = shouldHalve ? parsed.value / 2 : parsed.value
  const cm =
    proposal.selectedUnit === 'in'
      ? effectiveValueInUnit * CM_PER_INCH
      : effectiveValueInUnit

  const convention: MeasurementConvention = shouldHalve
    ? 'circumference_halved'
    : proposal.convention === 'unknown' &&
        proposal.dimension === 'waist' &&
        proposal.waistConvention === 'flat'
      ? 'standard'
      : proposal.convention

  const conversionNote = shouldHalve
    ? `Halved from ${proposal.rawNumber.trim()} ${proposal.selectedUnit} waistband circumference to ${roundToOneDecimal(effectiveValueInUnit)} ${proposal.selectedUnit} (${roundToOneDecimal(cm)} cm) flat width`
    : undefined

  return {
    ok: true,
    measurement: {
      cm,
      rawInput: shouldHalve
        ? String(roundToOneDecimal(effectiveValueInUnit))
        : proposal.rawNumber.trim(),
      enteredUnit: proposal.selectedUnit,
      convention,
      conventionNote: proposal.conventionNote,
      conversionNote,
      confirmed: true,
    },
  }
}
