import { supabase } from '../supabaseClient';

/**
 * Creates a ticket in `todos` for discount expiration ("VENCIMIENTO BONIFICACION")
 */
export async function crearTicketVencimientoBonificacion({
  linea,
  socioNombre,
  numeroGrupo,
  plan,
  vigencia,
  mesesRestantes,
  descuentoPct,
  proveedor,
  observaciones = ''
}) {
  if (!linea) throw new Error('Número de línea no especificado');

  const cleanLinea = String(linea).replace(/\D/g, '');

  // 1. Check if an open/pending ticket for this line with VENCIMIENTO BONIFICACION already exists
  const { data: existingTodos, error: checkErr } = await supabase
    .from('todos')
    .select('id, title, status')
    .eq('numero_linea', cleanLinea)
    .neq('status', 'completado')
    .ilike('title', '%VENCIMIENTO BONIFICACION%');

  if (checkErr) {
    console.warn('Error checking existing todos:', checkErr);
  }

  if (existingTodos && existingTodos.length > 0) {
    return {
      success: false,
      alreadyExists: true,
      message: `Ya existe un ticket abierto de vencimiento para la línea ${linea}.`
    };
  }

  // 2. Prepare ticket data
  const vigenciaStr = vigencia || (mesesRestantes !== null && mesesRestantes !== undefined ? `${mesesRestantes} mes(es) restantes` : 'Por vencer');
  const socioStr = socioNombre && socioNombre !== 'Socio no identificado' ? socioNombre : 'Sin socio asignado';
  const grupoStr = numeroGrupo ? `Grupo ${numeroGrupo}` : 'Sin grupo';
  const provStr = (proveedor || 'Operadora').toString().toUpperCase();

  const title = `VENCIMIENTO BONIFICACION - ${linea} (${socioStr})`;
  const description = [
    `📋 GESTIÓN DE VENCIMIENTO DE BONIFICACIÓN`,
    `----------------------------------------`,
    `• Línea: ${linea}`,
    `• Socio: ${socioStr} (${grupoStr})`,
    `• Operadora: ${provStr}`,
    `• Plan: ${plan || 'No especificado'}`,
    `• Descuento Operadora: ${descuentoPct ? (descuentoPct.toString().includes('%') ? descuentoPct : `${descuentoPct}%`) : '80%'}`,
    `• Vigencia: ${vigenciaStr}`,
    mesesRestantes !== null && mesesRestantes !== undefined ? `• Meses restantes: ${mesesRestantes}` : null,
    observaciones ? `• Observaciones: ${observaciones}` : null,
    ``,
    `⚡ ACCIÓN REQUERIDA:`,
    `Gestionar con ${provStr} la renovación o extensión de la bonificación antes del cierre de ciclo para evitar que el socio sufra un incremento abrupto de tarifa en el abono.`
  ].filter(Boolean).join('\n');

  const priority = (mesesRestantes !== null && mesesRestantes !== undefined && mesesRestantes <= 1) ? 'urgente' : 'alta';

  let currentUserId = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      currentUserId = session.user.id;
    }
  } catch (authErr) {
    console.warn('Could not get auth session for ticket assignment:', authErr);
  }

  const { data, error } = await supabase
    .from('todos')
    .insert([{
      title,
      description,
      priority,
      status: 'pendiente',
      sla_days: (mesesRestantes === 0) ? 2 : 5,
      numero_linea: cleanLinea,
      user_id: currentUserId,
      assigned_to: currentUserId,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;

  return {
    success: true,
    data,
    message: `Ticket creado y asignado exitosamente para la línea ${linea}`
  };
}

/**
 * Checks which lines from a list currently have an open "VENCIMIENTO BONIFICACION" ticket
 */
export async function getOpenVencimientoTickets(lineas = []) {
  if (!lineas || lineas.length === 0) return new Set();
  const cleanNums = lineas.map(l => String(l).replace(/\D/g, '')).filter(Boolean);
  if (cleanNums.length === 0) return new Set();

  try {
    const { data } = await supabase
      .from('todos')
      .select('numero_linea')
      .in('numero_linea', cleanNums)
      .neq('status', 'completado')
      .ilike('title', '%VENCIMIENTO BONIFICACION%');

    return new Set((data || []).map(d => d.numero_linea));
  } catch (err) {
    console.error('Error fetching open tickets:', err);
    return new Set();
  }
}

/**
 * Creates a follow-up ticket in `todos` for Mutual discounts ("SEGUIMIENTO DESCUENTO MUTUAL")
 * Rule: single-period discounts (total_cuotas <= 1) are exceptional and do NOT generate tickets.
 */
export async function crearTicketSeguimientoDescuentoMutual({
  linea,
  socioNombre,
  numeroGrupo,
  nroSocio,
  socioId,
  valor,
  ctaNumero = 1,
  totalCuotas,
  descripcion = '',
  finEstimado = ''
}) {
  const totalCuotasNum = parseInt(totalCuotas, 10) || 1;
  if (totalCuotasNum <= 1) {
    return {
      success: false,
      isSinglePeriod: true,
      message: 'Los descuentos de 1 solo período son excepcionales y no requieren ticket de seguimiento.'
    };
  }

  const ctaNum = parseInt(ctaNumero, 10) || 1;
  const remainingCuotas = Math.max(0, totalCuotasNum - ctaNum);
  const cleanLinea = linea ? String(linea).replace(/\D/g, '') : null;
  const socioStr = socioNombre && socioNombre !== 'Socio no identificado' 
    ? socioNombre 
    : (socioId ? `Socio #${socioId}` : 'Sin socio asignado');
  const grupoStr = numeroGrupo ? `Grupo ${numeroGrupo}` : (nroSocio ? `Socio #${nroSocio}` : 'Sin grupo');

  const title = cleanLinea 
    ? `SEGUIMIENTO DESCUENTO MUTUAL - ${linea} (${socioStr})`
    : `SEGUIMIENTO DESCUENTO MUTUAL - ${grupoStr} (${socioStr})`;

  // Duplicate check
  try {
    let checkQuery = supabase
      .from('todos')
      .select('id, title, status')
      .neq('status', 'completado')
      .ilike('title', '%SEGUIMIENTO DESCUENTO MUTUAL%');

    if (cleanLinea) {
      checkQuery = checkQuery.eq('numero_linea', cleanLinea);
    } else if (numeroGrupo) {
      checkQuery = checkQuery.ilike('title', `%Grupo ${numeroGrupo}%`);
    } else {
      checkQuery = checkQuery.ilike('title', `%${socioStr}%`);
    }

    const { data: existingTodos, error: checkErr } = await checkQuery;
    if (checkErr) console.warn('Error checking existing mutual discount todos:', checkErr);

    if (existingTodos && existingTodos.length > 0) {
      return {
        success: false,
        alreadyExists: true,
        message: `Ya existe un ticket abierto de seguimiento para ${cleanLinea || grupoStr}.`
      };
    }
  } catch (chkErr) {
    console.warn('Error verifying existing todos:', chkErr);
  }

  const valorStr = valor ? (String(valor).includes('%') ? valor : `${valor}%`) : 'A definir';
  const description = [
    `📋 SEGUIMIENTO DE DESCUENTO MUTUAL`,
    `----------------------------------------`,
    `• Socio: ${socioStr} ${nroSocio ? `(ID #${nroSocio})` : ''}`,
    `• Grupo: ${grupoStr}`,
    `• Línea: ${linea || 'Global (Aplica a todas las líneas)'}`,
    `• Descuento Mutual: ${valorStr}`,
    `• Estado de Cuotas: Cuota ${ctaNum} de ${totalCuotasNum} (${remainingCuotas} cuota(s) restante(s))`,
    finEstimado ? `• Fin Estimado: ${finEstimado}` : null,
    descripcion ? `• Detalle/Motivo: ${descripcion}` : null,
    ``,
    `⚡ ACCIÓN REQUERIDA:`,
    `Evaluar la continuidad, renovación, ajuste o baja del descuento de la Mutual para el próximo ciclo de liquidación.`
  ].filter(Boolean).join('\n');

  const priority = (remainingCuotas <= 1) ? 'urgente' : (remainingCuotas <= 2 ? 'alta' : 'media');
  const sla_days = (remainingCuotas <= 1) ? 3 : 7;

  let currentUserId = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      currentUserId = session.user.id;
    }
  } catch (authErr) {
    console.warn('Could not get auth session for ticket assignment:', authErr);
  }

  const { data, error } = await supabase
    .from('todos')
    .insert([{
      title,
      description,
      priority,
      status: 'pendiente',
      sla_days,
      numero_linea: cleanLinea,
      user_id: currentUserId,
      assigned_to: currentUserId,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;

  return {
    success: true,
    data,
    message: `Ticket de seguimiento creado exitosamente para ${cleanLinea || grupoStr}`
  };
}

/**
 * Checks all active open "SEGUIMIENTO DESCUENTO MUTUAL" tickets
 */
export async function getOpenMutualDiscountTickets() {
  try {
    const { data, error } = await supabase
      .from('todos')
      .select('id, title, numero_linea, status, priority, created_at')
      .neq('status', 'completado')
      .ilike('title', '%SEGUIMIENTO DESCUENTO MUTUAL%');

    if (error) {
      console.error('Error fetching open mutual discount tickets:', error);
      return { lineasSet: new Set(), rawTickets: [] };
    }

    const lineasSet = new Set((data || []).map(d => d.numero_linea).filter(Boolean));
    return {
      lineasSet,
      rawTickets: data || []
    };
  } catch (err) {
    console.error('Error in getOpenMutualDiscountTickets:', err);
    return { lineasSet: new Set(), rawTickets: [] };
  }
}

