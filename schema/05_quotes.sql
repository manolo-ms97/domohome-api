-- DomoHome CRM — quotes table
-- Requires MySQL 8.0.13+ (DEFAULT (UUID()) expression support)
-- Depends on: clients
-- status ACCEPTED acts as an order (no separate orders table needed for now)
-- pdf_filename points to a file in quotes_pdfs/ served as static content

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `quotes` (
  `id`                        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `unique_id`                 VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  `quote_number`              VARCHAR(20)   NOT NULL COMMENT 'e.g. S00001',
  `client_id`                 VARCHAR(36)   DEFAULT NULL COMMENT 'FK → clients.unique_id; NULL if client deleted',
  `client_name_snapshot`      VARCHAR(255)  DEFAULT NULL,
  `client_tax_id_snapshot`    VARCHAR(20)   DEFAULT NULL COMMENT 'RFC — Mexican business tax ID',
  `client_address_snapshot`   TEXT          DEFAULT NULL,
  `client_email_snapshot`     VARCHAR(255)  DEFAULT NULL,
  `client_phone_snapshot`     VARCHAR(30)   DEFAULT NULL,
  `date`                      DATE          NOT NULL,
  `expiry_date`               DATE          DEFAULT NULL COMMENT '30 days after date',
  `subtotal`                  DECIMAL(12,2) NOT NULL COMMENT 'Before tax',
  `tax_rate`                  DECIMAL(5,4)  NOT NULL DEFAULT 0.1600 COMMENT 'Rate at time of quote',
  `tax_amount`                DECIMAL(12,2) NOT NULL,
  `total`                     DECIMAL(12,2) NOT NULL COMMENT 'subtotal + tax_amount',
  `status`                    ENUM('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED') NOT NULL DEFAULT 'DRAFT',
  `pdf_filename`              VARCHAR(255)  DEFAULT NULL COMMENT 'Filename inside quotes_pdfs/',
  `created_at`                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_quotes_unique_id` (`unique_id`),
  UNIQUE KEY `uq_quotes_number` (`quote_number`),
  KEY `idx_quotes_client_id` (`client_id`),
  KEY `idx_quotes_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
