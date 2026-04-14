// gameLogic.js - Pure game logic for LetterDuel
// Works in browser (exposes functions globally) and Node.js (CommonJS exports)

(function (root, factory) {
    const exports = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exports;
    } else {
        // Browser: expose all functions globally (backward compatible)
        Object.assign(root, exports);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // --- CONSTANTS ---

    // Bug fix: 'J' was present in both "BGHJK" and "JVXYZQ", giving it double weight.
    // Fixed: removed J from the medium-weight group → "BGHK".
    // Bug fix (origineel): J zat in zowel "BGHJK" (gewicht 20) als "JVXYZQ" (gewicht 5),
    // en H zat in zowel "BGHJK" (gewicht 20) als "LMPFH" (gewicht 10).
    // Beide letters hadden daardoor dubbel gewicht. Opgelost: J en H uit de middelste
    // groep verwijderd → "BGK" en "LMPH" (H hoort bij gewicht 10 als minder-frequent).
    const WEIGHTED_LETTERS = [
        { chars: "AEION",  weight: 35 },
        { chars: "DRSTU",  weight: 30 },
        { chars: "BGK",    weight: 20 },
        { chars: "LMPHF",  weight: 10 },
        { chars: "JVXYZQ", weight: 5  }
    ];

    // --- WORD SET (initialised via initWordSet) ---

    let wordSet = new Set();
    let wordsByLength = { 3: [], 4: [], 5: [] };

    function initWordSet(wordList) {
        wordSet = new Set(wordList);
        const arr = Array.from(wordSet);
        wordsByLength[5] = arr.filter(w => w.length === 5);
        wordsByLength[4] = arr.filter(w => w.length === 4);
        wordsByLength[3] = arr.filter(w => w.length === 3);
    }

    function hasWord(word) {
        return wordSet.has(word);
    }

    // --- DETERMINISTIC RNG (for daily puzzles) ---

    function hashStringToSeed(input) {
        let hash = 2166136261;
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) || 123456789;
    }

    function createSeededRandom(seed) {
        let value = seed >>> 0;
        return function seeded() {
            value += 0x6D2B79F5;
            let t = value;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function pickWeightedLetterFromRng(rng) {
        const totalWeight = WEIGHTED_LETTERS.reduce((sum, g) => sum + g.weight, 0);
        let randomNum = rng() * totalWeight;
        for (let group of WEIGHTED_LETTERS) {
            if (randomNum < group.weight) {
                return group.chars.charAt(Math.floor(rng() * group.chars.length));
            }
            randomNum -= group.weight;
        }
        return 'E';
    }

    function pickWeightedLetterFromGroups(rng, groups) {
        const totalWeight = groups.reduce((sum, g) => sum + g.weight, 0);
        let randomNum = rng() * totalWeight;
        for (let group of groups) {
            if (randomNum < group.weight) {
                return group.chars.charAt(Math.floor(rng() * group.chars.length));
            }
            randomNum -= group.weight;
        }
        return 'E';
    }

    // --- DAILY PUZZLE GENERATION ---

    function buildDailyPuzzle(dateKey) {
        const seed = hashStringToSeed(`LETTERDUEL-DAILY-${dateKey}`);
        const rng = createSeededRandom(seed);

        const startLetter1 = pickWeightedLetterFromRng(rng);
        const startLetter2 = pickWeightedLetterFromRng(rng);
        let startPos1 = Math.floor(rng() * 25);
        let startPos2 = Math.floor(rng() * 25);
        while (startPos2 === startPos1) {
            startPos2 = Math.floor(rng() * 25);
        }

        const aiSequence = [];
        const easyGroups = WEIGHTED_LETTERS.slice(0, 2);
        const withoutHardest = WEIGHTED_LETTERS.slice(0, 4);
        for (let i = 0; i < 11; i++) {
            let groups = WEIGHTED_LETTERS;
            if (i >= 7) groups = withoutHardest;
            if (i >= 9) groups = easyGroups;
            aiSequence.push(pickWeightedLetterFromGroups(rng, groups));
        }

        return {
            dateKey,
            startLetters: [startLetter1, startLetter2],
            startPositions: [startPos1, startPos2],
            aiSequence
        };
    }

    // --- SCORING ---

    // Bug fix: calculatePoints used to concatenate empty strings ("") for empty cells,
    // producing strings shorter than 5 characters. This caused:
    //   - 3-letter words found by wordSet.has(str) returning 15 pts instead of 5
    //   - Non-adjacent letters forming false "words" across empty cells
    // Fix: use a space (" ") as placeholder so strings are always 5 characters.
    // Spaces never appear in the word list, so no false positives occur.
    function calculatePoints(grid) {
        let total = 0;
        for (let r = 0; r < 5; r++) {
            let row = "";
            for (let c = 0; c < 5; c++) row += grid[r * 5 + c] || " ";
            total += getLineScore(row);
        }
        for (let c = 0; c < 5; c++) {
            let col = "";
            for (let r = 0; r < 5; r++) col += grid[r * 5 + c] || " ";
            total += getLineScore(col);
        }
        return total;
    }

    // Expects a 5-character string (one row or column of the grid).
    // Returns: 15 for a 5-letter word, 10 for a 4-letter word, 5 for a 3-letter word, 0 otherwise.
    function getLineScore(str) {
        if (wordSet.has(str)) return 15;
        for (let i = 0; i <= 1; i++) if (wordSet.has(str.substring(i, i + 4))) return 10;
        for (let i = 0; i <= 2; i++) if (wordSet.has(str.substring(i, i + 3))) return 5;
        return 0;
    }

    // Returns word highlights for the result screen. Called with a full (25-cell) grid.
    function getScoringWords(grid) {
        let highlights = [];
        for (let r = 0; r < 5; r++) {
            let rowStr = "";
            for (let c = 0; c < 5; c++) rowStr += grid[r * 5 + c];
            let found = false;
            if (wordSet.has(rowStr)) { highlights.push({ type: 'row', r, c: 0, len: 5 }); found = true; }
            if (!found && wordSet.has(rowStr.substring(0, 4))) { highlights.push({ type: 'row', r, c: 0, len: 4 }); found = true; }
            if (!found && wordSet.has(rowStr.substring(1, 5))) { highlights.push({ type: 'row', r, c: 1, len: 4 }); found = true; }
            if (!found) {
                if (wordSet.has(rowStr.substring(0, 3))) highlights.push({ type: 'row', r, c: 0, len: 3 });
                else if (wordSet.has(rowStr.substring(1, 4))) highlights.push({ type: 'row', r, c: 1, len: 3 });
                else if (wordSet.has(rowStr.substring(2, 5))) highlights.push({ type: 'row', r, c: 2, len: 3 });
            }
        }
        for (let c = 0; c < 5; c++) {
            let colStr = "";
            for (let r = 0; r < 5; r++) colStr += grid[r * 5 + c];
            let found = false;
            if (wordSet.has(colStr)) { highlights.push({ type: 'col', r: 0, c, len: 5 }); found = true; }
            if (!found && wordSet.has(colStr.substring(0, 4))) { highlights.push({ type: 'col', r: 0, c, len: 4 }); found = true; }
            if (!found && wordSet.has(colStr.substring(1, 5))) { highlights.push({ type: 'col', r: 1, c, len: 4 }); found = true; }
            if (!found) {
                if (wordSet.has(colStr.substring(0, 3))) highlights.push({ type: 'col', r: 0, c, len: 3 });
                else if (wordSet.has(colStr.substring(1, 4))) highlights.push({ type: 'col', r: 1, c, len: 3 });
                else if (wordSet.has(colStr.substring(2, 5))) highlights.push({ type: 'col', r: 2, c, len: 3 });
            }
        }
        return highlights;
    }

    // --- POTENTIAL CALCULATION ---

    function calculateDetailedPotential(grid) {
        let totalPotential = 0;
        const GAP_PENALTY = 12;
        const POINTS = { 5: 15, 4: 10, 3: 5 };

        const analyzeSegment = (segment) => {
            const len = segment.length;
            const holes = segment.filter(c => c === "").length;
            if (holes === 0 || holes === len) return 0;
            let patternStr = "^";
            segment.forEach(c => patternStr += (c === "" ? "." : c));
            patternStr += "$";
            const regex = new RegExp(patternStr);
            const candidates = wordsByLength[len] || [];
            let matchCount = 0;
            for (let w of candidates) { if (regex.test(w)) matchCount++; }
            if (matchCount === 0) return 0;
            return (matchCount / Math.pow(GAP_PENALTY, holes)) * POINTS[len];
        };

        const scanLine = (lineArr) => {
            let lineScore = 0;
            lineScore += analyzeSegment(lineArr);
            lineScore += analyzeSegment(lineArr.slice(0, 4));
            lineScore += analyzeSegment(lineArr.slice(1, 5));
            lineScore += analyzeSegment(lineArr.slice(0, 3));
            lineScore += analyzeSegment(lineArr.slice(1, 4));
            lineScore += analyzeSegment(lineArr.slice(2, 5));
            return lineScore;
        };

        for (let r = 0; r < 5; r++) {
            let row = [];
            for (let c = 0; c < 5; c++) row.push(grid[r * 5 + c]);
            totalPotential += scanLine(row);
        }
        for (let c = 0; c < 5; c++) {
            let col = [];
            for (let r = 0; r < 5; r++) col.push(grid[r * 5 + c]);
            totalPotential += scanLine(col);
        }
        return totalPotential;
    }

    // --- WIN PROBABILITY ---

    function calculateWinProbabilityValue(myG, oppG) {
        const filledCount = myG.filter(c => c !== "").length;
        const progress = filledCount / 25;
        const myScore = calculatePoints(myG);
        const oppScore = calculatePoints(oppG);
        const myPotential = calculateDetailedPotential(myG);
        const oppPotential = calculateDetailedPotential(oppG);
        const scoreWeight = 1 + (progress * 2);
        const potentialWeight = Math.max(0.1, 1.0 - progress);
        const myTotal = (myScore * scoreWeight) + (myPotential * potentialWeight);
        const oppTotal = (oppScore * scoreWeight) + (oppPotential * potentialWeight);
        let pct = 50;
        if (myTotal + oppTotal > 0) pct = (myTotal / (myTotal + oppTotal)) * 100;
        if (filledCount === 25) return pct;
        return Math.max(1, Math.min(99, pct));
    }

    // --- AI MOVE SELECTION ---

    function getBestPickAndPositionHeuristic(grid) {
        let emptyIndices = grid.map((v, i) => v === "" ? i : null).filter(v => v !== null);
        if (emptyIndices.length === 0) return { index: -1, letter: 'E' };
        let bestMove = { index: emptyIndices[0], letter: 'E' };
        let maxScore = -999;
        const candidates = "ENATIRSLGD";
        for (let char of candidates) {
            for (let idx of emptyIndices) {
                let simGrid = [...grid]; simGrid[idx] = char;
                let points = calculatePoints(simGrid);
                points += (calculateDetailedPotential(simGrid) / 5);
                if (points > maxScore) { maxScore = points; bestMove = { index: idx, letter: char }; }
            }
        }
        return bestMove;
    }

    function getBestPositionForLetter(grid, letter) {
        let emptyIndices = grid.map((v, i) => v === "" ? i : null).filter(v => v !== null);
        if (emptyIndices.length === 0) return { index: -1 };
        let bestIdx = emptyIndices[0];
        let maxScore = -1;
        for (let idx of emptyIndices) {
            let simGrid = [...grid]; simGrid[idx] = letter;
            let score = calculatePoints(simGrid);
            score += (calculateDetailedPotential(simGrid) / 5);
            if (score > maxScore) { maxScore = score; bestIdx = idx; }
        }
        return { index: bestIdx };
    }

    // --- GRID SETUP UTILITIES ---

    function getUniqueRowColStartPositions(count = 3) {
        const positions = [];
        const usedRows = new Set();
        const usedCols = new Set();
        let attempts = 0;

        while (positions.length < count && attempts < 1000) {
            const index = Math.floor(Math.random() * 25);
            const row = Math.floor(index / 5);
            const col = index % 5;
            attempts++;
            if (usedRows.has(row) || usedCols.has(col) || positions.includes(index)) continue;
            positions.push(index);
            usedRows.add(row);
            usedCols.add(col);
        }

        if (positions.length < count) {
            for (let row = 0; row < 5 && positions.length < count; row++) {
                if (usedRows.has(row)) continue;
                for (let col = 0; col < 5 && positions.length < count; col++) {
                    if (usedCols.has(col)) continue;
                    const index = row * 5 + col;
                    if (positions.includes(index)) continue;
                    positions.push(index);
                    usedRows.add(row);
                    usedCols.add(col);
                }
            }
        }

        return positions;
    }

    // --- PURE SPELVERLOOP-SIMULATIE (zonder DOM/Firebase) ---
    //
    // Deze functies modelleren de spelstroom als pure state-transformaties.
    // Ze zijn bedoeld voor het testen en voor simulaties.
    //
    // Spelstaat: { myGrid, opponentGrid, pendingLetter, isPickTurn, gameOver }
    //
    // Single player flow per ronde:
    //   1. playerPickStep   – speler kiest letter + plaatst op myGrid; AI mirrors op opponentGrid
    //   2. aiPickStep       – AI kiest letter + plaatst op opponentGrid; geeft pendingLetter aan speler
    //   3. playerPlaceStep  – speler plaatst pendingLetter op myGrid
    //
    // Daily flow per ronde:
    //   1. playerPickStep   – speler kiest letter + plaatst op myGrid; AI mirrors op opponentGrid
    //   2. dailyAiStep      – AI neemt volgende letter uit aiSequence; plaatst op opponentGrid; geeft pendingLetter
    //   3. playerPlaceStep  – speler plaatst pendingLetter op myGrid

    function isGridFull(grid) {
        return grid.every(c => c !== "");
    }

    function countFilled(grid) {
        return grid.filter(c => c !== "").length;
    }

    /**
     * Stap 1: speler kiest beste letter en plaatst die op myGrid.
     * AI mirrors dezelfde letter op opponentGrid.
     * Retourneert nieuw state-object; muteert de invoer niet.
     */
    function playerPickStep(state) {
        if (state.gameOver || !state.isPickTurn) return state;
        const pick = getBestPickAndPositionHeuristic(state.myGrid);
        if (pick.index === -1) return { ...state, gameOver: true };

        const myGrid = [...state.myGrid];
        myGrid[pick.index] = pick.letter;

        const opponentGrid = [...state.opponentGrid];
        const mirror = getBestPositionForLetter(opponentGrid, pick.letter);
        if (mirror.index !== -1) opponentGrid[mirror.index] = pick.letter;

        const gameOver = isGridFull(myGrid);
        return { myGrid, opponentGrid, pendingLetter: null, isPickTurn: false, gameOver };
    }

    /**
     * Stap 2 (single player): AI kiest beste letter en plaatst die op opponentGrid.
     * Die letter wordt pendingLetter voor de speler.
     */
    function aiPickStep(state) {
        if (state.gameOver || state.isPickTurn) return state;
        const pick = getBestPickAndPositionHeuristic(state.opponentGrid);
        if (pick.index === -1) return { ...state, gameOver: true };

        const opponentGrid = [...state.opponentGrid];
        opponentGrid[pick.index] = pick.letter;

        return { ...state, opponentGrid, pendingLetter: pick.letter, isPickTurn: true };
    }

    /**
     * Stap 2 (daily): AI neemt de volgende letter uit aiSequence en plaatst die op opponentGrid.
     * Die letter wordt pendingLetter voor de speler.
     * @param {object} state
     * @param {string[]} aiSequence - de volledige AI-sequentie uit de daily puzzle
     * @param {number} seqIndex - volgende te gebruiken index in aiSequence
     * @returns {{ state, nextSeqIndex }}
     */
    function dailyAiStep(state, aiSequence, seqIndex) {
        if (state.gameOver || state.isPickTurn) return { state, nextSeqIndex: seqIndex };
        if (seqIndex >= aiSequence.length) return { state: { ...state, gameOver: true }, nextSeqIndex: seqIndex };

        const letter = aiSequence[seqIndex];
        const opponentGrid = [...state.opponentGrid];
        const placement = getBestPositionForLetter(opponentGrid, letter);
        if (placement.index === -1) return { state: { ...state, gameOver: true }, nextSeqIndex: seqIndex };

        opponentGrid[placement.index] = letter;
        const newState = { ...state, opponentGrid, pendingLetter: letter, isPickTurn: true };
        return { state: newState, nextSeqIndex: seqIndex + 1 };
    }

    /**
     * Stap 3: speler plaatst pendingLetter op de beste positie in myGrid.
     */
    function playerPlaceStep(state) {
        if (state.gameOver || !state.pendingLetter) return state;
        const placement = getBestPositionForLetter(state.myGrid, state.pendingLetter);
        if (placement.index === -1) return { ...state, gameOver: true };

        const myGrid = [...state.myGrid];
        myGrid[placement.index] = state.pendingLetter;
        const gameOver = isGridFull(myGrid);
        return { ...state, myGrid, pendingLetter: null, isPickTurn: true, gameOver };
    }

    /**
     * Simuleer een volledig single player spel (AI vs AI) en retourneer het eindresultaat.
     * Handig voor integratietests van het spelverloop.
     * @param {string[]} startMyGrid    - beginrooster speler (25 cellen)
     * @param {string[]} startOppGrid   - beginrooster tegenstander (25 cellen)
     * @param {number}   maxRounds      - veiligheidsrem (default 50)
     */
    function simulateSinglePlayerGame(startMyGrid, startOppGrid, maxRounds = 50) {
        let state = {
            myGrid: [...startMyGrid],
            opponentGrid: [...startOppGrid],
            pendingLetter: null,
            isPickTurn: true,
            gameOver: false
        };
        let rounds = 0;
        while (!state.gameOver && rounds < maxRounds) {
            state = playerPickStep(state);
            if (state.gameOver) break;
            state = aiPickStep(state);
            if (state.gameOver) break;
            state = playerPlaceStep(state);
            rounds++;
        }
        return state;
    }

    /**
     * Simuleer een volledig daily spel (AI vs AI) en retourneer het eindresultaat.
     */
    function simulateDailyGame(startMyGrid, startOppGrid, aiSequence, maxRounds = 50) {
        let state = {
            myGrid: [...startMyGrid],
            opponentGrid: [...startOppGrid],
            pendingLetter: null,
            isPickTurn: true,
            gameOver: false
        };
        let seqIndex = 0;
        let rounds = 0;
        while (!state.gameOver && rounds < maxRounds) {
            state = playerPickStep(state);
            if (state.gameOver) break;
            const result = dailyAiStep(state, aiSequence, seqIndex);
            state = result.state;
            seqIndex = result.nextSeqIndex;
            if (state.gameOver) break;
            state = playerPlaceStep(state);
            rounds++;
        }
        return state;
    }

    // --- RANDOM LETTER (non-deterministic, for live games) ---

    function getWeightedLetter() {
        const totalWeight = WEIGHTED_LETTERS.reduce((sum, g) => sum + g.weight, 0);
        let randomNum = Math.random() * totalWeight;
        for (let group of WEIGHTED_LETTERS) {
            if (randomNum < group.weight) return group.chars.charAt(Math.floor(Math.random() * group.chars.length));
            randomNum -= group.weight;
        }
        return "E";
    }

    return {
        WEIGHTED_LETTERS,
        initWordSet,
        hasWord,
        hashStringToSeed,
        createSeededRandom,
        pickWeightedLetterFromRng,
        pickWeightedLetterFromGroups,
        buildDailyPuzzle,
        getLineScore,
        calculatePoints,
        getScoringWords,
        calculateDetailedPotential,
        calculateWinProbabilityValue,
        getBestPickAndPositionHeuristic,
        getBestPositionForLetter,
        getUniqueRowColStartPositions,
        getWeightedLetter,
        isGridFull,
        countFilled,
        playerPickStep,
        aiPickStep,
        dailyAiStep,
        playerPlaceStep,
        simulateSinglePlayerGame,
        simulateDailyGame
    };
});
