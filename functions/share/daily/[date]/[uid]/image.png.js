// Previewafbeelding voor een gedeeld daily-resultaat, als echte PNG.
//
// De oude variant was een SVG (image.svg.js). Facebook, WhatsApp en X tonen
// geen SVG als og:image, dus die previews bleven leeg. De browser van de
// speler rendert de kaart nu bij het opslaan op canvas en bewaart hem als
// base64 in het veld cardPng; hier geven we die bytes ongewijzigd terug.
//
// Resultaten van voor deze wijziging hebben geen cardPng. Daarvoor vallen we
// terug op de algemene og-image.png van de site.

const FIREBASE_PROJECT_ID = 'letterduel';
const FIREBASE_API_KEY = 'AIzaSyA38q4GgmYL85ukq7c-h7zI6xhHAtOPS1k';

async function getCardPng(dateKey, uid) {
  const docId = `${dateKey}_${uid}`;
  const url =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/daily_shares/${encodeURIComponent(docId)}` +
    `?key=${FIREBASE_API_KEY}&mask.fieldPaths=cardPng`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  const value = data?.fields?.cardPng?.stringValue;
  return value || null;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function onRequestGet(context) {
  const { params, request } = context;
  const origin = new URL(request.url).origin;

  try {
    const cardPng = await getCardPng(params.date, params.uid);
    if (cardPng) {
      return new Response(base64ToBytes(cardPng), {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=3600'
        }
      });
    }
  } catch (e) {
    console.log('png share fetch failed', e);
  }

  // Geen opgeslagen kaart: laat de algemene afbeelding zien in plaats van niets.
  return Response.redirect(`${origin}/og-image.png`, 302);
}
