-- DomoHome CRM — seed products from mock data
-- Safe to re-run: INSERT IGNORE skips rows whose unique_id already exists

SET NAMES utf8mb4;
SET time_zone = '+00:00';

INSERT IGNORE INTO `products`
  (`unique_id`, `code`, `description`, `category`, `price_ex_tax`, `unit`, `stock`, `status`)
VALUES
  ('prod-001', 'SEN-MOV-001', 'Sensor de Movimiento WiFi',          'Sensores',       450.00,  'pieza', 120, 'PUBLISHED'),
  ('prod-002', 'CAM-INT-001', 'Cámara Interior 360°',               'Cámaras',       1200.00,  'pieza',  85, 'PUBLISHED'),
  ('prod-003', 'SWI-3V-001',  'Switch Inteligente 3 Vías',          'Switches',        680.00,  'pieza', 200, 'PUBLISHED'),
  ('prod-004', 'HUB-ZIG-001', 'Hub Central Zigbee',                 'Hubs',           1500.00,  'pieza',  50, 'PUBLISHED'),
  ('prod-005', 'SEN-TH-001',  'Sensor de Temperatura y Humedad',    'Sensores',        380.00,  'pieza', 150, 'PUBLISHED'),
  ('prod-006', 'CER-BIO-001', 'Cerradura Digital Biométrica',       'Cerraduras',     3200.00,  'pieza',  30, 'PUBLISHED'),
  ('prod-007', 'ILU-RGB-001', 'Foco LED Inteligente RGB',           'Iluminación',     250.00,  'pieza', 300, 'PUBLISHED'),
  ('prod-008', 'CAM-EXT-001', 'Cámara Exterior 2K',                 'Cámaras',        1800.00,  'pieza',  60, 'PUBLISHED'),
  ('prod-009', 'ENC-MED-001', 'Enchufe Inteligente con Medidor',    'Switches',        320.00,  'pieza', 180, 'PUBLISHED'),
  ('prod-010', 'SEN-PV-001',  'Sensor de Puerta/Ventana',           'Sensores',        280.00,  'pieza', 220, 'PUBLISHED'),
  ('prod-011', 'AUT-COR-001', 'Cortina Motorizada WiFi',            'Automatización', 2100.00,  'pieza',  25, 'PUBLISHED'),
  ('prod-012', 'CLI-TER-001', 'Termostato Inteligente',             'Climatización',  2800.00,  'pieza',  40, 'PUBLISHED');
