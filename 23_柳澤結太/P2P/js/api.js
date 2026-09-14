// js/api.js
const API_BASE = 'api';

async function safeParseJson(response) {
    let text = await response.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return JSON.parse(text.trim());
}

async function fetchRankings() {
    try {
        const res = await fetch(`${API_BASE}/get_ranking.php?t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await safeParseJson(res);
        if (data.status === 'success') return data.rankings;
        return getLocalRankings();
    } catch (e) {
        return getLocalRankings();
    }
}

// sessionId=0 => 新規INSERT、それ以外 => UPDATE
// isPlaying=0 を渡すとゲーム終了としてマーク
async function syncScoreToDB(sessionId, playerName, score, waveReached, towersUsed, isPlaying = 1) {
    const payload = {
        session_id:   sessionId,
        player_name:  playerName,
        score:        score,
        wave_reached: waveReached,
        towers_used:  towersUsed,
        is_playing:   isPlaying
    };
    try {
        const res = await fetch(`${API_BASE}/save_score.php`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await safeParseJson(res);
    } catch (e) {
        return { status: 'fallback', session_id: sessionId };
    }
}

function getLocalRankings() {
    const defaults = [
        { id:1, player_name:'🛡️ エルフの長老',     score:14200, wave_reached:12, towers_used:4, currently_playing:false },
        { id:2, player_name:'🏹 疾風のレンジャー',  score:10800, wave_reached:9,  towers_used:3, currently_playing:false },
        { id:3, player_name:'🧙‍♂️ 大魔導士',        score:8500,  wave_reached:7,  towers_used:3, currently_playing:false },
        { id:4, player_name:'🌲 森の守護精霊',      score:6800,  wave_reached:6,  towers_used:2, currently_playing:false },
        { id:5, player_name:'🍃 木漏れ日の狩人',    score:5400,  wave_reached:5,  towers_used:2, currently_playing:false }
    ];
    try {
        const raw = localStorage.getItem('local_rankings');
        return raw ? JSON.parse(raw) : defaults;
    } catch (e) {
        return defaults;
    }
}