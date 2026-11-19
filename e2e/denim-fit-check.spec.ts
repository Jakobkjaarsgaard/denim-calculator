import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { SYNTHETIC_OCR_LISTING_TEXT } from '../src/domain/fixtures'

const FIXTURES_DIR = path.resolve('/home/antigravity/e2e/fixtures')
const LEGIBLE_PNG_PATH = path.join(FIXTURES_DIR, 'synthetic-listing.png')
const UNREADABLE_PNG_PATH = path.join(FIXTURES_DIR, 'unreadable-photo.png')
const SYNTHETIC_TXT_PATH = path.join(FIXTURES_DIR, 'synthetic-listing.txt')

test.describe('Denim Fit Check — End-to-End Browser Verification (390px iPhone viewport)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => window.localStorage.clear())
    await page.reload()
  })

  test('Fixtures 1, 2 & 3: Example vertical slice, multi-candidate ranking, live edits, and missing/incompatible thigh', async ({
    page,
  }) => {
    // Home offers "Compare my jeans" and "Try an example" and shows sample result immediately
    await expect(page.getByTestId('home-sample-result')).toBeVisible()
    await expect(page.getByTestId('btn-compare-my-jeans')).toBeVisible()
    await expect(page.getByTestId('btn-try-example')).toBeVisible()

    // Load Example (Fixture 1: Ref 42, 34, 24 cm; A = 42, 31, 21 cm)
    await page.getByTestId('btn-try-example').click()
    await expect(page.getByTestId('example-mode-banner')).toBeVisible()

    const summaryA = page.getByTestId('lead-summary-example-candidate-a')
    await expect(summaryA).toContainText('Waist similar.')
    await expect(summaryA).toContainText(
      'Thigh and hem each 3 cm narrower laid flat.'
    )
    await expect(
      page.getByTestId('three-field-total-example-candidate-a')
    ).toContainText('Three-field total: 6 cm')

    // Step 1 vertical slice check: edit Candidate A's thigh measurement and see conclusion update immediately
    const thighInput = page.getByTestId('cand-input-thigh')
    await thighInput.fill('34')
    await expect(
      page.getByTestId('three-field-total-example-candidate-a')
    ).toContainText('Three-field total: 3 cm')

    // Restore Candidate A's thigh to 31 cm
    await thighInput.fill('31')
    await expect(
      page.getByTestId('three-field-total-example-candidate-a')
    ).toContainText('Three-field total: 6 cm')

    // Fixture 2: Add B = 41.5, 33.5, 24 cm -> B is closest on the three stated fields, total 1 cm
    await page.getByTestId('btn-add-example-b').click()
    const rankingPanel = page.getByTestId('closest-measurements-panel')
    await expect(rankingPanel).toBeVisible()
    await expect(page.getByTestId('ranking-headline')).toContainText(
      'Closest measurements: Candidate B — three-field total 1 cm'
    )
    await expect(
      page.getByTestId('ranking-total-example-candidate-b')
    ).toHaveText('1 cm')

    // Edit B's hem to 17 cm -> changes its total to 8 cm and makes A closest
    const hemInputB = page.getByTestId('cand-input-hem')
    await hemInputB.fill('17')
    await expect(
      page.getByTestId('ranking-total-example-candidate-b')
    ).toHaveText('8 cm')
    await expect(page.getByTestId('ranking-headline')).toContainText(
      'Closest measurements: Candidate A — three-field total 6 cm'
    )

    // Fixture 3a: Mark B's thigh as measured at the crotch -> Ranking disappears, asks for thigh 2.5 cm below crotch
    await page.getByTestId('cand-method-thigh').selectOption('incompatible')
    await expect(page.getByTestId('closest-measurements-panel')).toHaveCount(0)
    await expect(page.getByTestId('ranking-unavailable-panel')).toBeVisible()
    await expect(page.getByTestId('ranking-unavailable-panel')).toContainText(
      'thigh width measured 2.5 cm below the crotch'
    )
    await expect(
      page.getByTestId('seller-question-textarea-example-candidate-b')
    ).toHaveValue(/thigh width measured 2\.5 cm below the crotch/i)

    // Fixture 3b: Restore method to standard, then remove B's thigh (blank is never treated as zero)
    await page.getByTestId('cand-method-thigh').selectOption('standard')
    await expect(page.getByTestId('closest-measurements-panel')).toBeVisible()
    await page.getByTestId('cand-input-thigh').fill('')
    await expect(page.getByTestId('closest-measurements-panel')).toHaveCount(0)
    await expect(page.getByTestId('ranking-unavailable-panel')).toContainText(
      'thigh width measured 2.5 cm below the crotch'
    )
  })

  test('Fixtures 4 & 5: Paste listing text parser — W32/€95/hem 8 1/2 in, explicit 84 cm circumference vs ambiguous waist 84', async ({
    page,
  }) => {
    // Fixture 4: "Tagged W32 L32, asking €95, hem 8 1/2 in."
    await page
      .getByTestId('paste-listing-textarea')
      .fill('Tagged W32 L32, asking €95, hem 8 1/2 in.')
    await page.getByTestId('btn-parse-listing-text').click()

    const reviewForm = page.getByTestId('import-review-form')
    await expect(reviewForm).toBeVisible()

    // Only hem is proposed; waist and inseam are NOT proposed
    await expect(page.getByTestId('review-checkbox-hem')).toBeVisible()
    await expect(page.getByTestId('review-checkbox-waist')).toHaveCount(0)
    await expect(page.getByTestId('review-checkbox-inseam')).toHaveCount(0)

    // Internally 21.59 cm, display 21.6 cm
    await expect(page.getByTestId('review-resolved-preview-hem')).toContainText(
      '21.6 cm'
    )
    await expect(page.getByTestId('review-resolved-preview-hem')).toContainText(
      '21.59 cm'
    )

    // Apply reviewed measurement
    await page.getByTestId('btn-apply-review').click()
    await expect(page.getByTestId('cand-stored-summary-hem')).toContainText(
      '21.6 cm'
    )
    await expect(page.getByTestId('cand-input-waist')).toHaveValue('')
    await expect(page.getByTestId('cand-input-inseam')).toHaveValue('')

    // Fixture 5a: Explicit "84 cm waistband circumference" -> gives 42 cm flat with conversion note
    await page
      .getByTestId('paste-listing-textarea')
      .fill('84 cm waistband circumference')
    await page.getByTestId('btn-parse-listing-text').click()
    await expect(
      page.getByTestId('review-resolved-preview-waist')
    ).toContainText('42 cm')
    await expect(
      page.getByTestId('review-resolved-preview-waist')
    ).toContainText('Halved from 84 cm waistband circumference')
    await page.getByTestId('btn-apply-review').click()
    await expect(page.getByTestId('cand-input-waist')).toHaveValue('42')
    await expect(
      page.getByTestId('cand-conversion-note-waist')
    ).toContainText('Halved from 84 cm waistband circumference')

    // Fixture 5b: Ambiguous "waist 84" -> needs unit and convention confirmation
    await page.getByTestId('paste-listing-textarea').fill('waist 84')
    await page.getByTestId('btn-parse-listing-text').click()
    const waistCheck = page.getByTestId('review-checkbox-waist')
    await waistCheck.check()

    await expect(
      page.getByTestId('review-unresolved-warning-waist')
    ).toContainText('Confirm the unit')
    await page.getByTestId('btn-apply-review').click()
    await expect(page.getByTestId('review-apply-error')).toContainText(
      'Confirm the unit'
    )

    // Select unit 'cm' -> now requires waist convention confirmation
    await page.getByTestId('review-unit-select-waist').selectOption('cm')
    await expect(
      page.getByTestId('review-unresolved-warning-waist')
    ).toContainText('Confirm whether this waist number is a flat width')

    // Select circumference convention -> resolves to 42 cm
    await page
      .getByTestId('review-waist-convention-select')
      .selectOption('circumference')
    await expect(
      page.getByTestId('review-resolved-preview-waist')
    ).toContainText('42 cm')
    await page.getByTestId('btn-apply-review').click()
    await expect(page.getByTestId('import-review-form')).toHaveCount(0)
  })

  test('Fixture 6 & Mobile layout: Two identical candidates, mixed units, decimal comma, repeated unit toggling, no horizontal scroll at 390px', async ({
    page,
  }) => {
    // Enter reference pair: 42, 34, 24 cm
    await page.getByTestId('ref-input-waist').fill('42')
    await page.getByTestId('ref-input-thigh').fill('34')
    await page.getByTestId('ref-input-hem').fill('24')

    // Enter Candidate A with decimal commas in cm and hem 21.59 cm
    await page.getByTestId('cand-input-waist').fill('41,5')
    await page.getByTestId('cand-input-thigh').fill('33,5')
    await page.getByTestId('cand-input-hem').fill('21,59')

    // Add Candidate B: waist 41.5 cm, thigh 33.5 cm, hem 8 1/2 in
    await page.getByTestId('btn-add-candidate').click()
    await page.getByTestId('cand-input-waist').fill('41.5')
    await page.getByTestId('cand-input-thigh').fill('33.5')

    // Switch to inches to enter 8 1/2 in for Candidate B's hem
    await page.getByTestId('unit-toggle-in').click()
    await page.getByTestId('cand-input-hem').fill('8 1/2')

    // Toggle units cm <-> in repeatedly
    for (let i = 0; i < 4; i += 1) {
      await page.getByTestId('unit-toggle-cm').click()
      await expect(page.getByTestId('cand-input-hem')).toHaveValue('21.6')
      await page.getByTestId('unit-toggle-in').click()
      await expect(page.getByTestId('cand-input-hem')).toHaveValue('8 1/2')
    }
    await page.getByTestId('unit-toggle-cm').click()

    // Ties are visible and converted values remain stable
    await expect(page.getByTestId('closest-measurements-panel')).toBeVisible()
    await expect(page.getByTestId('ranking-headline')).toContainText(
      'Joint closest measurements (tie)'
    )

    // Verify zero horizontal page scrolling at 390px iPhone viewport width
    const hasHorizontalOverflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      )
    })
    expect(hasHorizontalOverflow).toBe(false)
  })

  test('Fixture 7: Screenshot file upload & local OCR — legible PNG file, unreadable PNG file, cancel during OCR, manual edits protected', async ({
    page,
  }) => {
    // Generate synthetic PNG fixture files on disk from original synthetic listing text
    fs.mkdirSync(FIXTURES_DIR, { recursive: true })
    fs.writeFileSync(SYNTHETIC_TXT_PATH, SYNTHETIC_OCR_LISTING_TEXT, 'utf-8')

    const { legibleBase64, unreadableBase64 } = await page.evaluate(
      (listingText) => {
        const makeLegible = (text: string) => {
          const canvas = document.createElement('canvas')
          const lines = text.split(/\r?\n/)
          canvas.width = 760
          canvas.height = Math.max(320, 96 + lines.length * 44)
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#000000'
          ctx.font = 'bold 26px Arial, Helvetica, sans-serif'
          ctx.textBaseline = 'top'
          lines.forEach((l, idx) => ctx.fillText(l, 48, 48 + idx * 44))
          return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
        }

        const makeUnreadable = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 400
          canvas.height = 300
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = '#1E2F46'
          ctx.fillRect(0, 0, 400, 300)
          ctx.strokeStyle = '#D99B4E'
          ctx.lineWidth = 3
          ctx.strokeRect(120, 60, 160, 180)
          return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
        }

        return {
          legibleBase64: makeLegible(listingText),
          unreadableBase64: makeUnreadable(),
        }
      },
      SYNTHETIC_OCR_LISTING_TEXT
    )

    fs.writeFileSync(LEGIBLE_PNG_PATH, Buffer.from(legibleBase64, 'base64'))
    fs.writeFileSync(UNREADABLE_PNG_PATH, Buffer.from(unreadableBase64, 'base64'))

    // Enter a manual waist measurement first (43 cm) to verify OCR does not overwrite manual edits
    await page.getByTestId('cand-input-waist').fill('43')
    await expect(page.getByTestId('cand-stored-summary-waist')).toContainText(
      '43 cm'
    )

    // 1. Upload legible synthetic PNG file via <input type="file"> and run browser-local OCR
    await page
      .getByTestId('screenshot-file-input')
      .setInputFiles(LEGIBLE_PNG_PATH)
    await expect(page.getByTestId('screenshot-preview-img')).toBeVisible()
    await page.getByTestId('btn-run-ocr').click()

    // Wait for local Tesseract.js OCR to populate the review form
    const reviewForm = page.getByTestId('import-review-form')
    await expect(reviewForm).toBeVisible({ timeout: 30_000 })

    // Verify manual waist edit is protected (unchecked by default with badge)
    await expect(
      page.getByTestId('review-protected-badge-waist')
    ).toBeVisible()
    await expect(page.getByTestId('review-checkbox-waist')).not.toBeChecked()

    // Apply OCR review -> manual waist (43 cm) is preserved while OCR thigh/hem are applied!
    await page.getByTestId('btn-apply-review').click()
    await expect(page.getByTestId('cand-input-waist')).toHaveValue('43')
    await expect(page.getByTestId('cand-stored-summary-hem')).toContainText(
      '24 cm'
    )

    // 2. Cancel during OCR leaves manual entry and earlier edits usable
    await page
      .getByTestId('screenshot-file-input')
      .setInputFiles(LEGIBLE_PNG_PATH)
    await page.getByTestId('btn-run-ocr').click()
    await expect(page.getByTestId('btn-cancel-ocr')).toBeVisible()
    await page.getByTestId('btn-cancel-ocr').click()
    await expect(page.getByTestId('ocr-progress-status')).toContainText(
      'OCR cancelled'
    )
    await expect(page.getByTestId('cand-input-waist')).toHaveValue('43')

    // 3. Upload unreadable / photo-only PNG file via <input type="file">
    await page
      .getByTestId('screenshot-file-input')
      .setInputFiles(UNREADABLE_PNG_PATH)
    await page.getByTestId('btn-run-ocr').click()
    await expect(page.getByTestId('ocr-error-alert')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByTestId('cand-input-waist')).toHaveValue('43')

    // Dismiss screenshot removes preview from DOM
    await page.getByTestId('btn-dismiss-screenshot').click()
    await expect(page.getByTestId('screenshot-preview-img')).toHaveCount(0)
  })

  test('Fixture 8: Persistence lifecycle — blank state, save, refresh, try example isolation, clear data, reopen, no screenshots persisted', async ({
    page,
  }) => {
    // Enter reference pair & candidate from blank state
    await page
      .getByTestId('ref-pair-name-input')
      .fill('Fullcount 1108 Favourite')
    await page.getByTestId('ref-input-waist').fill('41')
    await page.getByTestId('ref-input-thigh').fill('32')
    await page.getByTestId('ref-input-hem').fill('20.5')

    await page.getByTestId('cand-name-input').fill('Yahoo Auctions Lot 1108')
    await page.getByTestId('cand-input-waist').fill('41')
    await page.getByTestId('cand-input-thigh').fill('31')
    await page.getByTestId('cand-input-hem').fill('20')

    // Load a screenshot to confirm no screenshot bytes or OCR text ever persist to localStorage
    await page.getByTestId('btn-load-synthetic-legible-screenshot').click()
    await expect(page.getByTestId('screenshot-preview-img')).toBeVisible()

    const storedJson = await page.evaluate(() =>
      window.localStorage.getItem('denim_fit_check_saved_v1')
    )
    expect(storedJson).toBeTruthy()
    expect(storedJson).not.toContain('blob:')
    expect(storedJson).not.toContain('data:image')
    expect(storedJson).not.toContain("Studio D'Artisan")

    // Refresh browser -> saved pair survives refresh, screenshot does not persist
    await page.reload()
    await expect(page.getByTestId('ref-pair-name-input')).toHaveValue(
      'Fullcount 1108 Favourite'
    )
    await expect(page.getByTestId('ref-input-waist')).toHaveValue('41')
    await expect(page.getByTestId('cand-name-input')).toHaveValue(
      'Yahoo Auctions Lot 1108'
    )
    await expect(page.getByTestId('screenshot-preview-img')).toHaveCount(0)

    // Try example -> modify example state -> return/refresh -> saved pair survives demo intact
    await page.getByTestId('btn-try-example').click()
    await expect(page.getByTestId('ref-pair-name-input')).toHaveValue(
      'My Favourite Pair (Reference)'
    )
    await page.getByTestId('ref-input-waist').fill('45')

    await page.getByTestId('btn-compare-my-jeans').click()
    await expect(page.getByTestId('ref-pair-name-input')).toHaveValue(
      'Fullcount 1108 Favourite'
    )
    await expect(page.getByTestId('ref-input-waist')).toHaveValue('41')

    // Clear saved data and reopen/reload -> removes saved pair
    await page.getByTestId('btn-clear-saved-data').click()
    await expect(page.getByTestId('ref-pair-name-input')).toHaveValue('')
    await page.reload()
    await expect(page.getByTestId('ref-pair-name-input')).toHaveValue('')
    await expect(page.getByTestId('ref-input-waist')).toHaveValue('')
  })
})
