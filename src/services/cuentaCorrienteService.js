import { supabase } from '../supabaseClient';
import { recalcularSaldosGrupo, DEFAULT_TNA } from '../utils/cuentaCorrienteEngine';

/**
 * Obtiene la configuración de parámetros de la cuenta corriente (TNA, día tope, etc)
 */
export async function getParametrosCuenta() {
  const { data, error } = await supabase
    .from('parametros_cuenta')
    .select('*')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error al obtener parametros_cuenta:', error);
  }

  let tnaVal = 120;
  if (data && data.tasa_anual !== undefined && data.tasa_anual !== null) {
    const raw = Number(data.tasa_anual);
    tnaVal = raw <= 2 ? raw * 100 : raw;
  }

  return {
    ...data,
    tasa_anual: tnaVal,
    tasa_diaria: (tnaVal / 100) / 365,
    dia_tope_pago: data?.dia_tope_pago || 15
  };
}

/**
 * Actualiza la Tasa Nominal Anual (TNA) en la base de datos
 */
export async function updateTasaAnual(tasaAnual) {
  const tna = parseFloat(tasaAnual);
  if (isNaN(tna)) throw new Error('Tasa TNA inválida');
  
  const tasaDiaria = (tna / 100) / 365;

  const { data, error } = await supabase
    .from('parametros_cuenta')
    .upsert({ id: 1, tasa_anual: tna, tasa_diaria: tasaDiaria, updated_at: new Date().toISOString() });

  if (error) throw error;
  return data;
}

/**
 * Obtiene la lista completa de TODOS los números de grupo de la mutual
 * (combina grupo_socio, lineas y movimientos_cuenta)
 */
export async function fetchGruposUnicos() {
  const [
    { data: gsData },
    { data: lineasData },
    { data: mcData }
  ] = await Promise.all([
    supabase
      .from('grupo_socio')
      .select('numero_grupo, socio_id, es_titular, socios:socio_id(nombre_completo)')
      .not('numero_grupo', 'is', null),
    supabase
      .from('lineas')
      .select('numero_grupo, socio_id, socios:socio_id(nombre_completo)')
      .not('numero_grupo', 'is', null),
    supabase
      .from('movimientos_cuenta')
      .select('numero_grupo, nombre')
      .not('numero_grupo', 'is', null)
  ]);

  const mapa = {};

  // 1. Cargar desde grupo_socio (prioridad a titulares)
  (gsData || []).forEach(row => {
    const g = row.numero_grupo;
    if (g !== null && g !== undefined) {
      if (!mapa[g] || (row.es_titular && row.socios?.nombre_completo)) {
        mapa[g] = {
          numero_grupo: g,
          nombre: row.socios?.nombre_completo || `Grupo ${g}`
        };
      }
    }
  });

  // 2. Cargar desde lineas
  (lineasData || []).forEach(row => {
    const g = row.numero_grupo;
    if (g !== null && g !== undefined && !mapa[g]) {
      mapa[g] = {
        numero_grupo: g,
        nombre: row.socios?.nombre_completo || `Grupo ${g}`
      };
    }
  });

  // 3. Cargar desde movimientos_cuenta
  (mcData || []).forEach(row => {
    const g = row.numero_grupo;
    if (g !== null && g !== undefined) {
      if (!mapa[g]) {
        mapa[g] = {
          numero_grupo: g,
          nombre: row.nombre || `Grupo ${g}`
        };
      }
    }
  });

  return Object.values(mapa).sort((a, b) => a.numero_grupo - b.numero_grupo);
}

/**
 * Obtiene los movimientos de cuenta corriente para un grupo específico
 */
export async function fetchMovimientosGrupo(numeroGrupo) {
  const { data, error } = await supabase
    .from('movimientos_cuenta')
    .select('*')
    .eq('numero_grupo', numeroGrupo)
    .order('fecha', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Obtiene la lista resumida de todos los grupos con sus saldos actuales
 */
export async function fetchInformeSaldosGeneral({ search = '', soloDeudores = false } = {}) {
  // 1. Cargar TODOS los movimientos con campos necesarios para el recálculo
  let allData = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    let query = supabase
      .from('movimientos_cuenta')
      .select('id, numero_grupo, nombre, empresa, fecha, importe, tipo')
      .not('numero_grupo', 'is', null)
      .order('numero_grupo', { ascending: true })
      .order('fecha', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    allData.push(...(data || []));
    if (!data || data.length < limit) break;
    offset += limit;
  }

  // 2. Obtener la TNA vigente
  let tna = DEFAULT_TNA;
  try {
    const params = await getParametrosCuenta();
    if (params && params.tasa_anual) {
      tna = Number(params.tasa_anual);
    }
  } catch (_) { /* usar default */ }

  // 3. Pre-cargar nombres de grupos
  const todosLosGrupos = await fetchGruposUnicos().catch(() => []);
  const nombresMap = {};
  todosLosGrupos.forEach(g => {
    nombresMap[g.numero_grupo] = g.nombre || `Grupo ${g.numero_grupo}`;
  });

  // 4. Agrupar movimientos por numero_grupo
  const movPorGrupo = {};
  allData.forEach(mov => {
    const g = mov.numero_grupo;
    if (!movPorGrupo[g]) {
      movPorGrupo[g] = [];
    }
    movPorGrupo[g].push(mov);
  });

  // 5. Recalcular saldos usando el motor EXACTO del Excel para cada grupo
  const gruposMap = {};

  // Inicializar grupos sin movimientos desde el catálogo
  todosLosGrupos.forEach(g => {
    gruposMap[g.numero_grupo] = {
      numero_grupo: g.numero_grupo,
      nombre: g.nombre || `Grupo ${g.numero_grupo}`,
      empresas: new Set(),
      totalFacturas: 0,
      totalPagos: 0,
      ultimoMovimientoFecha: 'Sin movimientos',
      saldoCapitalUltimo: 0,
      interesPendUltimo: 0,
      saldoFinalUltimo: 0,
      movimientosCount: 0
    };
  });

  for (const [grupoNum, movimientos] of Object.entries(movPorGrupo)) {
    const g = Number(grupoNum);

    // Recalcular con el motor del Excel
    const procesados = recalcularSaldosGrupo(movimientos, tna);

    // Obtener el último movimiento procesado para extraer los saldos finales
    const ultimo = procesados.length > 0 ? procesados[procesados.length - 1] : null;

    // Calcular totales de facturas y pagos
    let totalFacturas = 0;
    let totalPagos = 0;
    const empresas = new Set();
    let nombreGrupo = nombresMap[g] || `Grupo ${g}`;

    movimientos.forEach(mov => {
      const imp = Math.abs(Number(mov.importe) || 0);
      if (mov.tipo === 'FACTURA') totalFacturas += imp;
      if (mov.tipo === 'PAGO') totalPagos += imp;
      if (mov.empresa) empresas.add(mov.empresa);
      if (mov.nombre && (nombreGrupo === `Grupo ${g}` || !nombreGrupo)) {
        nombreGrupo = mov.nombre;
      }
    });

    gruposMap[g] = {
      numero_grupo: g,
      nombre: nombreGrupo,
      empresas,
      totalFacturas,
      totalPagos,
      ultimoMovimientoFecha: ultimo ? ultimo.fecha : 'Sin movimientos',
      saldoCapitalUltimo: ultimo ? ultimo.saldo_capital : 0,
      interesPendUltimo: ultimo ? ultimo.interes_pend_final : 0,
      saldoFinalUltimo: ultimo ? ultimo.saldo_final : 0,
      movimientosCount: procesados.length
    };
  }

  // 6. Formatear resultado
  let resultado = Object.values(gruposMap).map(g => ({
    ...g,
    empresas: g.empresas instanceof Set ? Array.from(g.empresas).join(', ') || 'N/D' : (g.empresas || 'N/D')
  }));

  // 7. Aplicar filtros
  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    resultado = resultado.filter(g =>
      String(g.numero_grupo).includes(s) ||
      (g.nombre || '').toLowerCase().includes(s) ||
      (g.empresas || '').toLowerCase().includes(s)
    );
  } else if (soloDeudores) {
    resultado = resultado.filter(g => g.saldoFinalUltimo > 5 || g.saldoCapitalUltimo > 5);
  }

  resultado.sort((a, b) => b.saldoFinalUltimo - a.saldoFinalUltimo);
  return resultado;
}

/**
 * Registra un cobro PAGO en movimientos_cuenta y recalcula el saldo acumulado
 */
export async function registrarCobroCuenta({
  numero_grupo,
  nombre,
  importe,
  medio_pago,
  observaciones,
  fecha = new Date().toISOString().slice(0, 10),
  imputaciones = []
}) {
  const monto = parseFloat(importe);
  if (isNaN(monto) || monto <= 0) throw new Error('El importe ingresado es inválido.');

  // 1. Obtener el último movimiento del grupo para calcular saldo capital anterior
  const { data: ultimos, error: ultErr } = await supabase
    .from('movimientos_cuenta')
    .select('saldo_capital, interes_pend_final')
    .eq('numero_grupo', numero_grupo)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);

  if (ultErr) throw ultErr;

  const saldoCapitalAnterior = ultimos && ultimos.length > 0 ? Number(ultimos[0].saldo_capital || 0) : 0;
  const nuevoSaldoCapital = saldoCapitalAnterior - monto;

  // Sumar desgloses de interés vs capital de la imputación FIFO
  let pagoAplicadoInteres = 0;
  let pagoAplicadoCapital = 0;
  imputaciones.forEach(imp => {
    pagoAplicadoInteres += Number(imp.pagoAplicadoInteres || 0);
    pagoAplicadoCapital += Number(imp.pagoAplicadoCapital || 0);
  });

  if (pagoAplicadoCapital === 0) pagoAplicadoCapital = monto;

  const nuevoMovimiento = {
    fecha,
    numero_grupo,
    nombre: nombre || `Grupo ${numero_grupo}`,
    importe: -monto, // Pagos siempre negativos
    tipo: 'PAGO',
    medio_pago,
    observaciones: observaciones || `Pago registrado vía web - Ref: ${medio_pago}`,
    origen: 'REGISTRO_WEB_CUENTA_CORRIENTE',
    pago_aplicado_interes: Math.round(pagoAplicadoInteres * 100) / 100,
    pago_aplicado_capital: Math.round(pagoAplicadoCapital * 100) / 100,
    saldo_capital_anterior: Math.round(saldoCapitalAnterior * 100) / 100,
    saldo_capital: Math.round(nuevoSaldoCapital * 100) / 100,
    saldo_final: Math.round(nuevoSaldoCapital * 100) / 100
  };

  const { data, error } = await supabase
    .from('movimientos_cuenta')
    .insert([nuevoMovimiento])
    .select()
    .single();

  if (error) throw error;

  // Registrar audit log
  await supabase.from('audit_log').insert({
    tipo_evento: 'REGISTRO_PAGO_CUENTA_CORRIENTE',
    descripcion: `Cobro PAGO registrado: Grupo ${numero_grupo} por $${monto} (${medio_pago})`,
    monto: monto,
    usuario: 'admin@aunar.com'
  }).catch(e => console.warn('Audit log warn:', e));

  return data;
}
