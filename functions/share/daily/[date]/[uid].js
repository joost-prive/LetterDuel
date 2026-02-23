const FIREBASE_PROJECT_ID = 'letterduel';
const FIREBASE_API_KEY = 'AIzaSyA38q4GgmYL85ukq7c-h7zI6xhHAtOPS1k';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readField(fields, name, fallback = '') {
  const field = fields?.[name];
  if (!field) return fallback;
  if (Object.prototype.hasOwnProperty.call(field, 'stringValue')) return field.stringValue;
  if (Object.prototype.hasOwnProperty.call(field, 'integerValue')) return field.integerValue;
  if (Object.prototype.hasOwnProperty.call(field, 'booleanValue')) return field.booleanValue;
  return fallback;
}

async function getDailyShareDoc(dateKey, uid) {
  const docId = `${dateKey}_${uid}`;
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/daily_shares/${encodeURIComponent(docId)}?key=${FIREBASE_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  const fields = data?.fields || {};

  return {
    dateKey: readField(fields, 'dateKey', dateKey),
    name: readField(fields, 'name', 'Player'),
    playerScore: Number(readField(fields, 'playerScore', 0)),
    aiScore: Number(readField(fields, 'aiScore', 0)),
    won: readField(fields, 'won', false) === true,
    shareUrl: readField(fields, 'shareUrl', ''),
    shareGridColors: readField(fields, 'shareGridColors', ''),
    shareRowScores: readField(fields, 'shareRowScores', ''),
    shareColScores: readField(fields, 'shareColScores', '')
  };
}

export async function onRequestGet(context) {
  const { params, request } = context;
  const dateKey = params.date;
  const uid = params.uid;

  const requestUrl = new URL(request.url);
  const canonicalShareUrl = `${requestUrl.origin}/share/daily/${dateKey}/${uid}`;
  const ogImageUrl = `${requestUrl.origin}/share/daily/${dateKey}/${uid}/image.svg`;
  const appUrl = `${requestUrl.origin}/`;

  let title = `LetterDuel Daily ${dateKey}`;
  let description = `Bekijk mijn Daily resultaat op LetterDuel.`;

  try {
    const doc = await getDailyShareDoc(dateKey, uid);
    if (doc) {
      const outcome = doc.won ? 'Gewonnen' : 'Verloren';
      title = `LetterDuel Daily ${doc.dateKey} • ${outcome}`;
      description = `${doc.name}: ${doc.playerScore} - AI ${doc.aiScore}`;
      if (doc.shareRowScores && doc.shareColScores) {
        description += ` • Rijen ${doc.shareRowScores} • Kolommen ${doc.shareColScores}`;
      }
    }
  } catch (e) {
    console.log('share page fetch failed', e);
  }

  const html = `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta property="og:url" content="${escapeHtml(canonicalShareUrl)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />

  <meta http-equiv="refresh" content="1; url=${escapeHtml(appUrl)}" />
</head>
<body style="font-family: Arial, sans-serif; background:#0f1d35; color:#ecf0f1; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0;">
  <div style="text-align:center; padding:20px;">
    <h1 style="margin:0 0 10px 0; color:#00d2d3;">${escapeHtml(title)}</h1>
    <p style="margin:0 0 12px 0;">${escapeHtml(description)}</p>
    <p style="margin:0; opacity:.8;">Je wordt doorgestuurd naar LetterDuel…</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'public, max-age=300'
    }
  });
}
