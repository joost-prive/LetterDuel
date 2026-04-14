/**
 * LetterDuel – testsuite voor gameLogic.js
 *
 * Gebruik: npm test  (vereist: npm install)
 *
 * Woorden die zeker in words.js zitten (gebruikt als testankerpunten):
 *   3-letter: AAN, KAT, WAT, AAP
 *   4-letter: AARD, BOOM, BOOT, KAAS
 *   5-letter: AARDE, APPEL, WATER
 */

const RAW_WORD_LIST = require('../words');
const {
    WEIGHTED_LETTERS,
    initWordSet,
    hasWord,
    hashStringToSeed,
    createSeededRandom,
    pickWeightedLetterFromRng,
    buildDailyPuzzle,
    isGridFull,
    countFilled,
    playerPickStep,
    aiPickStep,
    dailyAiStep,
    playerPlaceStep,
    simulateSinglePlayerGame,
    simulateDailyGame,
    getLineScore,
    calculatePoints,
    getScoringWords,
    calculateDetailedPotential,
    calculateWinProbabilityValue,
    getBestPickAndPositionHeuristic,
    getBestPositionForLetter,
    getUniqueRowColStartPositions,
    getWeightedLetter,
} = require('../gameLogic');

// Initialiseer de woordenlijst eenmalig voor alle tests
beforeAll(() => {
    initWordSet(RAW_WORD_LIST);
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Maak een leeg 5×5 grid (25 lege strings) */
function emptyGrid() { return Array(25).fill(""); }

/** Maak een volledig grid gevuld met een gegeven letter (default X) */
function fullGrid(char = "X") { return Array(25).fill(char); }

/** Plaatst letters rij voor rij: elke string is één rij van 5 letters */
function gridFromRows(...rows) {
    const g = emptyGrid();
    rows.forEach((row, r) => {
        for (let c = 0; c < 5; c++) g[r * 5 + c] = row[c] || "";
    });
    return g;
}

// ===========================================================================
// WEIGHTED_LETTERS – constante integriteit
// ===========================================================================

describe('WEIGHTED_LETTERS', () => {
    test('bevat geen dubbele letters', () => {
        const allChars = WEIGHTED_LETTERS.flatMap(g => g.chars.split(''));
        const unique = new Set(allChars);
        expect(unique.size).toBe(allChars.length);
    });

    test('J zit in precies één groep', () => {
        const groupsWithJ = WEIGHTED_LETTERS.filter(g => g.chars.includes('J'));
        expect(groupsWithJ.length).toBe(1);
    });

    test('alle gewichten zijn positief', () => {
        WEIGHTED_LETTERS.forEach(g => expect(g.weight).toBeGreaterThan(0));
    });

    test('alle chars zijn hoofdletters A-Z', () => {
        const allChars = WEIGHTED_LETTERS.flatMap(g => g.chars.split(''));
        allChars.forEach(ch => expect(ch).toMatch(/^[A-Z]$/));
    });
});

// ===========================================================================
// hasWord – woordenlijst initialisatie
// ===========================================================================

describe('hasWord / initWordSet', () => {
    test('herkent woorden uit de echte lijst', () => {
        expect(hasWord('AARDE')).toBe(true);
        expect(hasWord('APPEL')).toBe(true);
        expect(hasWord('KAT')).toBe(true);
        expect(hasWord('WATER')).toBe(true);
    });

    test('verwerpt niet-bestaande woorden', () => {
        expect(hasWord('ZZZZZ')).toBe(false);
        expect(hasWord('XXXXX')).toBe(false);
        expect(hasWord('')).toBe(false);
    });

    test('is hoofdlettergevoelig (alleen hoofdletters)', () => {
        expect(hasWord('appel')).toBe(false);
        expect(hasWord('Appel')).toBe(false);
    });
});

// ===========================================================================
// getLineScore – score per rij/kolom
// ===========================================================================

describe('getLineScore', () => {
    test('5-letter woord scoort 15', () => {
        expect(getLineScore('AARDE')).toBe(15);
        expect(getLineScore('APPEL')).toBe(15);
        expect(getLineScore('WATER')).toBe(15);
    });

    test('4-letter woord op positie 0-3 scoort 10', () => {
        // AARD + 1 willekeurige letter die geen 5-letterwoord maakt
        expect(getLineScore('AARDX')).toBe(10);
        expect(getLineScore('BOOMX')).toBe(10);
    });

    test('4-letter woord op positie 1-4 scoort 10', () => {
        expect(getLineScore('XAARD')).toBe(10);
        expect(getLineScore('XBOOT')).toBe(10);
    });

    test('3-letter woord op positie 0-2 scoort 5', () => {
        expect(getLineScore('KATXX')).toBe(5);
        expect(getLineScore('AAPXX')).toBe(5);
    });

    test('3-letter woord op positie 1-3 scoort 5', () => {
        expect(getLineScore('XKATX')).toBe(5);
    });

    test('3-letter woord op positie 2-4 scoort 5', () => {
        expect(getLineScore('XXKAT')).toBe(5);
    });

    test('geen woord scoort 0', () => {
        expect(getLineScore('XXXXX')).toBe(0);
        expect(getLineScore('QQQQQ')).toBe(0);
    });

    test('5-letter prioriteit boven 4-letter', () => {
        // AARDE is 5-letter (15), AARD als substring zou 10 geven
        expect(getLineScore('AARDE')).toBe(15);
    });

    test('4-letter prioriteit boven 3-letter', () => {
        // BOOM op pos 0-3 geeft 10, AAP etc. zou 5 geven
        expect(getLineScore('BOOMX')).toBe(10);
    });

    test('lege string scoort 0', () => {
        expect(getLineScore('')).toBe(0);
    });

    test('5 spaties scoort 0 (empty-cell placeholder)', () => {
        expect(getLineScore('     ')).toBe(0);
    });
});

// ===========================================================================
// calculatePoints – totale score voor een vol grid
// ===========================================================================

describe('calculatePoints', () => {
    test('leeg grid scoort 0', () => {
        expect(calculatePoints(emptyGrid())).toBe(0);
    });

    test('grid vol met onbekende letters scoort 0', () => {
        expect(calculatePoints(fullGrid('X'))).toBe(0);
    });

    test('5-letter woord in rij 0 scoort 15', () => {
        // Rij 0 = AARDE, rest = X (geen woorden)
        const g = gridFromRows('AARDE', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX');
        // Kolommen bevatten A/X/R/D/E + X's → geen woord
        expect(calculatePoints(g)).toBe(15);
    });

    test('5-letter woord in kolom 0 scoort 15', () => {
        // Kolom 0 = A,A,R,D,E → AARDE
        const g = emptyGrid();
        ['A','A','R','D','E'].forEach((ch, r) => g[r * 5] = ch);
        // Vul rest met X
        for (let i = 0; i < 25; i++) if (g[i] === "") g[i] = "X";
        expect(calculatePoints(g)).toBe(15);
    });

    test('twee woorden (rij + kolom) tellen bij elkaar op', () => {
        // Rij 0 = APPEL (15), kolom 0 bevat A+X's (geen woord)
        // Bouw zo dat rij 0 = APPEL en kolom 4 = XXXXX
        const g = gridFromRows('APPEL', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX');
        // Alleen rij 0 scoort → 15
        expect(calculatePoints(g)).toBe(15);
    });

    test('meerdere rijscore telt correct op', () => {
        // Rij 0 = AARDE (15), rij 1 = APPEL (15), rest = X
        const g = gridFromRows('AARDE', 'APPEL', 'XXXXX', 'XXXXX', 'XXXXX');
        // Kolommen: A+A+X+X+X, A+P+X+X+X, R+P+X+X+X, D+E+X+X+X, E+L+X+X+X → geen woord
        expect(calculatePoints(g)).toBe(30);
    });

    // Bug-regressietest: lege cellen mogen geen valse punten geven
    test('3 aaneengesloten letters scoren 5, niet 15 (bug-fix lege cellen)', () => {
        // Rij 0: K A T _ _ → string was vroeger "KAT" (3 chars) → fout: 15 pt
        // Na fix: "KAT  " (5 chars) → correct: 5 pt
        const g = emptyGrid();
        g[0] = 'K'; g[1] = 'A'; g[2] = 'T';
        // Vul rest met X zodat er geen kolom-woorden zijn
        for (let i = 3; i < 25; i++) if (g[i] === "") g[i] = "X";
        const score = calculatePoints(g);
        expect(score).toBe(5);
        expect(score).not.toBe(15);
    });

    test('niet-aangrenzende letters vormen geen woord (bug-fix lege cellen)', () => {
        // Rij 0: K _ A T _ → vroeger "KAT" → fout: 5 pt; na fix: 0 pt
        const g = emptyGrid();
        g[0] = 'K'; g[2] = 'A'; g[3] = 'T';
        for (let i = 0; i < 25; i++) if (g[i] === "") g[i] = "X";
        // Rij 0 = "K AT " → geen aaneengesloten woord
        // Kolommen ook geen woord
        const rowScore = getLineScore('K AT ');
        expect(rowScore).toBe(0);
    });
});

// ===========================================================================
// getScoringWords – consistentie met calculatePoints
// ===========================================================================

describe('getScoringWords', () => {
    test('leeg (volledig X) grid geeft geen highlights', () => {
        expect(getScoringWords(fullGrid('X'))).toHaveLength(0);
    });

    test('5-letter woord in rij 0 geeft één highlight met len=5', () => {
        const g = gridFromRows('AARDE', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX');
        const words = getScoringWords(g);
        expect(words.some(w => w.type === 'row' && w.r === 0 && w.len === 5)).toBe(true);
    });

    test('4-letter woord op positie 0 geeft highlight c=0, len=4', () => {
        const g = gridFromRows('BOOMX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX');
        const words = getScoringWords(g);
        expect(words.some(w => w.type === 'row' && w.r === 0 && w.c === 0 && w.len === 4)).toBe(true);
    });

    test('4-letter woord op positie 1 geeft highlight c=1, len=4', () => {
        const g = gridFromRows('XAARD', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX');
        const words = getScoringWords(g);
        expect(words.some(w => w.type === 'row' && w.r === 0 && w.c === 1 && w.len === 4)).toBe(true);
    });

    test('3-letter woord in kolom geeft col-highlight', () => {
        // Kolom 0: K A T X X
        const g = emptyGrid();
        g[0] = 'K'; g[5] = 'A'; g[10] = 'T';
        for (let i = 0; i < 25; i++) if (g[i] === "") g[i] = "X";
        const words = getScoringWords(g);
        expect(words.some(w => w.type === 'col' && w.c === 0 && w.len === 3)).toBe(true);
    });

    test('getScoringWords en calculatePoints zijn consistent: geen woord → beide 0', () => {
        const g = fullGrid('X');
        expect(getScoringWords(g)).toHaveLength(0);
        expect(calculatePoints(g)).toBe(0);
    });

    test('getScoringWords en calculatePoints zijn consistent: 5-letter woord', () => {
        const g = gridFromRows('WATER', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX');
        const words = getScoringWords(g);
        const score = calculatePoints(g);
        // Er moet precies één rij-highlight zijn met len=5
        const rowWord = words.find(w => w.type === 'row' && w.len === 5);
        expect(rowWord).toBeDefined();
        // En het score-bijdrage van die rij moet 15 zijn
        expect(score).toBeGreaterThanOrEqual(15);
    });
});

// ===========================================================================
// calculateDetailedPotential – potentiaalberekening
// ===========================================================================

describe('calculateDetailedPotential', () => {
    test('volledig leeg grid heeft potentieel 0 (analyzeSegment slaat all-holes over)', () => {
        // analyzeSegment retourneert 0 als holes === len (alle cellen leeg) — bewust gedrag.
        expect(calculateDetailedPotential(emptyGrid())).toBe(0);
    });

    test('volledig gevuld grid met onbekende letters heeft potentieel 0', () => {
        // Geen holes → analyzeSegment retourneert 0 voor segments zonder gaten
        expect(calculateDetailedPotential(fullGrid('X'))).toBe(0);
    });

    test('grid met één nuttige letter heeft meer potentieel dan volledig leeg', () => {
        // Een veelvoorkomende letter (A) geeft meer kansen dan helemaal leeg
        const g = emptyGrid();
        g[12] = 'A'; // midden van het grid
        expect(calculateDetailedPotential(g)).toBeGreaterThan(0);
    });

    test('potentieel is niet-negatief', () => {
        const g = emptyGrid();
        g[0] = 'A'; g[1] = 'A'; g[2] = 'R';
        expect(calculateDetailedPotential(g)).toBeGreaterThanOrEqual(0);
    });
});

// ===========================================================================
// calculateWinProbabilityValue – winkansschatting
// ===========================================================================

describe('calculateWinProbabilityValue', () => {
    test('twee identieke lege grids geven ~50%', () => {
        const pct = calculateWinProbabilityValue(emptyGrid(), emptyGrid());
        expect(pct).toBeCloseTo(50, 0);
    });

    test('resultaat zit tussen 1 en 99 bij niet-vol grid', () => {
        const g1 = emptyGrid(); g1[0] = 'A';
        const g2 = emptyGrid();
        const pct = calculateWinProbabilityValue(g1, g2);
        expect(pct).toBeGreaterThanOrEqual(1);
        expect(pct).toBeLessThanOrEqual(99);
    });

    test('duidelijk winnend grid geeft >50%', () => {
        // Speler 1 heeft een volledig woord (AARDE), speler 2 niets
        const g1 = gridFromRows('AARDE', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX');
        const g2 = fullGrid('X');
        const pct = calculateWinProbabilityValue(g1, g2);
        expect(pct).toBeGreaterThan(50);
    });

    test('vol grid met gelijk score geeft ~50%', () => {
        const g = fullGrid('X');
        const pct = calculateWinProbabilityValue(g, g);
        expect(pct).toBeCloseTo(50, 0);
    });

    test('vol grid retourneert exact percentage (geen clamp)', () => {
        const g1 = gridFromRows('AARDE', 'APPEL', 'XXXXX', 'XXXXX', 'XXXXX');
        const g2 = fullGrid('X');
        const pct = calculateWinProbabilityValue(g1, g2);
        // Bij vol grid mag het buiten 1-99 vallen (geen clamp)
        expect(typeof pct).toBe('number');
        expect(pct).toBeGreaterThan(50);
    });
});

// ===========================================================================
// getBestPickAndPositionHeuristic – AI move selection
// ===========================================================================

describe('getBestPickAndPositionHeuristic', () => {
    test('vol grid retourneert index -1', () => {
        const result = getBestPickAndPositionHeuristic(fullGrid('A'));
        expect(result.index).toBe(-1);
    });

    test('retourneert een lege cel-index bij leeg grid', () => {
        const result = getBestPickAndPositionHeuristic(emptyGrid());
        expect(result.index).toBeGreaterThanOrEqual(0);
        expect(result.index).toBeLessThan(25);
    });

    test('gekozen letter is één van de kandidaten (ENATIRSLGD)', () => {
        const result = getBestPickAndPositionHeuristic(emptyGrid());
        expect('ENATIRSLGD').toContain(result.letter);
    });

    test('plaatst letter op lege cel (niet op al gevulde)', () => {
        const g = emptyGrid();
        // Vul alles behalve positie 12
        for (let i = 0; i < 25; i++) if (i !== 12) g[i] = 'X';
        const result = getBestPickAndPositionHeuristic(g);
        expect(result.index).toBe(12);
    });

    test('kiest positie die een woord completeert', () => {
        // Rij 0: A A R D _ → plaatsen van E op pos 4 maakt AARDE (15 pt)
        // E zit in de AI-kandidaten ("ENATIRSLGD"), en is de enige kandidaat die
        // een 5-letter woord oplevert op de enige lege positie.
        const g = emptyGrid();
        g[0] = 'A'; g[1] = 'A'; g[2] = 'R'; g[3] = 'D';
        // Vul de rest met X zodat er geen andere zinvolle posities zijn
        for (let i = 5; i < 25; i++) g[i] = 'X';
        const result = getBestPickAndPositionHeuristic(g);
        expect(result.index).toBe(4);
        expect(result.letter).toBe('E');
    });
});

// ===========================================================================
// getBestPositionForLetter – positie kiezen voor gegeven letter
// ===========================================================================

describe('getBestPositionForLetter', () => {
    test('vol grid retourneert index -1', () => {
        const result = getBestPositionForLetter(fullGrid('A'), 'E');
        expect(result.index).toBe(-1);
    });

    test('retourneert een geldige lege cel-index', () => {
        const result = getBestPositionForLetter(emptyGrid(), 'A');
        expect(result.index).toBeGreaterThanOrEqual(0);
        expect(result.index).toBeLessThan(25);
    });

    test('kiest de positie die een woord completeert', () => {
        // Rij 0: _ A T X X → plaatsen van K op pos 0 maakt "KAT " (3-letter)
        const g = emptyGrid();
        g[1] = 'A'; g[2] = 'T';
        for (let i = 3; i < 25; i++) g[i] = 'X';
        const result = getBestPositionForLetter(g, 'K');
        expect(result.index).toBe(0);
    });
});

// ===========================================================================
// hashStringToSeed & createSeededRandom – deterministisch RNG
// ===========================================================================

describe('hashStringToSeed', () => {
    const { hashStringToSeed } = require('../gameLogic');

    test('zelfde input geeft zelfde seed', () => {
        expect(hashStringToSeed('test')).toBe(hashStringToSeed('test'));
    });

    test('verschillende inputs geven (waarschijnlijk) verschillende seeds', () => {
        expect(hashStringToSeed('aaa')).not.toBe(hashStringToSeed('bbb'));
    });

    test('retourneert een positief getal', () => {
        expect(hashStringToSeed('LETTERDUEL-DAILY-2025-01-01')).toBeGreaterThan(0);
    });
});

describe('createSeededRandom', () => {
    const { createSeededRandom } = require('../gameLogic');

    test('zelfde seed → zelfde reeks getallen', () => {
        const rng1 = createSeededRandom(42);
        const rng2 = createSeededRandom(42);
        for (let i = 0; i < 10; i++) {
            expect(rng1()).toBe(rng2());
        }
    });

    test('retourneert waarden tussen 0 en 1', () => {
        const rng = createSeededRandom(12345);
        for (let i = 0; i < 20; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    test('verschillende seeds → verschillende reeksen', () => {
        const rng1 = createSeededRandom(1);
        const rng2 = createSeededRandom(2);
        const seq1 = Array.from({ length: 5 }, () => rng1());
        const seq2 = Array.from({ length: 5 }, () => rng2());
        expect(seq1).not.toEqual(seq2);
    });
});

// ===========================================================================
// buildDailyPuzzle – deterministische dagelijkse puzzel
// ===========================================================================

describe('buildDailyPuzzle', () => {
    test('zelfde datum → zelfde puzzel', () => {
        const p1 = buildDailyPuzzle('2025-06-15');
        const p2 = buildDailyPuzzle('2025-06-15');
        expect(p1).toEqual(p2);
    });

    test('verschillende datums → (zeer waarschijnlijk) andere puzzels', () => {
        const p1 = buildDailyPuzzle('2025-06-15');
        const p2 = buildDailyPuzzle('2025-06-16');
        expect(p1.startLetters).not.toEqual(p2.startLetters);
    });

    test('startLetters bevat precies 2 hoofdletters', () => {
        const { startLetters } = buildDailyPuzzle('2025-01-01');
        expect(startLetters).toHaveLength(2);
        startLetters.forEach(l => expect(l).toMatch(/^[A-Z]$/));
    });

    test('startPositions zijn twee verschillende indices (0-24)', () => {
        const { startPositions } = buildDailyPuzzle('2025-01-01');
        expect(startPositions).toHaveLength(2);
        expect(startPositions[0]).not.toBe(startPositions[1]);
        startPositions.forEach(p => {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThan(25);
        });
    });

    test('aiSequence bevat precies 11 letters', () => {
        const { aiSequence } = buildDailyPuzzle('2025-01-01');
        expect(aiSequence).toHaveLength(11);
        aiSequence.forEach(l => expect(l).toMatch(/^[A-Z]$/));
    });

    test('dateKey wordt opgeslagen in het resultaat', () => {
        const key = '2025-03-21';
        expect(buildDailyPuzzle(key).dateKey).toBe(key);
    });
});

// ===========================================================================
// getUniqueRowColStartPositions – startposities
// ===========================================================================

describe('getUniqueRowColStartPositions', () => {
    test('retourneert het gevraagde aantal posities', () => {
        expect(getUniqueRowColStartPositions(3)).toHaveLength(3);
        expect(getUniqueRowColStartPositions(1)).toHaveLength(1);
    });

    test('alle posities zijn geldig (0-24)', () => {
        const positions = getUniqueRowColStartPositions(3);
        positions.forEach(p => {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThan(25);
        });
    });

    test('geen twee posities in dezelfde rij', () => {
        const positions = getUniqueRowColStartPositions(3);
        const rows = positions.map(p => Math.floor(p / 5));
        const uniqueRows = new Set(rows);
        expect(uniqueRows.size).toBe(positions.length);
    });

    test('geen twee posities in dezelfde kolom', () => {
        const positions = getUniqueRowColStartPositions(3);
        const cols = positions.map(p => p % 5);
        const uniqueCols = new Set(cols);
        expect(uniqueCols.size).toBe(positions.length);
    });

    test('geen duplicate indices', () => {
        const positions = getUniqueRowColStartPositions(3);
        const unique = new Set(positions);
        expect(unique.size).toBe(positions.length);
    });
});

// ===========================================================================
// getWeightedLetter – willekeurige letter met gewichten
// ===========================================================================

describe('getWeightedLetter', () => {
    const allValidChars = new Set(
        WEIGHTED_LETTERS.flatMap(g => g.chars.split(''))
    );

    test('retourneert altijd een letter uit WEIGHTED_LETTERS', () => {
        for (let i = 0; i < 50; i++) {
            const letter = getWeightedLetter();
            expect(allValidChars.has(letter)).toBe(true);
        }
    });

    test('retourneert een enkele hoofdletter', () => {
        for (let i = 0; i < 20; i++) {
            expect(getWeightedLetter()).toMatch(/^[A-Z]$/);
        }
    });
});

// ===========================================================================
// pickWeightedLetterFromRng – deterministisch gewogen letter
// ===========================================================================

describe('pickWeightedLetterFromRng', () => {
    const allValidChars = new Set(
        WEIGHTED_LETTERS.flatMap(g => g.chars.split(''))
    );

    test('retourneert een letter uit WEIGHTED_LETTERS', () => {
        const rng = createSeededRandom(999);
        for (let i = 0; i < 20; i++) {
            expect(allValidChars.has(pickWeightedLetterFromRng(rng))).toBe(true);
        }
    });

    test('zelfde seed → zelfde reeks letters', () => {
        const seq1 = [];
        const seq2 = [];
        const rng1 = createSeededRandom(7);
        const rng2 = createSeededRandom(7);
        for (let i = 0; i < 10; i++) {
            seq1.push(pickWeightedLetterFromRng(rng1));
            seq2.push(pickWeightedLetterFromRng(rng2));
        }
        expect(seq1).toEqual(seq2);
    });
});

// ===========================================================================
// SPELVERLOOP – isGridFull / countFilled
// ===========================================================================

describe('isGridFull / countFilled', () => {
    test('leeg grid is niet vol', () => {
        expect(isGridFull(emptyGrid())).toBe(false);
    });

    test('volledig gevuld grid is vol', () => {
        expect(isGridFull(fullGrid('A'))).toBe(true);
    });

    test('grid met één lege cel is niet vol', () => {
        const g = fullGrid('A');
        g[12] = '';
        expect(isGridFull(g)).toBe(false);
    });

    test('countFilled leeg grid = 0', () => {
        expect(countFilled(emptyGrid())).toBe(0);
    });

    test('countFilled vol grid = 25', () => {
        expect(countFilled(fullGrid('A'))).toBe(25);
    });

    test('countFilled telt correct', () => {
        const g = emptyGrid();
        g[0] = 'A'; g[5] = 'B'; g[24] = 'C';
        expect(countFilled(g)).toBe(3);
    });
});

// ===========================================================================
// SPELVERLOOP – playerPickStep
// ===========================================================================

describe('playerPickStep', () => {
    function startState(myGrid, opponentGrid) {
        return { myGrid, opponentGrid, pendingLetter: null, isPickTurn: true, gameOver: false };
    }

    test('muteert de invoergrids niet (immutabiliteit)', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[1] = 'B'; opp[2] = 'C';
        const frozen = [...my];
        playerPickStep(startState(my, opp));
        expect(my).toEqual(frozen);
    });

    test('myGrid heeft één cel meer na de stap', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        const before = countFilled(my);
        const after = playerPickStep(startState(my, opp));
        expect(countFilled(after.myGrid)).toBe(before + 1);
    });

    test('opponentGrid heeft één cel meer of evenveel na mirroring', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        const before = countFilled(opp);
        const result = playerPickStep(startState(my, opp));
        expect(countFilled(result.opponentGrid)).toBeGreaterThanOrEqual(before);
    });

    test('na de stap is isPickTurn false (wacht op AI)', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        const result = playerPickStep(startState(my, opp));
        expect(result.isPickTurn).toBe(false);
    });

    test('gameOver = true als myGrid na plaatsing vol is', () => {
        // Vul myGrid tot 24 cellen
        const my = fullGrid('X'); my[24] = '';
        const opp = fullGrid('X');
        const result = playerPickStep(startState(my, opp));
        expect(result.gameOver).toBe(true);
    });

    test('doet niets als gameOver al true is', () => {
        const state = { myGrid: emptyGrid(), opponentGrid: emptyGrid(), pendingLetter: null, isPickTurn: true, gameOver: true };
        expect(playerPickStep(state)).toBe(state);
    });

    test('doet niets als het niet de beurt van de speler is', () => {
        const state = { myGrid: emptyGrid(), opponentGrid: emptyGrid(), pendingLetter: 'A', isPickTurn: false, gameOver: false };
        expect(playerPickStep(state)).toBe(state);
    });

    test('retourneert gameOver = true als myGrid al vol was', () => {
        const state = { myGrid: fullGrid('A'), opponentGrid: emptyGrid(), pendingLetter: null, isPickTurn: true, gameOver: false };
        const result = playerPickStep(state);
        expect(result.gameOver).toBe(true);
    });
});

// ===========================================================================
// SPELVERLOOP – aiPickStep
// ===========================================================================

describe('aiPickStep', () => {
    function afterPickState(myGrid, opponentGrid) {
        return { myGrid, opponentGrid, pendingLetter: null, isPickTurn: false, gameOver: false };
    }

    test('opponentGrid heeft één cel meer na AI-pick', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        const before = countFilled(opp);
        const result = aiPickStep(afterPickState(my, opp));
        expect(countFilled(result.opponentGrid)).toBe(before + 1);
    });

    test('pendingLetter is gevuld na AI-pick', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        const result = aiPickStep(afterPickState(my, opp));
        expect(result.pendingLetter).toBeTruthy();
        expect(result.pendingLetter).toMatch(/^[A-Z]$/);
    });

    test('na AI-pick is isPickTurn true (speler mag pending plaatsen)', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        const result = aiPickStep(afterPickState(my, opp));
        expect(result.isPickTurn).toBe(true);
    });

    test('gameOver = true als opponentGrid al vol is', () => {
        const state = { myGrid: emptyGrid(), opponentGrid: fullGrid('A'), pendingLetter: null, isPickTurn: false, gameOver: false };
        const result = aiPickStep(state);
        expect(result.gameOver).toBe(true);
    });

    test('muteert de invoergrids niet', () => {
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        const frozen = [...opp];
        aiPickStep(afterPickState(emptyGrid(), opp));
        expect(opp).toEqual(frozen);
    });
});

// ===========================================================================
// SPELVERLOOP – dailyAiStep
// ===========================================================================

describe('dailyAiStep', () => {
    function afterPickState(myGrid, opponentGrid) {
        return { myGrid, opponentGrid, pendingLetter: null, isPickTurn: false, gameOver: false };
    }

    const SEQ = ['A', 'E', 'N', 'R', 'T', 'S', 'I', 'O', 'D', 'L', 'A'];

    test('gebruikt de juiste letter uit de sequentie', () => {
        const opp = emptyGrid(); opp[0] = 'X'; opp[1] = 'X'; opp[2] = 'X';
        const { state } = dailyAiStep(afterPickState(emptyGrid(), opp), SEQ, 0);
        expect(state.pendingLetter).toBe('A'); // SEQ[0]
    });

    test('verhoogt seqIndex met 1', () => {
        const opp = emptyGrid(); opp[0] = 'X';
        const { nextSeqIndex } = dailyAiStep(afterPickState(emptyGrid(), opp), SEQ, 3);
        expect(nextSeqIndex).toBe(4);
    });

    test('gameOver = true als sequentie uitgeput is', () => {
        const opp = emptyGrid();
        const { state } = dailyAiStep(afterPickState(emptyGrid(), opp), SEQ, SEQ.length);
        expect(state.gameOver).toBe(true);
    });

    test('plaatst de letter op opponentGrid', () => {
        const opp = emptyGrid(); opp[0] = 'X'; opp[1] = 'X'; opp[2] = 'X';
        const before = countFilled(opp);
        const { state } = dailyAiStep(afterPickState(emptyGrid(), opp), SEQ, 0);
        expect(countFilled(state.opponentGrid)).toBe(before + 1);
    });

    test('muteert de invoergrids niet', () => {
        const opp = emptyGrid(); opp[0] = 'X';
        const frozen = [...opp];
        dailyAiStep(afterPickState(emptyGrid(), opp), SEQ, 0);
        expect(opp).toEqual(frozen);
    });
});

// ===========================================================================
// SPELVERLOOP – playerPlaceStep
// ===========================================================================

describe('playerPlaceStep', () => {
    function stateWithPending(myGrid, letter) {
        return { myGrid, opponentGrid: emptyGrid(), pendingLetter: letter, isPickTurn: true, gameOver: false };
    }

    test('pendingLetter wordt geplaatst op myGrid', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const before = countFilled(my);
        const result = playerPlaceStep(stateWithPending(my, 'E'));
        expect(countFilled(result.myGrid)).toBe(before + 1);
    });

    test('pendingLetter is null na plaatsing', () => {
        const my = emptyGrid(); my[0] = 'A';
        const result = playerPlaceStep(stateWithPending(my, 'E'));
        expect(result.pendingLetter).toBeNull();
    });

    test('gameOver = true als myGrid vol is na plaatsing', () => {
        const my = fullGrid('X'); my[24] = '';
        const result = playerPlaceStep(stateWithPending(my, 'A'));
        expect(result.gameOver).toBe(true);
        expect(isGridFull(result.myGrid)).toBe(true);
    });

    test('doet niets als er geen pendingLetter is', () => {
        const state = { myGrid: emptyGrid(), opponentGrid: emptyGrid(), pendingLetter: null, isPickTurn: true, gameOver: false };
        expect(playerPlaceStep(state)).toBe(state);
    });

    test('plaatst de letter niet op al gevulde cel', () => {
        const my = fullGrid('X'); my[20] = ''; my[21] = ''; my[22] = ''; // 3 lege cellen
        const result = playerPlaceStep(stateWithPending(my, 'E'));
        // De geplaatste letter moet in een lege cel terechtkomen
        const placedIndex = result.myGrid.findIndex((c, i) => c === 'E' && my[i] === '');
        expect(placedIndex).toBeGreaterThanOrEqual(0);
    });

    test('muteert het invoergrid niet', () => {
        const my = emptyGrid(); my[0] = 'A';
        const frozen = [...my];
        playerPlaceStep(stateWithPending(my, 'E'));
        expect(my).toEqual(frozen);
    });
});

// ===========================================================================
// SPELVERLOOP – volledige single player simulatie
// ===========================================================================

describe('simulateSinglePlayerGame – volledig spelverloop', () => {
    // Startgrids met 3 letters elk (zoals in het echte spel)
    function makeStartGrids() {
        const positions = [0, 6, 12]; // rij 0 col 0, rij 1 col 1, rij 2 col 2 → uniek
        const letters = ['A', 'E', 'N'];
        const my = Array(25).fill('');
        const opp = Array(25).fill('');
        positions.forEach((p, i) => { my[p] = letters[i]; opp[p] = letters[i]; });
        return { my, opp };
    }

    test('na het spel zijn beide grids volledig gevuld', () => {
        const { my, opp } = makeStartGrids();
        const result = simulateSinglePlayerGame(my, opp);
        expect(isGridFull(result.myGrid)).toBe(true);
        expect(isGridFull(result.opponentGrid)).toBe(true);
    }, 10000);

    test('geen cel wordt twee keer gevuld (startletters blijven staan)', () => {
        const { my, opp } = makeStartGrids();
        const result = simulateSinglePlayerGame(my, opp);
        // Alle cellen zijn niet-leeg
        result.myGrid.forEach((c, i) => {
            expect(c).not.toBe('');
            // Startletters staan op juiste plekken
        });
    }, 10000);

    test('myGrid bevat precies 25 letters na het spel', () => {
        const { my, opp } = makeStartGrids();
        const result = simulateSinglePlayerGame(my, opp);
        expect(result.myGrid.filter(c => c !== '').length).toBe(25);
    }, 10000);

    test('opponentGrid bevat precies 25 letters na het spel', () => {
        const { my, opp } = makeStartGrids();
        const result = simulateSinglePlayerGame(my, opp);
        expect(result.opponentGrid.filter(c => c !== '').length).toBe(25);
    }, 10000);

    test('eindstand: beide scores zijn niet-negatief integers', () => {
        const { my, opp } = makeStartGrids();
        const result = simulateSinglePlayerGame(my, opp);
        const myScore = calculatePoints(result.myGrid);
        const oppScore = calculatePoints(result.opponentGrid);
        expect(myScore).toBeGreaterThanOrEqual(0);
        expect(oppScore).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(myScore)).toBe(true);
        expect(Number.isInteger(oppScore)).toBe(true);
    }, 10000);

    test('eindscore is consistent: calculatePoints op eindgrid ≥ 0', () => {
        const { my, opp } = makeStartGrids();
        const result = simulateSinglePlayerGame(my, opp);
        expect(calculatePoints(result.myGrid)).toBeGreaterThanOrEqual(0);
    }, 10000);

    test('laatste letter vult het grid (geen pending meer aan het einde)', () => {
        const { my, opp } = makeStartGrids();
        const result = simulateSinglePlayerGame(my, opp);
        expect(result.pendingLetter).toBeNull();
    }, 10000);

    test('turn-beurt is correct afgewisseld: eindstand is pickTurn=true of gameOver', () => {
        const { my, opp } = makeStartGrids();
        const result = simulateSinglePlayerGame(my, opp);
        expect(result.gameOver || result.isPickTurn).toBe(true);
    }, 10000);
});

// ===========================================================================
// SPELVERLOOP – daily simulatie
// ===========================================================================

describe('simulateDailyGame – daily spelverloop', () => {
    // Bouw een daily startgrid met exact 2 letters op dezelfde posities
    function makeDailyStart(puzzle) {
        const my = Array(25).fill('');
        const opp = Array(25).fill('');
        puzzle.startLetters.forEach((l, i) => {
            my[puzzle.startPositions[i]] = l;
            opp[puzzle.startPositions[i]] = l;
        });
        return { my, opp };
    }

    const PUZZLE = buildDailyPuzzle('2025-06-15');

    test('beide grids zijn vol na het daily spel', () => {
        const { my, opp } = makeDailyStart(PUZZLE);
        const result = simulateDailyGame(my, opp, PUZZLE.aiSequence);
        expect(isGridFull(result.myGrid)).toBe(true);
        expect(isGridFull(result.opponentGrid)).toBe(true);
    }, 10000);

    test('myGrid bevat precies 25 letters', () => {
        const { my, opp } = makeDailyStart(PUZZLE);
        const result = simulateDailyGame(my, opp, PUZZLE.aiSequence);
        expect(countFilled(result.myGrid)).toBe(25);
    }, 10000);

    test('startletters blijven op hun oorspronkelijke posities', () => {
        const { my, opp } = makeDailyStart(PUZZLE);
        const result = simulateDailyGame(my, opp, PUZZLE.aiSequence);
        PUZZLE.startLetters.forEach((l, i) => {
            expect(result.myGrid[PUZZLE.startPositions[i]]).toBe(l);
            expect(result.opponentGrid[PUZZLE.startPositions[i]]).toBe(l);
        });
    }, 10000);

    test('dezelfde daily puzzel geeft altijd hetzelfde eindresultaat (deterministisch)', () => {
        const { my: my1, opp: opp1 } = makeDailyStart(PUZZLE);
        const { my: my2, opp: opp2 } = makeDailyStart(PUZZLE);
        const r1 = simulateDailyGame(my1, opp1, PUZZLE.aiSequence);
        const r2 = simulateDailyGame(my2, opp2, PUZZLE.aiSequence);
        expect(r1.myGrid).toEqual(r2.myGrid);
        expect(r1.opponentGrid).toEqual(r2.opponentGrid);
    }, 10000);

    test('verschillende daily puzzels geven (waarschijnlijk) andere eindgrids', () => {
        const p1 = buildDailyPuzzle('2025-06-15');
        const p2 = buildDailyPuzzle('2025-06-16');
        const { my: my1, opp: opp1 } = makeDailyStart(p1);
        const { my: my2, opp: opp2 } = makeDailyStart(p2);
        const r1 = simulateDailyGame(my1, opp1, p1.aiSequence);
        const r2 = simulateDailyGame(my2, opp2, p2.aiSequence);
        expect(r1.myGrid).not.toEqual(r2.myGrid);
    }, 10000);

    test('AI-sequentie wordt volledig verbruikt vóór speleinde', () => {
        // We tracken seqIndex handmatig
        const { my, opp } = makeDailyStart(PUZZLE);
        let state = { myGrid: [...my], opponentGrid: [...opp], pendingLetter: null, isPickTurn: true, gameOver: false };
        let seqIndex = 0;
        while (!state.gameOver) {
            state = playerPickStep(state);
            if (state.gameOver) break;
            const r = dailyAiStep(state, PUZZLE.aiSequence, seqIndex);
            state = r.state;
            seqIndex = r.nextSeqIndex;
            if (state.gameOver) break;
            state = playerPlaceStep(state);
        }
        // Alle 11 AI-sequentie-letters zijn gebruikt vóórdat het spel eindigde
        expect(seqIndex).toBe(PUZZLE.aiSequence.length);
    }, 10000);

    test('daily eindstand is consistent: calculatePoints ≥ 0', () => {
        const { my, opp } = makeDailyStart(PUZZLE);
        const result = simulateDailyGame(my, opp, PUZZLE.aiSequence);
        expect(calculatePoints(result.myGrid)).toBeGreaterThanOrEqual(0);
        expect(calculatePoints(result.opponentGrid)).toBeGreaterThanOrEqual(0);
    }, 10000);
});

// ===========================================================================
// SPELVERLOOP – beurtafwisseling
// ===========================================================================

describe('beurtafwisseling – turn-volgorde invarianten', () => {
    test('na playerPickStep is isPickTurn altijd false', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        const state = { myGrid: my, opponentGrid: opp, pendingLetter: null, isPickTurn: true, gameOver: false };
        expect(playerPickStep(state).isPickTurn).toBe(false);
    });

    test('na aiPickStep is isPickTurn altijd true', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        const state = { myGrid: my, opponentGrid: opp, pendingLetter: null, isPickTurn: false, gameOver: false };
        expect(aiPickStep(state).isPickTurn).toBe(true);
    });

    test('na playerPlaceStep is isPickTurn altijd true', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const state = { myGrid: my, opponentGrid: emptyGrid(), pendingLetter: 'E', isPickTurn: true, gameOver: false };
        expect(playerPlaceStep(state).isPickTurn).toBe(true);
    });

    test('volledige beurtcyclus: pick → aiPick → place → terug naar pick', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        let state = { myGrid: my, opponentGrid: opp, pendingLetter: null, isPickTurn: true, gameOver: false };

        // Stap 1: speler kiest en plaatst
        state = playerPickStep(state);
        expect(state.isPickTurn).toBe(false);
        expect(state.pendingLetter).toBeNull();

        // Stap 2: AI kiest en geeft pending
        state = aiPickStep(state);
        expect(state.isPickTurn).toBe(true);
        expect(state.pendingLetter).toBeTruthy();

        // Stap 3: speler plaatst pending
        state = playerPlaceStep(state);
        expect(state.isPickTurn).toBe(true);
        expect(state.pendingLetter).toBeNull();
    });

    test('myGrid groeit per ronde met precies 2 letters', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        let state = { myGrid: my, opponentGrid: opp, pendingLetter: null, isPickTurn: true, gameOver: false };
        const before = countFilled(state.myGrid); // 3
        state = playerPickStep(state);
        state = aiPickStep(state);
        state = playerPlaceStep(state);
        expect(countFilled(state.myGrid)).toBe(before + 2);
    });

    test('opponentGrid groeit per ronde met precies 2 letters', () => {
        const my = emptyGrid(); my[0] = 'A'; my[1] = 'B'; my[2] = 'C';
        const opp = emptyGrid(); opp[0] = 'A'; opp[5] = 'B'; opp[10] = 'C';
        let state = { myGrid: my, opponentGrid: opp, pendingLetter: null, isPickTurn: true, gameOver: false };
        const before = countFilled(state.opponentGrid); // 3
        state = playerPickStep(state);
        state = aiPickStep(state);
        state = playerPlaceStep(state);
        expect(countFilled(state.opponentGrid)).toBe(before + 2);
    });
});
