# Google Forms → CRM lead capture

This guide connects a Google Form (via Google Sheets) to the CRM so new submissions automatically create **NEW_LEAD** clients.

No CRM login is required for Google — a shared secret protects the webhook instead.

---

## 1. What you need

| Item | Description |
|------|-------------|
| CRM production URL | e.g. `https://crm-ppa-nine.vercel.app` |
| Webhook secret | A long random password you create (keep it private) |
| Optional assignee | A CRM user ID to auto-assign as **Relationship** on new leads |

---

## 2. Vercel environment variables

In **Vercel → Project → Settings → Environment Variables**, add:

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `GOOGLE_FORMS_WEBHOOK_SECRET` | **Yes** | `a8f3c2e1-9b4d-4f7a-91e0-2c8d6f5a4b3c` | Use a long random string. Google Apps Script must send the same value in header `x-webhook-secret`. |
| `GOOGLE_FORMS_DEFAULT_RELATIONSHIP_USER_ID` | No | `clxyz123abc...` | CRM user `id` (from Admin → Users or database). User must be **ACTIVE** and role **STANDARD_USER** or **SUPER_ADMIN**. If invalid, the lead is still created but not assigned. |

After saving variables, **redeploy** the app so they take effect.

---

## 3. Webhook endpoint

```
POST https://YOUR-CRM-DOMAIN/api/integrations/google-forms/leads
```

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `x-webhook-secret` | Same value as `GOOGLE_FORMS_WEBHOOK_SECRET` |

**JSON body:**

```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+852 9123 4567",
  "company": "Acme Ltd",
  "leadSource": "Google Form - Contact Us",
  "roleInCompany": "Director",
  "employeeCount": 25,
  "expectations": "Looking for advisory support",
  "contactInfo": "Prefers WhatsApp"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | **Yes** | Contact / lead name |
| `email` | No | |
| `phone` | No | |
| `company` | No | |
| `leadSource` | No | Defaults to `"Google Form"` if omitted |
| `roleInCompany` | No | |
| `employeeCount` | No | Number or numeric string; invalid values are stored as empty |
| `expectations` | No | |
| `contactInfo` | No | |

**Success (201):** Returns the created client fields (`client_id`, `name`, `status`, etc.). If auto-assignment ran, `assignment_id` is included.

**Errors:**

| Status | Meaning |
|--------|---------|
| 401 | Missing or wrong `x-webhook-secret` |
| 400 | Invalid JSON or missing `name` |
| 500 | Server misconfiguration or database error |

---

## 4. Google Sheets setup (recommended)

Google Forms saves responses to a **Google Sheet**. You attach a script that runs when a new row is added.

### Step A — Open the script editor

1. Open the **Responses** spreadsheet for your Google Form.
2. Menu: **Extensions → Apps Script**.
3. Delete any sample code in `Code.gs`.

### Step B — Paste the script

Replace the three `CONFIG` values at the top, then paste everything:

```javascript
const CONFIG = {
  // Your live CRM URL (no trailing slash)
  CRM_WEBHOOK_URL: 'https://crm-ppa-nine.vercel.app/api/integrations/google-forms/leads',
  // Must match GOOGLE_FORMS_WEBHOOK_SECRET in Vercel
  WEBHOOK_SECRET: 'PASTE-YOUR-SECRET-HERE',
  // Optional: set to a column header name if your form has a dedicated "name" field.
  // If empty, the script uses the first non-empty response column as the name.
  NAME_COLUMN_HEADER: 'Full Name',
};

/**
 * Map your sheet column headers to CRM JSON fields.
 * Keys = exact column header text from row 1 of the sheet.
 * Values = CRM payload field names.
 */
const COLUMN_MAP = {
  'Full Name': 'name',
  'Email Address': 'email',
  'Phone Number': 'phone',
  'Company Name': 'company',
  'Your Role': 'roleInCompany',
  'Number of Employees': 'employeeCount',
  'What are you looking for?': 'expectations',
  'Additional contact details': 'contactInfo',
};

function onFormSubmit(e) {
  try {
    const sheet = e.range.getSheet();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowValues = e.range.getValues()[0];

    const payload = buildPayload(headers, rowValues);

    if (!payload.name) {
      console.warn('Google Forms webhook: no name found in submission — skipped');
      return;
    }

    const response = UrlFetchApp.fetch(CONFIG.CRM_WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-webhook-secret': CONFIG.WEBHOOK_SECRET,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      console.error(
        'Google Forms webhook failed: HTTP ' + status + ' — ' + response.getContentText()
      );
    }
  } catch (err) {
    console.error('Google Forms webhook error: ' + err);
  }
}

function buildPayload(headers, rowValues) {
  const payload = {
    leadSource: 'Google Form',
  };

  headers.forEach(function (header, index) {
    const key = String(header || '').trim();
    const value = rowValues[index];
    if (!key || value === '' || value === null || value === undefined) {
      return;
    }

    const mappedField = COLUMN_MAP[key];
    if (mappedField) {
      payload[mappedField] = String(value).trim();
    }
  });

  if (!payload.name && CONFIG.NAME_COLUMN_HEADER) {
    const nameIndex = headers.indexOf(CONFIG.NAME_COLUMN_HEADER);
    if (nameIndex >= 0 && rowValues[nameIndex]) {
      payload.name = String(rowValues[nameIndex]).trim();
    }
  }

  if (!payload.name) {
    for (let i = 0; i < rowValues.length; i++) {
      const value = rowValues[i];
      if (value !== '' && value !== null && value !== undefined) {
        payload.name = String(value).trim();
        break;
      }
    }
  }

  return payload;
}

/** Run once from the editor to verify connectivity (Executions log). */
function testWebhook() {
  const response = UrlFetchApp.fetch(CONFIG.CRM_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-webhook-secret': CONFIG.WEBHOOK_SECRET,
    },
    payload: JSON.stringify({
      name: 'Test Lead ' + new Date().toISOString(),
      email: 'test@example.com',
      company: 'Webhook Test Co',
      leadSource: 'Google Form - Manual Test',
    }),
    muteHttpExceptions: true,
  });

  console.log('Status: ' + response.getResponseCode());
  console.log('Body: ' + response.getContentText());
}
```

**Important:** Edit `COLUMN_MAP` so the **left-hand keys** match your form’s column headers exactly (row 1 of the sheet).

### Step C — Create the trigger

1. In Apps Script, click the **clock icon** (Triggers) in the left sidebar.
2. **+ Add Trigger**
3. Choose:
   - Function: `onFormSubmit`
   - Event source: **From spreadsheet**
   - Event type: **On form submit**
4. Save. Google may ask you to authorize the script — approve for your account.

### Step D — Test from the script editor

1. Select function **`testWebhook`** in the toolbar dropdown.
2. Click **Run**.
3. Open **Executions** (left sidebar). You should see HTTP `201` and a JSON body with `client_id`.
4. In the CRM, confirm a new lead appears with status **New Lead**.

### Step E — Test a real form submission

1. Submit your Google Form once.
2. Check **Apps Script → Executions** for errors.
3. Confirm the new row created a matching CRM lead.

---

## 5. Manual test with curl

Replace the URL and secret:

```bash
curl -s -X POST "https://crm-ppa-nine.vercel.app/api/integrations/google-forms/leads" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET_HERE" \
  -d '{
    "name": "Curl Test Lead",
    "email": "curl-test@example.com",
    "company": "Test Company",
    "leadSource": "Google Form - curl test"
  }'
```

Expected: HTTP `201` and JSON containing `"status":"NEW_LEAD"`.

Wrong secret → `401 Unauthorized`.

---

## 6. Security notes

- Never put the webhook secret in public code or share it in email/chat.
- The endpoint is **not** a public open API — requests without the correct header are rejected.
- Existing `POST /api/clients` (CRM login required) is unchanged; this is a separate integration route.
- Leads are always created as `NEW_LEAD`; commission and assignment rules elsewhere in the CRM are not modified.

---

## 7. Troubleshooting

| Problem | What to check |
|---------|----------------|
| 401 Unauthorized | Secret in Vercel matches `WEBHOOK_SECRET` in Apps Script exactly |
| 500 Webhook is not configured | `GOOGLE_FORMS_WEBHOOK_SECRET` missing in Vercel — redeploy after adding |
| Lead created but not assigned | `GOOGLE_FORMS_DEFAULT_RELATIONSHIP_USER_ID` wrong, user deactivated, or wrong role |
| Script runs but no CRM lead | Apps Script **Executions** log; fix `COLUMN_MAP` headers; ensure `name` is sent |
| Duplicate leads | Normal if the trigger fires twice or you re-run `testWebhook` — delete test leads in CRM admin |
