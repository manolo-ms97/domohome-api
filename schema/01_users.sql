-- DomoHome CRM — users table
-- Requires MySQL 8.0.13+ (DEFAULT (UUID()) expression support)

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `users` (
  `id`                       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `unique_id`                VARCHAR(36)   NOT NULL DEFAULT (UUID())  COMMENT 'UUID — used as JWT sub',
  `name`                     VARCHAR(255)  NOT NULL,
  `username`                 VARCHAR(50)   NOT NULL                   COMMENT 'Login handle — lowercase, no spaces',
  `email`                    VARCHAR(255)  NOT NULL,
  `password_hash`            VARCHAR(255)  NOT NULL                   COMMENT 'bcrypt hash',
  `role`                     ENUM('admin','sales') NOT NULL DEFAULT 'sales',
  `is_active`                TINYINT(1)    NOT NULL DEFAULT 1,
  `refresh_token_hash`       VARCHAR(255)  DEFAULT NULL               COMMENT 'SHA-256 of current refresh token; NULL = logged out',
  `refresh_token_expires_at` DATETIME      DEFAULT NULL,
  `last_login`               DATETIME      DEFAULT NULL,
  `created_at`               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_unique_id` (`unique_id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_refresh_token_hash` (`refresh_token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
