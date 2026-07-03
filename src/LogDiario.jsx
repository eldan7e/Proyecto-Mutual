import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  Plus, Search, Phone, MessageCircle, Users, Trash2, Edit3,
  Loader2, ChevronLeft, ChevronRight, Filter, X, AlertCircle, UserCheck
} from 'lucide-react';
import { useToast } from './components/ui/ToastProvider';
import Modal from './components/Modal';

export default function LogDiario() {
  const { addToast } = useToast();

  // Estados de datos
  const [logs, setLogs] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState('todas');
  const [busquedaResponsable, setBusquedaResponsable] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');
  const [filtroAsignado, setFiltroAsignado] = useState('todos'); // 'todos', 'sin_asignar', or UUID
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Paginación simple
  const [pagina, setPagina] = useState(1);
  const ITEMS_POR_PAGINA = 20;

  // Modal CRUD
  const [modalAbierto, setModalAbierto] = useState(false);
  const [logEditando, setLogEditando] = useState(null); // null = nuevo
  const [formTipo, setFormTipo] = useState('llamada');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formResponsable, setFormResponsable] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState(''); // user UUID or empty
  const [formFechaHora, setFormFechaHora] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Debounce búsqueda
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBusqueda(busquedaResponsable), 300);
    return () => clearTimeout(timer);
  }, [busquedaResponsable]);

  // Cargar datos iniciales
  useEffect(() => {
    fetchUsuarios();
  }, []);

  // Cargar logs cada vez que cambian filtros o página
  useEffect(() => {
    fetchLogs();
  }, [filtroTipo, debouncedBusqueda, filtroAsignado, fechaDesde, fechaHasta, pagina]);

  async function fetchUsuarios() {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, email')
        .order('email');
      if (error) throw error;
      setUsuarios(data || []);
    } catch (err) {
      console.error('Error al cargar colaboradores:', err);
    }
  }

  async function fetchLogs() {
    setLoading(true);
    try {
      let query = supabase
        .from('log_diario')
        .select('*', { count: 'exact' });

      // Filtros
      if (filtroTipo !== 'todas') query = query.eq('tipo', filtroTipo);
      if (debouncedBusqueda.trim()) {
        query = query.ilike('responsable', `%${debouncedBusqueda.trim()}%`);
      }
      if (filtroAsignado !== 'todos') {
        if (filtroAsignado === 'sin_asignar') {
          query = query.is('assigned_to', null);
        } else {
          query = query.eq('assigned_to', filtroAsignado);
        }
      }
      if (fechaDesde) query = query.gte('fecha_hora', fechaDesde);
      if (fechaHasta) {
        const hastaFinDia = fechaHasta + 'T23:59:59';
        query = query.lte('fecha_hora', hastaFinDia);
      }

      // Orden y paginación
      query = query
        .order('fecha_hora', { ascending: false })
        .range((pagina - 1) * ITEMS_POR_PAGINA, pagina * ITEMS_POR_PAGINA - 1);

      const { data, error } = await query;
      if (error) throw error;

      setLogs(data || []);
    } catch (err) {
      console.error('Error al cargar logs diarios:', err);
      addToast('Error al cargar la bitácora diaria.', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Abrir modal para nuevo log
  const abrirModalNuevo = () => {
    setLogEditando(null);
    setFormTipo('llamada');
    setFormDescripcion('');
    setFormResponsable('');
    setFormAssignedTo('');
    // Fecha actual en formato ISO local
    const ahora = new Date();
    const tzoffset = ahora.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(ahora.getTime() - tzoffset)).toISOString().slice(0, 16);
    setFormFechaHora(localISOTime);
    setModalAbierto(true);
  };

  // Abrir modal para editar
  const abrirModalEditar = (log) => {
    setLogEditando(log);
    setFormTipo(log.tipo);
    setFormDescripcion(log.descripcion);
    setFormResponsable(log.responsable);
    setFormAssignedTo(log.assigned_to || '');
    // Convertir la fecha UTC al formato del input local
    const fechaLocal = new Date(log.fecha_hora);
    const tzoffset = fechaLocal.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(fechaLocal.getTime() - tzoffset)).toISOString().slice(0, 16);
    setFormFechaHora(localISOTime);
    setModalAbierto(true);
  };

  // Guardar (crear o actualizar)
  const handleGuardar = async () => {
    if (!formDescripcion.trim()) return addToast('La descripción es obligatoria.', 'warning');
    if (!formResponsable.trim()) return addToast('El responsable es obligatorio.', 'warning');
    if (!formFechaHora) return addToast('Seleccioná una fecha y hora.', 'warning');

    setGuardando(true);
    try {
      const datos = {
        tipo: formTipo,
        descripcion: formDescripcion.trim(),
        responsable: formResponsable.trim(),
        assigned_to: formAssignedTo || null,
        fecha_hora: new Date(formFechaHora).toISOString(),
      };

      if (logEditando) {
        // Actualizar
        const { error } = await supabase
          .from('log_diario')
          .update(datos)
          .eq('id', logEditando.id);
        if (error) throw error;
        addToast('Registro de bitácora actualizado.', 'success');
      } else {
        // Crear
        const { error } = await supabase
          .from('log_diario')
          .insert([datos]);
        if (error) throw error;
        addToast('Registro agregado exitosamente.', 'success');
      }

      setModalAbierto(false);
      fetchLogs(); // Refrescar lista
    } catch (err) {
      console.error(err);
      addToast('Error al guardar el registro.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  // Eliminar registro
  const handleEliminar = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este registro?')) return;

    try {
      const { error } = await supabase.from('log_diario').delete().eq('id', id);
      if (error) throw error;
      addToast('Registro eliminado.', 'success');
      fetchLogs();
    } catch (err) {
      console.error(err);
      addToast('Error al eliminar.', 'error');
    }
  };

  // Resetear filtros
  const limpiarFiltros = () => {
    setFiltroTipo('todas');
    setBusquedaResponsable('');
    setFiltroAsignado('todos');
    setFechaDesde('');
    setFechaHasta('');
    setPagina(1);
  };

  // Formatear fecha para mostrar
  const formatearFecha = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  // Obtener email del colaborador asignado
  const getAsignadoEmail = (userId) => {
    if (!userId) return 'Sin asignar';
    const found = usuarios.find(u => u.id === userId);
    return found ? found.email : 'Colaborador';
  };

  // Badge de tipo con color
  const tipoBadge = (tipo) => {
    const estilos = {
      llamada: { bg: 'rgba(37,99,235,0.1)', color: '#2563eb', icon: <Phone size={14} /> },
      chat: { bg: 'rgba(22,163,74,0.1)', color: '#16a34a', icon: <MessageCircle size={14} /> },
      conversacion: { bg: 'rgba(147,51,234,0.1)', color: '#9333ea', icon: <Users size={14} /> },
    };
    const e = estilos[tipo] || estilos.llamada;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: e.bg, color: e.color, padding: '4px 12px',
        borderRadius: '20px', fontSize: '12px', fontWeight: 600,
      }}>
        {e.icon} {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
      </span>
    );
  };

  // Estilos
  const S = {
    page: { padding: '32px', maxWidth: '1200px', margin: '0 auto', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" },
    card: {
      background: 'var(--surface)',
      backdropFilter: 'blur(16px) saturate(140%)',
      WebkitBackdropFilter: 'blur(16px) saturate(140%)',
      border: '1px solid var(--border-light)',
      borderRadius: '24px',
      padding: '24px',
      marginBottom: '20px',
      boxShadow: 'var(--shadow-soft)',
    },
    headerRow: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px',
    },
    title: { fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
    subtitle: { fontSize: '12px', margin: '4px 0 0 0', color: 'var(--text-secondary)', fontWeight: 500 },
    btnPrimary: {
      background: 'linear-gradient(135deg, var(--accent) 0%, #1b5e20 100%)',
      color: '#fff', border: 'none', fontWeight: 600, fontSize: '14px',
      padding: '12px 20px', borderRadius: '12px', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      boxShadow: '0 4px 12px rgba(46,125,50,0.3)',
      transition: 'all 0.2s',
    },
    btnSecondary: {
      background: 'rgba(0,0,0,0.04)', color: 'var(--text-primary)',
      border: '1px solid var(--border-light)', fontWeight: 600, fontSize: '14px',
      padding: '10px 16px', borderRadius: '12px', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      transition: 'all 0.2s',
    },
    filterBar: {
      display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center',
    },
    select: {
      background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border-light)',
      borderRadius: '10px', padding: '8px 12px', fontSize: '13px', color: 'var(--text-primary)',
      outline: 'none', cursor: 'pointer', width: '100%',
    },
    input: {
      background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border-light)',
      borderRadius: '10px', padding: '8px 12px', fontSize: '13px', color: 'var(--text-primary)',
      outline: 'none', width: '100%',
    },
    tableWrapper: {
      maxHeight: '600px',
      overflowY: 'auto',
      borderRadius: '16px',
      border: '1px solid var(--border-light)',
    },
    table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0 },
    th: {
      fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--text-secondary)', padding: '14px 16px', borderBottom: '2px solid var(--border-light)',
      textAlign: 'left', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 1,
    },
    td: { padding: '12px 16px', borderBottom: '1px solid var(--border-light)', verticalAlign: 'middle' },
    emptyState: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', color: 'var(--text-secondary)',
    },
  };

  return (
    <div style={S.page}>
      {/* Encabezado */}
      <div style={S.card}>
        <div style={S.headerRow}>
          <div>
            <h2 style={S.title}>📋 Log Diario de Contacto</h2>
            <p style={S.subtitle}>Bitácora de llamadas, chats y conversaciones de atención al cliente</p>
          </div>
          <button onClick={abrirModalNuevo} style={S.btnPrimary}>
            <Plus size={18} /> Nuevo Registro
          </button>
        </div>

        {/* Filtros */}
        <div style={S.filterBar}>
          <div style={{ width: '160px' }}>
            <select value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setPagina(1); }} style={S.select}>
              <option value="todas">Todos los tipos</option>
              <option value="llamada">Llamadas</option>
              <option value="chat">Chats</option>
              <option value="conversacion">Conversaciones</option>
            </select>
          </div>

          <div style={{ width: '180px' }}>
            <select value={filtroAsignado} onChange={(e) => { setFiltroAsignado(e.target.value); setPagina(1); }} style={S.select}>
              <option value="todos">Todos los asignados</option>
              <option value="sin_asignar">Sin asignar</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <input
              type="text"
              placeholder="Buscar responsable..."
              value={busquedaResponsable}
              onChange={(e) => { setBusquedaResponsable(e.target.value); setPagina(1); }}
              style={S.input}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => { setFechaDesde(e.target.value); setPagina(1); }}
              style={{ ...S.input, width: '140px' }}
              title="Desde"
            />
            <span style={{ color: 'var(--text-secondary)' }}>—</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => { setFechaHasta(e.target.value); setPagina(1); }}
              style={{ ...S.input, width: '140px' }}
              title="Hasta"
            />
          </div>

          <button onClick={limpiarFiltros} style={{ ...S.btnSecondary, padding: '8px 12px' }}>
            <X size={14} /> Limpiar
          </button>
        </div>

        {/* Tabla de registros */}
        <div style={S.tableWrapper}>
          {loading ? (
            <div style={S.emptyState}><Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }} /></div>
          ) : logs.length === 0 ? (
            <div style={S.emptyState}>
              <AlertCircle size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <h4>Sin resultados</h4>
              <p style={{ fontSize: '12px', margin: '6px 0 0', opacity: 0.7 }}>No hay registros en la bitácora con estos filtros.</p>
            </div>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Tipo</th>
                  <th style={S.th}>Descripción</th>
                  <th style={S.th}>Creador</th>
                  <th style={S.th}>Asignado a</th>
                  <th style={S.th}>Fecha y Hora</th>
                  <th style={{ ...S.th, width: '100px', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-light)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={S.td}>{tipoBadge(log.tipo)}</td>
                    <td style={{ ...S.td, maxWidth: '300px' }}>
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {log.descripcion}
                      </div>
                    </td>
                    <td style={{ ...S.td, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {log.responsable}
                    </td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: log.assigned_to ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: log.assigned_to ? 600 : 400 }}>
                        <UserCheck size={14} style={{ color: log.assigned_to ? 'var(--accent)' : 'var(--text-secondary)' }} />
                        <span>{getAsignadoEmail(log.assigned_to)}</span>
                      </div>
                    </td>
                    <td style={{ ...S.td, color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {formatearFecha(log.fecha_hora)}
                    </td>
                    <td style={{ ...S.td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                        <button onClick={() => abrirModalEditar(log)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }} title="Editar">
                          <Edit3 size={15} />
                        </button>
                        <button onClick={() => handleEliminar(log.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} title="Eliminar">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Controles de paginación */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <button
            disabled={pagina === 1}
            onClick={() => setPagina(p => Math.max(1, p - 1))}
            style={{ ...S.btnSecondary, padding: '8px 14px', fontSize: '12px', opacity: pagina === 1 ? 0.5 : 1, cursor: pagina === 1 ? 'not-allowed' : 'pointer' }}
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>Página {pagina}</span>
          <button
            disabled={logs.length < ITEMS_POR_PAGINA}
            onClick={() => setPagina(p => p + 1)}
            style={{ ...S.btnSecondary, padding: '8px 14px', fontSize: '12px', opacity: logs.length < ITEMS_POR_PAGINA ? 0.5 : 1, cursor: logs.length < ITEMS_POR_PAGINA ? 'not-allowed' : 'pointer' }}
          >
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Modal de creación/edición */}
      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={logEditando ? 'Editar Registro' : 'Nuevo Registro de Bitácora'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Tipo */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</label>
            <select value={formTipo} onChange={(e) => setFormTipo(e.target.value)} style={{ ...S.select, marginTop: '4px' }}>
              <option value="llamada">📞 Llamada</option>
              <option value="chat">💬 Chat</option>
              <option value="conversacion">👥 Conversación</option>
            </select>
          </div>

          {/* Descripción */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Descripción</label>
            <textarea
              value={formDescripcion}
              onChange={(e) => setFormDescripcion(e.target.value)}
              rows={4}
              placeholder="Detalles de la actividad (con quién se habló, resumen, etc.)..."
              style={{ ...S.input, resize: 'vertical', marginTop: '4px' }}
            />
          </div>

          {/* Creador / Responsable */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Creador / Responsable</label>
            <input
              type="text"
              value={formResponsable}
              onChange={(e) => setFormResponsable(e.target.value)}
              placeholder="Nombre de quien registra la actividad"
              style={{ ...S.input, marginTop: '4px' }}
            />
          </div>

          {/* Asignar a colaborador */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asignar a Colaborador</label>
            <select value={formAssignedTo} onChange={(e) => setFormAssignedTo(e.target.value)} style={{ ...S.select, marginTop: '4px' }}>
              <option value="">-- Sin Asignar / General --</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </div>

          {/* Fecha y hora */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha y Hora</label>
            <input
              type="datetime-local"
              value={formFechaHora}
              onChange={(e) => setFormFechaHora(e.target.value)}
              style={{ ...S.input, marginTop: '4px' }}
            />
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
            <button onClick={() => setModalAbierto(false)} style={S.btnSecondary}>
              Cancelar
            </button>
            <button onClick={handleGuardar} disabled={guardando} style={S.btnPrimary}>
              {guardando ? <Loader2 className="animate-spin" size={16} /> : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
