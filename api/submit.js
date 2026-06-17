// Vercel Serverless Function — receives guest-list form submissions
// and writes them to Airtable. The Airtable token stays server-side
// via environment variables and is never exposed to the browser.
//
// Required environment variables (Vercel → Settings → Environment Variables):
//   AIRTABLE_TOKEN    Personal Access Token, scope: data.records:write
//   AIRTABLE_BASE_ID  e.g. appXXXXXXXXXXXXXX
//   AIRTABLE_TABLE    Table name, e.g. "Applications"

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE) {
    return res.status(500).json({ error: 'Server is not configured.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const clean = (v) => (typeof v === 'string' ? v.trim() : '');
  const data = {
    full_name: clean(body.full_name),
    phone: clean(body.phone),
    email: clean(body.email),
    city: clean(body.city),
    platform: clean(body.platform),
    profile: clean(body.profile),
    heard: clean(body.heard),
    referrer: clean(body.referrer),
  };

  if (!data.full_name || !data.email || !data.city) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // LEFT side must match your Airtable column titles exactly.
  const fields = {
    'Full Name': data.full_name,
    'Phone': data.phone,
    'Email': data.email,
    'City': data.city,
    'Platform': data.platform,
    'Profile': data.profile,
    'Heard': data.heard,
    'Referrer': data.referrer,
  };

  try {
    const url =
      'https://api.airtable.com/v0/' +
      AIRTABLE_BASE_ID + '/' +
      encodeURIComponent(AIRTABLE_TABLE);

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + AIRTABLE_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('Airtable error', r.status, detail);
      return res.status(502).json({ error: 'Could not save submission.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Request failed', err);
    return res.status(500).json({ error: 'Unexpected error.' });
  }
}
