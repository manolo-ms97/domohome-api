-- DomoHome CRM — clients table
-- Requires MySQL 8.0.13+ (DEFAULT (UUID()) expression support)

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `clients` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `unique_id`  VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  `name`       VARCHAR(255)    NOT NULL,
  `rfc`        VARCHAR(20)     DEFAULT NULL COMMENT 'RFC — Mexican business tax ID',
  `email`      VARCHAR(255)    DEFAULT NULL,
  `phone`      VARCHAR(30)     DEFAULT NULL,
  `address`    TEXT            DEFAULT NULL,
  `source`     VARCHAR(50)     NOT NULL DEFAULT 'manual' COMMENT 'Origin: manual (CRM), b2b, b2c, etc.',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clients_unique_id` (`unique_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
