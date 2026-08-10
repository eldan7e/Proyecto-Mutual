import { supabase } from '../supabaseClient';

/**
 * Registrar un evento en la tabla `audit_log` de Supabase
 * @param {Object} eventData
 * @param {string} eventData.tipo_evento - Ejemplo: 'EDIT_SOCIO', 'EDIT_PLAN', 'CREAR_USUARIO', 'CARGA_FACTURA', 'PAGO'
 * @param {string} eventData.descripcion - Descripción clara del cambio o acción
 * @param {string} [eventData.usuario] - Email del usuario (si no se pasa, intenta resolver de la sesión)
 * @param {number} [eventData.monto] - Monto asociado si aplica
 * @param {number} [eventData.numero_grupo] - Número de grupo si aplica
 * @param {string} [eventData.numero_linea] - Número de línea si aplica
 */
export async function registrarAuditoria({
  tipo_evento = 'EVENTO_GENERAL',
  descripcion,
  usuario,
  monto = null,
  numero_grupo = null,
  numero_linea = null
}) {
  try {
    let userEmail = usuario;

    if (!userEmail) {
      const { data: { session } } = await supabase.auth.getSession();
      userEmail = session?.user?.email || 'Sistema';
    }

    const { error } = await supabase.from('audit_log').insert([{
      fecha: new Date().toISOString(),
      tipo_evento,
      descripcion,
      usuario: userEmail,
      monto: monto !== null ? Number(monto) : null,
      numero_grupo: numero_grupo !== null ? Number(numero_grupo) : null,
      numero_linea: numero_linea ? String(numero_linea) : null
    }]);

    if (error) {
      console.warn('Error al registrar log de auditoría:', error.message);
    }
  } catch (err) {
    console.error('Excepción al registrar auditoría:', err);
  }
}
