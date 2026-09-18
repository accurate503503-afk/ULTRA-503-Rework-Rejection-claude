# ULTRA@503 Internal Rework / Rejection Notification

Mobile-friendly PWA for the ULTRA@503 shop-floor workflow.

## Final changes
- Example Route Card removed.
- QR-from-photo fallback removed.
- Notification number: QN-UCBATCH-DATE.
- PDF first page includes NC Confirm by and Verify by.
- Responsible Section supports multiple selections.
- Create New Entry clears the current form and photos.
- PDF sharing includes Part No., PO No., UC Batch No. and Notification No. in the share text.
- QR scanning uses rear camera, native BarcodeDetector when available, jsQR fallback, autofocus/zoom hints, and multiple crop passes.

## v2 fixes (this update)
- Fixed logo image path: the app and PDF were referencing `assets/ultra-logo.png`, but the logo file ships at the project root (`ultra-logo.png`). The header logo and the PDF logo were silently failing to load until this fix.
- Notification No. now recalculates live while typing the UC Batch No. manually (previously it only updated after a QR scan or a Section change).
- Notification No. requires a UC Batch No. before "Create PDF" will proceed (shows a clear message instead of producing a `QN-—-—` PDF).
- ULTRA logo now also appears on the photo pages of the PDF (page 2 onward), not just page 1.
- "Create New Entry" confirmation text aligned to the requested wording.
- Service worker cache bumped to `v3` so returning users on Android automatically pick up these fixes instead of an old cached copy.

Use the HTTPS GitHub Pages address on Android Chrome.
