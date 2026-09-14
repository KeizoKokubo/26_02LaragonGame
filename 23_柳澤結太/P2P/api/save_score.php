<?php
// api/save_score.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/db.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
    exit;
}

$sessionId  = isset($data['session_id'])   ? intval($data['session_id'])   : 0;
$playerName = isset($data['player_name'])  ? trim($data['player_name'])     : '名無しの防衛士';
$score      = isset($data['score'])        ? intval($data['score'])         : 0;
$waveReached= isset($data['wave_reached']) ? intval($data['wave_reached'])  : 0;
$towersUsed = isset($data['towers_used'])  ? intval($data['towers_used'])   : 0;
$isPlaying  = isset($data['is_playing'])   ? intval($data['is_playing'])    : 1;

if ($playerName === '') {
    $playerName = '名無しの防衛士';
}

try {
    if ($sessionId > 0) {
        // 既存レコードをリアルタイム更新（last_active でプレイ中を示す）
        $stmt = $pdo->prepare(
            "UPDATE rankings SET score=:score, wave_reached=:wave, towers_used=:towers,
             player_name=:pname, is_playing=:playing, last_active=NOW()
             WHERE id=:id"
        );
        $stmt->execute([
            ':score'   => $score,
            ':wave'    => $waveReached,
            ':towers'  => $towersUsed,
            ':pname'   => $playerName,
            ':playing' => $isPlaying,
            ':id'      => $sessionId
        ]);
        echo json_encode(['status' => 'success', 'session_id' => $sessionId, 'action' => 'updated']);
    } else {
        // 新規登録（ゲーム開始時）
        $stmt = $pdo->prepare(
            "INSERT INTO rankings (player_name, score, wave_reached, towers_used, is_playing, last_active)
             VALUES (:pname, :score, :wave, :towers, 1, NOW())"
        );
        $stmt->execute([
            ':pname'  => $playerName,
            ':score'  => $score,
            ':wave'   => $waveReached,
            ':towers' => $towersUsed
        ]);
        $newId = (int)$pdo->lastInsertId();
        echo json_encode(['status' => 'success', 'session_id' => $newId, 'action' => 'inserted']);
    }
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}