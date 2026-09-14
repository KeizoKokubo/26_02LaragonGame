<?php
// api/get_ranking.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

require_once __DIR__ . '/db.php';

try {
    // last_active が 10 秒以内なら "今プレイ中" とみなす
    $stmt = $pdo->query(
        "SELECT id, player_name, score, wave_reached, towers_used,
                (is_playing = 1 AND last_active >= NOW() - INTERVAL 10 SECOND) AS currently_playing
         FROM rankings
         ORDER BY score DESC, wave_reached DESC, towers_used ASC
         LIMIT 10"
    );
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        $r['currently_playing'] = (bool)$r['currently_playing'];
    }

    echo json_encode(['status' => 'success', 'rankings' => $rows]);
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}