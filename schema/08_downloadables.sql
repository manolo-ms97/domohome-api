-- DomoHome CRM — downloadables table
-- Stores lead capture records from domohome-next PDF download forms (B2B + B2C)
-- Requires MySQL 8.0.13+ (DEFAULT (UUID()) expression support)

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `downloadables` (
  `id`           INT UNSIGNED                NOT NULL AUTO_INCREMENT,
  `unique_id`    VARCHAR(36)                 NOT NULL DEFAULT (UUID()),
  `type`         ENUM('b2b', 'b2c')          NOT NULL COMMENT 'b2b = Distribuidor PDF, b2c = Hogar PDF',
  `name`         VARCHAR(255)                NOT NULL,
  `company`      VARCHAR(255)                DEFAULT NULL COMMENT 'Company name — B2B leads only; NULL for B2C',
  `email`        VARCHAR(255)                NOT NULL,
  `submitted_at` TIMESTAMP                   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_downloadables_unique_id` (`unique_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
