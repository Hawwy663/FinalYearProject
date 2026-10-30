-- 1. 建立並切換到資料庫
CREATE DATABASE IF NOT EXISTS `fyp_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `fyp_db`;

-- --------------------------------------------------------

-- 2. 建立「巡查紀錄表」
CREATE TABLE `巡查紀錄表` (
  `巡查ID` varchar(50) NOT NULL,
  `樓層` varchar(20) NOT NULL,
  `照片` varchar(255) NOT NULL,
  `AI是否發現雜物` enum('TRUE','FALSE') NOT NULL,
  `狀態` varchar(20) NOT NULL,
  `時間` datetime NOT NULL,
  PRIMARY KEY (`巡查ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 寫入「巡查紀錄表」假資料
INSERT INTO `巡查紀錄表` (`巡查ID`, `樓層`, `照片`, `AI是否發現雜物`, `狀態`, `時間`) VALUES
('1F_20261018', '1樓', 'https://picsum.photos/400/300?random=1', 'TRUE', '待處理', '2026-10-18 10:00:00'),
('2F_20261018', '2樓', 'https://picsum.photos/400/300?random=2', 'FALSE', 'N/A', '2026-10-18 10:05:00'),
('3F_20261018', '3樓', 'https://picsum.photos/400/300?random=3', 'TRUE', '已結案', '2026-10-18 10:10:00');

-- --------------------------------------------------------

-- 3. 建立「通知紀錄表」
CREATE TABLE `通知紀錄表` (
  `通知ID` varchar(50) NOT NULL,
  `巡查ID` varchar(50) NOT NULL,
  `樓層` varchar(20) NOT NULL,
  `清理限期` date NOT NULL,
  `通知列印` enum('TRUE','FALSE') NOT NULL,
  PRIMARY KEY (`通知ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 寫入「通知紀錄表」假資料（已修正 0000-00-00 的問題）
INSERT INTO `通知紀錄表` (`通知ID`, `巡查ID`, `樓層`, `清理限期`, `通知列印`) VALUES
('NOTIF_001', '1F_20261018', '1樓', '2026-10-25', 'TRUE'),
('NOTIF_002', '3F_20261018', '3樓', '2026-10-25', 'TRUE');