-- DomoHome CRM — quote_items table
-- Requires MySQL 8.0.13+ (DEFAULT (UUID()) expression support)
-- Depends on: quotes (CASCADE DELETE), products

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `quote_items` (
  `id`                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `unique_id`             VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  `quote_id`              INT UNSIGNED  NOT NULL COMMENT 'FK → quotes.id',
  `product_id`            VARCHAR(36)   DEFAULT NULL COMMENT 'FK → products.unique_id; NULL if product deleted',
  `product_name_snapshot` VARCHAR(255)  NOT NULL COMMENT 'Name at time of quote',
  `unit_price`            DECIMAL(12,2) NOT NULL COMMENT 'Price applied (list or special), without tax',
  `quantity`              INT UNSIGNED  NOT NULL DEFAULT 1,
  `price_list`            TINYINT(1)    NOT NULL DEFAULT 1    COMMENT '1 = list price used; 0 = client special price used',
  `line_subtotal`         DECIMAL(12,2) NOT NULL COMMENT 'unit_price × quantity',
  `line_tax`              DECIMAL(12,2) NOT NULL COMMENT 'line_subtotal × tax_rate',
  `line_total`            DECIMAL(12,2) NOT NULL COMMENT 'line_subtotal + line_tax',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_quote_items_unique_id` (`unique_id`),
  KEY `idx_quote_items_quote_id` (`quote_id`),
  CONSTRAINT `fk_quote_items_quote`
    FOREIGN KEY (`quote_id`) REFERENCES `quotes` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
