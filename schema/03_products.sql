-- DomoHome CRM — products table
-- Requires MySQL 8.0.13+ (DEFAULT (UUID()) expression support)

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `products` (
  `unique_id`      VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  `name`           VARCHAR(255)    DEFAULT NULL  COMMENT 'Short product display name',
  `brand`          VARCHAR(255)    DEFAULT NULL  COMMENT 'Brand / supplier company',
  `code`           VARCHAR(100)    DEFAULT NULL  COMMENT 'Product code (SKU equivalent)',
  `sku`            VARCHAR(100)    DEFAULT NULL  COMMENT 'Internal product ID',
  `description`    TEXT            DEFAULT NULL,
  `category`       VARCHAR(100)    DEFAULT NULL  COMMENT 'e.g. Sensors, Cameras',
  `price_list`     DECIMAL(12,2)   NOT NULL      COMMENT 'List price without tax (MXN)',
  `stock`          TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1 = in stock, 0 = out of stock',
  `image_filename` VARCHAR(255)    DEFAULT NULL  COMMENT 'Filename inside products_images/',
  `status`         ENUM('PUBLISHED','DRAFT') NOT NULL DEFAULT 'PUBLISHED',
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`unique_id`),
  UNIQUE KEY `uq_products_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
