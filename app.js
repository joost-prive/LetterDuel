// --- WOORDENLIJST LOADING ---
// WEIGHTED_LETTERS en word-functies komen uit gameLogic.js
const FALLBACK_LIST = ["APPEL", "PEREN", "TAFEL", "STOEL", "WATER", "LATER", "BETER", "VUREN", "GROEN", "DOPEN", "LOPEN", "KOPEN", "HOPEN", "KAT", "HOND", "VIS", "BOOM", "ROOS", "KAAS", "BOOT", "WIND", "LAND", "ZAND", "GOUD", "HOUT"];

if (typeof RAW_WORD_LIST !== 'undefined') {
    console.log("Lokale words.js gevonden!");
    initWordSet(RAW_WORD_LIST);
} else {
    console.warn("Geen words.js gevonden, gebruik fallback.");
    initWordSet(FALLBACK_LIST);
}

// --- STATE ---
let currentGameId = null;
let myRoleId = null;
let isSinglePlayer = false;
let aiDifficulty = 'easy';
let unsubscribeGame = null;
let opponentName = "Computer";
let lastStatus = "init"; 

let myGrid = Array(25).fill("");
let opponentGrid = Array(25).fill("");
let pendingLetter = null;
let isMyPickTurn = false;
let activeCellIndex = null;
let finalTurnProcessed = false; 
let isAiProcessing = false; 
let isJoiningOnlineGame = false;
let isSimulationRunning = false;
let simulationIntervalId = null;
let simulationAwaitingAiPick = false;
let isOnlineSimulationRunning = false;
let onlineSimulationIntervalId = null;
let gameMode = 'menu';
let currentDailyDateKey = null;
let currentDailyPuzzle = null;
let dailyAiSequenceIndex = 0;
let dailyGameFinished = false;
let lastDailyResultPayload = null;
const DAILY_SEQUENCE_START_KEY = '2026-02-28';
const RULES_SKIP_STORAGE_KEY = 'ld_hide_rules_popup';
let rulesContinueCallback = null;
let lastAnnouncedPendingLetter = null;
const isDailyAttemptLimitEnabled = true;
const isDebugMode = ['localhost', '127.0.0.1'].includes(window.location.hostname) || new URLSearchParams(window.location.search).get('debug') === '1';

function isDailyAdminBypassActive() {
    return String(myUsername || '').trim().toLowerCase() === 'admin123';
}

// Username Handling
let myUsername = localStorage.getItem('ld_username') || null;

// DOM
const gridDisplay = document.getElementById('my-grid-display');
const instructionText = document.getElementById('turn-instruction');
const letterDisplay = document.getElementById('pending-letter-display');
const gameUi = document.getElementById('game-ui');
const keyboard = document.getElementById('virtual-keyboard');
const winChanceContainer = document.getElementById('win-chance-container');

function isLikelyMobileClient() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
        || ((navigator.maxTouchPoints || 0) > 1 && window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
}

function getShareHintText() {
    if (isLikelyMobileClient()) {
        return 'Klik in het berichtvak en kies Plakken om je score-image toe te voegen.';
    }
    return 'Voeg je score-image toe met Ctrl+V.';
}

async function copyDailyScoreImageToClipboard(payloadOverride = null, textValue = '', includeText = true) {
    if (!(window.isSecureContext && navigator.clipboard && window.ClipboardItem)) {
        return false;
    }

    try {
        const blob = await createDailyResultCardBlob(payloadOverride);
        if (!blob) return false;
        const clipboardPayload = {
            'image/png': blob
        };

        const safeText = String(textValue || '').trim();
        if (includeText && safeText) {
            clipboardPayload['text/plain'] = new Blob([safeText], { type: 'text/plain' });
        }

        await navigator.clipboard.write([
            new ClipboardItem(clipboardPayload)
        ]);
        return true;
    } catch (err) {
        console.warn('Scorekaart kopiëren mislukt:', err);
        return false;
    }
}

function updateShareHintText() {
    const text = getShareHintText();
    const dailyHint = document.getElementById('daily-share-hint');
    const viewHint = document.getElementById('view-share-hint');
    if (dailyHint) dailyHint.textContent = text;
    if (viewHint) viewHint.textContent = text;
}

function parseDateKeyAsUtcDate(dateKey) {
    const safe = String(dateKey || '').trim();
    const m = safe.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(Date.UTC(y, mo - 1, d));
}

function getDailySequenceNumber(dateKey) {
    const targetDate = parseDateKeyAsUtcDate(dateKey || getUtcDateKey());
    const startDate = parseDateKeyAsUtcDate(DAILY_SEQUENCE_START_KEY);
    if (!targetDate || !startDate) return null;
    const diffMs = targetDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 0) return null;
    return diffDays + 1;
}

function updateDailyMenuNumber() {
    const dailyNo = getDailySequenceNumber(getUtcDateKey());

    const sectionTitleEl = document.getElementById('daily-section-title');
    if (sectionTitleEl) sectionTitleEl.textContent = dailyNo ? `DAILY - #${dailyNo}` : 'DAILY';
}

window.onload = () => {
    createGridUI();
    updateProfileDisplay(); 
    const debugBtn = document.getElementById('debug-btn');
    if (debugBtn) debugBtn.style.display = isDebugMode ? 'inline-block' : 'none';
    updateShareHintText();
    updateDailyMenuNumber();
    updateGameControlButtons();
    if (window.pendingInviteId) {
        window.checkAndJoin();
    }
};

window.checkAndJoin = function() {
    if (window.currentUser && window.pendingInviteId) {
        console.log("Check passed: joining game", window.pendingInviteId);
        const gameId = window.pendingInviteId;
        window.pendingInviteId = null; 
        handleGuestEntry(gameId);
    }
}

function getUtcDateKey(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function getOrCreateDailyPuzzle(dateKey) {
    const { doc, runTransaction } = window.firebaseFuncs;
    const puzzleRef = doc(window.db, 'daily_puzzles', dateKey);

    const puzzle = await runTransaction(window.db, async (transaction) => {
        const snap = await transaction.get(puzzleRef);
        if (snap.exists()) return snap.data();

        const generated = buildDailyPuzzle(dateKey);
        transaction.set(puzzleRef, generated);
        return generated;
    });

    return puzzle;
}

async function hasPlayedDaily(dateKey, uid) {
    const { doc, getDoc } = window.firebaseFuncs;
    const resultRef = doc(window.db, 'daily_results', dateKey, 'entries', uid);
    const resultSnap = await getDoc(resultRef);
    if (!resultSnap.exists()) return { played: false };
    return { played: true, data: resultSnap.data() };
}

// --- USERNAME FLOW ---
function updateProfileDisplay() {
    const nameEl = document.getElementById('profile-name');
    if (myUsername) nameEl.innerText = myUsername;
    else nameEl.innerText = "Gast";
}

function openNameChange() {
    const input = document.getElementById('username-input');
    if (myUsername) input.value = myUsername;
    else input.value = "";
    document.getElementById('username-modal').style.display = 'flex';
}

function ensureUsername(callback) {
    if (myUsername) {
        callback(); 
    } else {
        openNameChange();
        window.afterUsernameSaved = callback;
    }
}

function saveUsername() {
    const input = document.getElementById('username-input').value.trim();
    if (input.length < 2) { alert("Naam is te kort!"); return; }
    
    myUsername = input;
    localStorage.setItem('ld_username', input);
    updateProfileDisplay();
    updateGameControlButtons();
    
    document.getElementById('username-modal').style.display = 'none';
    
    if (window.afterUsernameSaved) {
        window.afterUsernameSaved();
        window.afterUsernameSaved = null;
    }
}

// --- RULES & MODALS ---
function getRulesTextConfig(mode = 'general') {
    const normalizedMode = ['general', 'daily', 'single', 'online'].includes(mode) ? mode : 'general';
    const isGeneral = normalizedMode === 'general';
    const isOnline = normalizedMode === 'online';
    const isDaily = normalizedMode === 'daily';

    return {
        title: isGeneral ? 'SPELREGELS' : (isDaily ? 'SPELREGELS • DAILY' : (isOnline ? 'SPELREGELS • ONLINE' : 'SPELREGELS • TEGEN COMPUTER')),
        intro: isGeneral
            ? 'Jij en je tegenstander hebben allebei een eigen bord van 5x5. Om de beurt kiezen jullie een letter die je allebei ergens op je bord moet plaatsen. Wie maakt daarmee de meeste woorden horizontaal en verticaal?'
            : (isOnline
            ? 'Jij en je tegenstander hebben allebei een eigen bord van 5x5. Om de beurt kiezen jullie een letter die je allebei ergens op je bord moet plaatsen. Wie maakt daarmee de meeste woorden horizontaal en verticaal?'
            : 'Jij en de computer hebben allebei een eigen bord van 5x5. Om de beurt kiezen jullie een letter die je allebei ergens op je bord moet plaatsen. Wie maakt daarmee de meeste woorden horizontaal en verticaal?'),
        startText: isGeneral
            ? 'Jullie beginnen beiden met dezelfde 2 of 3 random letters.'
            : (isDaily
            ? 'Jullie beginnen beiden met dezelfde 2 random letters.'
            : 'Jullie beginnen beiden met dezelfde 3 random letters.'),
        extraDailyText: (isDaily || isGeneral)
            ? 'De computer kiest dezelfde reeks letters, dus iedereen die de Daily speelt heeft dezelfde kansen! Wie haalt de hoogste score van de dag?'
            : ''
    };
}

function renderRulesModal(mode = 'single', options = {}) {
    const { showSkip = false, primaryLabel = 'BEGREPEN' } = options;
    const cfg = getRulesTextConfig(mode);

    const titleEl = document.getElementById('rules-modal-title');
    const bodyEl = document.getElementById('rules-modal-body');
    const skipWrap = document.getElementById('rules-skip-wrap');
    const skipCheckbox = document.getElementById('rules-skip-checkbox');
    const primaryBtn = document.getElementById('rules-primary-btn');

    titleEl.textContent = cfg.title;
    bodyEl.innerHTML = `
        <p>${cfg.intro}</p>
        <p class="rules-list"><strong>Start:</strong> ${cfg.startText}</p>
        <div class="rules-list" style="line-height:1.6; margin-bottom:8px;">
            <strong>Punten:</strong><br>
            • 3 letters = <span style="color:var(--easy)">5 pnt</span><br>
            • 4 letters = <span style="color:var(--medium)">10 pnt</span><br>
            • 5 letters = <span style="color:var(--hard)">15 pnt</span>
        </div>
        ${cfg.extraDailyText ? `<p class="rules-list"><strong>Extra Daily regel:</strong> ${cfg.extraDailyText}</p>` : ''}
    `;

    skipWrap.style.display = showSkip ? 'inline-flex' : 'none';
    skipCheckbox.checked = showSkip ? localStorage.getItem(RULES_SKIP_STORAGE_KEY) === '1' : false;
    primaryBtn.textContent = primaryLabel;
}

function openRules(mode = 'general') {
    rulesContinueCallback = null;
    renderRulesModal(mode, { showSkip: false, primaryLabel: 'BEGREPEN' });
    document.getElementById('rules-modal').style.display = 'flex';
}

function openPreGameRules(mode, onContinue) {
    rulesContinueCallback = typeof onContinue === 'function' ? onContinue : null;
    renderRulesModal(mode, { showSkip: true, primaryLabel: 'START SPEL' });
    document.getElementById('rules-modal').style.display = 'flex';
}

function closeRules() {
    document.getElementById('rules-modal').style.display = 'none';
    rulesContinueCallback = null;
}

function handleRulesPrimaryAction() {
    const skipCheckbox = document.getElementById('rules-skip-checkbox');
    if (skipCheckbox) {
        localStorage.setItem(RULES_SKIP_STORAGE_KEY, skipCheckbox.checked ? '1' : '0');
    }

    const callback = rulesContinueCallback;
    document.getElementById('rules-modal').style.display = 'none';
    rulesContinueCallback = null;
    if (typeof callback === 'function') callback();
}

function runWithPreGameRules(mode, startAction) {
    if (localStorage.getItem(RULES_SKIP_STORAGE_KEY) === '1') {
        startAction();
        return;
    }
    openPreGameRules(mode, startAction);
}

function openChecker() {
    document.getElementById('checker-modal').style.display = 'flex';
    document.getElementById('checker-input').value = '';
    document.getElementById('checker-result').innerHTML = '';
    document.getElementById('checker-input').focus();
}
function closeChecker() { document.getElementById('checker-modal').style.display = 'none'; }

function checkInputWord() {
    const input = document.getElementById('checker-input').value.trim().toUpperCase();
    const resDiv = document.getElementById('checker-result');
    if (!input) return;
    resDiv.innerHTML = "";
    const resultBadge = document.createElement('span');
    if (hasWord(input)) {
        resultBadge.className = 'valid-word';
        resultBadge.textContent = `✅ "${input}" is GELDIG`;
    } else {
        resultBadge.className = 'invalid-word';
        resultBadge.textContent = `❌ "${input}" is ONGELDIG`;
    }
    resDiv.appendChild(resultBadge);
}

// --- HIGHSCORES LOGIC ---
function openHighscores() { 
    document.getElementById('highscores-modal').style.display = 'flex'; 
    hsCurrentMode = 'regular';
    const periodBar = document.getElementById('hs-period-bar');
    const dailyDatePicker = document.getElementById('hs-daily-date-picker');
    const scopeBar = document.getElementById('hs-scope-bar');
    if (periodBar) periodBar.style.display = 'flex';
    if (dailyDatePicker) dailyDatePicker.style.display = 'none';
    if (scopeBar) scopeBar.style.display = 'flex';
    switchHighscoreScope('global', document.querySelector('.scope-btn'));
}

function openDailyHighscores() {
    document.getElementById('highscores-modal').style.display = 'flex';
    hsCurrentMode = 'daily';
    hsCurrentScope = 'global';
    const periodBar = document.getElementById('hs-period-bar');
    const dailyDatePicker = document.getElementById('hs-daily-date-picker');
    const scopeBar = document.getElementById('hs-scope-bar');
    if (periodBar) periodBar.style.display = 'none';
    if (dailyDatePicker) dailyDatePicker.style.display = 'block';
    if (scopeBar) scopeBar.style.display = 'none';
    ensureDailyDateOptions();
    renderDailyDatePicker();
    renderHighscores();
}

function closeHighscores() { document.getElementById('highscores-modal').style.display = 'none'; }
function closeViewGrid() { document.getElementById('view-grid-modal').style.display = 'none'; }

let hsCurrentScope = 'global'; 
let hsCurrentTab = 'today';
let hsCurrentMode = 'regular';
let hsDailyDateOptions = [];
let hsSelectedDailyDateKey = getUtcDateKey();
let viewedDailySharePayload = null;
let hsCache = { global: null, personal: null }; 
let hsDailyCache = {};
let hsLastError = null;

function clearHighscoreCache() {
    hsCache = { global: null, personal: null };
    hsDailyCache = {};
    hsLastError = null;
    renderHighscores(); 
}

function ensureDailyDateOptions() {
    if (hsDailyDateOptions.length > 0) return;

    const options = [];
    const base = new Date();
    for (let i = 0; i < 14; i++) {
        const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
        d.setUTCDate(d.getUTCDate() - i);
        options.push(getUtcDateKey(d));
    }

    hsDailyDateOptions = options;
    if (!hsSelectedDailyDateKey) hsSelectedDailyDateKey = options[0] || getUtcDateKey();
}

function formatDailyDateLabel(dateKey, idx) {
    const dailyNo = getDailySequenceNumber(dateKey);
    const numberSuffix = dailyNo ? ` - #${dailyNo}` : '';
    if (idx === 0) return `Vandaag${numberSuffix}`;
    if (idx === 1) return `Gisteren${numberSuffix}`;

    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(dateKey));
    if (!m) return `${String(dateKey)}${numberSuffix}`;
    return `${m[3]}-${m[2]}-${m[1]}${numberSuffix}`;
}

function renderDailyDatePicker() {
    const selectEl = document.getElementById('hs-daily-date-select');
    if (!selectEl) return;

    ensureDailyDateOptions();
    selectEl.innerHTML = '';

    hsDailyDateOptions.forEach((dateKey, idx) => {
        const opt = document.createElement('option');
        opt.value = dateKey;
        opt.textContent = formatDailyDateLabel(dateKey, idx);
        if (dateKey === hsSelectedDailyDateKey) opt.selected = true;
        selectEl.appendChild(opt);
    });

    selectEl.value = hsSelectedDailyDateKey;
}

function handleDailyDateSelectChange(value) {
    hsSelectedDailyDateKey = value;
    renderHighscores();
}

function switchHighscoreScope(scope, btn) {
    hsCurrentScope = scope;
    document.querySelectorAll('.scope-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    else document.querySelectorAll('.scope-btn')[scope === 'global' ? 0 : 1].classList.add('active');

    if (hsCurrentMode === 'daily') {
        renderHighscores();
        return;
    }

    switchHighscoreTab(hsCurrentTab, document.querySelector(`#hs-period-bar .tab-btn:nth-child(${getTabIndex(hsCurrentTab)})`));
}

function getTabIndex(tab) {
    if(tab === 'today') return 1;
    if(tab === 'week') return 2;
    return 3;
}

async function switchHighscoreTab(period, btnElement) {
    hsCurrentTab = period;
    document.querySelectorAll('#hs-period-bar .tab-btn').forEach(b => b.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    renderHighscores();
}

async function fetchDailyScoresForScopeAndDate(scope, dateKey) {
    const cacheKey = `${scope}_${dateKey}`;
    if (hsDailyCache[cacheKey]) return hsDailyCache[cacheKey];
    hsLastError = null;

    const { collection, query, where, limit, getDocs } = window.firebaseFuncs;

    if (scope === 'personal' && !myUsername) return [];

    try {
        const q = query(
            collection(window.db, 'daily_results', dateKey, 'entries'),
            where('won', '==', true),
            limit(200)
        );

        const snapshot = await getDocs(q);
        let data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

        if (scope === 'personal') {
            data = data.filter(item => (item.name || '') === myUsername);
        }

        data.sort((a, b) => {
            const scoreA = Number(a.playerScore || 0);
            const scoreB = Number(b.playerScore || 0);
            if (scoreB !== scoreA) return scoreB - scoreA;

            const timeA = a.playedAt && a.playedAt.seconds ? a.playedAt.seconds : 0;
            const timeB = b.playedAt && b.playedAt.seconds ? b.playedAt.seconds : 0;
            return timeB - timeA;
        });

        hsDailyCache[cacheKey] = data;
        return data;
    } catch(e) {
        const errCode = (e && e.code) ? e.code : '';
        const errMsg = String((e && e.message) ? e.message : '').toLowerCase();
        const isPermissionDenied = errCode === 'permission-denied' || errMsg.includes('insufficient permissions');

        hsLastError = {
            type: isPermissionDenied ? 'permission-denied' : 'unknown',
            original: e
        };

        if (!isPermissionDenied) {
            console.error('Daily fetch error:', e);
        }
        return null;
    }
}

async function fetchScoresForScope(scope) {
    if (hsCache[scope]) return hsCache[scope];
    hsLastError = null;
    
    const { collection, query, orderBy, limit, getDocs, where } = window.firebaseFuncs;
    let q;
    let needsSorting = false; 
    
    if (scope === 'personal') {
        if (!myUsername) return []; 
        q = query(
            collection(window.db, "highscores"), 
            where("name", "==", myUsername),
            limit(50)
        );
        needsSorting = true;
    } else {
        q = query(collection(window.db, "highscores"), orderBy("score", "desc"), limit(50));
    }
    
    try {
        const snapshot = await getDocs(q);
        let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (needsSorting) {
            data.sort((a, b) => b.score - a.score);
        }
        hsCache[scope] = data; 
        return data;
    } catch(e) {
        const errCode = (e && e.code) ? e.code : '';
        const errMsg = String((e && e.message) ? e.message : '').toLowerCase();
        const isPermissionDenied = errCode === 'permission-denied' || errMsg.includes('insufficient permissions');

        hsLastError = {
            type: isPermissionDenied ? 'permission-denied' : 'unknown',
            original: e
        };

        if (!isPermissionDenied) {
            console.error("Fetch error:", e);
        }
        return null;
    }
}

async function renderHighscores() {
    if (hsCurrentMode === 'daily') {
        await renderDailyHighscores();
        return;
    }

    const listEl = document.getElementById('hs-list');
    listEl.innerHTML = '<div style="color:#888; padding:20px;">Scores ophalen...</div>';
    const allScores = await fetchScoresForScope(hsCurrentScope);
    if (!allScores) {
        if (hsLastError && hsLastError.type === 'permission-denied') {
            listEl.innerHTML = '<div style="color:#f1c40f; padding:20px; line-height:1.5;">Highscores zijn nu niet toegankelijk door Firestore permissions.<br>Controleer de rules voor collectie "highscores".</div>';
        } else {
            listEl.innerHTML = '<div style="color:var(--hard); padding:20px;">Fout bij laden van highscores. Probeer opnieuw.</div>';
        }
        return;
    }

    const now = new Date();
    let filteredList = [];
    if (hsCurrentTab === 'all') {
        filteredList = allScores;
    } else if (hsCurrentTab === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        filteredList = allScores.filter(item => item.timestamp && item.timestamp.seconds * 1000 >= startOfDay);
    } else if (hsCurrentTab === 'week') {
        const day = now.getDay() || 7; 
        if(day !== 1) now.setHours(-24 * (day - 1)); 
        now.setHours(0,0,0,0);
        const startOfWeek = now.getTime();
        filteredList = allScores.filter(item => item.timestamp && item.timestamp.seconds * 1000 >= startOfWeek);
    }
    
    filteredList = filteredList.slice(0, 10);
    listEl.innerHTML = "";
    if (filteredList.length === 0) { listEl.innerHTML = `<div style="color:#666; padding:20px;">Nog geen scores ${hsCurrentTab === 'today' ? 'vandaag' : 'in deze periode'}.</div>`; return; }

    filteredList.forEach((scoreData, index) => {
        const row = document.createElement('div');
        row.className = 'hs-row';
        const dateObj = scoreData.timestamp ? new Date(scoreData.timestamp.seconds * 1000) : new Date();
        const dateStr = `${dateObj.getDate()}/${dateObj.getMonth()+1}`;

        const rankEl = document.createElement('div');
        rankEl.className = 'hs-rank';
        rankEl.textContent = `${index + 1}`;

        const nameEl = document.createElement('div');
        nameEl.className = 'hs-name';
        nameEl.textContent = scoreData.name || 'Onbekend';

        const dateEl = document.createElement('div');
        dateEl.className = 'hs-date';
        dateEl.textContent = dateStr;

        const scoreEl = document.createElement('div');
        scoreEl.className = 'hs-score';
        scoreEl.textContent = `${scoreData.score ?? 0}`;

        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'eye-btn';
        eyeBtn.title = 'Bekijk raster';
        eyeBtn.textContent = '👁️';
        eyeBtn.onclick = () => viewHighscoreGrid(scoreData);

        row.appendChild(rankEl);
        row.appendChild(nameEl);
        row.appendChild(dateEl);
        row.appendChild(scoreEl);
        row.appendChild(eyeBtn);
        listEl.appendChild(row);
    });
}

async function renderDailyHighscores() {
    const listEl = document.getElementById('hs-list');
    listEl.innerHTML = '<div style="color:#888; padding:20px;">Daily scores ophalen...</div>';

    ensureDailyDateOptions();
    const selectedDate = hsSelectedDailyDateKey || hsDailyDateOptions[0] || getUtcDateKey();
    const allScores = await fetchDailyScoresForScopeAndDate('global', selectedDate);

    if (!allScores) {
        if (hsLastError && hsLastError.type === 'permission-denied') {
            listEl.innerHTML = '<div style="color:#f1c40f; padding:20px; line-height:1.5;">Daily highscores zijn nu niet toegankelijk door Firestore permissions.<br>Controleer de rules voor collectie "daily_results".</div>';
        } else {
            listEl.innerHTML = '<div style="color:var(--hard); padding:20px;">Fout bij laden van daily highscores. Probeer opnieuw.</div>';
        }
        return;
    }

    const filteredList = allScores.slice(0, 10);
    listEl.innerHTML = '';
    if (filteredList.length === 0) {
        listEl.innerHTML = '<div style="color:#666; padding:20px;">Nog geen daily win-scores voor deze dag.</div>';
        return;
    }

    filteredList.forEach((scoreData, index) => {
        const row = document.createElement('div');
        row.className = 'hs-row';

        const rankEl = document.createElement('div');
        rankEl.className = 'hs-rank';
        rankEl.textContent = `${index + 1}`;

        const nameEl = document.createElement('div');
        nameEl.className = 'hs-name';
        nameEl.textContent = scoreData.name || 'Onbekend';

        const scoreEl = document.createElement('div');
        scoreEl.className = 'hs-score';
        scoreEl.textContent = `${scoreData.playerScore ?? 0}`;

        const aiScoreEl = document.createElement('div');
        aiScoreEl.className = 'hs-ai-score';
        aiScoreEl.textContent = `COMP ${scoreData.aiScore ?? 0}`;

        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'eye-btn';
        eyeBtn.title = 'Bekijk rasters';
        eyeBtn.textContent = '👁️';
        eyeBtn.onclick = () => viewHighscoreGrid(scoreData);

        row.appendChild(rankEl);
        row.appendChild(nameEl);
        row.appendChild(scoreEl);
        row.appendChild(aiScoreEl);
        row.appendChild(eyeBtn);
        listEl.appendChild(row);
    });
}

function viewHighscoreGrid(data) {
    const playerGrid = Array.isArray(data.playerGrid) ? data.playerGrid : data.grid;
    if (!Array.isArray(playerGrid)) return;

    const playerScore = Number.isFinite(data.playerScore) ? data.playerScore : (data.score ?? 0);
    const aiGrid = Array.isArray(data.aiGrid) ? data.aiGrid : null;
    const aiScore = Number.isFinite(data.aiScore) ? data.aiScore : 0;

    document.getElementById('view-grid-title').innerText = data.name || 'Scoredetail';
    document.getElementById('view-player-name').innerText = data.name || 'Speler';
    document.getElementById('view-player-score').innerText = String(playerScore);
    renderMiniGridWithOutlines(playerGrid, 'view-player-mini-grid', 'view-player-row-scores', 'view-player-col-scores');

    const aiWrapper = document.getElementById('view-ai-wrapper');
    if (aiGrid) {
        aiWrapper.style.display = 'flex';
        document.getElementById('view-ai-score').innerText = String(aiScore);
        renderMiniGridWithOutlines(aiGrid, 'view-ai-mini-grid', 'view-ai-row-scores', 'view-ai-col-scores');
    } else {
        aiWrapper.style.display = 'none';
    }

    const viewShareControls = document.getElementById('view-share-controls');
    viewedDailySharePayload = null;

    const entryUid = data.uid || data.id || null;

    const isOwnDailyScore = hsCurrentMode === 'daily'
        && !!window.currentUser
        && !!entryUid
        && entryUid === window.currentUser.uid;

    if (isOwnDailyScore) {
        const snapshot = buildShareGridSnapshot(playerGrid);
        viewedDailySharePayload = {
            uid: entryUid,
            name: data.name || (myUsername || 'Player'),
            dateKey: data.dateKey || hsSelectedDailyDateKey || getUtcDateKey(),
            playerScore,
            aiScore,
            won: typeof data.won === 'boolean' ? data.won : (playerScore > aiScore),
            shareGridColors: data.shareGridColors || snapshot.serializedColorCodes,
            shareRowScores: data.shareRowScores || snapshot.serializedRowScores,
            shareColScores: data.shareColScores || snapshot.serializedColScores
        };
    }

    if (viewShareControls) {
        viewShareControls.style.display = viewedDailySharePayload ? 'block' : 'none';
    }

    document.getElementById('view-grid-modal').style.display = 'flex';
}

function shareViewedDailyResult(channel) {
    if (!viewedDailySharePayload) {
        showFlashMessage('Daily', 'Delen is alleen beschikbaar voor je eigen resultaat', 2200);
        return;
    }

    shareDailyResult(channel, viewedDailySharePayload);
}

// --- FLASH MESSAGES ---
function showFlashMessage(title, content, duration = 2000) {
    const overlay = document.getElementById('flash-overlay');
    document.getElementById('flash-title').innerText = title;
    document.getElementById('flash-content').textContent = content;
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.style.display = 'none'; }, duration);
}

// --- MENU FUNCTIONS ---
function showDifficultySelect() { document.getElementById('main-menu').style.display='none'; document.getElementById('difficulty-select').style.display='flex'; }
function hideDifficultySelect() { document.getElementById('difficulty-select').style.display='none'; document.getElementById('main-menu').style.display='flex'; }

// --- ONLINE HOST FLOW ---
function showOnlineLobby() {
    isSinglePlayer = false;
    gameMode = 'online';
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('lobby-ui').style.display = 'flex';
    document.getElementById('lobby-start-buttons').style.display = 'block';
    document.getElementById('share-area').style.display = 'none';
    document.getElementById('daily-share-controls').style.display = 'none';
    updateSimulationButton();
}
function hideOnlineLobby() {
    document.getElementById('lobby-ui').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
}

async function startDailyMode() {
    runWithPreGameRules('daily', () => {
        ensureUsername(async () => {
            const isReady = await ensureFirebaseAuthReady();
            if (!isReady) {
                showFlashMessage('Daily', 'Nog geen Firebase login');
                return;
            }

            const uid = window.currentUser.uid;
            const dateKey = getUtcDateKey();
            const enforceDailyLimit = isDailyAttemptLimitEnabled && !isDailyAdminBypassActive();

            try {
                if (enforceDailyLimit) {
                    const playedState = await hasPlayedDaily(dateKey, uid);
                    if (playedState.played) {
                        const result = playedState.data || {};
                        const score = result.playerScore ?? '-';
                        const wonText = result.won ? 'Gewonnen' : 'Verloren';
                        showFlashMessage('Daily al gespeeld', `${wonText} • Score ${score}`, 2600);
                        return;
                    }
                }

                const puzzle = await getOrCreateDailyPuzzle(dateKey);
                initializeDailyGame(puzzle, dateKey);
            } catch (e) {
                console.error('Daily start fout:', e);
                showFlashMessage('Daily', 'Daily puzzel kon niet laden');
            }
        });
    });
}

function initializeDailyGame(puzzle, dateKey) {
    if (unsubscribeGame) {
        unsubscribeGame();
        unsubscribeGame = null;
    }

    stopOnlineSimulation();
    stopSinglePlayerSimulation();

    currentGameId = null;
    myRoleId = null;
    window.activeTurnPlayerId = null;

    isSinglePlayer = true;
    gameMode = 'daily';
    aiDifficulty = 'hard';
    opponentName = 'Comp.';
    finalTurnProcessed = false;
    isAiProcessing = false;
    pendingLetter = null;
    activeCellIndex = null;
    isMyPickTurn = true;
    dailyGameFinished = false;
    lastDailyResultPayload = null;

    currentDailyPuzzle = puzzle;
    currentDailyDateKey = dateKey;
    dailyAiSequenceIndex = 0;

    myGrid = Array(25).fill('');
    opponentGrid = Array(25).fill('');

    const startLetters = Array.isArray(puzzle.startLetters) ? puzzle.startLetters : [];
    const startPositions = Array.isArray(puzzle.startPositions) ? puzzle.startPositions : [];
    if (startLetters.length < 2 || startPositions.length < 2) {
        showFlashMessage('Daily', 'Ongeldige daily puzzel');
        return;
    }

    myGrid[startPositions[0]] = startLetters[0];
    myGrid[startPositions[1]] = startLetters[1];
    opponentGrid[startPositions[0]] = startLetters[0];
    opponentGrid[startPositions[1]] = startLetters[1];

    document.getElementById('start-screen').style.display = 'none';
    gameUi.style.display = 'block';
    winChanceContainer.style.display = 'none';
    document.getElementById('daily-share-controls').style.display = 'none';

    renderGrid();
    updateGameControlButtons();
    updateUI('DAILY: JIJ BEGINT');
    updateSimulationButton();
    const dailyNo = getDailySequenceNumber(dateKey);
    const dailyTitle = dailyNo ? `DAILY #${dailyNo}` : 'DAILY';
    showFlashMessage(dailyTitle, `${dateKey}`);
}

async function ensureFirebaseAuthReady() {
    if (window.currentUser) return true;
    if (window.authReadyPromise) {
        try {
            await window.authReadyPromise;
        } catch (e) {
            console.error("Auth init fout:", e);
        }
    }
    return !!window.currentUser;
}

async function prepareOnlineGame() {
    runWithPreGameRules('online', () => {
        ensureUsername(() => {
            createFirebaseGame();
        });
    });
}

async function createFirebaseGame() {
    const { addDoc, collection } = window.firebaseFuncs;
    const isReady = await ensureFirebaseAuthReady();
    if (!isReady) {
        showFlashMessage("Online niet klaar", "Nog geen Firebase login");
        return;
    }

    const uid = window.currentUser.uid;
    
    const p1Grid = Array(25).fill("");
    const p2Grid = Array(25).fill("");
    const startLetters = [getWeightedLetter(), getWeightedLetter(), getWeightedLetter()];
    const startPositions = getUniqueRowColStartPositions(3);

    for (let i = 0; i < startLetters.length; i++) {
        const pos = startPositions[i];
        const letter = startLetters[i];
        p1Grid[pos] = letter;
        p2Grid[pos] = letter;
    }

    try {
        const docRef = await addDoc(collection(window.db, "games"), {
            hostId: uid, hostName: myUsername,
            guestId: null, guestName: "Wachten...",
            turn: "WAITING", status: "waiting",
            p1Grid: p1Grid, p2Grid: p2Grid,
            pendingLetter: null, lastUpdated: new Date()
        });
        
        currentGameId = docRef.id;
        document.getElementById('lobby-start-buttons').style.display = 'none';
        document.getElementById('share-area').style.display = 'block';
        joinFirebaseGameById(currentGameId);
    } catch (error) {
        console.error("Online game aanmaken mislukt:", error);
        if (error && (error.code === 'permission-denied' || String(error.message || '').toLowerCase().includes('insufficient permissions'))) {
            alert("Firebase weigert toegang (permission-denied). Controleer Firestore Rules voor anonieme spelers op collectie 'games'.");
        } else {
            alert("Kon online game niet starten. Probeer het opnieuw.");
        }
    }
}

async function shareViaWhatsapp() {
    const baseUrl = window.location.origin + window.location.pathname; 
    const gameUrl = `${baseUrl}?game=${currentGameId}`;
    
    const shareData = {
        title: 'LetterDuel',
        text: 'Ik daag je uit voor een potje LetterDuel! ⚔️',
        url: gameUrl
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            return; 
        } catch (err) {
            console.log("Delen geannuleerd");
        }
    }

    const text = `Ik daag je uit voor LetterDuel! ⚔️\nKlik hier om direct mee te doen:\n${gameUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function copyGameLink() {
    const baseUrl = window.location.origin + window.location.pathname; 
    const gameUrl = `${baseUrl}?game=${currentGameId}`;

    navigator.clipboard.writeText(gameUrl).then(() => {
        showFlashMessage("Gekopieerd!", "Link staat op je klembord!");
    }).catch(err => {
        console.error('Kon niet kopiëren: ', err);
        // Fallback als clipboard API faalt
        alert("Kopieer deze link:\n" + gameUrl);
    });
}


// --- ONLINE GUEST FLOW ---
function handleGuestEntry(gameId) {
    runWithPreGameRules('online', () => {
        isSinglePlayer = false;
        gameMode = 'online';
        updateSimulationButton();
        document.getElementById('start-screen').style.display = 'none'; 
        ensureUsername(() => {
            joinFirebaseGameById(gameId);
        });
    });
}

function isOnlineSessionActive() {
    return gameMode === 'online' && !isSinglePlayer && !!currentGameId && !!myRoleId;
}

function updateSimulationButton() {
    const simBtn = document.getElementById('simulate-btn');
    if (!simBtn) return;

    if (!isDailyAdminBypassActive()) {
        simBtn.style.display = 'none';
        return;
    }

    simBtn.style.display = 'inline-flex';

    if (isOnlineSessionActive()) {
        simBtn.textContent = isOnlineSimulationRunning ? '⏹ Stop Online Sim' : '🌐 Sim Online';
    } else {
        simBtn.textContent = isSimulationRunning ? '⏹ Stop Sim' : '🧪 Simulatie';
    }
}

function updateGameControlButtons() {
    const scrambleBtn = document.getElementById('scramble-btn');
    if (scrambleBtn) {
        const filledCount = myGrid.filter(c => c !== '').length;
        const canScramble = gameUi.style.display === 'block' && gameMode !== 'daily' && filledCount <= 2;
        scrambleBtn.style.display = canScramble ? 'inline-flex' : 'none';
    }

    updateSimulationButton();
}

function stopSinglePlayerSimulation() {
    if (simulationIntervalId) {
        clearInterval(simulationIntervalId);
        simulationIntervalId = null;
    }
    isSimulationRunning = false;
    simulationAwaitingAiPick = false;
    isAiProcessing = false;
    updateSimulationButton();
}

function stopOnlineSimulation() {
    if (onlineSimulationIntervalId) {
        clearInterval(onlineSimulationIntervalId);
        onlineSimulationIntervalId = null;
    }
    isOnlineSimulationRunning = false;
    updateSimulationButton();
}

async function onlineSimulationTick() {
    if (!isOnlineSimulationRunning || isSinglePlayer || !currentGameId) {
        stopOnlineSimulation();
        return;
    }

    const { doc, getDoc, updateDoc } = window.firebaseFuncs;

    try {
        const gameRef = doc(window.db, "games", currentGameId);
        const snap = await getDoc(gameRef);
        if (!snap.exists()) {
            stopOnlineSimulation();
            return;
        }

        const data = snap.data();
        if (data.status !== 'playing' || data.turn === 'FINISHED') {
            stopOnlineSimulation();
            return;
        }

        const hostId = data.hostId;
        const guestId = data.guestId;
        if (!hostId || !guestId) {
            updateUI("SIMULATIE: wacht op 2e speler...");
            return;
        }

        let p1Grid = Array.isArray(data.p1Grid) ? [...data.p1Grid] : Array(25).fill("");
        let p2Grid = Array.isArray(data.p2Grid) ? [...data.p2Grid] : Array(25).fill("");
        let nextPending = data.pendingLetter || null;
        let nextTurn = data.turn;

        if (nextPending) {
            const placerIsHost = nextTurn === hostId;
            const placerGrid = placerIsHost ? p1Grid : p2Grid;
            const placement = getBestPositionForLetter(placerGrid, nextPending);

            if (placement.index === -1) {
                nextTurn = 'FINISHED';
                nextPending = null;
            } else {
                placerGrid[placement.index] = nextPending;
                nextPending = null;

                const p1Count = p1Grid.filter(c => c !== "").length;
                const p2Count = p2Grid.filter(c => c !== "").length;

                if (p1Count >= 25 && p2Count >= 25) {
                    nextTurn = 'FINISHED';
                } else {
                    nextTurn = placerIsHost ? hostId : guestId;
                }
            }
        } else {
            const pickerIsHost = nextTurn === hostId;
            const pickerGrid = pickerIsHost ? p1Grid : p2Grid;
            const otherPlayerId = pickerIsHost ? guestId : hostId;

            const pick = getBestPickAndPositionHeuristic(pickerGrid);
            if (pick.index === -1) {
                nextTurn = 'FINISHED';
            } else {
                pickerGrid[pick.index] = pick.letter;
                nextPending = pick.letter;
                nextTurn = otherPlayerId;
            }
        }

        await updateDoc(gameRef, {
            p1Grid,
            p2Grid,
            pendingLetter: nextPending,
            turn: nextTurn,
            status: nextTurn === 'FINISHED' ? 'finished' : 'playing',
            lastUpdated: new Date()
        });
    } catch (err) {
        console.error("Online simulatie fout:", err);
        stopOnlineSimulation();
        showFlashMessage("ONLINE SIM", "Gestopt door fout");
    }
}

function toggleOnlineSimulation() {
    if (isOnlineSimulationRunning) {
        stopOnlineSimulation();
        showFlashMessage("ONLINE SIM", "Gestopt");
        return;
    }

    if (isSinglePlayer || gameUi.style.display !== 'block' || !currentGameId) {
        showFlashMessage("ONLINE SIM", "Start eerst een online game");
        return;
    }

    if (myRoleId !== 'host') {
        showFlashMessage("ONLINE SIM", "Alleen host kan simuleren");
        return;
    }

    if (document.getElementById('result-modal').style.display === 'flex') {
        showFlashMessage("ONLINE SIM", "Deze game is al afgelopen");
        return;
    }

    isOnlineSimulationRunning = true;
    updateSimulationButton();
    showFlashMessage("ONLINE SIM", "Auto-play gestart");
    onlineSimulationIntervalId = setInterval(onlineSimulationTick, 650);
}

function toggleSimulation() {
    if (!isDailyAdminBypassActive()) {
        showFlashMessage('SIMULATIE', 'Alleen beschikbaar voor admin123', 2200);
        return;
    }

    if (isOnlineSessionActive()) {
        toggleOnlineSimulation();
    } else {
        toggleSinglePlayerSimulation();
    }
}

function finishSimulationGameSoon() {
    if (finalTurnProcessed) return;
    finalTurnProcessed = true;
    isAiProcessing = true;
    renderGrid();
    setTimeout(() => {
        finishGame();
        stopSinglePlayerSimulation();
    }, 800);
}

function simulatePendingPlacementStep() {
    if (!pendingLetter) return;

    const targetIndex = getBestPositionForLetter(myGrid, pendingLetter).index;
    if (targetIndex === -1) {
        finishSimulationGameSoon();
        return;
    }

    performMoveSinglePlayer(targetIndex, pendingLetter);
    pendingLetter = null;
    activeCellIndex = null;

    const myCount = myGrid.filter(x => x !== "").length;

    if (myCount >= 25) {
        updateUI("SIMULATIE: laatste letter geplaatst...");
        updateWinChanceVisualization();
        finishSimulationGameSoon();
        return;
    }

    if (gameMode === 'daily') {
        isMyPickTurn = true;
        simulationAwaitingAiPick = false;
        updateUI("SIMULATIE: daily speler aan zet");
        return;
    }

    isMyPickTurn = true;
    simulationAwaitingAiPick = false;
    updateWinChanceVisualization();
    updateUI("SIMULATIE: speler aan zet");
}

function simulatePlayerPickStep() {
    const pick = getBestPickAndPositionHeuristic(myGrid);
    if (pick.index === -1) {
        finishSimulationGameSoon();
        return;
    }

    performMoveSinglePlayer(pick.index, pick.letter);
    const aiMirrorIndex = getBestPositionForLetter(opponentGrid, pick.letter).index;
    if (aiMirrorIndex !== -1) opponentGrid[aiMirrorIndex] = pick.letter;

    activeCellIndex = null;
    isMyPickTurn = false;
    simulationAwaitingAiPick = true;
    updateWinChanceVisualization();
    updateUI(`SIMULATIE: speler kiest ${pick.letter}`);
}

function simulateAiPickStep() {
    const aiPick = getBestPickAndPositionHeuristic(opponentGrid);
    if (aiPick.index === -1) {
        finishSimulationGameSoon();
        return;
    }

    opponentGrid[aiPick.index] = aiPick.letter;
    pendingLetter = aiPick.letter;
    isMyPickTurn = false;
    simulationAwaitingAiPick = false;
    updateWinChanceVisualization();
    updateUI(`SIMULATIE: computer kiest ${aiPick.letter}`);
}

function simulateDailyAiPickStep() {
    if (!currentDailyPuzzle || !Array.isArray(currentDailyPuzzle.aiSequence)) {
        finishSimulationGameSoon();
        return;
    }

    if (dailyAiSequenceIndex >= currentDailyPuzzle.aiSequence.length) {
        finishSimulationGameSoon();
        return;
    }

    const nextLetter = currentDailyPuzzle.aiSequence[dailyAiSequenceIndex];
    dailyAiSequenceIndex += 1;

    const aiPickIndex = getBestPositionForLetter(opponentGrid, nextLetter).index;
    if (aiPickIndex === -1) {
        finishSimulationGameSoon();
        return;
    }

    opponentGrid[aiPickIndex] = nextLetter;
    pendingLetter = nextLetter;
    isMyPickTurn = false;
    simulationAwaitingAiPick = false;
    updateUI(`SIMULATIE: Comp. kiest ${nextLetter}`);
}

function simulationTick() {
    if (!isSimulationRunning || !isSinglePlayer) {
        stopSinglePlayerSimulation();
        return;
    }

    if (finalTurnProcessed) {
        stopSinglePlayerSimulation();
        return;
    }

    const myCount = myGrid.filter(x => x !== "").length;
    if (myCount >= 25) {
        finishSimulationGameSoon();
        return;
    }

    if (gameMode === 'daily') {
        if (simulationAwaitingAiPick) {
            simulateDailyAiPickStep();
            return;
        }

        if (pendingLetter) {
            simulatePendingPlacementStep();
            return;
        }

        if (isMyPickTurn) {
            simulatePlayerPickStep();
            return;
        }
    }

    if (simulationAwaitingAiPick) {
        simulateAiPickStep();
        return;
    }

    if (pendingLetter) {
        simulatePendingPlacementStep();
        return;
    }

    if (isAiProcessing && !isMyPickTurn) {
        return;
    }

    if (isMyPickTurn) {
        simulatePlayerPickStep();
    }
}

function toggleSinglePlayerSimulation() {
    if (isSimulationRunning) {
        showFlashMessage("SIMULATIE", "Gestopt");
        stopSinglePlayerSimulation();
        updateUI();
        return;
    }

    if (!isSinglePlayer || gameUi.style.display !== 'block') {
        showFlashMessage("SIMULATIE", "Start eerst een singleplayer of Daily match");
        return;
    }

    if (finalTurnProcessed || document.getElementById('result-modal').style.display === 'flex') {
        showFlashMessage("SIMULATIE", "Deze game is al afgelopen");
        return;
    }

    isSimulationRunning = true;
    simulationAwaitingAiPick = false;
    isAiProcessing = true;
    updateSimulationButton();
    showFlashMessage("SIMULATIE", "Auto-play gestart");

    simulationIntervalId = setInterval(simulationTick, 550);
}

// --- SINGLE PLAYER ---
function startSinglePlayer(difficulty) {
    runWithPreGameRules('single', () => {
        ensureUsername(() => {
            if (unsubscribeGame) {
                unsubscribeGame();
                unsubscribeGame = null;
            }
            currentGameId = null;
            myRoleId = null;
            window.activeTurnPlayerId = null;
            stopOnlineSimulation();
            stopSinglePlayerSimulation();
            isSinglePlayer = true;
            gameMode = 'single';
            currentDailyPuzzle = null;
            currentDailyDateKey = null;
            dailyAiSequenceIndex = 0;
            dailyGameFinished = false;
            lastDailyResultPayload = null;
            aiDifficulty = difficulty; opponentName = "Computer";
            finalTurnProcessed = false; isAiProcessing = false;
            setupStartGrids(false); 
            const iStart = Math.random() > 0.5;
            document.getElementById('start-screen').style.display = 'none';
            gameUi.style.display = 'block';
            winChanceContainer.style.display = 'block';
            document.getElementById('daily-share-controls').style.display = 'none';
            
            showFlashMessage("MUNT OPGOOIEN...", "🪙", 1500);
            setTimeout(() => {
                if (iStart) {
                    isMyPickTurn = true;
                    showFlashMessage("Jij Wint!", "JIJ BEGINT");
                    updateUI("JIJ MAG BEGINNEN!");
                } else {
                    isMyPickTurn = false;
                    showFlashMessage("Helaas!", "COMPUTER BEGINT");
                    updateUI("COMPUTER MAG EERST...");
                    handleAiStart();
                }
            }, 1500);
            updateWinChanceVisualization();
            updateGameControlButtons();
        });
    });
}

function handleAiStart() {
    isAiProcessing = true; 
    setTimeout(() => {
        const letters = "ENATIRSLGD";
        const randomChar = letters.charAt(Math.floor(Math.random() * letters.length));
        let emptyIndices = opponentGrid.map((v, i) => v === "" ? i : null).filter(v => v !== null);
        let randomIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        opponentGrid[randomIdx] = randomChar;
        pendingLetter = randomChar;
        isMyPickTurn = false; 
        isAiProcessing = false;
        updateUI(); updateWinChanceVisualization();
    }, 1000);
}

async function tryJoinGameAsGuest(gameId, uid, username) {
    if (isJoiningOnlineGame) return 'pending';
    isJoiningOnlineGame = true;

    try {
        const { doc, runTransaction } = window.firebaseFuncs;
        const gameRef = doc(window.db, "games", gameId);

        const result = await runTransaction(window.db, async (transaction) => {
            const snap = await transaction.get(gameRef);
            if (!snap.exists()) return 'missing';

            const gameData = snap.data();
            if (gameData.guestId && gameData.guestId !== uid) return 'full';
            if (gameData.guestId === uid) return 'already';

            const hostStarts = Math.random() > 0.5;
            const startTurn = hostStarts ? gameData.hostId : uid;

            transaction.update(gameRef, {
                guestId: uid,
                guestName: username,
                status: "playing",
                turn: startTurn
            });

            return 'joined';
        });

        return result || 'unknown';
    } finally {
        isJoiningOnlineGame = false;
    }
}

// --- GAME LOGIC ---
function joinFirebaseGameById(gameId) {
    const { doc, onSnapshot } = window.firebaseFuncs;
    const uid = window.currentUser.uid;
    currentGameId = gameId;

    unsubscribeGame = onSnapshot(doc(window.db, "games", gameId), (snapshot) => {
        if (!snapshot.exists()) { alert("Spel bestaat niet of is afgelopen!"); location.href = window.location.pathname; return; }
        const data = snapshot.data();
        
        // Update turn global
        window.activeTurnPlayerId = data.turn; 

        if (data.hostId === uid) {
            myRoleId = 'host';
            opponentName = data.guestName || "Wachten...";
        }
        else if (data.guestId === uid) {
            myRoleId = 'guest';
            opponentName = data.hostName;
        }
        else if (!data.guestId && data.hostId !== uid) {
            if (!isJoiningOnlineGame) {
                tryJoinGameAsGuest(gameId, uid, myUsername)
                    .then((joinStatus) => {
                        if (joinStatus === 'full') {
                            alert("Spel is vol!");
                            location.href = window.location.pathname;
                        } else if (joinStatus === 'missing') {
                            alert("Spel bestaat niet of is afgelopen!");
                            location.href = window.location.pathname;
                        }
                    })
                    .catch((err) => {
                        console.error("Kon niet joinen:", err);
                        alert("Kon niet verbinden met het spel.");
                        location.href = window.location.pathname;
                    });
            }
            return;
        } else {
            alert("Spel is vol!"); location.href = window.location.pathname; return;
        }

        const myGridKey = myRoleId === 'host' ? 'p1Grid' : 'p2Grid';
        const oppGridKey = myRoleId === 'host' ? 'p2Grid' : 'p1Grid';
        myGrid = data[myGridKey]; opponentGrid = data[oppGridKey];
        pendingLetter = data.pendingLetter;

        if (data.status === 'playing') {
            document.getElementById('start-screen').style.display = 'none';
            gameUi.style.display = 'block';
            winChanceContainer.style.display = 'block';
            isSinglePlayer = false;
            gameMode = 'online';
            document.getElementById('daily-share-controls').style.display = 'none';
            updateSimulationButton();
        } else if (data.status === 'waiting' && myRoleId === 'host') {
            document.getElementById('start-screen').style.display = 'flex';
            document.getElementById('lobby-ui').style.display = 'flex';
            document.getElementById('share-area').style.display = 'block';
            document.getElementById('lobby-start-buttons').style.display = 'none';
        }

        if (isOnlineSimulationRunning && (data.status !== 'playing' || data.turn === 'FINISHED')) {
            stopOnlineSimulation();
        }

        if (lastStatus === "waiting" && data.status === "playing") {
             showFlashMessage("MUNT OPGOOIEN...", "🪙", 1500);
             setTimeout(() => {
                 if(data.turn === uid) showFlashMessage("Jij Wint!", "JIJ MAG STARTEN");
                 else showFlashMessage("Helaas!", "TEGENSTANDER BEGINT");
             }, 1500);
        }
        lastStatus = data.status; 
        
        // CHECK EINDE SPEL
        const myCount = myGrid.filter(c => c!=="").length;
        const oppCount = opponentGrid.filter(c => c!=="").length;
        
        if (myCount >= 25 && oppCount >= 25) {
             if(!finalTurnProcessed) {
                 finalTurnProcessed = true; renderGrid(); setTimeout(finishGame, 1500);
             }
             return;
        }

        if (data.status === 'playing') {
            if (data.turn === uid) {
                // FIX: VEILIGHEID: Als het mijn beurt is, mag er nooit een AI-lock op zitten
                isAiProcessing = false;

                if (pendingLetter) isMyPickTurn = false; else isMyPickTurn = true;
            } else isMyPickTurn = false;
        }
        
        renderGrid(); updateUI(); updateWinChanceVisualization();
    });
}

// -------------------------------------------------------------
// --- AANGEPASTE LOGICA ---
// -------------------------------------------------------------

async function sendMoveToFirebase(index, char, isPlacingPending) {
    // UI direct locken
    isMyPickTurn = false;
    pendingLetter = null; 
    activeCellIndex = null;
    updateUI(); 

    const { updateDoc, doc, getDoc } = window.firebaseFuncs;
    const uid = window.currentUser.uid;
    
    // Update lokaal en render direct
    myGrid[index] = char;
    renderGrid();

    const myGridKey = myRoleId === 'host' ? 'p1Grid' : 'p2Grid';
    const updates = { [myGridKey]: myGrid };

    const gameSnap = await getDoc(doc(window.db, "games", currentGameId));
    const gData = gameSnap.data();
    const currentOppId = myRoleId === 'host' ? gData.guestId : gData.hostId;
    
    let nextTurn;
    let nextPending;

    const myCount = myGrid.filter(x => x !== "").length;
    const oppCount = opponentGrid.filter(x => x !== "").length;

    if (!isPlacingPending) {
        nextPending = char;
        nextTurn = currentOppId;
    } else {
        nextPending = null;

        if (myCount >= 25 && oppCount >= 25) nextTurn = "FINISHED";
        else nextTurn = uid;
    }

    updates.pendingLetter = nextPending;
    updates.turn = nextTurn;
    updates.status = nextTurn === 'FINISHED' ? 'finished' : 'playing';
    await updateDoc(doc(window.db, "games", currentGameId), updates);
}
function createGridUI() {
    gridDisplay.innerHTML = "";
    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell'); cell.id = `cell-${i}`;
        cell.onclick = () => handleCellClick(i);
        gridDisplay.appendChild(cell);
    }
}

function setupStartGrids(asymmetric) {
    myGrid = Array(25).fill("");
    opponentGrid = Array(25).fill("");

    const startLetters = [getWeightedLetter(), getWeightedLetter(), getWeightedLetter()];
    const myStartPositions = getUniqueRowColStartPositions(3);
    const opponentStartPositions = asymmetric ? getUniqueRowColStartPositions(3) : myStartPositions;

    for (let i = 0; i < startLetters.length; i++) {
        const letter = startLetters[i];
        myGrid[myStartPositions[i]] = letter;
        opponentGrid[opponentStartPositions[i]] = letter;
    }

    renderGrid();
}

function handleCellClick(index) {
    if (isSimulationRunning || isOnlineSimulationRunning) return;
    if (isAiProcessing) return; 
    if (myGrid[index] !== "") return;
    
    // --- STRIKTE BEURT CONTROLE VOOR ONLINE SPEL ---
    if (!isSinglePlayer) {
        if (window.activeTurnPlayerId && window.activeTurnPlayerId !== window.currentUser.uid) {
            return;
        }
    }

    if (isSinglePlayer) {
        if (pendingLetter) {
            const letterToPlace = pendingLetter;
            pendingLetter = null;
            performMoveSinglePlayer(index, letterToPlace);
            isMyPickTurn = false;
            updateUI();

            if (myGrid.filter(x => x !== "").length >= 25) {
                 if(!finalTurnProcessed) { 
                     finalTurnProcessed = true; 
                     isAiProcessing = true; // Lock tijdens finish animatie
                     renderGrid(); 
                     setTimeout(finishGame, 1500); 
                 }
                 return;
            }

            if (gameMode === 'daily') {
                isMyPickTurn = true;
                updateUI('DAILY: JIJ KIEST DE VOLGENDE LETTER');
                return;
            }
            isMyPickTurn = true; updateUI();
        } else if (isMyPickTurn) { activeCellIndex = index; renderGrid(); updateUI(); }
    } else {
        if (pendingLetter) {
            sendMoveToFirebase(index, pendingLetter, true);
        } else if (isMyPickTurn) { 
            activeCellIndex = index; renderGrid(); updateUI(); 
        }
    }
}

function handleKey(letter) {
    if (isSimulationRunning || isOnlineSimulationRunning) return;
    if (isAiProcessing) return; 
    if (activeCellIndex === null || myGrid[activeCellIndex] !== "") return;
    
    if (isSinglePlayer) {
        if (!isMyPickTurn) return;
        
        isMyPickTurn = false;
        isAiProcessing = true; 
        
        performMoveSinglePlayer(activeCellIndex, letter);
        activeCellIndex = null;
        updateUI();

        const aiEmptyIndex = getBestPositionForLetter(opponentGrid, letter).index;
        if(aiEmptyIndex !== -1) opponentGrid[aiEmptyIndex] = letter;

        if (gameMode !== 'daily') updateWinChanceVisualization();
        
        const myCount = myGrid.filter(x=>x!=="").length;

        if (myCount >= 25) {
             if(!finalTurnProcessed) { 
                 finalTurnProcessed = true; 
                 renderGrid(); 
                 setTimeout(finishGame, 1500); 
             }
           } else if (gameMode === 'daily') {
               handleDailyAiReaction();
               return;
        } else {
            handleAiReaction(null);
        }
    } else {
        if (!isMyPickTurn) return;
        sendMoveToFirebase(activeCellIndex, letter, false);
        activeCellIndex = null;
    }
}

function handleDailyAiReaction() {
    if (!currentDailyPuzzle || !Array.isArray(currentDailyPuzzle.aiSequence)) {
        showFlashMessage('Daily', 'Puzzelgegevens ontbreken');
        return;
    }

    if (myGrid.filter(x => x !== "").length >= 25) {
        if (!finalTurnProcessed) {
            finalTurnProcessed = true;
            renderGrid();
            setTimeout(finishGame, 1500);
        }
        return;
    }

    if (dailyAiSequenceIndex >= currentDailyPuzzle.aiSequence.length) {
        if (!finalTurnProcessed) {
            finalTurnProcessed = true;
            renderGrid();
            setTimeout(finishGame, 1500);
        }
        return;
    }

    isAiProcessing = true;
    updateUI('Comp. denkt na...', true);
    setTimeout(() => {
        const nextLetter = currentDailyPuzzle.aiSequence[dailyAiSequenceIndex];
        dailyAiSequenceIndex += 1;

        const aiPlacement = getBestPositionForLetter(opponentGrid, nextLetter).index;
        if (aiPlacement !== -1) {
            opponentGrid[aiPlacement] = nextLetter;
            pendingLetter = nextLetter;
            isMyPickTurn = false;
            isAiProcessing = false;
            renderGrid();
            updateUI('DAILY: PLAATS DE LETTER');
        } else {
            if (!finalTurnProcessed) {
                finalTurnProcessed = true;
                renderGrid();
                setTimeout(finishGame, 1500);
            }
        }
    }, 450);
}

// -------------------------------------------------------------
// --- EINDE AANGEPASTE FUNCTIES ---
// -------------------------------------------------------------

function performMoveSinglePlayer(index, letter) { myGrid[index] = letter; renderGrid(); }

function handleAiReaction(letterFromPlayer) {
    if (letterFromPlayer) {
        opponentGrid[getBestPositionForLetter(opponentGrid, letterFromPlayer).index] = letterFromPlayer;
        updateWinChanceVisualization();
    }
    if (myGrid.filter(x=>x!=="").length >= 25) { 
        if(!finalTurnProcessed) { 
            finalTurnProcessed = true; 
            isAiProcessing = true; // Lock
            renderGrid(); 
            setTimeout(finishGame, 1500); 
        }
        return; 
    }
    updateUI("Computer denkt na...", true);
    setTimeout(() => {
        let aiPick;
        if (aiDifficulty === 'hard') aiPick = getBestPickAndPositionHeuristic(opponentGrid); 
        else aiPick = getBestPickAndPositionHeuristic(opponentGrid);

        if (aiPick.index === -1) {
            if (!finalTurnProcessed) {
                finalTurnProcessed = true;
                renderGrid();
                setTimeout(finishGame, 1500);
            }
            return;
        }

        opponentGrid[aiPick.index] = aiPick.letter;
        pendingLetter = aiPick.letter;
        
        isMyPickTurn = false; 
        isAiProcessing = false; // UNLOCK HIER PAS
        renderGrid();
        updateWinChanceVisualization(); updateUI();
    }, 500);
}

function canPlacePendingLetterNow() {
    if (!pendingLetter) return false;
    if (isSinglePlayer) return true;
    return window.activeTurnPlayerId === window.currentUser.uid;
}

function updateUI(overrideMsg, isThinking) {
    instructionText.style.whiteSpace = "normal";

    const shouldPlacePendingNow = canPlacePendingLetterNow();
    if (shouldPlacePendingNow && lastAnnouncedPendingLetter !== pendingLetter) {
        const picker = gameMode === 'online' ? 'Tegenstander' : 'Computer';
        showFlashMessage('LETTER GEKOZEN', `${picker} koos: ${pendingLetter}`, 1400);
        lastAnnouncedPendingLetter = pendingLetter;
    }
    if (!pendingLetter) {
        lastAnnouncedPendingLetter = null;
    }

    if (isThinking) { 
        instructionText.innerText = overrideMsg; 
        instructionText.style.color = "var(--text-muted)";
        letterDisplay.innerText = ""; 
        keyboard.style.display = 'none'; 
        return; 
    }

    const filledCount = myGrid.filter(c => c !== "").length;

    // --- FIX: ALS ROOSTER VOL IS, ALTIJD WACHTEN ---
    if (filledCount >= 25) {
        instructionText.innerText = "WACHTEN OP TEGENSTANDER..."; 
        instructionText.style.color = "var(--text-muted)"; 
        instructionText.style.fontSize = "1rem";
        letterDisplay.innerText = "...";
        document.body.classList.remove("highlight-empty"); 
        keyboard.style.display = 'none';
        return;
    }
    // -----------------------------------------------

    instructionText.style.fontSize = "1rem";

    if (pendingLetter) {
        // FIX: In SP is het altijd 'jouw beurt' als er een pending letter is
        let isMyTurn = false;
        if (isSinglePlayer) {
            isMyTurn = true;
        } else {
            isMyTurn = window.activeTurnPlayerId === window.currentUser.uid;
        }
        
        if (isMyTurn) {
            instructionText.innerText = "PLAATS DE LETTER"; 
            instructionText.style.color = "var(--primary)";
        } else {
            instructionText.innerText = "TEGENSTANDER IS AAN ZET...";
            instructionText.style.color = "var(--text-muted)";
        }
        
        letterDisplay.innerText = isMyTurn ? pendingLetter : "...";
        
        if (isMyTurn) {
            document.body.classList.add("highlight-empty"); 
        } else {
            document.body.classList.remove("highlight-empty");
        }
        
        keyboard.style.display = 'none';
    } else if (isMyPickTurn) {
        document.body.classList.remove("highlight-empty");
        letterDisplay.innerText = "?";
        
        if (activeCellIndex !== null) { 
            instructionText.innerText = "KIES LETTER:"; 
            instructionText.style.color = "var(--text-main)";
            instructionText.style.fontSize = "1rem"; 
            keyboard.style.display = 'flex'; 
        } else { 
            instructionText.innerText = "KIES EEN VAKJE"; 
            instructionText.style.color = "var(--text-main)";
            keyboard.style.display = 'none'; 
        }
    } else {
        instructionText.innerText = overrideMsg || "WACHTEN OP TEGENSTANDER..."; 
        instructionText.style.color = "var(--text-muted)"; 
        instructionText.style.fontSize = "1rem";
        letterDisplay.innerText = "...";
        document.body.classList.remove("highlight-empty"); 
        keyboard.style.display = 'none';
    }
}

function renderGrid() {
    for (let i = 0; i < 25; i++) {
        const cell = document.getElementById(`cell-${i}`);
        const hasLetter = myGrid[i] !== "";
        cell.innerText = myGrid[i];
        cell.className = `cell ${hasLetter ? 'filled' : ''}`;
        cell.style.borderColor = "";
        if (activeCellIndex === i && !hasLetter) cell.classList.add('selected-target');
    }
    updateGameControlButtons();
}

function updateWinChanceVisualization() {
    if (gameMode === 'daily') return;
    const canvas = document.getElementById('win-chance-canvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d'); const w = canvas.width; const h = canvas.height;
    const pct = calculateWinProbabilityValue(myGrid, opponentGrid);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#1e272e'; ctx.fillRect(0, 0, w, h);
    const splitX = (w * pct) / 100;
    let grd = ctx.createLinearGradient(0, 0, splitX, 0);
    grd.addColorStop(0, "#00d2d3"); grd.addColorStop(1, "#2980b9");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, splitX, h);
    ctx.fillStyle = "#ff4757"; ctx.fillRect(splitX, 0, w-splitX, h);
    ctx.beginPath(); ctx.moveTo(splitX, 0); ctx.lineTo(splitX, h); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = "800 14px 'Roboto', sans-serif"; ctx.textBaseline = "middle";
    ctx.fillStyle = "white"; ctx.textAlign = "left"; ctx.fillText(`JIJ: ${Math.round(pct)}%`, 10, h/2);
    ctx.textAlign = "right"; ctx.fillText(`${opponentName}: ${Math.round(100 - pct)}%`, w - 10, h/2);
}

function buildShareGridSnapshot(grid) {
    const rowUsage = Array(25).fill(false);
    const colUsage = Array(25).fill(false);
    const words = getScoringWords(grid);

    words.forEach((word) => {
        if (word.type === 'row') {
            for (let offset = 0; offset < word.len; offset++) {
                const idx = (word.r * 5) + (word.c + offset);
                if (idx >= 0 && idx < 25) rowUsage[idx] = true;
            }
            return;
        }

        for (let offset = 0; offset < word.len; offset++) {
            const idx = ((word.r + offset) * 5) + word.c;
            if (idx >= 0 && idx < 25) colUsage[idx] = true;
        }
    });

    const colorCodes = Array(25).fill('N');
    for (let i = 0; i < 25; i++) {
        if (rowUsage[i] && colUsage[i]) colorCodes[i] = 'B';
        else if (rowUsage[i]) colorCodes[i] = 'H';
        else if (colUsage[i]) colorCodes[i] = 'V';
    }

    const rowScores = [];
    for (let r = 0; r < 5; r++) {
        let rowStr = '';
        for (let c = 0; c < 5; c++) rowStr += grid[r * 5 + c];
        rowScores.push(getLineScore(rowStr));
    }

    const colScores = [];
    for (let c = 0; c < 5; c++) {
        let colStr = '';
        for (let r = 0; r < 5; r++) colStr += grid[r * 5 + c];
        colScores.push(getLineScore(colStr));
    }

    return {
        colorCodes,
        rowScores,
        colScores,
        serializedColorCodes: colorCodes.join(''),
        serializedRowScores: rowScores.join(','),
        serializedColScores: colScores.join(',')
    };
}

function getPublicShareBaseUrl() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return 'https://letterduel.net';
    }
    return window.location.origin;
}

function buildDailySharePath(dateKey, uid) {
    return `/share/daily/${dateKey}/${uid}`;
}

function buildDailyShareUrl(dateKey, uid) {
    return `${getPublicShareBaseUrl()}${buildDailySharePath(dateKey, uid)}`;
}

async function saveDailyResult(myScore, oppScore) {
    if (gameMode !== 'daily' || !currentDailyDateKey || !window.currentUser) return;
    if (dailyGameFinished) return;

    const { doc, runTransaction } = window.firebaseFuncs;
    const enforceDailyLimit = isDailyAttemptLimitEnabled && !isDailyAdminBypassActive();
    const uid = window.currentUser.uid;
    const resultRef = doc(window.db, 'daily_results', currentDailyDateKey, 'entries', uid);
    const shareDocRef = doc(window.db, 'daily_shares', `${currentDailyDateKey}_${uid}`);
    const sharePath = buildDailySharePath(currentDailyDateKey, uid);
    const shareUrl = buildDailyShareUrl(currentDailyDateKey, uid);
    const shareSnapshot = buildShareGridSnapshot(myGrid);

    const payload = {
        uid,
        name: myUsername || 'Player',
        dateKey: currentDailyDateKey,
        playerScore: myScore,
        aiScore: oppScore,
        won: myScore > oppScore,
        playerGrid: [...myGrid],
        aiGrid: [...opponentGrid],
        playedAt: new Date(),
        mode: 'DAILY',
        sharePath,
        shareUrl,
        shareGridColors: shareSnapshot.serializedColorCodes,
        shareRowScores: shareSnapshot.serializedRowScores,
        shareColScores: shareSnapshot.serializedColScores
    };

    if (enforceDailyLimit) {
        await runTransaction(window.db, async (transaction) => {
            const existing = await transaction.get(resultRef);
            if (existing.exists()) {
                throw new Error('daily-already-played');
            }
            transaction.set(resultRef, payload);
            transaction.set(shareDocRef, {
                uid,
                dateKey: currentDailyDateKey,
                name: myUsername || 'Player',
                playerScore: myScore,
                aiScore: oppScore,
                won: myScore > oppScore,
                playerGrid: [...myGrid],
                aiGrid: [...opponentGrid],
                sharePath,
                shareUrl,
                shareGridColors: shareSnapshot.serializedColorCodes,
                shareRowScores: shareSnapshot.serializedRowScores,
                shareColScores: shareSnapshot.serializedColScores,
                updatedAt: new Date()
            });
        });
    } else {
        const { setDoc } = window.firebaseFuncs;
        await setDoc(resultRef, payload);
        await setDoc(shareDocRef, {
            uid,
            dateKey: currentDailyDateKey,
            name: myUsername || 'Player',
            playerScore: myScore,
            aiScore: oppScore,
            won: myScore > oppScore,
            playerGrid: [...myGrid],
            aiGrid: [...opponentGrid],
            sharePath,
            shareUrl,
            shareGridColors: shareSnapshot.serializedColorCodes,
            shareRowScores: shareSnapshot.serializedRowScores,
            shareColScores: shareSnapshot.serializedColScores,
            updatedAt: new Date()
        });
    }

    dailyGameFinished = true;
    lastDailyResultPayload = payload;
    hsDailyCache = {};
    hsLastError = null;
}

function createDailyShareText(channel) {
    const dateKey = lastDailyResultPayload?.dateKey || currentDailyDateKey || getUtcDateKey();
    const dailyNumber = getDailySequenceNumber(dateKey);
    const dailyLabel = dailyNumber ? `Daily #${dailyNumber} ${dateKey}` : `Daily ${dateKey}`;
    const dailyTags = dailyNumber ? `#letterduel${dailyNumber} #daily${dailyNumber}` : '#letterduel #daily';
    const playerScore = Number.isFinite(lastDailyResultPayload?.playerScore)
        ? lastDailyResultPayload.playerScore
        : calculatePoints(myGrid);
    const aiScore = Number.isFinite(lastDailyResultPayload?.aiScore)
        ? lastDailyResultPayload.aiScore
        : calculatePoints(opponentGrid);
    const won = typeof lastDailyResultPayload?.won === 'boolean'
        ? lastDailyResultPayload.won
        : playerScore > aiScore;
    const resultWord = won ? 'Gewonnen' : 'Verloren';

    const colorMap = {
        H: '🟩',
        V: '🟦',
        B: '🟨',
        N: '⬛'
    };

    const fallbackSnapshot = buildShareGridSnapshot(myGrid);
    const gridCodesRaw = String(lastDailyResultPayload?.shareGridColors || fallbackSnapshot.serializedColorCodes || '').toUpperCase();

    if (channel === 'x') {
        const lines = [
            'letterduel.net',
            dailyLabel,
            `🧠 My score: ${playerScore}`,
            `🤖 Comp. score: ${aiScore}`,
            dailyTags,
            ''
        ];
        return lines.join('\n');
    }

    const rowScores = String(lastDailyResultPayload?.shareRowScores || fallbackSnapshot.serializedRowScores || '')
        .split(',')
        .map(v => Number(v))
        .filter(v => Number.isFinite(v));
    const colScores = String(lastDailyResultPayload?.shareColScores || fallbackSnapshot.serializedColScores || '')
        .split(',')
        .map(v => Number(v))
        .filter(v => Number.isFinite(v));

    const attemptTag = '';
    const header = `Daily #${dailyNumber} ${dateKey} • ${resultWord} • Ik ${playerScore} - Comp. ${aiScore}${attemptTag}`;
    if (gridCodesRaw.length !== 25 || rowScores.length !== 5 || colScores.length !== 5) return header;

    const toFullWidthDigits = (input) => {
        return String(input).replace(/[0-9]/g, (digit) => {
            return String.fromCharCode(digit.charCodeAt(0) + 65248);
        });
    };

    const toSuperscriptDigits = (input) => {
        const superscriptMap = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
            '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
        };
        return String(input).split('').map(c => superscriptMap[c] || c).join('');
    };

    const formatCellScore = (value) => {
        const safe = Number.isFinite(value) ? String(value) : '-';
        return safe;
    };

    const formatFullWidthScore = (value) => {
        const safe = Number.isFinite(value) ? String(value) : '-';
        const fullWidth = toFullWidthDigits(safe);
        // Single-digit: two spaces + fullwidth (e.g. "  ５")
        // Double-digit: fullwidth only (e.g. "１５")
        return fullWidth.length === 1 ? `  ${fullWidth}` : fullWidth;
    };

    const formatSuperscriptScore = (value) => {
        const safe = Number.isFinite(value) ? String(value) : '-';
        return toSuperscriptDigits(safe);
    };

    const lines = [header, ''];
    for (let r = 0; r < 5; r++) {
        let line = '';
        for (let c = 0; c < 5; c++) {
            const code = gridCodesRaw[(r * 5) + c];
            line += colorMap[code] || colorMap.N;
        }
        lines.push(`${line} ${formatCellScore(rowScores[r])}`);
    }
    const bottomScoresLine = ' ' + colScores.map(formatSuperscriptScore).join('  |  ');
    lines.push(bottomScoresLine);

    return lines.join('\n');
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawDailyGridCard(ctx, grid, x, y, title, score) {
    const cardWidth = 500;
    const cardHeight = 520;
    const cellSize = 60;
    const gridSize = cellSize * 5;
    const scoreSize = 54;
    const totalBoardWidth = gridSize + 6 + scoreSize;
    const totalBoardHeight = gridSize + 6 + scoreSize;
    const gridX = x + Math.floor((cardWidth - totalBoardWidth) / 2);
    const gridY = y + 96;

    drawRoundedRect(ctx, x, y, cardWidth, cardHeight, 16);
    ctx.fillStyle = 'rgba(10,16,26,0.55)';
    ctx.fill();

    ctx.font = "900 42px Roboto, sans-serif";
    ctx.fillStyle = '#ecf0f1';
    ctx.textAlign = 'left';
    ctx.fillText(`${title}: ${score}`, x + 20, y + 56);

    const snapshot = buildShareGridSnapshot(grid);
    const words = getScoringWords(grid);

    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const idx = row * 5 + col;
            const cx = gridX + col * cellSize;
            const cy = gridY + row * cellSize;
            const letter = String(grid[idx] || '').toUpperCase();

            ctx.fillStyle = '#2e3440';
            ctx.fillRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4);
            ctx.strokeStyle = '#3f4a59';
            ctx.lineWidth = 2;
            ctx.strokeRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4);

            if (letter) {
                ctx.fillStyle = '#ecf0f1';
                ctx.font = '900 30px Roboto, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(letter, cx + (cellSize / 2), cy + (cellSize / 2) + 1);
            }
        }
    }

    words.forEach((word) => {
        const outlineX = gridX + (word.c * cellSize) + 3;
        const outlineY = gridY + (word.r * cellSize) + 3;
        const outlineW = word.type === 'row' ? (word.len * cellSize) - 6 : cellSize - 6;
        const outlineH = word.type === 'col' ? (word.len * cellSize) - 6 : cellSize - 6;

        ctx.strokeStyle = word.type === 'row' ? '#2ecc71' : '#00d2d3';
        ctx.shadowBlur = 8;
        ctx.shadowColor = word.type === 'row' ? 'rgba(46,204,113,0.65)' : 'rgba(0,210,211,0.65)';
        ctx.lineWidth = 4;
        drawRoundedRect(ctx, outlineX, outlineY, outlineW, outlineH, 16);
        ctx.stroke();
        ctx.shadowBlur = 0;
    });

    for (let r = 0; r < 5; r++) {
        const rowScore = snapshot.rowScores[r] || 0;
        const sx = gridX + gridSize + 6;
        const sy = gridY + r * cellSize + 2;

        ctx.fillStyle = '#222';
        ctx.fillRect(sx, sy, scoreSize - 4, cellSize - 4);
        ctx.fillStyle = '#00d2d3';
        ctx.font = "900 28px Roboto, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rowScore > 0 ? String(rowScore) : '-', sx + (scoreSize - 4) / 2, sy + (cellSize - 4) / 2 + 1);
    }

    for (let c = 0; c < 5; c++) {
        const colScore = snapshot.colScores[c] || 0;
        const sx = gridX + c * cellSize + 2;
        const sy = gridY + gridSize + 6;

        ctx.fillStyle = '#222';
        ctx.fillRect(sx, sy, cellSize - 4, scoreSize - 4);
        ctx.fillStyle = '#00d2d3';
        ctx.font = "900 28px Roboto, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(colScore > 0 ? String(colScore) : '-', sx + (cellSize - 4) / 2, sy + (scoreSize - 4) / 2 + 1);
    }

}

async function createDailyResultCardBlob(sourcePayload = null) {
    const canvas = renderDailyShareGridCanvas(sourcePayload);
    return await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
}

function renderDailyShareGridCanvas(sourcePayload = null) {
    const sourceGrid = Array.isArray(sourcePayload?.playerGrid) ? sourcePayload.playerGrid : myGrid;

    const cellSize = 66;
    const scoreSize = 56;
    const gap = 6;
    const gridSize = cellSize * 5;
    const boardWidth = gridSize + gap + scoreSize;
    const boardHeight = gridSize + gap + scoreSize;
    const padding = 26;

    const canvas = document.createElement('canvas');
    canvas.width = boardWidth + (padding * 2);
    canvas.height = boardHeight + (padding * 2);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d1727';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gridX = padding;
    const gridY = padding;

    const snapshot = buildShareGridSnapshot(sourceGrid);
    const words = getScoringWords(sourceGrid);

    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const idx = row * 5 + col;
            const cx = gridX + col * cellSize;
            const cy = gridY + row * cellSize;
            const letter = String(sourceGrid[idx] || '').toUpperCase();

            ctx.fillStyle = '#2e3440';
            ctx.fillRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4);
            ctx.strokeStyle = '#3f4a59';
            ctx.lineWidth = 2;
            ctx.strokeRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4);

            if (letter) {
                ctx.fillStyle = '#ecf0f1';
                ctx.font = '900 34px Roboto, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(letter, cx + (cellSize / 2), cy + (cellSize / 2) + 1);
            }
        }
    }

    words.forEach((word) => {
        const outlineX = gridX + (word.c * cellSize) + 3;
        const outlineY = gridY + (word.r * cellSize) + 3;
        const outlineW = word.type === 'row' ? (word.len * cellSize) - 6 : cellSize - 6;
        const outlineH = word.type === 'col' ? (word.len * cellSize) - 6 : cellSize - 6;

        ctx.strokeStyle = word.type === 'row' ? '#2ecc71' : '#00d2d3';
        ctx.shadowBlur = 8;
        ctx.shadowColor = word.type === 'row' ? 'rgba(46,204,113,0.65)' : 'rgba(0,210,211,0.65)';
        ctx.lineWidth = 4;
        drawRoundedRect(ctx, outlineX, outlineY, outlineW, outlineH, 16);
        ctx.stroke();
        ctx.shadowBlur = 0;
    });

    for (let r = 0; r < 5; r++) {
        const rowScore = snapshot.rowScores[r] || 0;
        const sx = gridX + gridSize + gap;
        const sy = gridY + r * cellSize + 2;

        ctx.fillStyle = '#222';
        ctx.fillRect(sx, sy, scoreSize - 4, cellSize - 4);
        ctx.fillStyle = '#00d2d3';
        ctx.font = '900 30px Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rowScore > 0 ? String(rowScore) : '-', sx + (scoreSize - 4) / 2, sy + (cellSize - 4) / 2 + 1);
    }

    for (let c = 0; c < 5; c++) {
        const colScore = snapshot.colScores[c] || 0;
        const sx = gridX + c * cellSize + 2;
        const sy = gridY + gridSize + gap;

        ctx.fillStyle = '#222';
        ctx.fillRect(sx, sy, cellSize - 4, scoreSize - 4);
        ctx.fillStyle = '#00d2d3';
        ctx.font = '900 30px Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(colScore > 0 ? String(colScore) : '-', sx + (cellSize - 4) / 2, sy + (scoreSize - 4) / 2 + 1);
    }

    return canvas;
}

function renderDailyResultCardCanvas(sourcePayload = null) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1400;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0f1d35');
    grad.addColorStop(1, '#11284f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawRoundedRect(ctx, 70, 70, 1060, 1260, 24);
    ctx.fillStyle = 'rgba(7,12,20,0.4)';
    ctx.fill();

    ctx.fillStyle = '#00d2d3';
    ctx.font = "900 68px Roboto, sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('LETTERDUEL DAILY', 600, 165);

    const dateLabel = sourcePayload?.dateKey || currentDailyDateKey || getUtcDateKey();
    ctx.fillStyle = '#ecf0f1';
    ctx.font = "700 38px Roboto, sans-serif";
    ctx.fillText(dateLabel, 600, 220);

    const resolvedPayload = sourcePayload || lastDailyResultPayload;
    const sourcePlayerGrid = Array.isArray(sourcePayload?.playerGrid) ? sourcePayload.playerGrid : myGrid;
    const sourceAiGrid = Array.isArray(sourcePayload?.aiGrid) ? sourcePayload.aiGrid : opponentGrid;

    const myScore = resolvedPayload ? resolvedPayload.playerScore : calculatePoints(sourcePlayerGrid);
    const aiScore = resolvedPayload ? resolvedPayload.aiScore : calculatePoints(sourceAiGrid);
    const won = resolvedPayload ? resolvedPayload.won : (myScore > aiScore);

    ctx.fillStyle = '#ecf0f1';
    ctx.font = "900 88px Roboto, sans-serif";
    ctx.fillText(`JIJ ${myScore}  •  AI ${aiScore}`, 600, 320);

    ctx.font = "900 64px Roboto, sans-serif";
    ctx.fillStyle = won ? '#2ecc71' : '#ff4757';
    ctx.fillText(won ? 'GEWONNEN' : 'VERLOREN', 600, 400);

    drawDailyGridCard(ctx, sourcePlayerGrid, 350, 470, 'Jij', myScore);

    ctx.fillStyle = '#ecf0f1';
    ctx.font = "700 34px Roboto, sans-serif";
    ctx.fillText(`Speler: ${sourcePayload?.name || myUsername || 'Player'}`, 600, 1160);
    ctx.font = "700 30px Roboto, sans-serif";
    ctx.fillText('Speel vandaag op letterduel.pages.dev', 600, 1230);

    return canvas;
}

async function downloadDailyResultCard() {
    if (gameMode !== 'daily') {
        showFlashMessage('Daily', 'Alleen beschikbaar na Daily match');
        return;
    }

    const canvas = renderDailyResultCardCanvas();
    const link = document.createElement('a');
    const filenameDate = currentDailyDateKey || getUtcDateKey();
    link.download = `letterduel-daily-${filenameDate}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

async function shareDailyResult(channel, payloadOverride = null) {
    if (gameMode !== 'daily' && !payloadOverride) {
        showFlashMessage('Daily', 'Start eerst een Daily match');
        return;
    }

    const prevPayload = lastDailyResultPayload;
    const prevDateKey = currentDailyDateKey;

    if (payloadOverride) {
        lastDailyResultPayload = payloadOverride;
        currentDailyDateKey = payloadOverride.dateKey || currentDailyDateKey || getUtcDateKey();
    }

    try {
        const textChannel = (channel === 'facebook' || channel === 'whatsapp') ? 'x' : channel;
        const text = createDailyShareText(textChannel);
        const encodedText = encodeURIComponent(text);

        const includeTextInClipboard = channel !== 'x';
        const copiedImage = await copyDailyScoreImageToClipboard(payloadOverride, text, includeTextInClipboard);

        const channelLabel = channel === 'x' ? 'X' : (channel === 'facebook' ? 'Facebook' : 'WhatsApp');
        if (copiedImage) {
            if (isLikelyMobileClient()) {
                showFlashMessage('✅ Score-image gekopieerd!', `Open ${channelLabel} en kies Plakken in het berichtvak.`, 3600);
            } else {
                showFlashMessage('✅ Score-image gekopieerd!', `Open ${channelLabel} en plak met Ctrl+V.`, 3400);
            }
        } else {
            if (channel === 'x' && navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(text);
                    showFlashMessage(channelLabel, 'Image kopiëren lukt niet. Tekst is wel gekopieerd.', 3200);
                } catch {
                    showFlashMessage(channelLabel, 'Kopiëren mislukt op dit toestel/browser. Deel via screenshot.', 3200);
                }
            } else {
                showFlashMessage(channelLabel, 'Image kopiëren lukt hier niet. Gebruik een screenshot of upload handmatig.', 3300);
            }
        }

        if (channel === 'x') {
            window.open(`https://twitter.com/intent/tweet?text=${encodedText}`, '_blank');
            return;
        }

        if (navigator.share && channel === 'native') {
            try {
                await navigator.share({
                    title: 'LetterDuel Daily',
                    text
                });
                return;
            } catch (err) {
                console.warn('Direct delen geannuleerd/mislukt:', err);
            }
        }

        if (channel === 'facebook') {
            window.open('https://www.facebook.com/', '_blank');
            return;
        }
        if (channel === 'whatsapp') {
            window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
        }
    } finally {
        if (payloadOverride) {
            lastDailyResultPayload = prevPayload;
            currentDailyDateKey = prevDateKey;
        }
    }
}

function finishGame() {
    const myScore = calculatePoints(myGrid);
    const oppScore = calculatePoints(opponentGrid);
    
    if (gameMode === 'daily') {
        saveDailyResult(myScore, oppScore).catch((e) => {
            if (String(e && e.message) === 'daily-already-played') {
                showFlashMessage('Daily', 'Resultaat was al opgeslagen');
                return;
            }
            console.error('Daily resultaat opslaan mislukt:', e);
            showFlashMessage('Daily', 'Resultaat kon niet worden opgeslagen', 2600);
        });
    } else {
        // --- SAVE HIGHSCORE ---
        if (myScore > 25) {
            const { addDoc, collection } = window.firebaseFuncs;
            addDoc(collection(window.db, "highscores"), {
                name: myUsername || "Player",
                score: myScore,
                grid: myGrid,
                timestamp: new Date(),
                mode: isSinglePlayer ? 'SP' : 'MP'
            }).then(() => {
                clearHighscoreCache();
            }).catch(e => console.error("Kon score niet opslaan:", e));
        }
    }

    document.getElementById('my-final-score').innerText = myScore;
    document.getElementById('opp-final-score').innerText = oppScore;
    document.getElementById('opponent-name-result').innerText = opponentName;
    
    const winnerTxt = document.getElementById('winner-display');
    if (myScore > oppScore) { winnerTxt.innerText = "🏆 GEWONNEN!"; winnerTxt.style.color = "var(--secondary)"; }
    else if (oppScore > myScore) { winnerTxt.innerText = "❌ VERLOREN..."; winnerTxt.style.color = "var(--hard)"; }
    else { winnerTxt.innerText = "🤝 GELIJKSPEL"; winnerTxt.style.color = "#ecf0f1"; }
    renderMiniGridWithOutlines(myGrid, 'my-mini-grid', 'my-row-scores', 'my-col-scores');
    renderMiniGridWithOutlines(opponentGrid, 'opp-mini-grid', 'opp-row-scores', 'opp-col-scores');
    renderResultWords(myGrid);

    const dailyShareControls = document.getElementById('daily-share-controls');
    if (dailyShareControls) {
        dailyShareControls.style.display = gameMode === 'daily' ? 'block' : 'none';
    }

    document.getElementById('result-modal').style.display = 'flex';
    keyboard.style.display = 'none';
}

function renderMiniGridWithOutlines(gridData, gridId, rowScoresId, colScoresId) {
    const gridEl = document.getElementById(gridId);
    const rowEl = document.getElementById(rowScoresId);
    const colEl = document.getElementById(colScoresId);
    gridEl.innerHTML = ""; rowEl.innerHTML = ""; colEl.innerHTML = "";
    
    for (let i = 0; i < 25; i++) {
        const d = document.createElement('div');
        d.className = 'mini-cell'; d.innerText = gridData[i];
        gridEl.appendChild(d);
    }
    const words = getScoringWords(gridData);
    words.forEach(word => {
        const overlay = document.createElement('div');
        overlay.classList.add('word-outline');
        if (word.type === 'row') {
            overlay.classList.add('outline-row');
            overlay.style.left = (word.c * 20) + '%'; overlay.style.top = (word.r * 20) + '%';
            overlay.style.width = (word.len * 20) + '%'; overlay.style.height = '20%';
        } else {
            overlay.classList.add('outline-col');
            overlay.style.left = (word.c * 20) + '%'; overlay.style.top = (word.r * 20) + '%';
            overlay.style.width = '20%'; overlay.style.height = (word.len * 20) + '%';
        }
        overlay.style.transform = "scale(0.92)";
        gridEl.appendChild(overlay);
    });

    for (let r = 0; r < 5; r++) {
        let rowStr = ""; for (let c = 0; c < 5; c++) rowStr += gridData[r*5 + c];
        const d = document.createElement('div'); d.className = 'mini-score-cell';
        const score = getLineScore(rowStr); d.innerText = score > 0 ? score : "-"; rowEl.appendChild(d); 
    }
    for (let c = 0; c < 5; c++) {
        let colStr = ""; for (let r = 0; r < 5; r++) colStr += gridData[r*5 + c];
        const d = document.createElement('div'); d.className = 'mini-score-cell';
        const score = getLineScore(colStr); d.innerText = score > 0 ? score : "-"; colEl.appendChild(d); 
    }
}

function renderResultWords(grid) {
    const section = document.getElementById('result-words-section');
    const list = document.getElementById('result-words-list');
    if (!section || !list) return;
    list.innerHTML = '';
    const highlights = getScoringWords(grid);
    if (!highlights.length) { section.style.display = 'none'; return; }
    const pts = { 5: 15, 4: 10, 3: 5 };
    highlights.forEach(h => {
        let word = '';
        for (let i = 0; i < h.len; i++) {
            word += h.type === 'row' ? grid[h.r * 5 + h.c + i] : grid[(h.r + i) * 5 + h.c];
        }
        const badge = document.createElement('span');
        badge.className = `word-badge word-badge-${h.len}`;
        badge.innerHTML = `${word} <span class="word-badge-pts">+${pts[h.len]}</span>`;
        list.appendChild(badge);
    });
    section.style.display = 'block';
}

async function handleScrambleStart() {
    if (isAiProcessing) return;
    if (gameMode === 'daily') {
        showFlashMessage("DAILY", "Scramble staat uit in Daily");
        return;
    }

    const filledCount = myGrid.filter(c => c !== "").length;
    if (filledCount > 2) { showFlashMessage("TE LAAT", "Scramble werkt alleen bij start!", 2000); return; }
    showFlashMessage("SCRAMBLE!", "Roosters gehusseld...", 1500);
    const lettersToPlace = myGrid.filter(c => c !== "");
    const generateNewGrid = (letters) => {
        let newGrid = Array(25).fill("");
        let p1 = Math.floor(Math.random() * 25); let p2 = Math.floor(Math.random() * 25);
        while(p2 === p1) p2 = Math.floor(Math.random() * 25);
        newGrid[p1] = letters[0]; newGrid[p2] = letters[1];
        return newGrid;
    }
    const newP1Grid = generateNewGrid(lettersToPlace);
    const newP2Grid = generateNewGrid(lettersToPlace);

    if (isSinglePlayer) { myGrid = newP1Grid; opponentGrid = newP2Grid; renderGrid(); } 
    else {
        const { updateDoc, doc } = window.firebaseFuncs;
        await updateDoc(doc(window.db, "games", currentGameId), { p1Grid: newP1Grid, p2Grid: newP2Grid });
    }
}

function handleDebugAutofill() {
    if (!isDebugMode) return;
    if (isAiProcessing) return;

    let emptyIndices = []; for (let i = 0; i < 25; i++) if (myGrid[i] === "") emptyIndices.push(i);
    let spotsToFill = emptyIndices.length - 3;
    if (spotsToFill <= 0) { showFlashMessage("DEBUG", "Er zijn al 3 of minder vakjes over!"); return; }
    for (let k = 0; k < spotsToFill; k++) {
        let idx = emptyIndices[k]; let letter = getWeightedLetter();
        myGrid[idx] = letter;
        let oppEmptyIdx = opponentGrid.findIndex(c => c === "");
        if (oppEmptyIdx !== -1) opponentGrid[oppEmptyIdx] = letter;
    }
    pendingLetter = null; isMyPickTurn = true; activeCellIndex = null; 
    renderGrid(); updateWinChanceVisualization(); updateUI("Autofill klaar! Nog 3 beurten...");
    showFlashMessage("DEBUG", "Doorgespoeld naar eindfase! ⏩");
}

const footerYear = document.getElementById('footer-year');
if (footerYear) footerYear.textContent = new Date().getFullYear();
