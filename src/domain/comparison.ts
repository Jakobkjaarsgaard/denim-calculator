import {
  CONDITION_LABELS,
  DIMENSION_ORDER,
  DIMENSION_SPECS,
  PRIORITY_DIMENSIONS,
  SECONDARY_DIMENSIONS,
  SIMILAR_MEASUREMENT_THRESHOLD_CM,
  type CandidateListing,
  type DimensionKey,
  type MeasurementConvention,
  type ReferencePair,
  type StoredMeasurement,
  type Unit,
} from './types'
import { roundToOneDecimal } from './units'

export type ComparisonRowStatus =
  | 'confirmed_comparable'
  | 'indicative_unknown_method'
  | 'incompatible_method'
  | 'missing_candidate'
  | 'missing_reference'
  | 'missing_both'

export interface DimensionComparisonRow {
  dimension: DimensionKey
  label: string
  shortLabel: string
  isPriority: boolean
  isFlatWidth: boolean
  referenceMeasurement?: StoredMeasurement
  candidateMeasurement?: StoredMeasurement
  status: ComparisonRowStatus
  /** Raw delta (candidate - reference) in cm, when both measurements exist and method is not incompatible */
  rawDeltaCm?: number
  /** Rounded delta in cm (to 1 decimal, negative zero suppressed) */
  roundedDeltaCm?: number
  /** Absolute rounded delta in cm */
  absDeltaCm?: number
  /** True when absDeltaCm <= SIMILAR_MEASUREMENT_THRESHOLD_CM (0.5 cm) */
  isSimilar?: boolean
  /** Formatted signed delta string, e.g. "-3 cm", "+1.5 cm", "0 cm" */
  signedDeltaText: string
  /** Human-readable explanation in words, e.g. "3 cm narrower laid flat at the thigh" */
  explanationText: string
  /** Method status label for display */
  methodStatusLabel: string
}

export interface ThreeFieldScore {
  waistAbsDeltaCm: number
  thighAbsDeltaCm: number
  hemAbsDeltaCm: number
  totalAbsDeltaCm: number
}

export interface CandidateComparisonResult {
  candidateId: string
  candidateName: string
  rows: DimensionComparisonRow[]
  priorityRows: DimensionComparisonRow[]
  secondaryRows: DimensionComparisonRow[]
  leadSummary: string
  sellerQuestion: string
  needsSellerQuestion: boolean
  missingOrIncompatiblePriorityFields: DimensionKey[]
  conditionDiffers: boolean
  conditionNote?: string
  generalFitNote: string
  /** Present if and only if Reference and this Candidate share confirmed, comparable waist, thigh, and hem */
  threeFieldScore?: ThreeFieldScore
}

export interface RankedCandidateEntry {
  candidateId: string
  candidateName: string
  score: ThreeFieldScore
  rank: number
  isClosest: boolean
  isTiedForClosest: boolean
  secondaryRows: DimensionComparisonRow[]
}

export interface MultiCandidateRankingResult {
  /** True only when >= 2 candidates exist AND every candidate + reference have confirmed comparable waist, thigh, hem */
  isEligible: boolean
  basisLabel: string
  entries: RankedCandidateEntry[]
  closestIds: string[]
  closestNames: string[]
  isTie: boolean
  headline?: string
  /** Specific explanation of which measurements are needed when coverage is insufficient */
  ineligibleReason?: string
  missingDetails: string[]
}

export function isMethodComparable(convention: MeasurementConvention): boolean {
  return convention === 'standard' || convention === 'circumference_halved'
}

export function formatSignedCm(deltaCm: number): string {
  const rounded = roundToOneDecimal(deltaCm)
  if (rounded === 0) {
    return '0 cm'
  }
  return rounded > 0 ? `+${rounded} cm` : `${rounded} cm`
}

/**
 * Produces the plain-English description of a dimension delta in cm.
 */
export function describeDimensionDelta(
  dimension: DimensionKey,
  rawDeltaCm: number
): {
  roundedDeltaCm: number
  absDeltaCm: number
  isSimilar: boolean
  phrase: string
  shortSimilarPhrase: string
} {
  const roundedDeltaCm = roundToOneDecimal(rawDeltaCm)
  const absDeltaCm = roundToOneDecimal(Math.abs(rawDeltaCm))
  const isSimilar = absDeltaCm <= SIMILAR_MEASUREMENT_THRESHOLD_CM
  const spec = DIMENSION_SPECS[dimension]

  if (isSimilar) {
    const signed = formatSignedCm(roundedDeltaCm)
    return {
      roundedDeltaCm,
      absDeltaCm,
      isSimilar: true,
      phrase: `Similar measurement (${signed})`,
      shortSimilarPhrase: `${spec.shortLabel} similar`,
    }
  }

  if (dimension === 'frontRise') {
    const dir = roundedDeltaCm < 0 ? 'lower' : 'higher'
    return {
      roundedDeltaCm,
      absDeltaCm,
      isSimilar: false,
      phrase: `${absDeltaCm} cm ${dir} front rise`,
      shortSimilarPhrase: `${absDeltaCm} cm ${dir} front rise`,
    }
  }

  if (dimension === 'inseam') {
    const dir = roundedDeltaCm < 0 ? 'shorter' : 'longer'
    return {
      roundedDeltaCm,
      absDeltaCm,
      isSimilar: false,
      phrase: `${absDeltaCm} cm ${dir} inseam`,
      shortSimilarPhrase: `${absDeltaCm} cm ${dir} inseam`,
    }
  }

  // Flat width fields: waist, thigh, knee, hem
  const dir = roundedDeltaCm < 0 ? 'narrower' : 'wider'
  const locationMap: Record<'waist' | 'thigh' | 'knee' | 'hem', string> = {
    waist: 'at the waist',
    thigh: 'at the thigh',
    knee: 'at the knee',
    hem: 'at the hem',
  }
  const location = locationMap[dimension]
  return {
    roundedDeltaCm,
    absDeltaCm,
    isSimilar: false,
    phrase: `${absDeltaCm} cm ${dir} laid flat ${location}`,
    shortSimilarPhrase: `${absDeltaCm} cm ${dir} laid flat ${location}`,
  }
}

function getMethodStatusLabel(
  candidateMeasurement: StoredMeasurement | undefined
): string {
  if (!candidateMeasurement) {
    return 'Not supplied'
  }
  if (!candidateMeasurement.confirmed) {
    return 'Awaiting review confirmation'
  }
  if (candidateMeasurement.convention === 'circumference_halved') {
    return (
      candidateMeasurement.conversionNote ??
      'Halved from waistband circumference to flat width'
    )
  }
  if (candidateMeasurement.convention === 'standard') {
    return candidateMeasurement.conventionNote
      ? `Methods match (${candidateMeasurement.conventionNote})`
      : 'Methods match'
  }
  if (candidateMeasurement.convention === 'unknown') {
    return 'Method unconfirmed (“I don’t know”) — indicative only, excluded from ranking'
  }
  return candidateMeasurement.conventionNote
    ? `Incompatible method: ${candidateMeasurement.conventionNote}`
    : 'Incompatible measuring method — excluded from ranking'
}

function buildLeadSummary(
  rows: DimensionComparisonRow[],
  reference: ReferencePair
): string {
  const confirmedRows = rows.filter(
    (r) => r.status === 'confirmed_comparable' && r.absDeltaCm !== undefined
  )

  if (confirmedRows.length === 0) {
    const refHasAny = DIMENSION_ORDER.some((d) => Boolean(reference.measurements[d]))
    if (!refHasAny) {
      return 'No reference measurements entered yet. Next action: enter your favourite pair’s flat waist, thigh, and hem to start comparing.'
    }

    const missingPriority = PRIORITY_DIMENSIONS.filter((d) => {
      const row = rows.find((r) => r.dimension === d)
      return !row || row.status !== 'confirmed_comparable'
    }).map((d) => DIMENSION_SPECS[d].sellerMethodPhrase)

    if (missingPriority.length > 0) {
      return `No confirmed comparable measurements yet. Missing or unconfirmed priority fields: ${missingPriority.join('; ')}. Next action: ask the seller using the question below.`
    }

    return 'No overlapping confirmed measurements between your reference pair and this listing. Next action: add or confirm measurements.'
  }

  const similarRows = confirmedRows.filter((r) => r.isSimilar)
  const diffRows = confirmedRows
    .filter((r) => !r.isSimilar)
    .sort((a, b) => (b.absDeltaCm ?? 0) - (a.absDeltaCm ?? 0))

  if (diffRows.length === 0) {
    const names = similarRows.map((r) => r.shortLabel.toLowerCase()).join(', ')
    return `All confirmed measurements (${names}) are within the ${SIMILAR_MEASUREMENT_THRESHOLD_CM} cm similar measurement threshold.`
  }

  const parts: string[] = []
  if (similarRows.length > 0) {
    const similarNames = similarRows.map((r) =>
      r.dimension === 'waist' ? 'Waist' : r.shortLabel
    )
    if (similarNames.length === 1) {
      parts.push(`${similarNames[0]} similar.`)
    } else {
      parts.push(`${similarNames.join(' and ')} similar.`)
    }
  }

  // Check if top two flat-width differences share the exact same signed delta (e.g. Thigh and hem each 3 cm narrower laid flat)
  if (
    diffRows.length >= 2 &&
    diffRows[0].isFlatWidth &&
    diffRows[1].isFlatWidth &&
    diffRows[0].roundedDeltaCm === diffRows[1].roundedDeltaCm
  ) {
    const first = diffRows[0]
    const second = diffRows[1]
    const dir = (first.roundedDeltaCm ?? 0) < 0 ? 'narrower' : 'wider'
    const combined = `${first.shortLabel} and ${second.shortLabel.toLowerCase()} each ${first.absDeltaCm} cm ${dir} laid flat.`
    const rest = diffRows.slice(2).map((r) => `${r.explanationText}.`)
    parts.push(combined, ...rest)
  } else {
    const topPhrases = diffRows.slice(0, 3).map((r) => r.explanationText)
    parts.push(`${topPhrases.join('; ')}.`)
  }

  return parts.join(' ')
}

export function buildSellerQuestion(
  reference: ReferencePair,
  candidate: CandidateListing,
  rows: DimensionComparisonRow[],
  preferredUnit: Unit = 'cm'
): { question: string; needsQuestion: boolean; missingPriority: DimensionKey[] } {
  const unitName = preferredUnit === 'cm' ? 'cm' : 'inches'
  const missingPriority: DimensionKey[] = []
  const requestedPhrases: string[] = []

  // First check priority fields (waist, thigh, hem)
  for (const dim of PRIORITY_DIMENSIONS) {
    const row = rows.find((r) => r.dimension === dim)
    if (!row || row.status !== 'confirmed_comparable') {
      missingPriority.push(dim)
      requestedPhrases.push(DIMENSION_SPECS[dim].sellerMethodPhrase)
    }
  }

  // Also check secondary fields that the buyer measured on their reference pair
  for (const dim of SECONDARY_DIMENSIONS) {
    if (!reference.measurements[dim]) continue
    const row = rows.find((r) => r.dimension === dim)
    if (!row || row.status !== 'confirmed_comparable') {
      requestedPhrases.push(DIMENSION_SPECS[dim].sellerMethodPhrase)
    }
  }

  if (requestedPhrases.length === 0) {
    return {
      needsQuestion: false,
      missingPriority: [],
      question: `Hi! Before purchasing ${candidate.name || 'these jeans'}, could you confirm that the measurements were taken laid flat and unstretched (specifically thigh width measured 2.5 cm below the crotch seam), and let me know if they have been washed, soaked, or hemmed? Thank you!`,
    }
  }

  const question = `Hi! I'm interested in ${candidate.name || 'this pair'}. Could you please share the following measurements in ${unitName}: ${requestedPhrases.join('; ')}? Thank you!`

  return {
    needsQuestion: true,
    missingPriority,
    question,
  }
}

/**
 * Pure function to compare a single candidate listing against the buyer's reference pair.
 */
export function compareCandidate(
  reference: ReferencePair,
  candidate: CandidateListing,
  preferredUnit: Unit = 'cm'
): CandidateComparisonResult {
  const rows: DimensionComparisonRow[] = DIMENSION_ORDER.map((dimension) => {
    const spec = DIMENSION_SPECS[dimension]
    const refM = reference.measurements[dimension]
    const candM = candidate.measurements[dimension]
    const methodStatusLabel = getMethodStatusLabel(candM)

    if (!refM && !candM) {
      return {
        dimension,
        label: spec.label,
        shortLabel: spec.shortLabel,
        isPriority: spec.isPriority,
        isFlatWidth: spec.isFlatWidth,
        status: 'missing_both',
        signedDeltaText: '—',
        explanationText: `Not entered on reference or listing`,
        methodStatusLabel,
      }
    }

    if (!refM) {
      return {
        dimension,
        label: spec.label,
        shortLabel: spec.shortLabel,
        isPriority: spec.isPriority,
        isFlatWidth: spec.isFlatWidth,
        candidateMeasurement: candM,
        status: 'missing_reference',
        signedDeltaText: '—',
        explanationText: `Add ${spec.shortLabel.toLowerCase()} to your reference pair to compare`,
        methodStatusLabel,
      }
    }

    if (!candM || !candM.confirmed) {
      return {
        dimension,
        label: spec.label,
        shortLabel: spec.shortLabel,
        isPriority: spec.isPriority,
        isFlatWidth: spec.isFlatWidth,
        referenceMeasurement: refM,
        candidateMeasurement: candM,
        status: 'missing_candidate',
        signedDeltaText: 'Missing',
        explanationText: `Missing from listing — ask seller for ${spec.sellerMethodPhrase}`,
        methodStatusLabel,
      }
    }

    if (candM.convention === 'incompatible') {
      return {
        dimension,
        label: spec.label,
        shortLabel: spec.shortLabel,
        isPriority: spec.isPriority,
        isFlatWidth: spec.isFlatWidth,
        referenceMeasurement: refM,
        candidateMeasurement: candM,
        status: 'incompatible_method',
        signedDeltaText: 'Incompatible',
        explanationText: `Incompatible measuring method (${candM.conventionNote ?? 'different measuring location'}). Ask seller for ${spec.sellerMethodPhrase}.`,
        methodStatusLabel,
      }
    }

    const rawDeltaCm = candM.cm - refM.cm
    const { roundedDeltaCm, absDeltaCm, isSimilar, phrase } =
      describeDimensionDelta(dimension, rawDeltaCm)
    const signedDeltaText = formatSignedCm(roundedDeltaCm)

    if (candM.convention === 'unknown') {
      return {
        dimension,
        label: spec.label,
        shortLabel: spec.shortLabel,
        isPriority: spec.isPriority,
        isFlatWidth: spec.isFlatWidth,
        referenceMeasurement: refM,
        candidateMeasurement: candM,
        status: 'indicative_unknown_method',
        rawDeltaCm,
        roundedDeltaCm,
        absDeltaCm,
        isSimilar,
        signedDeltaText: `${signedDeltaText} (indicative)`,
        explanationText: `Indicative delta (method unconfirmed): ${phrase}`,
        methodStatusLabel,
      }
    }

    return {
      dimension,
      label: spec.label,
      shortLabel: spec.shortLabel,
      isPriority: spec.isPriority,
      isFlatWidth: spec.isFlatWidth,
      referenceMeasurement: refM,
      candidateMeasurement: candM,
      status: 'confirmed_comparable',
      rawDeltaCm,
      roundedDeltaCm,
      absDeltaCm,
      isSimilar,
      signedDeltaText,
      explanationText: phrase,
      methodStatusLabel,
    }
  })

  const priorityRows = rows.filter((r) => r.isPriority)
  const secondaryRows = rows.filter((r) => !r.isPriority)

  // Calculate Three-field score only if waist, thigh, and hem are all confirmed_comparable
  const waistRow = rows.find((r) => r.dimension === 'waist')
  const thighRow = rows.find((r) => r.dimension === 'thigh')
  const hemRow = rows.find((r) => r.dimension === 'hem')

  let threeFieldScore: ThreeFieldScore | undefined
  if (
    waistRow?.status === 'confirmed_comparable' &&
    thighRow?.status === 'confirmed_comparable' &&
    hemRow?.status === 'confirmed_comparable' &&
    waistRow.rawDeltaCm !== undefined &&
    thighRow.rawDeltaCm !== undefined &&
    hemRow.rawDeltaCm !== undefined
  ) {
    const waistAbsDeltaCm = roundToOneDecimal(Math.abs(waistRow.rawDeltaCm))
    const thighAbsDeltaCm = roundToOneDecimal(Math.abs(thighRow.rawDeltaCm))
    const hemAbsDeltaCm = roundToOneDecimal(Math.abs(hemRow.rawDeltaCm))
    const rawTotal =
      Math.abs(waistRow.rawDeltaCm) +
      Math.abs(thighRow.rawDeltaCm) +
      Math.abs(hemRow.rawDeltaCm)
    const totalAbsDeltaCm = roundToOneDecimal(rawTotal)

    threeFieldScore = {
      waistAbsDeltaCm,
      thighAbsDeltaCm,
      hemAbsDeltaCm,
      totalAbsDeltaCm,
    }
  }

  const leadSummary = buildLeadSummary(rows, reference)
  const { question, needsQuestion, missingPriority } = buildSellerQuestion(
    reference,
    candidate,
    rows,
    preferredUnit
  )

  const conditionDiffers =
    reference.condition !== 'unknown' &&
    candidate.condition !== 'unknown' &&
    reference.condition !== candidate.condition

  const conditionNote = conditionDiffers
    ? `Condition differs (${CONDITION_LABELS[candidate.condition]} vs your ${CONDITION_LABELS[reference.condition]} reference pair). Fabric stretch, wear, washing and measuring technique can change how a pair feels. Reported measurements are kept as supplied without predicting shrinkage percentages or guaranteeing fit.`
    : undefined

  const generalFitNote =
    'Fabric stretch, wear, washing and measuring technique can change how a pair feels. Measurements are compared as supplied without predicting shrinkage or guaranteeing fit.'

  return {
    candidateId: candidate.id,
    candidateName: candidate.name,
    rows,
    priorityRows,
    secondaryRows,
    leadSummary,
    sellerQuestion: question,
    needsSellerQuestion: needsQuestion,
    missingOrIncompatiblePriorityFields: missingPriority,
    conditionDiffers,
    conditionNote,
    generalFitNote,
    threeFieldScore,
  }
}

/**
 * Pure function to evaluate and rank multiple candidates across Flat waist, Thigh, and Hem.
 * Offers a "Closest measurements" result ONLY if every candidate and the reference share
 * confirmed, comparable flat waist, thigh, and hem.
 */
export function rankCandidates(
  reference: ReferencePair,
  candidates: CandidateListing[],
  preferredUnit: Unit = 'cm'
): MultiCandidateRankingResult {
  const basisLabel =
    'Equal-weighted sum of absolute differences across Flat waist, Thigh, and Hem (in cm, rounded to 0.1 cm). Front rise, Knee, and Inseam are shown separately.'

  if (candidates.length < 2) {
    return {
      isEligible: false,
      basisLabel,
      entries: [],
      closestIds: [],
      closestNames: [],
      isTie: false,
      ineligibleReason: 'Add at least two candidates to rank closest measurements across listings.',
      missingDetails: [],
    }
  }

  const missingDetails: string[] = []

  // Check reference pair coverage for waist, thigh, hem
  for (const dim of PRIORITY_DIMENSIONS) {
    if (!reference.measurements[dim]) {
      missingDetails.push(
        `Reference pair is missing ${DIMENSION_SPECS[dim].shortLabel.toLowerCase()}.`
      )
    }
  }

  const comparisons = candidates.map((c) =>
    compareCandidate(reference, c, preferredUnit)
  )

  for (const comp of comparisons) {
    for (const dim of PRIORITY_DIMENSIONS) {
      const row = comp.rows.find((r) => r.dimension === dim)
      if (!row || row.status !== 'confirmed_comparable') {
        missingDetails.push(
          `${comp.candidateName}: needs confirmed ${DIMENSION_SPECS[dim].sellerMethodPhrase}.`
        )
      }
    }
  }

  if (missingDetails.length > 0) {
    return {
      isEligible: false,
      basisLabel,
      entries: [],
      closestIds: [],
      closestNames: [],
      isTie: false,
      ineligibleReason:
        'Closest measurements ranking is unavailable until every candidate and your reference pair share confirmed, comparable Flat waist, Thigh, and Hem measurements.',
      missingDetails,
    }
  }

  // Every candidate has a valid threeFieldScore
  const scored = comparisons.map((comp) => ({
    comp,
    score: comp.threeFieldScore!,
  }))

  scored.sort((a, b) => a.score.totalAbsDeltaCm - b.score.totalAbsDeltaCm)

  const minTotal = scored[0].score.totalAbsDeltaCm
  const winners = scored.filter((s) => s.score.totalAbsDeltaCm === minTotal)
  const isTie = winners.length > 1

  const entries: RankedCandidateEntry[] = scored.map((item, idx) => {
    const isClosest = item.score.totalAbsDeltaCm === minTotal
    return {
      candidateId: item.comp.candidateId,
      candidateName: item.comp.candidateName,
      score: item.score,
      rank: isClosest ? 1 : idx + 1,
      isClosest,
      isTiedForClosest: isClosest && isTie,
      secondaryRows: item.comp.secondaryRows,
    }
  })

  const closestIds = winners.map((w) => w.comp.candidateId)
  const closestNames = winners.map((w) => w.comp.candidateName)

  const headline = isTie
    ? `Joint closest measurements (tie): ${closestNames.join(' & ')} — three-field total ${minTotal} cm`
    : `Closest measurements: ${closestNames[0]} — three-field total ${minTotal} cm`

  return {
    isEligible: true,
    basisLabel,
    entries,
    closestIds,
    closestNames,
    isTie,
    headline,
    missingDetails: [],
  }
}
