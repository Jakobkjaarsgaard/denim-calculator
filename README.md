# Denim Fit Check

Fit checker for second-hand Japanese denim. Compares one to three second-hand candidate listings against a reference pair the buyer already owns and answers:
> **“Where will this pair measure differently from mine, and what should I ask the seller before buying?”**

---

## Commands

```bash
# Install dependencies from lockfile
npm ci

# Start local development server (default: http://localhost:5173)
npm run dev

# Run unit tests (Vitest — pure comparison rules, conversions, parser, storage)
npm test

# Run end-to-end browser verification (Playwright at 390px iPhone viewport)
npm run test:e2e

# Run TypeScript typecheck and linter
npm run typecheck
npm run lint

# Build production bundle and preview locally
npm run build
npm run preview
```

---

## Measuring Conventions

All width measurements (**Flat waist**, **Thigh**, **Knee**, **Hem**) are **flat widths** taken on buttoned jeans laid flat and unstretched. The same measuring guide is shown inline to the buyer and used in generated seller questions:

| Field | Method used by this app |
| :--- | :--- |
| **Flat waist** | Button jeans, align the front and back edges of the waistband, lay flat and unstretched, then measure straight across. |
| **Thigh** | Measure straight across one leg 2.5 cm below the crotch seam, perpendicular to the leg. |
| **Front rise** | Follow the front seam from the crotch seam intersection to the top of the waistband. |
| **Knee** | Measure across one leg 33 cm down the inseam from the crotch. |
| **Hem** | Measure straight across one leg opening. |
| **Inseam** | Follow the inside seam from crotch intersection to hem. |

### Units, Conversions & Adjustable Assumptions
- Accepts `cm` and `in`, decimals (`41.5`), decimal commas (`41,5`), and ordinary inch fractions (`12 1/2`, `8 1/2`).
- Stores the original entry string and unit alongside canonical centimetres converted **once** using `1 inch = 2.54 cm`. Unit toggles (`cm` / `in`) change display without mutating stored canonical centimetres.
- Explicit waistband circumference (e.g., `84 cm waistband circumference`) is halved to `42 cm` flat width with a visible conversion note. Ambiguous waist lines (e.g., `waist 84`) require unit and convention confirmation before import.
- Tagged sizes (e.g., `W32 L32`), body waist, prices (`€95`), and unlabelled numbers are never inferred as garment dimensions.
- **Adjustable product assumption** (`SIMILAR_MEASUREMENT_THRESHOLD_CM = 0.5` in `src/domain/types.ts`): an absolute delta up to and including `0.5 cm` reads **“similar measurement”** while always displaying the actual signed delta.

---

## Browser-Local OCR Asset Requirements

Screenshot OCR runs 100% locally in the browser using `tesseract.js` loaded dynamically on demand only when the buyer clicks **Run local OCR**.
- Local assets are served from `public/ocr/`:
  - `public/ocr/worker.min.js` (Tesseract web worker)
  - `public/ocr/tesseract-core*.wasm` and `tesseract-core*.js` (WASM runtime)
  - `public/ocr/eng.traineddata.gz` and `public/ocr/eng.traineddata` (English trained data)
- No external API keys, paid services, or network CDN requests are required.
- Screenshot image bytes and raw OCR text are kept in memory only, revoked on dismissal, and excluded from `localStorage`.

---

## Ranking Basis & Limitations

- **Closest measurements ranking** across multiple candidates (2–3 pairs) is offered **only** when the reference pair and **every** candidate share confirmed, comparable (`standard` or `circumference_halved`) **Flat waist**, **Thigh**, and **Hem** measurements.
- Candidates are ranked by the equal-weighted sum of absolute deltas across those three fields in `cm`, rounded to one decimal (`0.1 cm`) before comparing. Ties display joint winners.
- **Front rise**, **Knee**, and **Inseam** are displayed separately and excluded from the three-field total.
- Unknown (`"I don't know"`) or incompatible measuring methods (such as thigh measured at the crotch instead of 2.5 cm below) and missing/blank fields are never treated as zero and immediately disable multi-candidate ranking while generating a copyable seller question for the missing measurement.
- The app compares reported measurements as supplied and does not predict shrinkage percentages, fabric stretch, or a fabricated fit probability.

---

## How to Give a First-Time Buyer a Demo

1. Open the app on a phone or desktop browser (`http://localhost:5173`).
2. Point out the **Sample Result** card at the top of Home, which immediately shows why flat garment measurements matter more than a `W32` size tag.
3. Tap **Try an example** (runs in isolated temporary state so it never overwrites a saved pair):
   - Inspect **Reference Pair** (`42 cm` waist, `34 cm` thigh, `24 cm` hem) vs **Candidate A** (`42 / 31 / 21 cm`) → reads *“Waist similar. Thigh and hem each 3 cm narrower laid flat. Three-field total: 6 cm.”*
   - Edit Candidate A’s thigh or tap **+ Add Example B (41.5 / 33.5 / 24 cm)** to see **Candidate B** win **Closest measurements** with a `1 cm` total.
   - Change Candidate B’s thigh method to **Measured at crotch (incompatible)** (or clear B’s thigh) to show how ranking disappears rather than letting incomplete data win, and copy the generated seller question asking for *thigh width measured 2.5 cm below the crotch*.
4. Tap **Compare my jeans** to switch back to the buyer’s personal workspace, enter their favourite pair once, and paste listing text or add a listing screenshot.
