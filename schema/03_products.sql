-- DomoHome CRM — products table
-- Requires MySQL 8.0.13+ (DEFAULT (UUID()) expression support)

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `products` (
  `id`           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `unique_id`    VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  `brand`        VARCHAR(255)    DEFAULT NULL  COMMENT 'Brand / supplier company',
  `code`         VARCHAR(100)    DEFAULT NULL  COMMENT 'Product code (SKU equivalent)',
  `description`  TEXT            DEFAULT NULL,
  `category`     VARCHAR(100)    DEFAULT NULL  COMMENT 'e.g. Sensors, Cameras',
  `type`         VARCHAR(100)    DEFAULT NULL  COMMENT 'Sub-type within category',
  `barcode`      VARCHAR(100)    DEFAULT NULL  COMMENT 'EAN / UPC barcode',
  `price_ex_tax` DECIMAL(12,2)   NOT NULL      COMMENT 'List price without tax (MXN)',
  `unit`         VARCHAR(50)     NOT NULL DEFAULT 'piece',
  `stock`        INT UNSIGNED    NOT NULL DEFAULT 0,
  `image_filename` VARCHAR(255)  DEFAULT NULL  COMMENT 'Filename inside products_images/',
  `status`       ENUM('PUBLISHED','DRAFT') NOT NULL DEFAULT 'PUBLISHED',
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_unique_id` (`unique_id`),
  UNIQUE KEY `uq_products_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
