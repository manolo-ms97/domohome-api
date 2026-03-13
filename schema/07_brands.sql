-- DomoHome CRM — brands table
-- Requires MySQL 8.0.13+ (DEFAULT (UUID()) expression support)

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `brands` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unique_id`  VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  `brand_name` VARCHAR(255) NOT NULL,
  `is_active`  TINYINT      NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_brands_unique_id` (`unique_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
