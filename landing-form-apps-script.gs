/**
 * TrueWinCircle landing-page lead capture
 * ─────────────────────────────────────────
 *
 * One-time setup:
 *
 * 1. Open https://sheets.google.com → create a new sheet → name it
 *    "TrueWinCircle Leads" (or anything you like).
 * 2. Inside that sheet: Extensions → Apps Script.
 * 3. Delete whatever code is there and paste this entire file in.
 * 4. Save (Ctrl+S). Give the project any name.
 * 5. Deploy → New deployment → choose type "Web app".
 *      • Description: "TWC landing form"
 *      • Execute as:  Me (your gmail)
 *      • Who has access: Anyone
 *    Click Deploy. Authorise when prompted.
 * 6. Copy the "Web app URL" Apps Script gives you.
 * 7. In Vercel → Project → Settings → Environment Variables, add:
 *      VITE_LANDING_FORM_URL = <that URL>
 *    Then redeploy the frontend.
 *
 * Whenever you change this script, redeploy as a NEW version (or
 * "manage deployments" → edit existing → new version) — Apps Script
 * doesn't pick up edits automatically.
 */

const NOTIFY_EMAIL = 'circletruewin@gmail.com';
const SHEET_NAME = 'Leads';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const name = String(payload.name || '').trim();
    const phone = String(payload.phone || '').replace(/\D/g, '');
    const source = String(payload.source || 'unknown');
    const ref = String(payload.ref || '');
    const submittedAt = payload.submittedAt || new Date().toISOString();

    if (!name || phone.length !== 10) {
      return jsonResponse({ ok: false, error: 'Invalid name or phone' });
    }

    const sheet = ensureSheet_();
    sheet.appendRow([
      new Date(),                  // server-side timestamp (IST shown in sheet)
      name,
      "'" + phone,                 // leading apostrophe stops Sheets eating leading zeros
      source,
      ref,
      submittedAt,
    ]);

    try {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: 'New TrueWinCircle lead: ' + name + ' (' + phone + ')',
        body:
          'New lead from landing page\n\n' +
          'Name:   ' + name + '\n' +
          'Phone:  +91 ' + phone + '\n' +
          'Source: ' + source + '\n' +
          'Page ref: ' + (ref || '-') + '\n' +
          'Submitted: ' + submittedAt + '\n\n' +
          '— TrueWinCircle landing form',
      });
    } catch (mailErr) {
      // Don't fail the whole request if email quota is exhausted; the
      // row is already in the sheet.
      console.warn('Email send failed:', mailErr);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('doPost error:', err);
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// Lets you sanity-check the deployment by visiting the URL in a browser.
function doGet() {
  return jsonResponse({ ok: true, msg: 'TrueWinCircle landing form is live' });
}

function ensureSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Received At', 'Name', 'Phone', 'Source', 'Ref', 'Client Time']);
    sheet.setFrozenRows(1);
    sheet.getRange('A1:F1').setFontWeight('bold');
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
