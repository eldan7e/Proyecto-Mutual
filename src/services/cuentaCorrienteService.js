import { supabase } from '../supabaseClient';
import { recalcularSaldosGrupo, sortMovimientosCuenta, DEFAULT_TNA } from '../utils/cuentaCorrienteEngine';

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

  let tnaVal = DEFAULT_TNA;
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
    { data: mcData },
    { data: grpData }
  ] = await Promise.all([
    supabase
      .from('grupo_socio')
      .select('numero_grupo, socio_id, es_titular, socios:socio_id(nombre_completo)')
      .not('numero_grupo', 'is', null),
    supabase
      .from('lineas')
      .select('numero_grupo, estado, socio_id, socios:socio_id(nombre_completo)')
      .not('numero_grupo', 'is', null),
    supabase
      .from('movimientos_cuenta')
      .select('numero_grupo, nombre')
      .not('numero_grupo', 'is', null),
    supabase
      .from('grupos')
      .select('numero_grupo, alias_grupo')
      .not('numero_grupo', 'is', null)
  ]);

  // Contar líneas activas por grupo
  const lineasCountMap = {};
  (lineasData || []).forEach(row => {
    const g = row.numero_grupo;
    if (g && (row.estado || 'ACTIVA').toUpperCase() !== 'BAJA') {
      lineasCountMap[g] = (lineasCountMap[g] || 0) + 1;
    }
  });

  const mapa = {};

  // 1. Cargar desde grupo_socio (prioridad a titulares)
  (gsData || []).forEach(row => {
    const g = row.numero_grupo;
    if (g !== null && g !== undefined && g !== 0) {
      if (!mapa[g] || (row.es_titular && row.socios?.nombre_completo)) {
        mapa[g] = {
          numero_grupo: g,
          nombre: row.socios?.nombre_completo || `Grupo ${g}`,
          total_lineas: lineasCountMap[g] || 0
        };
      }
    }
  });

  // 2. Cargar desde lineas
  (lineasData || []).forEach(row => {
    const g = row.numero_grupo;
    if (g !== null && g !== undefined && g !== 0 && !mapa[g]) {
      mapa[g] = {
        numero_grupo: g,
        nombre: row.socios?.nombre_completo || `Grupo ${g}`,
        total_lineas: lineasCountMap[g] || 0
      };
    }
  });

  // 3. Cargar desde movimientos_cuenta
  (mcData || []).forEach(row => {
    const g = row.numero_grupo;
    if (g !== null && g !== undefined && g !== 0) {
      if (!mapa[g]) {
        mapa[g] = {
          numero_grupo: g,
          nombre: row.nombre || `Grupo ${g}`,
          total_lineas: lineasCountMap[g] || 0
        };
      }
    }
  });

  // 4. Si el grupo tiene alias_grupo explícito en tabla grupos, usarlo como máxima prioridad
  (grpData || []).forEach(row => {
    const g = row.numero_grupo;
    if (g && row.alias_grupo && row.alias_grupo.trim()) {
      mapa[g] = {
        numero_grupo: g,
        nombre: row.alias_grupo.trim(),
        total_lineas: lineasCountMap[g] || 0
      };
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
    .order('tipo', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  // Excluir transferencias internas entre cuentas propias de la Mutual
  const filtered = (data || []).filter(m => !isTransferenciaInterna(m));
  return filtered.sort(sortMovimientosCuenta);
}


/**
 * Detecta si un movimiento es una transferencia interna entre cuentas propias de la Mutual
 * (no debe computarse como pago de un socio/grupo)
 */
function isTransferenciaInterna(mov) {
  if (!mov.observaciones) return false;
  const obs = mov.observaciones.toUpperCase();
  return (obs.includes('CTAS. PROPIAS') || obs.includes('CTAS PROPIAS')) &&
         (obs.includes('MUTUAL') || obs.includes('30708841656') || obs.includes('AUNAR'));
}

/**
 * Obtiene la lista resumida de todos los grupos con sus saldos actuales
 */
export async function fetchInformeSaldosGeneral({ search = '', soloDeudores = false, fechaCalculo = new Date() } = {}) {
  // 1. Cargar TODOS los movimientos con campos necesarios para el recálculo
  let allData = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    let query = supabase
      .from('movimientos_cuenta')
      .select('id, numero_grupo, nombre, empresa, fecha, importe, tipo, periodo, observaciones')
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

  // 1b. Filtrar transferencias internas entre cuentas propias de la Mutual
  // Estas no son pagos de socios y distorsionan los saldos
  const transferenciasExcluidas = allData.filter(m => isTransferenciaInterna(m));
  if (transferenciasExcluidas.length > 0) {
    console.info(`[Saldos] Se excluyen ${transferenciasExcluidas.length} transferencia(s) interna(s) entre cuentas propias de la Mutual`);
  }
  allData = allData.filter(m => !isTransferenciaInterna(m));

  // 2. Obtener la TNA vigente
  let tna = DEFAULT_TNA;
  try {
    const params = await getParametrosCuenta();
    if (params && params.tasa_anual) {
      tna = Number(params.tasa_anual);
    }
  } catch (_) { /* usar default */ }

  // 3. Pre-cargar nombres y líneas de grupos
  const todosLosGrupos = await fetchGruposUnicos().catch(() => []);
  const nombresMap = {};
  const lineasMap = {};
  todosLosGrupos.forEach(g => {
    nombresMap[g.numero_grupo] = g.nombre || `Grupo ${g.numero_grupo}`;
    lineasMap[g.numero_grupo] = g.total_lineas || 0;
  });

  // 4. Agrupar movimientos por numero_grupo
  const movPorGrupo = {};
  allData.forEach(mov => {
    const g = mov.numero_grupo;
    if (g === 0 || g === null || g === undefined) return;
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
      total_lineas: g.total_lineas || 0,
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
    const procesados = recalcularSaldosGrupo(movimientos, tna, fechaCalculo);

    // Obtener el último movimiento procesado para extraer los saldos finales
    const ultimo = procesados.length > 0 ? procesados[procesados.length - 1] : null;

    // Calcular totales de facturas y pagos
    let totalFacturas = 0;
    let totalPagos = 0;
    const empresas = new Set();
    let nombreGrupo = nombresMap[g] || `Grupo ${g}`;

    movimientos.forEach(mov => {
      const imp = Math.abs(Number(mov.importe) || 0);
      if (mov.tipo === 'FACTURA') {
        totalFacturas += imp;
        if (mov.empresa) {
          const empNorm = mov.empresa.toUpperCase().trim();
          if (empNorm.startsWith('CLARO')) empresas.add('CLARO');
          else if (empNorm.startsWith('MOVISTAR')) empresas.add('MOVISTAR');
          else if (empNorm.startsWith('PERSONAL')) empresas.add('PERSONAL');
          else if (['CLARO', 'MOVISTAR', 'PERSONAL'].some(op => empNorm.includes(op))) {
            if (empNorm.includes('CLARO')) empresas.add('CLARO');
            if (empNorm.includes('MOVISTAR')) empresas.add('MOVISTAR');
            if (empNorm.includes('PERSONAL')) empresas.add('PERSONAL');
          } else {
            empresas.add(empNorm);
          }
        }
      }
      if (mov.tipo === 'PAGO') totalPagos += imp;
      if (mov.nombre && (nombreGrupo === `Grupo ${g}` || !nombreGrupo)) {
        nombreGrupo = mov.nombre;
      }
    });

    // Fallback: si no tuvo facturas con empresa, buscar en pagos solo operadoras reconocidas
    if (empresas.size === 0) {
      movimientos.forEach(mov => {
        if (mov.empresa) {
          const empNorm = mov.empresa.toUpperCase().trim();
          if (empNorm.startsWith('CLARO')) empresas.add('CLARO');
          else if (empNorm.startsWith('MOVISTAR')) empresas.add('MOVISTAR');
          else if (empNorm.startsWith('PERSONAL')) empresas.add('PERSONAL');
        }
      });
    }

    gruposMap[g] = {
      numero_grupo: g,
      nombre: nombreGrupo,
      total_lineas: lineasMap[g] || 0,
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
    total_lineas: g.total_lineas ?? (lineasMap[g.numero_grupo] || 0),
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
 * Registra un cobro PAGO en movimientos_cuenta y recalcula el saldo acumulado.
 * @param {string} periodo - Período de la deuda a cancelar (ej: '2026-01'). OBLIGATORIO para imputación correcta.
 */
export async function registrarCobroCuenta({
  numero_grupo,
  nombre,
  importe,
  medio_pago,
  observaciones,
  fecha = new Date().toISOString().slice(0, 10),
  periodo = null,
  imputaciones = [],
  numero_linea = null,
  skipLiqUpdate = false
}) {
  const monto = parseFloat(importe);
  if (isNaN(monto) || monto <= 0) throw new Error('El importe ingresado es inválido.');

  // 0. Protección Anti-Duplicados: Verificar si ya existe exactamente este mismo pago
  const { data: existingDup } = await supabase
    .from('movimientos_cuenta')
    .select('id, numero_grupo, fecha, importe, observaciones')
    .eq('numero_grupo', numero_grupo)
    .eq('fecha', fecha)
    .eq('tipo', 'PAGO')
    .limit(10);

  if (existingDup && existingDup.length > 0) {
    const isDup = existingDup.some(d => {
      const matchAmount = Math.abs(Math.abs(Number(d.importe || 0)) - monto) < 0.05;
      if (!matchAmount) return false;
      
      const obsNew = String(observaciones || '').trim();
      const obsOld = String(d.observaciones || '').trim();
      if (!obsNew && !obsOld) return true;
      if (obsNew && obsOld) {
        if (obsNew === obsOld) return true;
        // Extraer comprobante si existe (ej: "Cpbte: 667001")
        const cNew = obsNew.match(/Cpbte:\s*([A-Za-z0-9_-]+)/i)?.[1];
        const cOld = obsOld.match(/Cpbte:\s*([A-Za-z0-9_-]+)/i)?.[1];
        if (cNew && cOld && cNew === cOld) return true;
      }
      return false;
    });

    if (isDup) {
      console.warn(`[cuentaCorrienteService] Pago duplicado omitido para Grupo ${numero_grupo}, Fecha ${fecha}, Monto ${monto}`);
      return existingDup[0];
    }
  }

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
  const interesPendAnterior = ultimos && ultimos.length > 0 ? Number(ultimos[0].interes_pend_final || 0) : 0;

  // Sumar desgloses de interés vs capital de la imputación FIFO
  let pagoAplicadoInteres = 0;
  let pagoAplicadoCapital = 0;
  imputaciones.forEach(imp => {
    pagoAplicadoInteres += Number(imp.pagoAplicadoInteres || 0);
    pagoAplicadoCapital += Number(imp.pagoAplicadoCapital || 0);
  });

  if (pagoAplicadoCapital === 0 && pagoAplicadoInteres === 0) {
    pagoAplicadoInteres = Math.min(monto, interesPendAnterior);
    pagoAplicadoCapital = Math.max(0, monto - pagoAplicadoInteres);
  }

  const nuevoSaldoCapital = saldoCapitalAnterior - pagoAplicadoCapital;
  const nuevoIntPendFinal = Math.max(0, interesPendAnterior - pagoAplicadoInteres);
  const nuevoSaldoFinal = nuevoSaldoCapital + nuevoIntPendFinal;

  const nuevoMovimiento = {
    fecha,
    numero_grupo,
    nombre: nombre || `Grupo ${numero_grupo}`,
    importe: -monto, // Pagos siempre negativos
    tipo: 'PAGO',
    medio_pago,
    numero_linea: numero_linea || null,
    observaciones: observaciones || `Pago registrado vía web - Ref: ${medio_pago}`,
    origen: 'REGISTRO_WEB_CUENTA_CORRIENTE',
    periodo: periodo || null,
    pago_aplicado_interes: Math.round(pagoAplicadoInteres * 100) / 100,
    pago_aplicado_capital: Math.round(pagoAplicadoCapital * 100) / 100,
    saldo_capital_anterior: Math.round(saldoCapitalAnterior * 100) / 100,
    saldo_capital: Math.round(nuevoSaldoCapital * 100) / 100,
    interes_pend_final: Math.round(nuevoIntPendFinal * 100) / 100,
    saldo_final: Math.round(nuevoSaldoFinal * 100) / 100
  };

  const { data, error } = await supabase
    .from('movimientos_cuenta')
    .insert([nuevoMovimiento])
    .select()
    .single();

  if (error) throw error;

  // 2. Sincronizar automáticamente liquidaciones_grupos asociadas al grupo
  //    Si skipLiqUpdate es true, no actualizar liquidaciones_grupos (porque ya fue actualizado por quien llamó)
  if (!skipLiqUpdate) {
    try {
      let query = supabase
      .from('liquidaciones_grupos')
      .select('liquidacion_id, periodo, monto_total_facturado, monto_abonado, estado_pago')
      .eq('numero_grupo', numero_grupo)
      .neq('estado_pago', 'ABONADO');

    if (periodo) {
      // Imputar SOLO al período indicado
      query = query.eq('periodo', periodo);
    }

    const { data: liqsPendientes } = await query.order('periodo', { ascending: true });

    if (liqsPendientes && liqsPendientes.length > 0) {
      // Usar pagoAplicadoCapital si se desglosó mora vs capital para no sobre-amortizar facturas
      let remanenteCobro = pagoAplicadoCapital > 0 ? pagoAplicadoCapital : monto;
      for (const liq of liqsPendientes) {
        if (remanenteCobro <= 0) break;

        const pagadoActual = Number(liq.monto_abonado || 0);
        const totalFact = Number(liq.monto_total_facturado || 0);
        const pendiente = Math.max(0, totalFact - pagadoActual);

        if (pendiente <= 0) continue;

        const abonoAplicado = Math.min(remanenteCobro, pendiente);
        let nuevoAbonado = pagadoActual + abonoAplicado;
        const isFullyPaid = nuevoAbonado >= (totalFact - 2);
        const nuevoEstado = isFullyPaid ? 'ABONADO' : 'PARCIAL';
        if (isFullyPaid) {
          nuevoAbonado = totalFact;
        }

        await supabase
          .from('liquidaciones_grupos')
          .update({
            monto_abonado: Math.round(nuevoAbonado * 100) / 100,
            estado_pago: nuevoEstado,
            updated_at: new Date().toISOString()
          })
          .eq('liquidacion_id', liq.liquidacion_id);

        remanenteCobro -= abonoAplicado;
      }
    }
    } catch (errLiq) {
      console.warn('Error al sincronizar estado en liquidaciones_grupos:', errLiq);
    }
  }

  // Registrar audit log
  try {
    await supabase.from('audit_log').insert({
      tipo_evento: 'REGISTRO_PAGO_CUENTA_CORRIENTE',
      descripcion: `Cobro PAGO registrado: Grupo ${numero_grupo} por $${monto} (${medio_pago}) - Período ${periodo || 'N/A'}`,
      monto: monto,
      usuario: 'admin@aunar.com'
    });
  } catch (e) {
    console.warn('Audit log warn:', e);
  }

  return data;
}

/**
 * Obtiene el detalle rápido de un grupo para la vista previa de reasignación
 */
export async function fetchDetalleGrupoParaReasignacion(numeroGrupo) {
  const g = parseInt(numeroGrupo);
  if (isNaN(g) || g <= 0) return null;

  // 1. Alias y datos de grupo
  const { data: grp } = await supabase
    .from('grupos')
    .select('alias_grupo')
    .eq('numero_grupo', g)
    .maybeSingle();

  // 2. Titular de grupo_socio
  let titular = grp?.alias_grupo || null;
  const { data: gs } = await supabase
    .from('grupo_socio')
    .select('es_titular, socio_id')
    .eq('numero_grupo', g);

  if (!titular && gs && gs.length > 0) {
    const titId = gs.find(x => x.es_titular)?.socio_id || gs[0].socio_id;
    const { data: s } = await supabase
      .from('socios')
      .select('nombre_completo')
      .eq('id', titId)
      .maybeSingle();
    titular = s?.nombre_completo;
  }

  // 3. Titular de lineas si aún no tiene
  if (!titular) {
    const { data: l } = await supabase
      .from('lineas')
      .select('socio_id, socios:socio_id(nombre_completo)')
      .eq('numero_grupo', g)
      .limit(1);
    if (l && l[0]?.socios?.nombre_completo) {
      titular = l[0].socios.nombre_completo;
    }
  }

  // 4. Nombre histórico en movimientos_cuenta
  if (!titular) {
    const { data: mc } = await supabase
      .from('movimientos_cuenta')
      .select('nombre')
      .eq('numero_grupo', g)
      .not('nombre', 'is', null)
      .limit(1);
    titular = mc?.[0]?.nombre;
  }

  if (!titular) {
    titular = `Grupo ${g}`;
  }

  // 5. Total líneas activas
  const { count: lineasCount } = await supabase
    .from('lineas')
    .select('numero_linea', { count: 'exact', head: true })
    .eq('numero_grupo', g)
    .neq('estado', 'BAJA');

  // 6. Facturas / liquidaciones pendientes
  const { data: liqs } = await supabase
    .from('liquidaciones_grupos')
    .select('liquidacion_id, periodo, monto_total_facturado, monto_abonado, estado_pago')
    .eq('numero_grupo', g)
    .neq('estado_pago', 'ABONADO')
    .order('periodo', { ascending: true });

  const periodosPendientes = (liqs || []).map(l => ({
    liquidacion_id: l.liquidacion_id,
    periodo: l.periodo,
    monto_total: Number(l.monto_total_facturado || 0),
    monto_abonado: Number(l.monto_abonado || 0),
    saldo_pendiente: Math.max(0, Number(l.monto_total_facturado || 0) - Number(l.monto_abonado || 0)),
    estado_pago: l.estado_pago
  }));

  // 7. Saldo capital rápido en movimientos_cuenta
  const { data: movs } = await supabase
    .from('movimientos_cuenta')
    .select('importe')
    .eq('numero_grupo', g);
  
  const saldoCapital = (movs || []).reduce((acc, m) => acc + Number(m.importe || 0), 0);

  return {
    numero_grupo: g,
    titular,
    total_lineas: lineasCount || 0,
    saldo_capital: saldoCapital,
    periodos_pendientes: periodosPendientes
  };
}

/**
 * Reasigna un movimiento de pago individual a otro grupo
 */
export async function reasignarPagoCuentaCorriente({
  movimientoId,
  nuevoNumeroGrupo,
  nuevoPeriodo = null,
  motivo = '',
  actualizarBanco = true
}) {
  const gDestino = parseInt(nuevoNumeroGrupo);
  if (isNaN(gDestino) || gDestino <= 0) {
    throw new Error('Debe especificar un número de grupo destino válido');
  }

  // 1. Obtener el movimiento a reasignar
  const { data: mov, error: errMov } = await supabase
    .from('movimientos_cuenta')
    .select('*')
    .eq('id', movimientoId)
    .single();

  if (errMov || !mov) {
    throw new Error('No se encontró el movimiento a reasignar');
  }

  const oldNumeroGrupo = mov.numero_grupo;
  if (oldNumeroGrupo === gDestino) {
    throw new Error('El grupo destino no puede ser igual al grupo origen');
  }

  // 2. Obtener datos del grupo destino
  const infoDestino = await fetchDetalleGrupoParaReasignacion(gDestino);
  const nuevoTitular = infoDestino?.titular || `Grupo ${gDestino}`;

  // 3. Actualizar movimiento en movimientos_cuenta
  const auditNota = ` [Reasignado de Grupo #${oldNumeroGrupo} a #${gDestino}${motivo ? ': ' + motivo : ''}]`;
  const nuevaObs = ((mov.observaciones || '') + auditNota).trim();
  const updateData = {
    numero_grupo: gDestino,
    nombre: nuevoTitular,
    observaciones: nuevaObs
  };
  if (nuevoPeriodo) {
    updateData.periodo = nuevoPeriodo;
  }

  const { error: errUpd } = await supabase
    .from('movimientos_cuenta')
    .update(updateData)
    .eq('id', movimientoId);

  if (errUpd) throw errUpd;

  // 4. Actualizar movimiento bancario coincidente si existe
  if (actualizarBanco) {
    try {
      const montoAbs = Math.abs(Number(mov.importe));
      const { data: mbMatches } = await supabase
        .from('movimientos_bancarios')
        .select('movimiento_id, numero_grupo, monto')
        .eq('numero_grupo', oldNumeroGrupo)
        .gte('monto', montoAbs - 1)
        .lte('monto', montoAbs + 1);

      if (mbMatches && mbMatches.length > 0) {
        await supabase
          .from('movimientos_bancarios')
          .update({
            numero_grupo: gDestino,
            nombre_socio: nuevoTitular,
            periodo: nuevoPeriodo || undefined
          })
          .eq('movimiento_id', mbMatches[0].movimiento_id);
      }
    } catch (errMb) {
      console.warn('No se pudo actualizar movimiento_bancario:', errMb);
    }
  }

  // 5. Imputar/amortizar liquidación pendiente en el grupo destino si corresponde
  const montoCobro = Math.abs(Number(mov.importe));
  try {
    let queryLiq = supabase
      .from('liquidaciones_grupos')
      .select('liquidacion_id, periodo, monto_total_facturado, monto_abonado, estado_pago')
      .eq('numero_grupo', gDestino)
      .neq('estado_pago', 'ABONADO');

    if (nuevoPeriodo) {
      queryLiq = queryLiq.eq('periodo', nuevoPeriodo);
    }

    const { data: liqsPend } = await queryLiq.order('periodo', { ascending: true });
    if (liqsPend && liqsPend.length > 0) {
      let remanente = montoCobro;
      for (const liq of liqsPend) {
        if (remanente <= 0) break;
        const totalFact = Number(liq.monto_total_facturado || 0);
        const pagadoActual = Number(liq.monto_abonado || 0);
        const pendiente = Math.max(0, totalFact - pagadoActual);
        if (pendiente <= 0) continue;

        const amort = Math.min(remanente, pendiente);
        let nuevoAbonado = pagadoActual + amort;
        const isAbonado = nuevoAbonado >= (totalFact - 2);
        if (isAbonado) nuevoAbonado = totalFact;

        await supabase
          .from('liquidaciones_grupos')
          .update({
            monto_abonado: Math.round(nuevoAbonado * 100) / 100,
            estado_pago: isAbonado ? 'ABONADO' : 'PARCIAL',
            updated_at: new Date().toISOString()
          })
          .eq('liquidacion_id', liq.liquidacion_id);

        remanente -= amort;
      }
    }
  } catch (errLiq) {
    console.warn('Error al sincronizar liquidaciones_grupos destino:', errLiq);
  }

  // 6. Verificar si el grupo origen quedó huérfano (0 movimientos, 0 líneas, 0 socios)
  await limpiarGrupoHuerfanoSiAplica(oldNumeroGrupo);

  // 7. Audit Log
  try {
    await supabase.from('audit_log').insert({
      tipo_evento: 'REASIGNACION_PAGO',
      descripcion: `Pago ID ${movimientoId} ($${montoCobro}) reasignado de Grupo #${oldNumeroGrupo} a Grupo #${gDestino} (${nuevoTitular}). Motivo: ${motivo || 'Error en planilla original'}`,
      monto: montoCobro,
      usuario: 'admin@aunar.com'
    });
  } catch (e) {
    console.warn('Audit log warn:', e);
  }

  return {
    success: true,
    movimientoId,
    oldNumeroGrupo,
    nuevoNumeroGrupo: gDestino,
    nuevoTitular,
    monto: montoCobro
  };
}

/**
 * Reasigna todos los pagos y movimientos de un grupo huérfano o erróneo a otro grupo
 */
export async function reasignarGrupoCompleto({
  oldNumeroGrupo,
  nuevoNumeroGrupo,
  motivo = '',
  actualizarBanco = true
}) {
  const gOrigen = parseInt(oldNumeroGrupo);
  const gDestino = parseInt(nuevoNumeroGrupo);
  if (isNaN(gOrigen) || isNaN(gDestino) || gOrigen === gDestino) {
    throw new Error('Números de grupo inválidos');
  }

  // 1. Obtener todos los movimientos de pago del grupo origen
  const { data: movs, error: errMovs } = await supabase
    .from('movimientos_cuenta')
    .select('*')
    .eq('numero_grupo', gOrigen)
    .eq('tipo', 'PAGO');

  if (errMovs) throw errMovs;
  if (!movs || movs.length === 0) {
    throw new Error(`El Grupo #${gOrigen} no tiene pagos registrados para reasignar`);
  }

  const infoDestino = await fetchDetalleGrupoParaReasignacion(gDestino);
  const nuevoTitular = infoDestino?.titular || `Grupo ${gDestino}`;

  let totalReasignado = 0;
  for (const m of movs) {
    await reasignarPagoCuentaCorriente({
      movimientoId: m.id,
      nuevoNumeroGrupo: gDestino,
      nuevoPeriodo: m.periodo,
      motivo: motivo || 'Reasignación masiva de grupo erróneo',
      actualizarBanco
    });
    totalReasignado += Math.abs(Number(m.importe || 0));
  }

  // Limpiar grupo origen si quedó huérfano
  await limpiarGrupoHuerfanoSiAplica(gOrigen);

  return {
    success: true,
    cantidadMovimientos: movs.length,
    totalMonto: totalReasignado,
    oldNumeroGrupo: gOrigen,
    nuevoNumeroGrupo: gDestino,
    nuevoTitular
  };
}

/**
 * Limpia un grupo huérfano (creado por error tipográfico) si no tiene más movimientos ni socios ni líneas
 */
async function limpiarGrupoHuerfanoSiAplica(numeroGrupo) {
  try {
    const g = parseInt(numeroGrupo);
    if (isNaN(g)) return;

    // Verificar si quedan movimientos en movimientos_cuenta
    const { count: countMovs } = await supabase
      .from('movimientos_cuenta')
      .select('id', { count: 'exact', head: true })
      .eq('numero_grupo', g);

    if (countMovs && countMovs > 0) return;

    // Verificar si tiene facturas / liquidaciones
    const { count: countLiqs } = await supabase
      .from('liquidaciones_grupos')
      .select('liquidacion_id', { count: 'exact', head: true })
      .eq('numero_grupo', g);

    if (countLiqs && countLiqs > 0) return;

    // Verificar si tiene líneas telefónicas
    const { count: countLineas } = await supabase
      .from('lineas')
      .select('numero_linea', { count: 'exact', head: true })
      .eq('numero_grupo', g);

    if (countLineas && countLineas > 0) return;

    // Verificar si tiene socios asociados
    const { count: countSocios } = await supabase
      .from('grupo_socio')
      .select('socio_id', { count: 'exact', head: true })
      .eq('numero_grupo', g);

    if (countSocios && countSocios > 0) return;

    // Si no tiene nada, eliminar el grupo dummy de la tabla grupos
    await supabase.from('grupos').delete().eq('numero_grupo', g);
  } catch (errClean) {
    console.warn('Advertencia al limpiar grupo huérfano:', errClean);
  }
}

