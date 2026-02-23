const FIREBASE_PROJECT_ID = 'letterduel';
const FIREBASE_API_KEY = 'AIzaSyA38q4GgmYL85ukq7c-h7zI6xhHAtOPS1k';

function esc(value) {
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

function parseCsvNumbers(input) {
  return String(input || '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
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
    shareGridColors: readField(fields, 'shareGridColors', ''),
    shareRowScores: readField(fields, 'shareRowScores', ''),
    shareColScores: readField(fields, 'shareColScores', '')
  };
}

export async function onRequestGet(context) {
  const { params } = context;
  const dateKey = params.date;
  const uid = params.uid;

  let title = `LETTERDUEL DAILY`;
  let subtitle = dateKey;
  let scoreLine = `JIJ 0 • AI 0`;
  let outcome = 'RESULTAAT';
  let outcomeColor = '#95a5a6';
  let playerName = 'Player';
  let gridColors = Array(25).fill('N');
  let rowScores = [0, 0, 0, 0, 0];
  let colScores = [0, 0, 0, 0, 0];

  try {
    const doc = await getDailyShareDoc(dateKey, uid);
    if (doc) {
      subtitle = doc.dateKey;
      scoreLine = `JIJ ${doc.playerScore} • AI ${doc.aiScore}`;
      outcome = doc.won ? 'GEWONNEN' : 'VERLOREN';
      outcomeColor = doc.won ? '#2ecc71' : '#ff4757';
      playerName = doc.name || 'Player';

      const parsedGrid = String(doc.shareGridColors || '').toUpperCase();
      if (parsedGrid.length === 25) {
        gridColors = parsedGrid.split('');
      }

      const parsedRows = parseCsvNumbers(doc.shareRowScores);
      if (parsedRows.length === 5) rowScores = parsedRows;
      const parsedCols = parseCsvNumbers(doc.shareColScores);
      if (parsedCols.length === 5) colScores = parsedCols;
    }
  } catch (e) {
    console.log('svg share fetch failed', e);
  }

  const colorMap = {
    N: '#3a3f4b',
    H: '#2ecc71',
    V: '#00a8ff',
    B: '#f1c40f'
  };

  const cellSize = 68;
  const scoreSize = 56;
  const gridSize = cellSize * 5;
  const boardX = 376;
  const boardY = 248;

  let gridRects = '';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const idx = (r * 5) + c;
      const x = boardX + (c * cellSize);
      const y = boardY + (r * cellSize);
      const code = gridColors[idx];
      const fill = colorMap[code] || colorMap.N;
      gridRects += `<rect x="${x + 3}" y="${y + 3}" width="${cellSize - 6}" height="${cellSize - 6}" rx="10" fill="${fill}"/>`;
    }
  }

  let rowScoreBlocks = '';
  for (let r = 0; r < 5; r++) {
    const x = boardX + gridSize + 8;
    const y = boardY + (r * cellSize) + 3;
    const value = rowScores[r] > 0 ? String(rowScores[r]) : '-';
    rowScoreBlocks += `<rect x="${x}" y="${y}" width="${scoreSize - 6}" height="${cellSize - 6}" rx="10" fill="#202836"/>`;
    rowScoreBlocks += `<text x="${x + (scoreSize / 2) - 3}" y="${y + (cellSize / 2) + 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#00d2d3">${esc(value)}</text>`;
  }

  let colScoreBlocks = '';
  for (let c = 0; c < 5; c++) {
    const x = boardX + (c * cellSize) + 3;
    const y = boardY + gridSize + 8;
    const value = colScores[c] > 0 ? String(colScores[c]) : '-';
    colScoreBlocks += `<rect x="${x}" y="${y}" width="${cellSize - 6}" height="${scoreSize - 6}" rx="10" fill="#202836"/>`;
    colScoreBlocks += `<text x="${x + (cellSize / 2)}" y="${y + (scoreSize / 2) + 8}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#00d2d3">${esc(value)}</text>`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f1d35"/>
      <stop offset="100%" stop-color="#11284f"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="40" y="40" width="1120" height="550" rx="20" fill="rgba(7,12,20,0.45)"/>

  <text x="600" y="130" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="900" fill="#00d2d3">${esc(title)}</text>
  <text x="600" y="185" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ecf0f1">${esc(subtitle)}</text>
  <text x="600" y="232" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="900" fill="#ecf0f1">${esc(scoreLine)}</text>
  <text x="600" y="286" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="900" fill="${outcomeColor}">${esc(outcome)}</text>

  ${gridRects}
  ${rowScoreBlocks}
  ${colScoreBlocks}

  <text x="600" y="582" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ecf0f1">${esc(playerName)} • Speel vandaag op letterduel.net</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=UTF-8',
      'cache-control': 'public, max-age=300'
    }
  });
}
