-- ====================================================================
-- MIGRACIÓN: Incorporación Ejercicio 2025, Corrección de Imputaciones
-- y Sincronización de Liquidaciones con Pagos Reales
-- Fecha: 24/09/2026 - 25/09/2026
-- ====================================================================

-- 1. Corrección de imputaciones de pagos y eliminación de grupos erróneos
-- Reasignación pago Miriam Bruzzese (701308 -> 70138)
UPDATE movimientos_cuenta
SET numero_grupo = 70138
WHERE id = 85061 AND numero_grupo = 701308;

-- Reasignación pago Rosana Alvarenga (7044 -> 70044)
UPDATE movimientos_cuenta
SET numero_grupo = 70044
WHERE id = 85062 AND numero_grupo = 7044;

-- Reasignación pago Gustavo Horacio Pujato (70141 -> 208)
UPDATE movimientos_cuenta
SET numero_grupo = 208
WHERE id = 85065 AND numero_grupo = 70141;

-- Limpieza de grupos ficticios en grupo_socio
DELETE FROM grupo_socio WHERE numero_grupo IN (701308, 70141, 7044);

-- 2. Asegurar existencia de grupos detectados en 2025
INSERT INTO grupos (numero_grupo, alias_grupo) 
VALUES 
  (252, 'Grupo 252'),
  (741, 'Grupo 741'),
  (5053, 'Grupo 5053'),
  (70012, 'Grupo 70012')
ON CONFLICT (numero_grupo) DO NOTHING;

-- 3. Actualización de función sincronizadora de liquidaciones a movimientos_cuenta
CREATE OR REPLACE FUNCTION fn_sync_liquidacion_to_movimiento()
RETURNS TRIGGER AS $$
DECLARE
  v_socio_nombre TEXT;
  v_prov_nombre TEXT;
  v_fecha DATE;
  v_saldo_anterior NUMERIC(12,2) := 0;
  v_nuevo_saldo NUMERIC(12,2) := 0;
  v_exists INT;
BEGIN
  -- Obtener nombre del proveedor
  SELECT nombre INTO v_prov_nombre FROM proveedores WHERE proveedor_id = NEW.proveedor_id;
  IF v_prov_nombre IS NULL THEN
    v_prov_nombre := CASE NEW.proveedor_id WHEN 1 THEN 'CLARO' WHEN 2 THEN 'MOVISTAR' WHEN 3 THEN 'PERSONAL' ELSE 'S/P' END;
  END IF;

  -- Obtener nombre del socio titular
  IF NEW.socio_id IS NOT NULL THEN
    SELECT nombre_completo INTO v_socio_nombre FROM socios WHERE socio_id = NEW.socio_id;
  END IF;
  IF v_socio_nombre IS NULL THEN
    v_socio_nombre := 'Grupo ' || NEW.numero_grupo;
  END IF;

  -- Calcular fecha de emisión / vencimiento (día 12 del mes siguiente)
  BEGIN
    v_fecha := (to_date(NEW.periodo || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '11 days')::date;
  EXCEPTION WHEN OTHERS THEN
    v_fecha := CURRENT_DATE;
  END;

  -- Validar unicidad de factura por grupo, período y proveedor
  SELECT COUNT(*) INTO v_exists
  FROM movimientos_cuenta
  WHERE (liquidacion_id = NEW.liquidacion_id)
     OR (numero_grupo = NEW.numero_grupo
         AND tipo = 'FACTURA'
         AND periodo = NEW.periodo
         AND (proveedor_id = NEW.proveedor_id OR proveedor_id IS NULL)
         AND importe = NEW.monto_total_facturado);

  IF v_exists = 0 AND NEW.monto_total_facturado > 0 THEN
    SELECT COALESCE(saldo_capital, 0) INTO v_saldo_anterior
    FROM movimientos_cuenta
    WHERE numero_grupo = NEW.numero_grupo
    ORDER BY fecha DESC, id DESC
    LIMIT 1;

    v_nuevo_saldo := v_saldo_anterior + NEW.monto_total_facturado;

    INSERT INTO movimientos_cuenta (
      fecha,
      numero_grupo,
      nombre,
      empresa,
      importe,
      tipo,
      observaciones,
      origen,
      saldo_capital_anterior,
      saldo_capital,
      saldo_final,
      periodo,
      proveedor_id,
      liquidacion_id
    ) VALUES (
      v_fecha,
      NEW.numero_grupo,
      v_socio_nombre,
      v_prov_nombre,
      NEW.monto_total_facturado,
      'FACTURA',
      'Facturación Período ' || NEW.periodo || ' (' || v_prov_nombre || ')',
      'FACTURACION_SISTEMA',
      v_saldo_anterior,
      v_nuevo_saldo,
      v_nuevo_saldo,
      NEW.periodo,
      NEW.proveedor_id,
      NEW.liquidacion_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
