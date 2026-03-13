-- DomoHome CRM — client_special_prices table
-- Requires MySQL 8.0.13+ (DEFAULT (UUID()) expression support)
-- Depends on: clients, products

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `client_special_prices` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `unique_id`    VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  `client_id`    VARCHAR(36)   NOT NULL COMMENT 'FK → clients.unique_id',
  `product_id`   VARCHAR(36)   NOT NULL COMMENT 'FK → products.unique_id',
  `price_ex_tax` DECIMAL(12,2) NOT NULL COMMENT 'Negotiated price without tax',
  `notes`        TEXT          DEFAULT NULL COMMENT 'Reason or context for the negotiated price',
  `valid_until`  DATE          DEFAULT NULL COMMENT 'Expiry date for this special price; NULL = no expiry',
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_csp_unique_id` (`unique_id`),
  UNIQUE KEY `uq_csp_client_product` (`client_id`, `product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
