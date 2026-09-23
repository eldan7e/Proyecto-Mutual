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

  const { data, error } = await supabase
    .from('todos')
    .insert([{
      title,
      description,
      priority,
      status: 'pendiente',
      sla_days: (mesesRestantes === 0) ? 2 : 5,
      numero_linea: cleanLinea
    }])
    .select()
    .single();

  if (error) throw error;

  return {
    success: true,
    data,
    message: `Ticket creado exitosamente para la línea ${linea}`
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
