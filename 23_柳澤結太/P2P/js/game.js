// js/game.js
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 40;
const COLS = 20; // 800px
const ROWS = 14; // 560px
canvas.width = COLS * TILE_SIZE;
canvas.height = ROWS * TILE_SIZE;

// ゲーム状態
let savedName = localStorage.getItem('last_player_name') || '森の防衛士';
let currentPlayerName = savedName;
let gold = 300;
let lives = 20;
let currentWave = 0;
let totalTowersBuilt = 0;
let defeatedEnemies = 0;
let baseScore = 0;
let calculatedScore = 0;
let efficiencyMultiplier = 1.0;
let currentSessionId = 0; // データベース上の現在セッションレコードID

let isWaveActive = false;
let isGameOver = false;
let isGameRunning = false;
let selectedTowerType = null;
let selectedPlacedTower = null;

// プレイヤースキル「天罰の落雷 (プレイヤー直接迎撃)」
let lightningCooldown = 0;
const MAX_LIGHTNING_COOLDOWN = 900; // 15秒クールダウン
let activeLightnings = []; // 落雷エフェクト描画用

// ホバーフォーカス座標
let hoveredGridX = -1;
let hoveredGridY = -1;
let mouseCanvasX = -1;
let mouseCanvasY = -1;

let enemies = [];
let towers = [];
let projectiles = [];
let particles = [];
let spawnQueue = [];
let spawnTimer = 0;

// 画面要素
const titleScreen = document.getElementById('titleScreen');
const gamePlayScreen = document.getElementById('gamePlayScreen');
const resultScreen = document.getElementById('resultScreen');
const guideModal = document.getElementById('guideModal');

function showScreen(screen) {
    titleScreen.classList.add('hidden');
    gamePlayScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// 侵入パス
const gridPath = [
    { x: 0, y: 3 },
    { x: 5, y: 3 },
    { x: 5, y: 10 },
    { x: 11, y: 10 },
    { x: 11, y: 4 },
    { x: 16, y: 4 },
    { x: 16, y: 11 },
    { x: 19, y: 11 }
];

const pixelPath = gridPath.map(pt => ({
    x: pt.x * TILE_SIZE + TILE_SIZE / 2,
    y: pt.y * TILE_SIZE + TILE_SIZE / 2
}));

const pathMatrix = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
function initPathMatrix() {
    for (let i = 0; i < gridPath.length - 1; i++) {
        let p1 = gridPath[i];
        let p2 = gridPath[i + 1];
        let minX = Math.min(p1.x, p2.x);
        let maxX = Math.max(p1.x, p2.x);
        let minY = Math.min(p1.y, p2.y);
        let maxY = Math.max(p1.y, p2.y);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                pathMatrix[y][x] = true;
            }
        }
    }
}
initPathMatrix();

// 戦略的タワー設置専用スポット（16箇所）
const buildSpots = [
    { x: 2, y: 2 },
    { x: 4, y: 1 },
    { x: 6, y: 2 },
    { x: 4, y: 5 },
    { x: 6, y: 5 },
    { x: 4, y: 8 },
    { x: 6, y: 8 },
    { x: 8, y: 9 },
    { x: 10, y: 8 },
    { x: 12, y: 6 },
    { x: 10, y: 3 },
    { x: 12, y: 2 },
    { x: 15, y: 2 },
    { x: 17, y: 6 },
    { x: 15, y: 9 },
    { x: 17, y: 9 }
];

function isBuildSpot(gx, gy) {
    return buildSpots.some(s => s.x === gx && s.y === gy);
}

// スコア計算 & 自動ランキング同期
function updateScore() {
    const expectedTowers = Math.max(1, currentWave * 1.5);
    const savedRatio = Math.max(0, (expectedTowers - towers.length) / (expectedTowers + 1));
    efficiencyMultiplier = 1.0 + savedRatio * 1.5;

    calculatedScore = Math.round((baseScore + currentWave * 250) * efficiencyMultiplier);

    const uiScore = document.getElementById('uiScore');
    const uiMult = document.getElementById('uiMultiplier');
    const uiTowers = document.getElementById('uiTowersUsed');

    if (uiScore) uiScore.innerText = calculatedScore.toLocaleString();
    if (uiMult) uiMult.innerText = `${efficiencyMultiplier.toFixed(2)}x`;
    if (uiTowers) uiTowers.innerText = `${towers.length} / ${buildSpots.length}`;
}

function updateUI() {
    const elGold = document.getElementById('uiGold');
    const elLives = document.getElementById('uiLives');
    const elWave = document.getElementById('uiWave');
    if (elGold) elGold.innerText = gold;
    if (elLives) elLives.innerText = lives;
    if (elWave) elWave.innerText = currentWave;
    updateScore();
    updateSkillUI();
}

// スキルUI（天罰の落雷）の更新
function updateSkillUI() {
    const btnSkill = document.getElementById('btnPlayerSkill');
    const skillProgress = document.getElementById('skillCooldownProgress');
    const skillStatusText = document.getElementById('skillStatusText');
    if (!btnSkill) return;

    if (lightningCooldown <= 0) {
        btnSkill.disabled = false;
        btnSkill.classList.add('ready');
        if (skillStatusText) skillStatusText.innerText = '⚡ READY (クリックで発動)';
        if (skillProgress) skillProgress.style.width = '100%';
    } else {
        btnSkill.disabled = true;
        btnSkill.classList.remove('ready');
        const remainSec = (lightningCooldown / 60).toFixed(1);
        if (skillStatusText) skillStatusText.innerText = `⏳ 充電中 (${remainSec}s)`;
        if (skillProgress) {
            const percent = ((MAX_LIGHTNING_COOLDOWN - lightningCooldown) / MAX_LIGHTNING_COOLDOWN) * 100;
            skillProgress.style.width = `${percent}%`;
        }
    }
}

// ゲーム開始
async function startNewGame() {
    sound.init();
    const nameInput = document.getElementById('titlePlayerName');
    if (nameInput && nameInput.value.trim()) {
        currentPlayerName = nameInput.value.trim(); localStorage.setItem('last_player_name', currentPlayerName);
    } else if (!currentPlayerName || currentPlayerName === 'あなた (挑戦中)') {
        currentPlayerName = '森の防衛士';
    }
    // タイトル入力欄にも現在のプレイヤー名を同期保持
    if (nameInput) {
        nameInput.value = currentPlayerName;
    }

    gold = 300;
    lives = 20;
    currentWave = 0;
    totalTowersBuilt = 0;
    defeatedEnemies = 0;
    baseScore = 0;
    calculatedScore = 0;
    efficiencyMultiplier = 1.0;
    isWaveActive = false;
    isGameOver = false;
    isGameRunning = true;
    lightningCooldown = 0;
    activeLightnings = [];

    selectedTowerType = null;
    selectedPlacedTower = null;
    hoveredGridX = -1;
    hoveredGridY = -1;
    updateBuildSelectionUI();

    enemies = [];
    towers = [];
    projectiles = [];
    particles = [];
    spawnQueue = [];

    document.getElementById('btnStartWave').disabled = false;
    document.getElementById('waveStatusBadge').innerText = '待機中';
    document.getElementById('waveStatusBadge').className = 'status-badge idle';

    updateUI();
    updateTowerActionPanel();
    
    const res = await syncScoreToDB(0, currentPlayerName, 0, 0, 0);
if (res && res.session_id) {
    currentSessionId = res.session_id;
}
    await refreshRankingUI();

    showScreen(gamePlayScreen);
}

// Wave開始
function startNextWave() {
    if (isWaveActive || isGameOver) return;
    sound.init();

    currentWave++;
    isWaveActive = true;
    sound.playWaveStart();

    document.getElementById('btnStartWave').disabled = true;
    document.getElementById('waveStatusBadge').innerText = `Wave ${currentWave} 進行中`;
    document.getElementById('waveStatusBadge').className = 'status-badge active';

    spawnQueue = [];
    const enemyCount = 8 + currentWave * 4;

    for (let i = 0; i < enemyCount; i++) {
        let type = 'normal';
        if (currentWave >= 3 && i % 4 === 0) type = 'fast';
        if (currentWave >= 5 && i % 6 === 0) type = 'tank';
        if (currentWave % 5 === 0 && i === enemyCount - 1) type = 'boss';

        spawnQueue.push(type);
    }
    spawnTimer = 0;
}

// 敵スポーン
function handleSpawning() {
    if (spawnQueue.length === 0) return;

    spawnTimer++;
    if (spawnTimer >= 35) {
        const nextType = spawnQueue.shift();
        enemies.push(new Enemy(currentWave, pixelPath, nextType));
        spawnTimer = 0;
    }
}

// 建設モード選択/解除のUI更新
function updateBuildSelectionUI() {
    document.querySelectorAll('.tower-select-btn').forEach(b => {
        if (selectedTowerType && b.dataset.tower === selectedTowerType) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    const statusHint = document.getElementById('buildModeHint');
    if (statusHint) {
        if (selectedTowerType) {
            const tName = selectedTowerType === 'gatling' ? 'エルフ弓' : selectedTowerType === 'cannon' ? '投石機' : 'ルーン魔術';
            statusHint.innerHTML = `<span class="hint-active">🛠️ [${tName}] 選択中 ➔ <strong>指定の空地(土台)をクリックで設置！</strong></span>`;
        } else {
            statusHint.innerHTML = `<span class="hint-idle">ℹ️ タワーを選んで土台に設置、または<strong>敵を直接クリックして防衛支援！</strong></span>`;
        }
    }
}

// プレイヤーによる直接迎撃（敵クリック迎撃 ＆ 落雷発動）
function triggerPlayerLightning(targetX, targetY) {
    if (lightningCooldown > 0) return false;
    sound.init();

    lightningCooldown = MAX_LIGHTNING_COOLDOWN;
    sound.playThunder();

    const blastRadius = 75;
    const lightningDmg = 90 + currentWave * 25;

    activeLightnings.push({
        x: targetX,
        y: targetY,
        life: 18,
        maxLife: 18,
        radius: blastRadius
    });

    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - targetX, enemy.y - targetY);
        if (dist <= blastRadius) {
            for (let i = 0; i < 10; i++) {
                particles.push(new Particle(enemy.x, enemy.y, '#facc15', 5, 4, 25));
            }
            enemy.takeDamage(lightningDmg, particles);
        }
    });

    updateUI();
    return true;
}

// プレイヤーの直接クリック攻撃（通常タップ攻撃：クールダウンなし小ダメージ）
function triggerPlayerDirectTap(targetX, targetY) {
    let hitEnemy = null;
    let minDist = 24;

    for (const enemy of enemies) {
        const dist = Math.hypot(enemy.x - targetX, enemy.y - targetY);
        if (dist < minDist) {
            minDist = dist;
            hitEnemy = enemy;
        }
    }

    if (hitEnemy) {
        sound.init();
        sound.playHit(false);
        const tapDmg = 8 + currentWave * 2;
        for (let i = 0; i < 5; i++) {
            particles.push(new Particle(targetX, targetY, '#38bdf8', 3, 2, 12));
        }
        hitEnemy.takeDamage(tapDmg, particles);
        return true;
    }
    return false;
}

// クリック時のタワー選択・建設・直接防衛処理
function handleCanvasClick(gridX, gridY, clickX, clickY) {
    if (gridX < 0 || gridX >= COLS || gridY < 0 || gridY >= ROWS) return;

    const hitDirect = triggerPlayerDirectTap(clickX, clickY);
    if (hitDirect && !selectedTowerType) {
        return;
    }

    const existing = towers.find(t => t.gridX === gridX && t.gridY === gridY);
    if (existing) {
        if (selectedPlacedTower === existing) {
            selectedPlacedTower = null;
        } else {
            selectedPlacedTower = existing;
        }
        updateTowerActionPanel();
        return;
    }

    if (selectedPlacedTower) {
        selectedPlacedTower = null;
        updateTowerActionPanel();
        return;
    }

    if (!isBuildSpot(gridX, gridY)) return;

    if (selectedTowerType) {
        let cost = 100;
        if (selectedTowerType === 'cannon') cost = 160;
        if (selectedTowerType === 'laser') cost = 220;

        if (gold >= cost) {
            sound.init();
            gold -= cost;
            const newTower = new Tower(gridX, gridY, TILE_SIZE, selectedTowerType);
            towers.push(newTower);
            totalTowersBuilt++;
            selectedPlacedTower = newTower;
            sound.playBuild();
            updateUI();
            updateTowerActionPanel();
        }
    }
}

// タワー詳細パネル
function updateTowerActionPanel() {
    const panel = document.getElementById('towerDetailPanel');

    if (!selectedPlacedTower) {
        if (selectedTowerType) {
            const previewStats = Tower.calculateStats(selectedTowerType, 1);
            panel.innerHTML = `
                <div class="selected-tower-info">
                    <h4>🏹 ${previewStats.name} (Lv.1)</h4>
                    <div class="form-desc">${previewStats.formDesc}</div>
                    <div class="stat-row"><span>威力:</span> <strong>${previewStats.damage}</strong></div>
                    <div class="stat-row"><span>射程:</span> <strong>${previewStats.range} px</strong></div>
                    <div class="stat-row"><span>連射:</span> <strong>${(60 / previewStats.fireRate).toFixed(1)} 発/秒</strong></div>
                    <div class="evolve-hint">※Lv.3で第2進化、Lv.9で★第3進化へ覚醒</div>
                </div>
            `;
        } else {
            panel.innerHTML = '<p class="placeholder-text">タワーを選択すると強化・進化・売却ができます<br><small>※マップ上の敵をクリックして直接迎撃も可能！</small></p>';
        }
        return;
    }

    const t = selectedPlacedTower;
    const upCost = t.getUpgradeCost();
    const refund = Math.round(t.cost * 0.7 * t.level);

    const nextStats = Tower.calculateStats(t.baseType, t.level + 1);

    let nextStageInfo = '';
    let btnText = `強化 (🪙${upCost})`;
    let btnClass = 'action-btn upgrade-btn';

    if (t.stage === 1) {
        const remaining = 3 - t.level;
        if (remaining === 1) {
            nextStageInfo = `<div class="evolve-hint">✨ <strong>次のレベルで【第2進化】へ進化！</strong></div>`;
            btnText = `進化 (🪙${upCost})`;
            btnClass = 'action-btn upgrade-btn evolve-action-btn';
        } else {
            nextStageInfo = `<div class="evolve-hint">あと <strong>${remaining} 回強化</strong> (Lv.3) で <strong>第2進化</strong></div>`;
        }
    } else if (t.stage === 2) {
        const remaining = 9 - t.level;
        if (remaining === 1) {
            nextStageInfo = `<div class="evolve-hint">🔥 <strong>次のレベルで【★最終第3進化】へ覚醒！</strong></div>`;
            btnText = `進化 (🪙${upCost})`;
            btnClass = 'action-btn upgrade-btn evolve-action-btn';
        } else {
            nextStageInfo = `<div class="evolve-hint">あと <strong>${remaining} 回強化</strong> (Lv.9) で <strong>★最終第3進化</strong></div>`;
        }
    } else {
        nextStageInfo = `<div class="evolved-badge">★最終第3進化 (覚醒完了)</div>`;
    }

    panel.innerHTML = `
        <div class="selected-tower-info ${t.stage === 3 ? 'evolved-glow' : ''}">
            <h4>${t.name} (Lv.${t.level})</h4>
            <div class="form-desc">${t.formDesc}</div>
            
            <div class="stat-row">
                <span>威力:</span>
                <div class="stat-val-group">
                    <strong>${Math.round(t.damage)}</strong>
                    <span class="stat-diff-arrow">➔</span>
                    <span class="stat-next-val">${Math.round(nextStats.damage)}</span>
                </div>
            </div>
            
            <div class="stat-row">
                <span>射程:</span>
                <div class="stat-val-group">
                    <strong>${t.range}</strong>
                    <span class="stat-diff-arrow">➔</span>
                    <span class="stat-next-val">${nextStats.range}</span>
                </div>
            </div>
            
            <div class="stat-row">
                <span>連射:</span>
                <div class="stat-val-group">
                    <strong>${(60 / t.fireRate).toFixed(1)}/s</strong>
                    <span class="stat-diff-arrow">➔</span>
                    <span class="stat-next-val">${(60 / nextStats.fireRate).toFixed(1)}/s</span>
                </div>
            </div>
            
            ${nextStageInfo}

            <div class="tower-btns">
                <button id="btnUpgradeTower" class="${btnClass}" ${gold < upCost ? 'disabled' : ''}>
                    ${btnText}
                </button>
                <button id="btnSellTower" class="action-btn sell-btn">
                    売却 (+🪙${refund})
                </button>
                <button id="btnDeselectTower" class="action-btn deselect-btn">
                    選択解除
                </button>
            </div>
        </div>
    `;

    const upBtn = document.getElementById('btnUpgradeTower');
    if (upBtn) upBtn.addEventListener('click', upgradeSelectedTower);

    const sellBtn = document.getElementById('btnSellTower');
    if (sellBtn) sellBtn.addEventListener('click', sellSelectedTower);

    const deselectBtn = document.getElementById('btnDeselectTower');
    if (deselectBtn) deselectBtn.addEventListener('click', () => {
        selectedPlacedTower = null;
        updateTowerActionPanel();
    });
}

window.upgradeSelectedTower = function() {
    if (!selectedPlacedTower) return;
    const cost = selectedPlacedTower.getUpgradeCost();
    if (gold >= cost) {
        gold -= cost;
        const evolved = selectedPlacedTower.upgrade();
        if (evolved) {
            sound.playEvolve();
        } else {
            sound.playBuild();
        }
        updateUI();
        updateTowerActionPanel();
    }
};

window.sellSelectedTower = function() {
    if (!selectedPlacedTower) return;
    const refund = Math.round(selectedPlacedTower.cost * 0.7 * selectedPlacedTower.level);
    gold += refund;
    towers = towers.filter(t => t !== selectedPlacedTower);
    selectedPlacedTower = null;
    sound.playBuild();
    updateUI();
    updateTowerActionPanel();
};

// リザルト画面へ遷移
async function goToResultScreen(reason = 'gameover') {
    isGameOver = true;
    isGameRunning = false;
    updateScore();

    // is_playing=0 でゲーム終了をDBに通知
    await syncScoreToDB(currentSessionId, currentPlayerName, calculatedScore, currentWave, towers.length, 0);
    refreshRankingUI();

    const titleEl = document.getElementById('resultTitle');
    const subtitleEl = document.getElementById('resultSubtitle');

    if (reason === 'quit') {
        titleEl.innerText = 'MISSION COMPLETED (戦略的リタイア)';
        titleEl.className = 'result-title retired';
        subtitleEl.innerText = '司令官の判断により防衛任務を早期完了しました。';
    } else {
        titleEl.innerText = 'GAME OVER';
        titleEl.className = 'result-title gameover';
        subtitleEl.innerText = '防衛ラインが突破されました。';
    }

    document.getElementById('resPlayerNameDisplay').innerText = currentPlayerName;
    document.getElementById('resWave').innerText = `Wave ${currentWave}`;
    document.getElementById('resTowers').innerText = `${towers.length} 台`;
    document.getElementById('resEnemies').innerText = `${defeatedEnemies} 体`;
    document.getElementById('resMultiplier').innerText = `${efficiencyMultiplier.toFixed(2)}x`;

    showScreen(resultScreen);

    animateCountUp('resFinalScore', 0, calculatedScore, 1400, () => {
        sound.playEvolve();
    });
}

function animateCountUp(elementId, start, end, duration, onComplete) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const startTime = performance.now();

    function updateCount(now) {
        const progress = Math.min(1, (now - startTime) / duration);
        const ease = 1 - (1 - progress) * (1 - progress);
        const current = Math.round(start + (end - start) * ease);
        el.innerText = `${current.toLocaleString()} pts`;

        if (progress < 1) {
            requestAnimationFrame(updateCount);
        } else {
            if (onComplete) onComplete();
        }
    }
    requestAnimationFrame(updateCount);
}

// 描画
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#e8e0d3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(139, 90, 43, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.save();
    ctx.strokeStyle = '#d1c5b0';
    ctx.lineWidth = TILE_SIZE - 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pixelPath[0].x, pixelPath[0].y);
    for (let i = 1; i < pixelPath.length; i++) {
        ctx.lineTo(pixelPath[i].x, pixelPath[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(72, 124, 83, 0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    for (const spot of buildSpots) {
        const sx = spot.x * TILE_SIZE;
        const sy = spot.y * TILE_SIZE;
        const hasTower = towers.some(t => t.gridX === spot.x && t.gridY === spot.y);

        ctx.save();
        if (!hasTower) {
            ctx.fillStyle = '#dbd1c1';
            ctx.beginPath();
            ctx.roundRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6, 8);
            ctx.fill();

            ctx.strokeStyle = '#baa993';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.strokeStyle = 'rgba(139, 90, 43, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 10, sy + 10, TILE_SIZE - 20, TILE_SIZE - 20);

            if (selectedTowerType) {
                ctx.fillStyle = 'rgba(72, 124, 83, 0.15)';
                ctx.beginPath();
                ctx.roundRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6, 8);
                ctx.fill();
                ctx.strokeStyle = '#487c53';
                ctx.lineWidth = 2;
                ctx.setLineDash([3, 3]);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    if (hoveredGridX >= 0 && hoveredGridX < COLS && hoveredGridY >= 0 && hoveredGridY < ROWS) {
        const isSpot = isBuildSpot(hoveredGridX, hoveredGridY);
        const isOccupied = towers.some(t => t.gridX === hoveredGridX && t.gridY === hoveredGridY);
        const canBuild = selectedTowerType && isSpot && !isOccupied;

        ctx.save();
        const fx = hoveredGridX * TILE_SIZE;
        const fy = hoveredGridY * TILE_SIZE;

        if (canBuild) {
            ctx.fillStyle = 'rgba(72, 124, 83, 0.28)';
            ctx.fillRect(fx + 2, fy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.strokeStyle = '#487c53';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(fx + 2, fy + 2, TILE_SIZE - 4, TILE_SIZE - 4);

            let previewRange = 115;
            if (selectedTowerType === 'cannon') previewRange = 145;
            if (selectedTowerType === 'laser') previewRange = 200;

            ctx.beginPath();
            ctx.arc(fx + TILE_SIZE / 2, fy + TILE_SIZE / 2, previewRange, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(72, 124, 83, 0.05)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(72, 124, 83, 0.4)';
            ctx.setLineDash([4, 4]);
            ctx.stroke();

            ctx.fillStyle = '#166534';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('設置', fx + TILE_SIZE / 2, fy + TILE_SIZE / 2 + 3);
        } else if (selectedTowerType && (!isSpot || isOccupied)) {
            ctx.fillStyle = 'rgba(201, 74, 68, 0.18)';
            ctx.fillRect(fx + 2, fy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.strokeStyle = '#c94a44';
            ctx.lineWidth = 2;
            ctx.strokeRect(fx + 2, fy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (!selectedTowerType && isOccupied) {
            ctx.strokeStyle = 'rgba(139, 90, 43, 0.6)';
            ctx.lineWidth = 2;
            ctx.strokeRect(fx + 2, fy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (isSpot && !isOccupied) {
            ctx.fillStyle = 'rgba(139, 90, 43, 0.12)';
            ctx.fillRect(fx + 2, fy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.strokeStyle = 'rgba(139, 90, 43, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(fx + 2, fy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }
        ctx.restore();
    }

    for (const tower of towers) {
        tower.draw(ctx, tower === selectedPlacedTower);
    }

    for (const p of projectiles) {
        p.draw(ctx);
    }

    for (const pt of particles) {
        pt.draw(ctx);
    }

    for (const enemy of enemies) {
        enemy.draw(ctx);
    }

    for (let i = activeLightnings.length - 1; i >= 0; i--) {
        const l = activeLightnings[i];
        const alpha = l.life / l.maxLife;

        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.arc(l.x, l.y, l.radius * (1 - alpha * 0.3), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(l.x + (Math.random() - 0.5) * 20, 0);
        let curY = 0;
        let curX = l.x;
        while (curY < l.y) {
            curY += 25;
            curX += (Math.random() - 0.5) * 30;
            ctx.lineTo(curX, Math.min(curY, l.y));
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 8;
        ctx.stroke();

        ctx.restore();

        l.life--;
        if (l.life <= 0) {
            activeLightnings.splice(i, 1);
        }
    }
}

function gameLoop() {
    if (isGameRunning && !isGameOver) {
        handleSpawning();

        if (lightningCooldown > 0) {
            lightningCooldown--;
            updateSkillUI();
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            e.update();

            if (e.dead) {
                gold += e.reward;
                baseScore += e.scoreValue;
                defeatedEnemies++;
                sound.playEnemyDefeated();
                updateUI();
                if (selectedPlacedTower || selectedTowerType) {
                    updateTowerActionPanel();
                }
                enemies.splice(i, 1);
            } else if (e.reachedEnd) {
                lives--;
                sound.playDamage();
                updateUI();
                enemies.splice(i, 1);
                if (lives <= 0) {
                    goToResultScreen('gameover');
                    break;
                }
            }
        }

        for (const tower of towers) {
            tower.update(enemies, projectiles, particles);
        }

        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            p.update(enemies, particles);
            if (p.hit) {
                projectiles.splice(i, 1);
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            if (particles[i].life >= particles[i].maxLife) {
                particles.splice(i, 1);
            }
        }

        if (isWaveActive && spawnQueue.length === 0 && enemies.length === 0) {
            isWaveActive = false;
            const saveBonus = Math.max(10, Math.round((currentWave * 2 - towers.length) * 15));
            gold += 50 + saveBonus;
            baseScore += 200;
            updateUI();
            if (selectedPlacedTower || selectedTowerType) {
                updateTowerActionPanel();
            }

            document.getElementById('btnStartWave').disabled = false;
            document.getElementById('waveStatusBadge').innerText = `Wave ${currentWave} 完了! (+🪙${50 + saveBonus})`;
            document.getElementById('waveStatusBadge').className = 'status-badge cleared';
        }
    }

    draw();
    requestAnimationFrame(gameLoop);
}

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseCanvasX = e.clientX - rect.left;
    mouseCanvasY = e.clientY - rect.top;
    hoveredGridX = Math.floor(mouseCanvasX / TILE_SIZE);
    hoveredGridY = Math.floor(mouseCanvasY / TILE_SIZE);
});

canvas.addEventListener('mouseleave', () => {
    hoveredGridX = -1;
    hoveredGridY = -1;
    mouseCanvasX = -1;
    mouseCanvasY = -1;
});

canvas.addEventListener('click', (e) => {
    sound.init();
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const gridX = Math.floor(clickX / TILE_SIZE);
    const gridY = Math.floor(clickY / TILE_SIZE);

    handleCanvasClick(gridX, gridY, clickX, clickY);
});

const btnPlayerSkill = document.getElementById('btnPlayerSkill');
if (btnPlayerSkill) {
    btnPlayerSkill.addEventListener('click', () => {
        if (lightningCooldown > 0) return;
        let targetX = canvas.width / 2;
        let targetY = canvas.height / 2;

        if (enemies.length > 0) {
            const leadingEnemy = enemies.reduce((prev, curr) => (curr.currentPathIndex > prev.currentPathIndex ? curr : prev), enemies[0]);
            targetX = leadingEnemy.x;
            targetY = leadingEnemy.y;
        }

        triggerPlayerLightning(targetX, targetY);
    });
}

document.querySelectorAll('.tower-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        sound.init();
        const clickedType = btn.dataset.tower;
        if (selectedTowerType === clickedType) {
            selectedTowerType = null;
        } else {
            selectedTowerType = clickedType;
            selectedPlacedTower = null;
        }
        updateBuildSelectionUI();
        updateTowerActionPanel();
    });
});

function openGuideModal() {
    guideModal.classList.remove('hidden');
}
function closeGuideModal() {
    guideModal.classList.add('hidden');
}

const openGuideBtnTitle = document.getElementById('btnOpenGuideTitle');
if (openGuideBtnTitle) openGuideBtnTitle.addEventListener('click', openGuideModal);

const openGuideBtnHeader = document.getElementById('btnOpenGuideHeader');
if (openGuideBtnHeader) openGuideBtnHeader.addEventListener('click', openGuideModal);

const closeGuideBtn = document.getElementById('btnCloseGuideModal');
if (closeGuideBtn) closeGuideBtn.addEventListener('click', closeGuideModal);

const guideOverlay = document.getElementById('guideModal');
if (guideOverlay) {
    guideOverlay.addEventListener('click', (e) => {
        if (e.target === guideOverlay) {
            closeGuideModal();
        }
    });
}

const soundToggleBtn = document.getElementById('btnSoundToggle');
if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
        sound.init();
        const muted = sound.toggleMute();
        soundToggleBtn.innerText = muted ? '🔇 音声: OFF' : '🔊 音声: ON';
        soundToggleBtn.classList.toggle('muted', muted);
    });
}

document.getElementById('btnStartWave').addEventListener('click', startNextWave);

document.getElementById('btnQuitGame').addEventListener('click', () => {
    if (confirm('現在のスコアでゲームを終了し、リザルト画面へ進みますか？')) {
        goToResultScreen('quit');
    }
});

document.getElementById('btnStartGame').addEventListener('click', startNewGame);

document.getElementById('btnRetryGame').addEventListener('click', startNewGame);
document.getElementById('btnBackToTitle').addEventListener('click', () => {
    refreshRankingUI();
    const initNameInput = document.getElementById('titlePlayerName');
if (initNameInput && savedName) {
    initNameInput.value = savedName;
}
showScreen(titleScreen);
});

async function refreshRankingUI() {
    const titleRanking = document.getElementById('titleRankingList');
    const inGameRanking = document.getElementById('inGameRankingList');

    // プレイ中ならDBに現在のスコアをUPDATE送信（last_activeを更新して「プレイ中」をDBに伝える）
    if (isGameRunning && !isGameOver && currentSessionId > 0) {
        await syncScoreToDB(currentSessionId, currentPlayerName, calculatedScore, currentWave, towers.length, 1);
    }

    let rankings = await fetchRankings();
    if (!rankings) rankings = [];

    let html = '';
    rankings.forEach((r, idx) => {
        const isMe = (currentSessionId > 0 && r.id == currentSessionId);
        const isOtherLive = !isMe && r.currently_playing;
        const rankClass = isMe ? 'rank-current-player' : idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
        const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;

        let badge = '';
        if (isMe) {
            badge = '<span class="live-tag me-tag">あなた LIVE</span>';
        } else if (isOtherLive) {
            badge = '<span class="live-tag other-live-tag">🎮 プレイ中</span>';
        }

        html += `
            <div class="ranking-item ${rankClass} ${isOtherLive ? 'rank-other-live' : ''}">
                <div class="rank-num">${rankBadge}</div>
                <div class="rank-user">
                    <span class="user-name">${escapeHtml(r.player_name)} ${badge}</span>
                    <span class="rank-meta">Wave ${r.wave_reached} / 🗼${r.towers_used}台</span>
                </div>
                <div class="rank-score">${parseInt(r.score).toLocaleString()} <small>pts</small></div>
            </div>
        `;
    });

    if (titleRanking) titleRanking.innerHTML = html;
    if (inGameRanking) inGameRanking.innerHTML = html;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

setInterval(() => {
    refreshRankingUI();
}, 2000);

const initNameInput = document.getElementById('titlePlayerName');
if (initNameInput && savedName) {
    initNameInput.value = savedName;
}
showScreen(titleScreen);
updateBuildSelectionUI();
refreshRankingUI();
requestAnimationFrame(gameLoop);


