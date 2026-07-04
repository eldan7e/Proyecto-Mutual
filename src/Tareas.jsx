import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import {
  CheckSquare, Calendar, Clock, AlertTriangle, Plus, Trash2, Check,
  RefreshCw, AlertCircle, ClipboardList, TrendingUp, Info, ChevronDown,
  CheckCircle, ShieldAlert, Square, User, UserCheck, Users, X,
  Edit3, Filter, SlidersHorizontal, ArrowUp, ArrowDown, Zap, Search,
  MoreHorizontal, Eye, Clock as ClockIcon, BarChart2
} from 'lucide-react';
import { useToast } from './components/ui/ToastProvider';
import Modal from './components/Modal';

// --- Componentes de UI reutilizables ---

// Badge para prioridad
const PriorityBadge = ({ priority }) => {
  const styles = {
    baja: { bg: '#e6f7e6', color: '#2e7d32', label: 'Baja' },
    media: { bg: '#e3f2fd', color: '#1565c0', label: 'Media' },
    alta: { bg: '#fff3e0', color: '#e65100', label: 'Alta' },
    urgente: { bg: '#fdecea', color: '#c62828', label: 'Urgente' }
  };
  const s = styles[priority] || styles.media;
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg,
      color: s.color,
      fontSize: '10px',
      fontWeight: 700,
      padding: '2px 10px',
      borderRadius: '12px',
      textTransform: 'uppercase',
      letterSpacing: '0.3px'
    }}>
      {s.label}
    </span>
  );
};

// Badge para SLA
const SlaBadge = ({ status }) => {
  const styles = {
    PLAZO: { bg: '#e6f7e6', color: '#2e7d32', label: 'En plazo' },
    RIESGO: { bg: '#fff3e0', color: '#e65100', label: 'En riesgo' },
    VENCIDO: { bg: '#fdecea', color: '#c62828', label: 'Vencido' },
    CUMPLIDO: { bg: '#e6f7e6', color: '#2e7d32', label: 'Cumplido' },
    EXCEDIDO: { bg: '#fdecea', color: '#c62828', label: 'Excedido' }
  };
  const s = styles[status] || styles.PLAZO;
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg,
      color: s.color,
      fontSize: '10px',
      fontWeight: 700,
      padding: '2px 10px',
      borderRadius: '12px',
      textTransform: 'uppercase',
      letterSpacing: '0.3px'
    }}>
      {s.label}
    </span>
  );
};

// Avatar con iniciales
const Avatar = ({ email, size = 28 }) => {
  if (!email || email === 'Sin asignar') {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#64748b', fontSize: '10px', fontWeight: 600
      }}>
        <User size={size * 0.5} />
      </div>
    );
  }
  const colors = ['#1e3a8a', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#65a30d', '#0d9488'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const color = colors[Math.abs(hash) % colors.length];
  const initial = email.charAt(0).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: `${size * 0.45}px`, fontWeight: 700, textTransform: 'uppercase'
    }} title={email}>
      {initial}
    </div>
  );
};

// Barra de progreso SLA
const SlaProgress = ({ todo }) => {
  if (todo.status === 'completado') return null;
  const elapsed = Math.floor((new Date() - new Date(todo.created_at)) / (1000 * 60 * 60 * 24));
  const total = todo.sla_days;
  const percent = Math.min((elapsed / total) * 100, 100);
  const color = elapsed > total ? '#dc2626' : (total - elapsed <= 1 ? '#ea580c' : '#22c55e');
  return (
    <div style={{ width: '80px', height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
      <div style={{ width: `${percent}%`, height: '100%', background: color, borderRadius: '2px' }} />
    </div>
  );
};

// --- Componente principal ---
export default function Tareas() {
  const { addToast } = useToast();
  const [todos, setTodos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Formulario
  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('media');
  const [slaDays, setSlaDays] = useState(3);
  const [assignedTo, setAssignedTo] = useState('');

  // Confirmación de eliminación
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Filtros y orden
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterSlaStatus, setFilterSlaStatus] = useState('ALL');
  const [filterAssignee, setFilterAssignee] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Carga inicial
  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) setCurrentUser(session.user);

      const { data: dbUsers, error: usersErr } = await supabase
        .from('usuarios').select('id, email').order('email');
      if (usersErr) throw usersErr;
      setUsuarios(dbUsers || []);

      const { data: dbTodos, error: todosErr } = await supabase
        .from('todos').select('*').order('created_at', { ascending: false });
      if (todosErr) throw todosErr;
      setTodos(dbTodos || []);
    } catch (err) {
      console.error(err);
      addToast('Error al cargar datos.', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Helpers (los mismos que antes)
  const getElapsedDays = (createdAt) => {
    return Math.floor((new Date() - new Date(createdAt)) / (1000 * 60 * 60 * 24));
  };
  const getResolutionDays = (createdAt, completedAt) => {
    return Math.floor((new Date(completedAt) - new Date(createdAt)) / (1000 * 60 * 60 * 24));
  };
  const getSlaStatus = (todo) => {
    if (todo.status === 'completado') {
      const resDays = getResolutionDays(todo.created_at, todo.completed_at);
      return resDays <= todo.sla_days ? 'CUMPLIDO' : 'EXCEDIDO';
    }
    const elapsed = getElapsedDays(todo.created_at);
    if (elapsed > todo.sla_days) return 'VENCIDO';
    if (todo.sla_days - elapsed <= 1) return 'RIESGO';
    return 'PLAZO';
  };

  // Métricas
  const pendingTodos = todos.filter(t => t.status === 'pendiente');
  const completedTodos = todos.filter(t => t.status === 'completado');
  const overdueCount = pendingTodos.filter(t => getElapsedDays(t.created_at) > t.sla_days).length;
  const slaMetCount = completedTodos.filter(t => getResolutionDays(t.created_at, t.completed_at) <= t.sla_days).length;
  const slaMetPercentage = completedTodos.length ? Math.round((slaMetCount / completedTodos.length) * 100) : 100;
  const avgResolutionTime = completedTodos.length
    ? (completedTodos.reduce((acc, t) => acc + getResolutionDays(t.created_at, t.completed_at), 0) / completedTodos.length).toFixed(1)
    : '0';

  // Filtrado y orden (igual)
  const filteredTodos = useMemo(() => {
    let filtered = [...todos];
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(s) || (t.description && t.description.toLowerCase().includes(s)));
    }
    if (filterPriority !== 'ALL') filtered = filtered.filter(t => t.priority === filterPriority);
    if (filterSlaStatus !== 'ALL') filtered = filtered.filter(t => getSlaStatus(t) === filterSlaStatus);
    if (filterAssignee === 'MY_TASKS') filtered = filtered.filter(t => t.assigned_to === currentUser?.id);
    else if (filterAssignee !== 'ALL') filtered = filtered.filter(t => t.assigned_to === filterAssignee);

    filtered.sort((a, b) => {
      let valA, valB;
      if (sortBy === 'created_at') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      } else if (sortBy === 'priority') {
        const order = { urgente: 4, alta: 3, media: 2, baja: 1 };
        valA = order[a.priority] || 0;
        valB = order[b.priority] || 0;
      } else if (sortBy === 'sla_remaining') {
        valA = a.status === 'pendiente' ? a.sla_days - getElapsedDays(a.created_at) : 999;
        valB = b.status === 'pendiente' ? b.sla_days - getElapsedDays(b.created_at) : 999;
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
    return filtered;
  }, [todos, debouncedSearch, filterPriority, filterSlaStatus, filterAssignee, sortBy, sortOrder]);

  const filteredPending = filteredTodos.filter(t => t.status === 'pendiente');
  const filteredCompleted = filteredTodos.filter(t => t.status === 'completado');

  // Handlers (los mismos)
  const openNewForm = () => {
    setEditingTodo(null);
    setTitle('');
    setDescription('');
    setPriority('media');
    setSlaDays(3);
    setAssignedTo('');
    setShowForm(true);
  };
  const openEditForm = (todo) => {
    setEditingTodo(todo);
    setTitle(todo.title);
    setDescription(todo.description || '');
    setPriority(todo.priority);
    setSlaDays(todo.sla_days);
    setAssignedTo(todo.assigned_to || '');
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditingTodo(null);
  };
  const handleSave = async (e) => {
    e?.preventDefault();
    if (!title.trim()) return addToast('El título es obligatorio.', 'warning');
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      sla_days: Number(slaDays),
      assigned_to: assignedTo || null,
      status: editingTodo ? editingTodo.status : 'pendiente',
    };
    try {
      if (editingTodo) {
        const { error } = await supabase.from('todos').update(payload).eq('id', editingTodo.id);
        if (error) throw error;
        addToast('Tarea actualizada.', 'success');
      } else {
        payload.user_id = currentUser?.id || null;
        payload.created_at = new Date().toISOString();
        const { error } = await supabase.from('todos').insert([payload]);
        if (error) throw error;
        addToast('Tarea creada.', 'success');
      }
      closeForm();
      loadInitialData();
    } catch (err) {
      console.error(err);
      addToast('Error al guardar.', 'error');
    }
  };
  const toggleStatus = async (todo) => {
    const newStatus = todo.status === 'pendiente' ? 'completado' : 'pendiente';
    const completedAt = newStatus === 'completado' ? new Date().toISOString() : null;
    try {
      const { error } = await supabase
        .from('todos')
        .update({ status: newStatus, completed_at: completedAt })
        .eq('id', todo.id);
      if (error) throw error;
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: newStatus, completed_at: completedAt } : t));
      addToast(newStatus === 'completado' ? 'Tarea completada.' : 'Tarea reabierta.', 'success');
    } catch (err) {
      console.error(err);
      addToast('Error al actualizar estado.', 'error');
    }
  };
  const requestDelete = (todo) => setDeleteTarget(todo);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from('todos').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      setTodos(prev => prev.filter(t => t.id !== deleteTarget.id));
      addToast('Tarea registrada y eliminada.', 'success');
    } catch (err) {
      addToast('Error al eliminar.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);
    if (diffSec < 60) return 'hace unos momentos';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffHrs < 24) return `hace ${diffHrs} ${diffHrs === 1 ? 'hora' : 'horas'}`;
    if (diffDays === 1) return 'ayer';
    return `hace ${diffDays} días`;
  };

  // --- Render ---
  return (
    <div style={{
      padding: '24px',
      background: '#f1f5f9',
      minHeight: '100vh',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>

        {/* Cabecera */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '28px',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              background: '#1e3a8a',
              color: 'white',
              padding: '10px',
              borderRadius: '12px',
              boxShadow: '0 4px 6px -1px rgba(30, 58, 138, 0.2)'
            }}>
              <ClipboardList size={24} />
            </div>
            <div>
              <h1 style={{
                fontSize: '24px',
                fontWeight: 700,
                color: '#0f172a',
                margin: 0,
                letterSpacing: '-0.01em'
              }}>
                Tablero de Tareas
              </h1>
              <p style={{
                color: '#475569',
                fontSize: '13px',
                fontWeight: 500,
                margin: 0
              }}>
                Seguimiento de incidentes y solicitudes con SLA
              </p>
            </div>
          </div>
          <button
            onClick={openNewForm}
            style={{
              background: '#1e3a8a',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              transition: 'background 0.2s',
              boxShadow: '0 2px 4px rgba(30, 58, 138, 0.2)'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.background = '#1e3a8a'}
          >
            <Plus size={18} /> Nueva Tarea
          </button>
        </div>

        {/* KPIs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            background: 'white',
            padding: '16px 20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ background: '#e3f2fd', color: '#1e3a8a', padding: '10px', borderRadius: '10px' }}>
              <ClipboardList size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Pendientes
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>
                {pendingTodos.length}
              </div>
            </div>
          </div>

          <div style={{
            background: 'white',
            padding: '16px 20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ background: '#fdecea', color: '#dc2626', padding: '10px', borderRadius: '10px' }}>
              <AlertCircle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Fuera de SLA
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>
                {overdueCount}
              </div>
            </div>
          </div>

          <div style={{
            background: 'white',
            padding: '16px 20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ background: '#e6f7e6', color: '#2e7d32', padding: '10px', borderRadius: '10px' }}>
              <TrendingUp size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                % SLA Cumplido
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>
                {slaMetPercentage}%
              </div>
            </div>
          </div>

          <div style={{
            background: 'white',
            padding: '16px 20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ background: '#f1f5f9', color: '#1e293b', padding: '10px', borderRadius: '10px' }}>
              <ClockIcon size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Resolución Promedio
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>
                {avgResolutionTime} días
              </div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div style={{
          background: 'white',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Buscar tareas..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                background: '#f8fafc',
                transition: 'border 0.2s'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#1e3a8a'}
              onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
            />
          </div>

          <select
            value={filterAssignee}
            onChange={e => setFilterAssignee(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '13px',
              background: '#f8fafc',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="ALL">Todos los colaboradores</option>
            <option value="MY_TASKS">Mis tareas</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>

          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '13px',
              background: '#f8fafc',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="ALL">Todas prioridades</option>
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>

          <select
            value={filterSlaStatus}
            onChange={e => setFilterSlaStatus(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '13px',
              background: '#f8fafc',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="ALL">SLA (Todos)</option>
            <option value="PLAZO">En plazo</option>
            <option value="RIESGO">En riesgo</option>
            <option value="VENCIDO">Vencido</option>
            <option value="CUMPLIDO">Cumplido</option>
            <option value="EXCEDIDO">Excedido</option>
          </select>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '13px',
                background: '#f8fafc',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="created_at">Fecha creación</option>
              <option value="priority">Prioridad</option>
              <option value="sla_remaining">Tiempo restante SLA</option>
            </select>
            <button
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b'
              }}
            >
              {sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            </button>
          </div>
        </div>

        {/* Lista de tareas pendientes */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          padding: '20px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
              Tareas Pendientes ({filteredPending.length})
            </h3>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <RefreshCw className="animate-spin" size={24} style={{ color: '#1e3a8a' }} />
            </div>
          ) : filteredPending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              <CheckSquare size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontWeight: 500 }}>Sin tareas pendientes.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filteredPending.map(todo => {
                const slaStat = getSlaStatus(todo);
                const assigneeEmail = usuarios.find(u => u.id === todo.assigned_to)?.email || 'Sin asignar';
                const creatorEmail = usuarios.find(u => u.id === todo.user_id)?.email || 'Sistema';

                return (
                  <div
                    key={todo.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px 120px 100px 80px auto',
                      gap: '12px',
                      alignItems: 'center',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      background: 'white',
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                  >
                    {/* Título y descripción */}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a', cursor: 'pointer' }} onClick={() => openEditForm(todo)}>
                        {todo.title}
                      </div>
                      {todo.description && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {todo.description}
                        </div>
                      )}
                    </div>

                    {/* Prioridad */}
                    <PriorityBadge priority={todo.priority} />

                    {/* Asignado */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Avatar email={assigneeEmail} size={24} />
                      <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: 500 }}>{assigneeEmail}</span>
                    </div>

                    {/* SLA */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <SlaProgress todo={todo} />
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {todo.sla_days - getElapsedDays(todo.created_at)}d
                        </span>
                      </div>
                      <SlaBadge status={slaStat} />
                    </div>

                    {/* Creado */}
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {formatRelativeTime(todo.created_at)}
                    </div>

                    {/* Acciones */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => toggleStatus(todo)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          padding: '4px',
                          borderRadius: '4px',
                          transition: 'all 0.2s'
                        }}
                        title="Completar"
                        onMouseEnter={e => { e.currentTarget.style.background = '#e6f7e6'; e.currentTarget.style.color = '#2e7d32'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => openEditForm(todo)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          padding: '4px',
                          borderRadius: '4px',
                          transition: 'all 0.2s'
                        }}
                        title="Editar"
                        onMouseEnter={e => { e.currentTarget.style.background = '#e3f2fd'; e.currentTarget.style.color = '#1e3a8a'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => requestDelete(todo)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          padding: '4px',
                          borderRadius: '4px',
                          transition: 'all 0.2s'
                        }}
                        title="Eliminar"
                        onMouseEnter={e => { e.currentTarget.style.background = '#fdecea'; e.currentTarget.style.color = '#dc2626'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Historial completadas */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          padding: '20px',
          opacity: 0.9
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#475569', margin: 0 }}>
              Historial Completadas ({filteredCompleted.length})
            </h3>
          </div>

          {filteredCompleted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
              <CheckCircle size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p>Sin tareas completadas.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filteredCompleted.map(todo => {
                const slaStat = getSlaStatus(todo);
                const assigneeEmail = usuarios.find(u => u.id === todo.assigned_to)?.email || 'Sin asignar';
                const resDays = getResolutionDays(todo.created_at, todo.completed_at);

                return (
                  <div
                    key={todo.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px 120px 100px 80px auto',
                      gap: '12px',
                      alignItems: 'center',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      opacity: 0.8,
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.8}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '14px', color: '#475569', textDecoration: 'line-through' }}>
                        {todo.title}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Resuelta en {resDays}d</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Avatar email={assigneeEmail} size={24} />
                      <span style={{ fontSize: '12px', color: '#475569' }}>{assigneeEmail}</span>
                    </div>
                    <SlaBadge status={slaStat} />
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {formatRelativeTime(todo.created_at)}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => toggleStatus(todo)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          padding: '4px',
                          borderRadius: '4px',
                          transition: 'all 0.2s'
                        }}
                        title="Reabrir"
                        onMouseEnter={e => { e.currentTarget.style.background = '#e3f2fd'; e.currentTarget.style.color = '#1e3a8a'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
                      >
                        <RefreshCw size={16} />
                      </button>
                      <button
                        onClick={() => requestDelete(todo)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          padding: '4px',
                          borderRadius: '4px',
                          transition: 'all 0.2s'
                        }}
                        title="Eliminar"
                        onMouseEnter={e => { e.currentTarget.style.background = '#fdecea'; e.currentTarget.style.color = '#dc2626'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modales (sin cambios, solo estilos) */}
        <Modal isOpen={showForm} onClose={closeForm} title={editingTodo ? 'Editar Tarea' : 'Nueva Tarea'} maxWidth="500px">
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontWeight: 600, fontSize: '12px', color: '#475569', display: 'block', marginBottom: '4px' }}>Título *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border 0.2s'
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#1e3a8a'}
                onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                placeholder="Nombre descriptivo de la tarea..."
                required
              />
            </div>
            <div>
              <label style={{ fontWeight: 600, fontSize: '12px', color: '#475569', display: 'block', marginBottom: '4px' }}>Descripción</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  resize: 'vertical',
                  transition: 'border 0.2s'
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#1e3a8a'}
                onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                placeholder="Detalles de la tarea..."
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: '12px', color: '#475569', display: 'block', marginBottom: '4px' }}>Prioridad</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: '12px', color: '#475569', display: 'block', marginBottom: '4px' }}>SLA (días)</label>
                <select
                  value={slaDays}
                  onChange={e => setSlaDays(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  {[1,2,3,5,7,15,30].map(d => <option key={d} value={d}>{d} día{d>1?'s':''}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontWeight: 600, fontSize: '12px', color: '#475569', display: 'block', marginBottom: '4px' }}>Asignar a</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                <option value="">Sin asignar</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={closeForm}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{
                  padding: '10px 20px',
                  background: '#1e3a8a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                onMouseLeave={e => e.currentTarget.style.background = '#1e3a8a'}
              >
                {editingTodo ? 'Guardar Cambios' : 'Crear Tarea'}
              </button>
            </div>
          </form>
        </Modal>

        <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmar eliminación" maxWidth="400px">
          <p style={{ marginBottom: '24px', fontSize: '14px', lineHeight: 1.5, color: '#0f172a' }}>
            ¿Estás seguro de que querés eliminar permanentemente la tarea <strong>"{deleteTarget?.title}"</strong>?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              onClick={() => setDeleteTarget(null)}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              onClick={confirmDelete}
              style={{
                padding: '10px 16px',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#b91c1c'}
              onMouseLeave={e => e.currentTarget.style.background = '#dc2626'}
            >
              Eliminar
            </button>
          </div>
        </Modal>
      </div>
    </div>
  );
}
