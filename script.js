// --- APP & GAME STATE ---
let masteredWords = JSON.parse(localStorage.getItem('koreanMastered')) || [];
let wordStats = JSON.parse(localStorage.getItem('koreanWordStats')) || {};
// wordStats structure: { "물": { seen: 5, correct: 4, incorrect: 1 } }

let speechDebounceTimer = null;
let currentMode = 'study'; 
let currentMainView = 'study';
let isWritingMode = false;
let isMuted = JSON.parse(localStorage.getItem('koreanMuted')) || false;
let currentIndex = 0;
let pool = [];
let activeBatches = [1];
let inputField = null;
let showChoseong = JSON.parse(localStorage.getItem('koreanShowChoseong')) || false;

function init() {
    inputField = document.getElementById('user-input');

    if (inputField) {
        inputField.addEventListener("keypress", (e) => { 
            if (e.key === "Enter") checkInputAnswer(); 
        });
    }

    const choseongToggle = document.getElementById('choseong-toggle');
    if (choseongToggle) {
        choseongToggle.checked = showChoseong;
    }

    const typingToggleContainer = document.getElementById('typing-toggle-container');
    if (typingToggleContainer) {
        typingToggleContainer.classList.toggle('hidden', currentMode !== 'quiz');
    }

    updateDirectionUI();
    renderBatchSelectors();
    updatePool();
    renderWord();
    updateStats();
    toggleWritingMode();
    updateMuteIcon();
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

// --- STATS LOGIC ---
function recordWordStat(koreanWord, isCorrect) {
    if (!wordStats[koreanWord]) {
        wordStats[koreanWord] = { seen: 0, correct: 0, incorrect: 0 };
    }
    wordStats[koreanWord].seen += 1;
    if (isCorrect) {
        wordStats[koreanWord].correct += 1;
    } else {
        wordStats[koreanWord].incorrect += 1;
    }
    localStorage.setItem('koreanWordStats', JSON.stringify(wordStats));
}

function getWordStat(koreanWord) {
    return wordStats[koreanWord] || { seen: 0, correct: 0, incorrect: 0 };
}

// --- NAVIGATION & VIEWS ---
function toggleNavMenu() {
    const drawer = document.getElementById('nav-drawer');
    const overlay = document.getElementById('nav-overlay');
    drawer.classList.toggle('open');
    overlay.classList.toggle('hidden');
}

function switchMainView(view) {
    currentMainView = view;
    toggleNavMenu();

    const studyView = document.getElementById('study-view');
    const libraryView = document.getElementById('library-view');
    const navStudyBtn = document.getElementById('nav-study-btn');
    const navLibraryBtn = document.getElementById('nav-library-btn');

    if (view === 'study') {
        studyView.classList.remove('hidden');
        libraryView.classList.add('hidden');
        navStudyBtn.classList.add('active');
        navLibraryBtn.classList.remove('active');
        renderWord();
    } else {
        studyView.classList.add('hidden');
        libraryView.classList.remove('hidden');
        navStudyBtn.classList.remove('active');
        navLibraryBtn.classList.add('active');
        renderLibrary();
    }
}

// --- STUDY & QUIZ ENGINE ---
function renderBatchSelectors() {
    const grid = document.getElementById('batch-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
        const label = document.createElement('label');
        label.className = 'batch-item';
        const checked = activeBatches.includes(i) ? 'checked' : '';
        label.innerHTML = `<input type="checkbox" value="${i}" ${checked} onchange="updateActiveBatches()"> B${i}`;
        grid.appendChild(label);
    }
}

function updateActiveBatches() {
    const checkboxes = document.querySelectorAll('#batch-grid input:checked');
    activeBatches = Array.from(checkboxes).map(cb => parseInt(cb.value));
    if (activeBatches.length === 0) {
        alert("Select at least one batch!");
        activeBatches = [1];
        renderBatchSelectors();
    }
    currentIndex = 0;
    updatePool();
    renderWord();
    updateStats();
}

function updatePool() {
    pool = vocabList.filter(word => 
        activeBatches.includes(word.batch) && !masteredWords.includes(word.kr)
    );
    if (pool.length === 0) {
        pool = vocabList.filter(word => activeBatches.includes(word.batch));
    }
    shuffle(pool);
}

function renderWord() {
    if (pool.length === 0) return;
    const word = pool[currentIndex];

    if (currentMode === 'study') {
        if (!wordStats[word.kr]) {
            wordStats[word.kr] = { seen: 1, correct: 0, incorrect: 0 };
        } else {
            wordStats[word.kr].seen += 1;
        }
        localStorage.setItem('koreanWordStats', JSON.stringify(wordStats));
    }

    let badge = document.getElementById('card-score-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'card-score-badge';
        badge.className = 'card-score-badge';
        document.getElementById('main-card').appendChild(badge);
    }
    const currentScore = getWordScore(word.kr);
    badge.innerText = `Score: ${currentScore}/${MASTERY_THRESHOLD}`;

    const krEl = document.getElementById('display-korean');
    const enEl = document.getElementById('display-english');

    if (learningDirection === 'kr-to-en') {
        // Front: Korean | Back: English
        krEl.className = 'korean';
        krEl.innerText = word.kr;
        krEl.classList.remove('hidden');

        enEl.className = 'english hidden';
        enEl.innerText = word.en;

        if (typeof updateChoseongDisplay === "function") {
            updateChoseongDisplay();
        }

        speak(word.kr);
    } else {
        // Front: English | Back: Korean
        enEl.className = 'english prompt-active';
        enEl.innerText = word.en;
        enEl.classList.remove('hidden');

        krEl.className = 'korean answer-reveal hidden';
        krEl.innerText = word.kr;

        // In EN -> KR, 초성 clue (if toggled) serves as an inline hint
        const clueEl = document.getElementById('display-choseong');
        if (clueEl) {
            if (showChoseong) {
                clueEl.innerText = getChoseong(word.kr);
                clueEl.classList.remove('hidden');
            } else {
                clueEl.classList.add('hidden');
            }
        }
    }

    updateRootLessonDisplay(word);

    // Add inside renderWord() right after updating the card text:
const flipBtn = document.getElementById('flip-card-btn');
if (flipBtn) {
    flipBtn.innerHTML = `
        <svg viewBox="0 0 24 24" class="inline-flip-icon">
            <path d="M7 7h10v2l4-3-4-3v2H5a2 2 0 0 0-2 2v7h2V7zm10 10H7v-2l-4 3 4 3v-2h12a2 2 0 0 0 2-2v-7h-2v7z" fill="currentColor"/>
        </svg>
        <span>Flip Card / Show Answer</span>
    `;
}

    if (inputField) inputField.value = "";

    if (currentMode === 'quiz' && !isWritingMode) {
        renderMultipleChoice();
    }
}

function checkInputAnswer() {
    const word = pool[currentIndex];
    const userValue = inputField.value.trim().toLowerCase();
    
    const isCorrect = (learningDirection === 'kr-to-en')
        ? (userValue === word.en.toLowerCase())
        : (userValue === word.kr.trim().toLowerCase() || userValue === (word.ro || '').toLowerCase());

    recordWordStat(word.kr, isCorrect);

    if (isCorrect) {
        inputField.classList.add('correct-flash');
        setTimeout(() => {
            inputField.classList.remove('correct-flash');
            nextWord();
        }, 400);
    } else {
        inputField.classList.add('wrong-flash');
        revealFullWord();
        setTimeout(() => {
            inputField.classList.remove('wrong-flash');
        }, 1000);
    }
}

function getSmartDistractors(correctWord, neededCount = 3) {
    const distractors = [];
    const correctTags = Array.isArray(correctWord.tags) ? correctWord.tags : [];

    // Step 1: If target word has tags, find candidates sharing >= 1 tag
    if (correctTags.length > 0) {
        const taggedCandidates = vocabList.filter(w => {
            if (w.kr === correctWord.kr || !Array.isArray(w.tags)) return false;
            return w.tags.some(tag => correctTags.includes(tag));
        });

        shuffle(taggedCandidates);
        for (const candidate of taggedCandidates) {
            if (distractors.length >= neededCount) break;
            // Prevent duplicate English meanings in choices
            if (!distractors.some(d => d.en.toLowerCase() === candidate.en.toLowerCase())) {
                distractors.push(candidate);
            }
        }
    }

    // Step 2: Fallback filler if fewer than neededCount tagged candidates exist
    if (distractors.length < neededCount) {
        const remainingPool = vocabList.filter(w => 
            w.kr !== correctWord.kr && 
            !distractors.some(d => d.kr === w.kr)
        );
        shuffle(remainingPool);

        for (const candidate of remainingPool) {
            if (distractors.length >= neededCount) break;
            if (!distractors.some(d => d.en.toLowerCase() === candidate.en.toLowerCase())) {
                distractors.push(candidate);
            }
        }
    }

    return distractors;
}

function renderMultipleChoice() {
    const container = document.getElementById('quiz-options');
    if (!container) return;
    container.innerHTML = '';
    const correctWord = pool[currentIndex];

    const distractors = getSmartDistractors(correctWord, 3);
    const options = [correctWord, ...distractors];
    shuffle(options);

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        // Display Korean choices for EN -> KR, English choices for KR -> EN
        btn.innerText = (learningDirection === 'kr-to-en') ? opt.en : opt.kr;

        btn.onclick = () => {
            const isCorrect = (opt.kr === correctWord.kr);
            recordWordStat(correctWord.kr, isCorrect);

            if (isCorrect) {
                btn.classList.add('correct-flash');
                setTimeout(nextWord, 400);
            } else {
                btn.classList.add('wrong-flash');
                revealFullWord();
            }
        };

        container.appendChild(btn);
    });
}

function toggleWritingMode() {
    const toggleCheckbox = document.getElementById('writing-mode-toggle');
    const typingArea = document.getElementById('typing-area');
    const quizOpts = document.getElementById('quiz-options');

    // Only allow writing mode to be active when in quiz mode
    isWritingMode = (currentMode === 'quiz') && (toggleCheckbox ? toggleCheckbox.checked : false);

    // Show text input only if we are in quiz mode AND writing mode is enabled
    if (typingArea) {
        typingArea.classList.toggle('hidden', !isWritingMode);
    }

    // In quiz mode, show multiple-choice buttons only when typing challenge is NOT enabled
    if (quizOpts) {
        if (currentMode === 'quiz' && !isWritingMode) {
            quizOpts.classList.remove('hidden');
        } else {
            quizOpts.classList.add('hidden');
        }
    }

    if (isWritingMode && inputField) {
        inputField.focus();
    }
}

function toggleGameMode() {
    currentMode = (currentMode === 'study') ? 'quiz' : 'study';
    
    document.getElementById('mode-title').innerText = currentMode === 'study' ? 'Study Mode' : 'Quiz Mode';
    document.getElementById('next-mode-label').innerText = currentMode === 'study' ? 'Quiz' : 'Study';
    
    // Study mode controls (Again, Hard, Good, Easy) visible only in Study Mode
    const studyControls = document.getElementById('study-controls');
    if (studyControls) {
        studyControls.classList.toggle('hidden', currentMode === 'quiz');
    }

    // Show "Enable Typing Challenge" toggle ONLY in Quiz Mode
    const typingToggleContainer = document.getElementById('typing-toggle-container');
    if (typingToggleContainer) {
        typingToggleContainer.classList.toggle('hidden', currentMode !== 'quiz');
    }

    toggleWritingMode();
    currentIndex = 0;
    renderWord();
    updateRootLessonDisplay(pool[currentIndex])
}

function nextWord() {
    window.speechSynthesis.cancel();
    if (pool.length === 0) return;
    currentIndex = (currentIndex + 1) % pool.length;
    renderWord();
    if (isWritingMode && inputField) inputField.focus();
}

function markMastered() {
    if (pool.length === 0) return;
    const word = pool[currentIndex];
    if (!masteredWords.includes(word.kr)) {
        masteredWords.push(word.kr);
        localStorage.setItem('koreanMastered', JSON.stringify(masteredWords));
    }
    recordWordStat(word.kr, true);
    updateStats();
    updatePool();
    currentIndex = 0;
    renderWord();
}

function updateStats() {
    const totalInSelection = vocabList.filter(w => activeBatches.includes(w.batch)).length;
    const masteredInSelection = masteredWords.filter(kr => {
        const word = vocabList.find(w => w.kr === kr);
        return word && activeBatches.includes(word.batch);
    }).length;

    document.getElementById('mastered-count').innerText = masteredInSelection;
    document.getElementById('total-count').innerText = totalInSelection;
    document.getElementById('progress-bar').style.width = (totalInSelection === 0 ? 0 : (masteredInSelection / totalInSelection * 100)) + '%';
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// --- AUDIO & MUTE CONTROLS ---
function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('koreanMuted', JSON.stringify(isMuted));
    updateMuteIcon();
    if (isMuted) window.speechSynthesis.cancel();
}

function updateMuteIcon() {
    const unmutedIcon = document.getElementById('icon-unmuted');
    const mutedIcon = document.getElementById('icon-muted');
    if (unmutedIcon && mutedIcon) {
        unmutedIcon.classList.toggle('hidden', isMuted);
        mutedIcon.classList.toggle('hidden', !isMuted);
    }
}


function speak(text) {
    if (isMuted || !text) return;

    // Clear any pending speech trigger from a rapid succession of clicks
    clearTimeout(speechDebounceTimer);

    // Cancel current audio pipeline
    window.speechSynthesis.cancel();

    // Small micro-delay lets the browser thread safely clear its audio buffer
    speechDebounceTimer = setTimeout(() => {
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'ko-KR';
        msg.rate = 1.1; // Slightly crisper playback rate for flashcards

        // Pre-select Korean voice to avoid runtime voice-lookup hitching
        const voices = window.speechSynthesis.getVoices();
        const koVoice = voices.find(v => v.lang.startsWith('ko'));
        if (koVoice) msg.voice = koVoice;

        window.speechSynthesis.speak(msg);
    }, 40);
}

// --- LIBRARY VIEW RENDERING & SORTING ---
function sortWords(list, sortCriteria) {
    const sorted = [...list];
    sorted.sort((a, b) => {
        const statA = getWordStat(a.kr);
        const statB = getWordStat(b.kr);
        const attemptsA = statA.correct + statA.incorrect;
        const attemptsB = statB.correct + statB.incorrect;
        const pctA = attemptsA ? (statA.correct / attemptsA) * 100 : 0;
        const pctB = attemptsB ? (statB.correct / attemptsB) * 100 : 0;
        const inPctA = attemptsA ? (statA.incorrect / attemptsA) * 100 : 0;
        const inPctB = attemptsB ? (statB.incorrect / attemptsB) * 100 : 0;

        switch (sortCriteria) {
            case 'seen-desc': return statB.seen - statA.seen;
            case 'seen-asc': return statA.seen - statB.seen;
            case 'correct-desc': return statB.correct - statA.correct;
            case 'correct-pct-desc': return pctB - pctA;
            case 'incorrect-desc': return statB.incorrect - statA.incorrect;
            case 'incorrect-pct-desc': return inPctB - inPctA;
            default: return 0;
        }
    });
    return sorted;
}

function renderLibrary() {
    const container = document.getElementById('library-content');
    const groupMode = document.getElementById('lib-group-select').value;
    const sortCriteria = document.getElementById('lib-sort-select').value;
    const searchInput = document.getElementById('lib-search-input');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    container.innerHTML = '';

    // Filter words matching Korean, English, or Romanization
    const filteredVocab = vocabList.filter(w => {
        if (!searchTerm) return true;
        const krMatch = w.kr && w.kr.toLowerCase().includes(searchTerm);
        const enMatch = w.en && w.en.toLowerCase().includes(searchTerm);
        const roMatch = w.ro && w.ro.toLowerCase().includes(searchTerm);
        return krMatch || enMatch || roMatch;
    });

    if (filteredVocab.length === 0) {
        container.innerHTML = '<p style="padding: 20px; color: #777;">No matching words found.</p>';
        return;
    }

    if (groupMode === 'all') {
        const sorted = sortWords(filteredVocab, sortCriteria);
        container.innerHTML = buildLibraryTable(sorted);
    } else {
        // Group by batches 1 through 10
        let renderedAny = false;
        for (let b = 1; b <= 10; b++) {
            const batchWords = filteredVocab.filter(w => w.batch === b);
            if (batchWords.length === 0) continue;

            renderedAny = true;
            const section = document.createElement('div');
            section.className = 'library-section';
            section.innerHTML = `<h3>Batch ${b} (${batchWords.length} words)</h3>`;

            const sorted = sortWords(batchWords, sortCriteria);
            section.innerHTML += buildLibraryTable(sorted);
            container.appendChild(section);
        }

        if (!renderedAny) {
            container.innerHTML = '<p style="padding: 20px; color: #777;">No matching words found.</p>';
        }
    }
}

function buildLibraryTable(words) {
    if (words.length === 0) return '<p>No words in this section.</p>';

    let html = `
    <table class="lib-table">
        <thead>
            <tr>
                <th>Korean</th>
                <th>English</th>
                <th>Seen</th>
                <th>Correct</th>
                <th>Incorrect</th>
            </tr>
        </thead>
        <tbody>`;

    words.forEach(w => {
        const stat = getWordStat(w.kr);
        const totalAnswers = stat.correct + stat.incorrect;
        const correctPct = totalAnswers ? Math.round((stat.correct / totalAnswers) * 100) : 0;
        const incorrectPct = totalAnswers ? Math.round((stat.incorrect / totalAnswers) * 100) : 0;

        html += `
            <tr>
                <td><strong>${w.kr}</strong></td>
                <td>${w.en}</td>
                <td>${stat.seen}</td>
                <td class="stat-correct">${stat.correct} <span class="stat-sub">(${correctPct}%)</span></td>
                <td class="stat-incorrect">${stat.incorrect} <span class="stat-sub">(${incorrectPct}%)</span></td>
            </tr>`;
    });

    html += `</tbody></table>`;
    return html;
}

function replayCurrentWord() {
    if (!pool || pool.length === 0) return;
    const currentWord = pool[currentIndex];
    if (currentWord && currentWord.kr) {
        speak(currentWord.kr);
    }
}

// --- MASTERY CONFIGURATION ---
const MASTERY_THRESHOLD = 5; // Reaching 5 points marks word as mastered
let wordScores = JSON.parse(localStorage.getItem('koreanWordScores')) || {};
// Format: { "사람": 3, "물": 5 }

function getWordScore(krWord) {
    return wordScores[krWord] || 0;
}

function setWordScore(krWord, score) {
    wordScores[krWord] = Math.max(0, score);
    localStorage.setItem('koreanWordScores', JSON.stringify(wordScores));
}

// Ensure masteredWords stays in sync with wordScores >= threshold
function checkMasteryStatus(krWord) {
    const currentScore = getWordScore(krWord);
    const isMastered = masteredWords.includes(krWord);

    if (currentScore >= MASTERY_THRESHOLD && !isMastered) {
        masteredWords.push(krWord);
        localStorage.setItem('koreanMastered', JSON.stringify(masteredWords));
    } else if (currentScore < MASTERY_THRESHOLD && isMastered) {
        masteredWords = masteredWords.filter(w => w !== krWord);
        localStorage.setItem('koreanMastered', JSON.stringify(masteredWords));
    }
}

// Anki-style rating dispatcher
function rateWord(grade) {
    window.speechSynthesis.cancel(); // Drop speech immediately on user action
    if (!pool || pool.length === 0) return;

    const currentWord = pool[currentIndex];
    let score = getWordScore(currentWord.kr);

    switch (grade) {
        case 'again':
            score = 0; // reset progression
            recordWordStat(currentWord.kr, false);
            break;
        case 'hard':
            score += 1;
            recordWordStat(currentWord.kr, true);
            break;
        case 'good':
            score += 2;
            recordWordStat(currentWord.kr, true);
            break;
        case 'easy':
            score += 3;
            recordWordStat(currentWord.kr, true);
            break;
    }

    setWordScore(currentWord.kr, score);
    checkMasteryStatus(currentWord.kr);

    // If "Again", reinsert word a few cards ahead in the current session pool
    if (grade === 'again') {
        const failedItem = pool.splice(currentIndex, 1)[0];
        const reinsertIndex = Math.min(pool.length, currentIndex + 3);
        pool.splice(reinsertIndex, 0, failedItem);
    } else if (score >= MASTERY_THRESHOLD) {
        // If now mastered, drop from active pool
        pool.splice(currentIndex, 1);
        if (currentIndex >= pool.length) currentIndex = 0;
    } else {
        currentIndex = (currentIndex + 1) % pool.length;
    }

    updateStats();

    if (pool.length === 0) {
        updatePool(); // Reload or cycle if entire pool finished
    }

    renderWord();
}

// --- CHOSEONG (초성) EXTRACTION ENGINE ---
const CHOSEONG_LIST = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 
    'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

function getChoseong(text) {
    if (!text) return '';
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        // Standard Hangul Syllable Block range (가 ~ 힣)
        if (code >= 0xAC00 && code <= 0xD7A3) {
            const choseongIndex = Math.floor((code - 0xAC00) / 588);
            result += CHOSEONG_LIST[choseongIndex] || text[i];
        } else {
            result += text[i]; // Return spaces, numbers, or punctuation unchanged
        }
    }
    return result;
}



function toggleChoseongClue() {
    const checkbox = document.getElementById('choseong-toggle');
    if (!checkbox) return;
    showChoseong = checkbox.checked;
    localStorage.setItem('koreanShowChoseong', JSON.stringify(showChoseong));
    updateChoseongDisplay();
}

function updateChoseongDisplay() {
    const clueEl = document.getElementById('display-choseong');
    const koreanEl = document.getElementById('display-korean');
    if (!clueEl || !koreanEl || !pool || pool.length === 0) return;

    const currentWord = pool[currentIndex];
    if (showChoseong && currentWord) {
        clueEl.innerText = getChoseong(currentWord.kr);
        clueEl.classList.remove('hidden');
        // Hide full Hangul until revealed
        koreanEl.classList.add('hidden');
    } else {
        clueEl.classList.add('hidden');
        koreanEl.classList.remove('hidden');
    }
}

function revealFullWord() {
    const krEl = document.getElementById('display-korean');
    const enEl = document.getElementById('display-english');
    const word = pool[currentIndex];

    if (krEl) krEl.classList.remove('hidden');
    if (enEl) enEl.classList.remove('hidden');

    if (learningDirection === 'en-to-kr' && word) {
        speak(word.kr);
    }
}

function flipCard() {
    const krEl = document.getElementById('display-korean');
    const enEl = document.getElementById('display-english');
    const flipBtn = document.getElementById('flip-card-btn');

    let isRevealed = false;

    if (learningDirection === 'kr-to-en') {
        if (enEl.classList.contains('hidden')) {
            revealFullWord();
            isRevealed = true;
        } else {
            enEl.classList.add('hidden');
            if (showChoseong) krEl.classList.add('hidden');
            isRevealed = false;
        }
    } else {
        if (krEl.classList.contains('hidden')) {
            revealFullWord();
            isRevealed = true;
        } else {
            krEl.classList.add('hidden');
            isRevealed = false;
        }
    }

    if (flipBtn) {
        flipBtn.querySelector('span').innerText = isRevealed 
            ? "Hide Answer" 
            : "Flip Card / Show Answer";
    }
}

function getLessonForWord(word) {
    if (!word || typeof rootLessons === "undefined") return null;

    // Check Hanja root key first
    if (word.hanjaRoot && rootLessons[word.hanjaRoot]) {
        return rootLessons[word.hanjaRoot];
    }
    // Check English root key
    if (word.englishRoot && rootLessons[word.englishRoot]) {
        return rootLessons[word.englishRoot];
    }
    // Fall back to checking the Korean word itself
    if (rootLessons[word.kr]) {
        return rootLessons[word.kr];
    }

    return null;
}

function updateRootLessonDisplay(word) {
    const accordion = document.getElementById('root-lesson-accordion');
    const badge = document.getElementById('root-badge');
    const title = document.getElementById('root-summary-title');
    const body = document.getElementById('root-lesson-body');

    if (!accordion || !body || !badge || !title) return;

    if (currentMode !== 'study') {
        accordion.classList.add('hidden');
        return;
    }

    const lesson = getLessonForWord(word);

    if (!lesson) {
        accordion.classList.add('hidden');
        accordion.open = false;
        return;
    }

    accordion.open = false;
    accordion.classList.remove('hidden');

    if (lesson.type === 'hanja') {
        badge.className = 'root-badge hanja';
        badge.innerText = 'Hanja Root';
        title.innerText = `${lesson.hanja} — ${lesson.meaning}`;

        const familyHtml = lesson.family && lesson.family.length > 0 
            ? `<div class="root-related-tags">${lesson.family.map(f => `<span class="root-tag-pill">\${f}</span>`).join('')}</div>`
            : '';

        body.innerHTML = `
            <div><span class="root-character">${lesson.hanja}</span> <strong>${lesson.meaning}</strong></div>
            <p style="margin: 6px 0;">${lesson.explanation}</p>
            ${familyHtml}
        `;
    } else {
        badge.className = 'root-badge loanword';
        badge.innerText = 'Loanword';
        title.innerText = lesson.source;

        const familyHtml = lesson.family && lesson.family.length > 0 
            ? `<div class="root-related-tags">${lesson.family.map(f => `<span class="root-tag-pill">\${f}</span>`).join('')}</div>`
            : '';

        body.innerHTML = `
            <div><strong>${lesson.source}</strong></div>
            <p style="margin: 6px 0;">${lesson.explanation}</p>
            ${familyHtml}
        `;
    }
}

// --- DIRECTION STATE ---
let learningDirection = localStorage.getItem('koreanLearningDirection') || 'kr-to-en'; // 'kr-to-en' or 'en-to-kr'

function toggleDirection() {
    learningDirection = (learningDirection === 'kr-to-en') ? 'en-to-kr' : 'kr-to-en';
    localStorage.setItem('koreanLearningDirection', learningDirection);
    updateDirectionUI();
    renderWord();
}

function updateDirectionUI() {
    const label = document.getElementById('direction-label');
    if (label) {
        label.innerText = (learningDirection === 'kr-to-en') ? 'KR → EN' : 'EN → KR';
    }

    const input = document.getElementById('user-input');
    if (input) {
        input.placeholder = (learningDirection === 'kr-to-en') 
            ? "Type meaning in English..." 
            : "Type in Hangul...";
    }
}

function resetAllStats() {
    const confirmed = confirm(
        "Are you sure you want to reset all statistics, word scores, and mastery status? This cannot be undone."
    );

    if (!confirmed) return;

    // Clear state objects
    wordStats = {};
    wordScores = {};
    masteredWords = [];

    // Clear persistent storage
    localStorage.removeItem('koreanWordStats');
    localStorage.removeItem('koreanWordScores');
    localStorage.removeItem('koreanMastered');

    // Refresh active data, UI counters, and library table
    updatePool();
    updateStats();
    renderLibrary();
    if (pool.length > 0) renderWord();

    alert("All statistics and progress have been reset.");
}

init();