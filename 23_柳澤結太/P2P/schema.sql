-- データベース作成
CREATE DATABASE IF NOT EXISTS `tower_defense_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `tower_defense_db`;

-- ランキングテーブル作成
CREATE TABLE IF NOT EXISTS `rankings` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `player_name` VARCHAR(50) NOT NULL,
    `score` INT NOT NULL,
    `wave_reached` INT NOT NULL,
    `towers_used` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_score` (`score` DESC, `wave_reached` DESC, `towers_used` ASC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- サンプル初期データ
INSERT INTO `rankings` (`player_name`, `score`, `wave_reached`, `towers_used`, `created_at`) VALUES
('Commander Alpha', 12500, 15, 6, NOW()),
('Tactical Master', 9800, 12, 4, NOW()),
('Tower Specialist', 7400, 10, 5, NOW()),
('Iron Wall', 5200, 8, 4, NOW()),
('Novice Defender', 2100, 4, 3, NOW());
