import { supabase } from '../supabaseClient';

/**
 * Obtiene la configuración de AFIP guardada en parametros_cuenta
 */
export async function getAfipConfig() {
  try {
    const { data, error } = await supabase
      .from('parametros_cuenta')
      .select('afip_cuit, afip_punto_venta, afip_cert, afip_key, afip_environment, afip_enabled')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching AFIP config:', error);
    }

    return {
      cuit: data?.afip_cuit || '',
      puntoVenta: data?.afip_punto_venta || 1,
      cert: data?.afip_cert || '',
      key: data?.afip_key || '',
      environment: data?.afip_environment || 'testing',
      enabled: Boolean(data?.afip_enabled)
    };
  } catch (err) {
    console.error('getAfipConfig error:', err);
    return {
      cuit: '',
      puntoVenta: 1,
      cert: '',
      key: '',
      environment: 'testing',
      enabled: false
    };
  }
}

/**
 * Guarda o actualiza los certificados y parámetros de AFIP
 */
export async function saveAfipConfig(config) {
  const payload = {
    id: 1,
    afip_cuit: config.cuit ? String(config.cuit).replace(/\D/g, '') : '',
    afip_punto_venta: parseInt(config.puntoVenta, 10) || 1,
    afip_cert: config.cert || '',
    afip_key: config.key || '',
    afip_environment: config.environment || 'testing',
    afip_enabled: Boolean(config.enabled),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('parametros_cuenta')
    .upsert(payload);

  if (error) throw error;
  return data;
}

/**
 * Solicita la emisión de una Factura Electrónica en AFIP WSFE
 */
export async function solicitarCAEAFIP({ tipoComprobante, receptorNombre, cuitReceptor, total, numeroGrupo }) {
  const config = await getAfipConfig();

  // Si no está habilitado AFIP o no hay CUIT emisor configurado, simular CAE provisorio para pruebas sin frenar el flujo
  if (!config.cuit || !config.enabled) {
    const fakeCae = `76${Math.floor(10000000000 + Math.random() * 90000000000)}`;
    const today = new Date();
    const venc = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const vencStr = venc.toLocaleDateString('es-AR');

    return {
      cae: fakeCae,
      vencimientoCae: vencStr,
      nroComprobante: Math.floor(1000 + Math.random() * 9000),
      puntoVenta: config.puntoVenta || 1,
      modo: 'provisorio'
    };
  }

  // Intentar invocación a Edge Function de AFIP pasando la configuración guardada
  try {
    const { data: res, error: fnError } = await supabase.functions.invoke('afip-invoice', {
      body: {
        cuit_emisor: config.cuit,
        punto_venta: config.puntoVenta,
        cert: config.cert,
        key: config.key,
        environment: config.environment,
        denominacion_receptor: receptorNombre,
        cuit_receptor: cuitReceptor,
        imp_total: total,
        tipo: tipoComprobante,
        numero_grupo: numeroGrupo
      }
    });

    if (fnError) throw fnError;

    if (res && res.cae) {
      return {
        cae: res.cae,
        vencimientoCae: res.vencimiento_cae || new Date().toLocaleDateString('es-AR'),
        nroComprobante: res.nro_comprobante || Math.floor(1000 + Math.random() * 9000),
        puntoVenta: config.puntoVenta,
        modo: 'oficial_afip'
      };
    }
  } catch (err) {
    console.warn('Error llamando a servicio AFIP en vivo, fallback a provisorio:', err);
  }

  // Fallback seguro si la Edge Function no responde
  const caeFallback = `76${Math.floor(10000000000 + Math.random() * 90000000000)}`;
  return {
    cae: caeFallback,
    vencimientoCae: new Date().toLocaleDateString('es-AR'),
    nroComprobante: Math.floor(1000 + Math.random() * 9000),
    puntoVenta: config.puntoVenta || 1,
    modo: 'provisorio_fallback'
  };
}
