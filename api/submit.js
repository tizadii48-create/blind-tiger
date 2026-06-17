// Vercel Serverless Function — receives guest-list form submissions,
// writes them to Airtable, and emails a notification via Resend.
// All secrets stay server-side via environment variables.
//
// Required environment variables (Vercel → Settings → Environment Variables):
//   AIRTABLE_TOKEN    Personal Access Token, scope: data.records:write
//   AIRTABLE_BASE_ID  e.g. appXXXXXXXXXXXXXX
//   AIRTABLE_TABLE    Table name, e.g. "Applications"
//   RESEND_API_KEY    Resend API key (re_...). If unset, email is skipped.
//   NOTIFY_TO         (optional) comma-separated recipients. Default: aramandzeno@gmail.com,tannaz.zenoworlds@gmail.com
//   NOTIFY_FROM       (optional) sender. Default: Blind Tiger <hello@blindtigerlist.com>

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
  } catch (err) {
    console.error('Airtable request failed', err);
    return res.status(500).json({ error: 'Unexpected error.' });
  }

  // Email notification (best effort — never blocks a saved submission).
  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const NOTIFY_TO = (process.env.NOTIFY_TO || 'aramandzeno@gmail.com,tannaz.zenoworlds@gmail.com')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const NOTIFY_FROM =
      process.env.NOTIFY_FROM || 'Blind Tiger <hello@blindtigerlist.com>';

    if (RESEND_API_KEY) {
      const rows = [
        ['Full name', data.full_name],
        ['Phone', data.phone],
        ['Email', data.email],
        ['City', data.city],
        ['Platform', data.platform],
        ['Profile', data.profile],
        ['Heard', data.heard],
        ['Referrer', data.referrer],
      ];

      const text = rows.map(([k, v]) => k + ': ' + (v || '—')).join('\n');
      const html =
        '<h2>New Blind Tiger application</h2><table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">' +
        rows
          .map(
            ([k, v]) =>
              '<tr><td style="color:#888">' + k + '</td><td><strong>' +
              (v ? String(v).replace(/[<>&]/g, '') : '—') + '</strong></td></tr>'
          )
          .join('') +
        '</table>';

      const er = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: NOTIFY_FROM,
          to: NOTIFY_TO,
          reply_to: data.email,
          subject: 'New application: ' + data.full_name + ' (' + data.city + ')',
          text,
          html,
        }),
      });

      if (!er.ok) {
        console.error('Resend error', er.status, await er.text());
      }
    }
  } catch (err) {
    console.error('Email send failed', err);
  }

  return res.status(200).json({ ok: true });
}
