import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import {
  CheckSquare, Calendar, Clock, AlertTriangle, Plus, Trash2, Check,
  RefreshCw, AlertCircle, ClipboardList, TrendingUp, Info, ChevronDown,
  CheckCircle, ShieldAlert, Square, User, UserCheck, Users, X,
  Edit3, Filter, SlidersHorizontal, ArrowUp, ArrowDown, Zap
} from 'lucide-react';
import { useToast } from './components/ui/ToastProvider';
import Modal from './components/Modal';

// Componente para Avatares dinámicos y estilizados
function UserAvatar({ email, size = 20 }) {
  if (!email || email === 'Sin asignar') {
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(0, 0, 0, 0.05)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-light)'
      }} title="Sin asignar">
        <User size={size * 0.6} />
      </div>
    );
  }
  
  // Genera un color único y consistente a partir del email
  const colors = [
    '#2e7d32', '#1565c0', '#c62828', '#ad1457', '#6a1b9a', 
    '#00838f', '#00695c', '#f57f17', '#d84315', '#37474f'
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];
  const initial = email.charAt(0).toUpperCase();

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      backgroundColor: color,
      color: 'white',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${size * 0.55}px`,
      fontWeight: 800,
      textTransform: 'uppercase',
      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)'
    }} title={email}>
      {initial}
    </div>
  );
}

// Componente para porcentaje de cumplimiento SLA en formato circular
function CircularProgress({ percentage, size = 44, strokeWidth = 4.5, color = '#10b981' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(0, 0, 0, 0.05)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
        />
      </svg>
      <div style={{ position: 'absolute', fontSize: '10px', fontWeight: 800, color: 'var(--text-primary)' }}>
        {percentage}%
      </div>
    </div>
  );
}

export default function Tareas() {
  const { addToast } = useToast();
  const [todos, setTodos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Formulario nueva/edición
  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('media');
  const [slaDays, setSlaDays] = useState(3);
  const [assignedTo, setAssignedTo] = useState('');

  // Confirmación de eliminación
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Filtros y ordenamiento
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterSlaStatus, setFilterSlaStatus] = useState('ALL');
  const [filterAssignee, setFilterAssignee] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created_at'); // 'created_at', 'priority', 'sla_remaining'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'

  // Debounce para búsqueda
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

  // Abrir formulario para nueva tarea
  const openNewForm = () => {
    setEditingTodo(null);
    setTitle('');
    setDescription('');
    setPriority('media');
    setSlaDays(3);
    setAssignedTo('');
    setShowForm(true);
  };

  // Abrir formulario para editar tarea existente
  const openEditForm = (todo) => {
    setEditingTodo(todo);
    setTitle(todo.title);
    setDescription(todo.description || '');
    setPriority(todo.priority);
    setSlaDays(todo.sla_days);
    setAssignedTo(todo.assigned_to || '');
    setShowForm(true);
  };

  // Cerrar formulario
  const closeForm = () => {
    setShowForm(false);
    setEditingTodo(null);
  };

  // Guardar (crear o actualizar)
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
      loadInitialData(); // Refrescar lista
    } catch (err) {
      console.error(err);
      addToast('Error al guardar.', 'error');
    }
  };

  // Cambiar estado (completar/reabrir)
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

  // Confirmar eliminación
  const requestDelete = (todo) => setDeleteTarget(todo);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from('todos').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      setTodos(prev => prev.filter(t => t.id !== deleteTarget.id));
      addToast('Tarea eliminada.', 'success');
    } catch (err) {
      addToast('Error al eliminar.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Helpers de tiempo y timestamps relativos
  const getElapsedDays = (createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();
    return Math.floor((now - created) / (1000 * 60 * 60 * 24));
  };

  const getResolutionDays = (createdAt, completedAt) => {
    return Math.floor((new Date(completedAt) - new Date(createdAt)) / (1000 * 60 * 60 * 24));
  };

  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffSec < 60) {
      return 'hace unos momentos';
    } else if (diffMin < 60) {
      return `hace ${diffMin} min`;
    } else if (diffHrs < 24) {
      return `hace ${diffHrs} ${diffHrs === 1 ? 'hora' : 'horas'}`;
    } else if (diffDays === 1) {
      return 'ayer';
    } else {
      return `hace ${diffDays} días`;
    }
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

  // Filtrado y ordenamiento
  const filteredTodos = useMemo(() => {
    // Clonamos el array para evitar mutaciones directas en el estado
    let filtered = [...todos];

    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(s) || (t.description && t.description.toLowerCase().includes(s)));
    }
    if (filterPriority !== 'ALL') filtered = filtered.filter(t => t.priority === filterPriority);
    if (filterSlaStatus !== 'ALL') filtered = filtered.filter(t => getSlaStatus(t) === filterSlaStatus);
    if (filterAssignee === 'MY_TASKS') filtered = filtered.filter(t => t.assigned_to === currentUser?.id);
    else if (filterAssignee !== 'ALL') filtered = filtered.filter(t => t.assigned_to === filterAssignee);

    // Ordenamiento
    filtered.sort((a, b) => {
      let valA, valB;
      if (sortBy === 'created_at') { 
        valA = new Date(a.created_at).getTime(); 
        valB = new Date(b.created_at).getTime(); 
      }
      else if (sortBy === 'priority') {
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

  const priorityStyles = {
    baja: { bg: 'rgba(16,185,129,0.1)', fg: '#10b981', border: '1px solid rgba(16,185,129,0.2)', label: 'Baja', icon: ArrowDown },
    media: { bg: 'rgba(59,130,246,0.1)', fg: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', label: 'Media', icon: Info },
    alta: { bg: 'rgba(249,115,22,0.1)', fg: '#f97316', border: '1px solid rgba(249,115,22,0.2)', label: 'Alta', icon: AlertTriangle },
    urgente: { bg: 'rgba(239,68,68,0.1)', fg: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', label: 'Urgente', icon: ShieldAlert }
  };

  const slaStyles = {
    PLAZO: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', text: 'En Plazo' },
    RIESGO: { bg: 'rgba(249,115,22,0.12)', fg: '#f97316', text: 'En Riesgo' },
    VENCIDO: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444', text: 'Vencido' },
    CUMPLIDO: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', text: 'SLA Cumplido' },
    EXCEDIDO: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444', text: 'SLA Excedido' }
  };

  const renderSlaBar = (todo) => {
    if (todo.status === 'completado') return null;
    const elapsed = getElapsedDays(todo.created_at);
    const total = todo.sla_days;
    let percent = Math.min((elapsed / total) * 100, 100);
    let color = '#10b981';
    if (elapsed > total) {
      percent = 100;
      color = '#ef4444';
    } else if (total - elapsed <= 1) {
      color = '#f97316';
    }
    return (
      <div style={{ height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '2px', marginTop: '10px', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
      </div>
    );
  };

  return (
    <div className="animate-fade" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'linear-gradient(135deg, var(--accent), #1b5e20)', color: 'white', padding: '10px', borderRadius: '14px', boxShadow: '0 4px 12px var(--accent-shadow)' }}>
            <ClipboardList size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Tablero de Tareas</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>Seguimiento de incidentes y solicitudes con SLA</p>
          </div>
        </div>
        <button onClick={openNewForm} style={{
          background: 'linear-gradient(135deg, var(--accent), #1b5e20)',
          color: 'white', border: 'none', padding: '12px 20px', borderRadius: '12px',
          fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
          boxShadow: '0 4px 12px var(--accent-shadow)', transition: 'all 0.2s'
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <Plus size={18} /> Nueva Tarea
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {[
          { icon: ClipboardList, color: 'var(--accent)', bg: 'var(--accent-light)', label: 'Pendientes', value: pendingTodos.length },
          { icon: ShieldAlert, color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Fuera de SLA', value: overdueCount },
          { 
            label: '% SLA Cumplido', 
            value: `${slaMetPercentage}%`,
            render: () => <CircularProgress percentage={slaMetPercentage} size={44} color="#10b981" strokeWidth={4.5} />
          },
          { icon: Clock, color: '#6366f1', bg: '#eef2ff', label: 'Resolución Promedio', value: `${avgResolutionTime} días` }
        ].map((kpi, idx) => (
          <div key={idx} className="bento-card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '14px', minHeight: '85px' }}>
            {kpi.render ? kpi.render() : (
              <div style={{ width: 44, height: 44, borderRadius: '12px', background: kpi.bg, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <kpi.icon size={18} />
              </div>
            )}
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{kpi.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)' }}>{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros y orden */}
      <div className="bento-card" style={{ padding: '14px 20px', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
          <input 
            type="text" placeholder="Buscar tareas..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="premium-input" style={{ width: '100%', padding: '10px 14px' }}
          />
        </div>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="premium-input" style={{ padding: '10px 14px', cursor: 'pointer' }}>
          <option value="ALL">👥 Todos los colaboradores</option>
          <option value="MY_TASKS">👤 Mis tareas</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="premium-input" style={{ padding: '10px 14px', cursor: 'pointer' }}>
          <option value="ALL">🚩 Todas prioridades</option>
          {Object.entries(priorityStyles).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <select value={filterSlaStatus} onChange={e => setFilterSlaStatus(e.target.value)} className="premium-input" style={{ padding: '10px 14px', cursor: 'pointer' }}>
          <option value="ALL">⏳ SLA (Todos)</option>
          <option value="PLAZO">En Plazo</option>
          <option value="RIESGO">En Riesgo</option>
          <option value="VENCIDO">Vencido</option>
          <option value="CUMPLIDO">Cumplido</option>
          <option value="EXCEDIDO">Excedido</option>
        </select>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="premium-input" style={{ padding: '10px', cursor: 'pointer' }}>
            <option value="created_at">Fecha creación</option>
            <option value="priority">Prioridad</option>
            <option value="sla_remaining">Tiempo restante SLA</option>
          </select>
          <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            {sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          </button>
        </div>
      </div>

      {/* Contenido principal: pendientes + historial */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        
        {/* Pendientes */}
        <div className="bento-card" style={{ padding: '24px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '17px', fontWeight: 800, marginBottom: '20px' }}>
            Tareas Pendientes ({filteredPending.length})
          </h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}><RefreshCw className="animate-spin" size={24} style={{ color: 'var(--accent)' }} /></div>
          ) : filteredPending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              <CheckSquare size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontWeight: 500 }}>Sin tareas pendientes.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredPending.map(todo => {
                const slaStat = getSlaStatus(todo);
                const pStyle = priorityStyles[todo.priority] || priorityStyles.media;
                const sStyle = slaStyles[slaStat];
                const assigneeEmail = usuarios.find(u => u.id === todo.assigned_to)?.email || 'Sin asignar';
                const creatorEmail = usuarios.find(u => u.id === todo.user_id)?.email || 'Sistema';

                return (
                  <div key={todo.id} style={{
                    padding: '16px', 
                    background: 'var(--surface)', 
                    borderRadius: '16px',
                    border: `1px solid ${slaStat === 'VENCIDO' ? 'rgba(239,68,68,0.25)' : 'var(--border-light)'}`,
                    display: 'flex', 
                    gap: '12px', 
                    alignItems: 'flex-start', 
                    transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.background = 'var(--surface)';
                  }}
                  >
                    <button onClick={() => toggleStatus(todo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginTop: '2px', transition: 'color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                      title="Completar"
                    ><Square size={20} /></button>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 800, fontSize: '14.5px', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => openEditForm(todo)}>
                          {todo.title}
                        </span>
                        <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: pStyle.bg, color: pStyle.fg, border: pStyle.border, textTransform: 'uppercase' }}>
                          {pStyle.label}
                        </span>
                        <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: sStyle.bg, color: sStyle.fg, textTransform: 'uppercase' }}>
                          {sStyle.text}
                        </span>
                      </div>
                      
                      {todo.description && <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '4px 0 8px 0', lineHeight: 1.4 }}>{todo.description}</p>}
                      
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '11px', color: 'var(--text-secondary)', alignItems: 'center', marginTop: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <UserAvatar email={assigneeEmail} size={18} />
                          <span>Asignado a: <strong style={{ color: 'var(--text-primary)' }}>{assigneeEmail}</strong></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <User size={12} />
                          <span>Creado por: <span>{creatorEmail}</span></span>
                        </div>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> {formatRelativeTime(todo.created_at)}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> SLA {todo.sla_days}d</span>
                      </div>
                      
                      {renderSlaBar(todo)}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                      <button onClick={() => openEditForm(todo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', borderRadius: '6px', transition: 'background-color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="Editar tarea"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => requestDelete(todo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', borderRadius: '6px', transition: 'background-color 0.2s' }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)';
                          e.currentTarget.style.color = '#ef4444';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'var(--text-secondary)';
                        }}
                        title="Eliminar tarea"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Historial completadas */}
        <div className="bento-card" style={{ padding: '24px', opacity: 0.95 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 800, marginBottom: '20px', color: 'var(--text-secondary)' }}>
            Historial Completadas ({filteredCompleted.length})
          </h3>
          {filteredCompleted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
              <CheckCircle size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
              <p>Sin tareas completadas.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredCompleted.map(todo => {
                const slaStat = getSlaStatus(todo);
                const sStyle = slaStyles[slaStat];
                const assigneeEmail = usuarios.find(u => u.id === todo.assigned_to)?.email || 'Sin asignar';
                const creatorEmail = usuarios.find(u => u.id === todo.user_id)?.email || 'Sistema';
                const resDays = getResolutionDays(todo.created_at, todo.completed_at);

                return (
                  <div key={todo.id} style={{
                    padding: '14px', 
                    background: 'rgba(255,255,255,0.15)', 
                    borderRadius: '16px',
                    border: '1px dashed var(--border-light)', 
                    display: 'flex', 
                    gap: '12px', 
                    alignItems: 'flex-start',
                    transition: 'all 0.3s ease',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    opacity: 0.85
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.25)';
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                    e.currentTarget.style.opacity = '0.85';
                  }}
                  >
                    <button onClick={() => toggleStatus(todo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', marginTop: '2px' }}
                      title="Reabrir"
                    >
                      <CheckSquare size={18} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '13.5px', textDecoration: 'line-through', color: 'var(--text-secondary)' }}>{todo.title}</span>
                        <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: sStyle.bg, color: sStyle.fg, textTransform: 'uppercase' }}>
                          {sStyle.text}
                        </span>
                      </div>
                      
                      {todo.description && (
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textDecoration: 'line-through', opacity: 0.7 }}>
                          {todo.description}
                        </p>
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <UserAvatar email={assigneeEmail} size={16} />
                          <span>Asignado: <strong>{assigneeEmail}</strong></span>
                        </div>
                        <span>·</span>
                        <span>Creado por: {creatorEmail}</span>
                        <span>·</span>
                        <span>Resuelta en {resDays} {resDays === 1 ? 'día' : 'días'}</span>
                        <span>·</span>
                        <span>SLA: {todo.sla_days}d</span>
                        {slaStat === 'CUMPLIDO' ? (
                          <span style={{ color: '#10b981', fontWeight: 700 }}>
                            ✓ Cumplió SLA ({todo.sla_days - resDays}d antes)
                          </span>
                        ) : (
                          <span style={{ color: '#ef4444', fontWeight: 700 }}>
                            ⚠️ Excedió SLA por {resDays - todo.sla_days}d
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <button onClick={() => requestDelete(todo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginTop: '2px', padding: '4px', borderRadius: '6px', transition: 'all 0.2s' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)';
                        e.currentTarget.style.color = '#ef4444';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                      title="Eliminar tarea completada"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de formulario (Nueva/Editar) */}
      <Modal isOpen={showForm} onClose={closeForm} title={editingTodo ? 'Editar Tarea' : 'Nueva Tarea'} maxWidth="500px">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Título</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="premium-input" style={{ width: '100%', padding: '10px 12px' }} required placeholder="Nombre descriptivo de la tarea..." />
          </div>
          <div>
            <label style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Descripción</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="premium-input" style={{ width: '100%', padding: '10px 12px', resize: 'none' }} placeholder="Detalles de la tarea..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Prioridad</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="premium-input" style={{ width: '100%', padding: '10px 12px', cursor: 'pointer' }}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div>
              <label style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>SLA (días)</label>
              <select value={slaDays} onChange={e => setSlaDays(Number(e.target.value))} className="premium-input" style={{ width: '100%', padding: '10px 12px', cursor: 'pointer' }}>
                {[1,2,3,5,7,15,30].map(d => <option key={d} value={d}>{d} día{d>1?'s':''}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Asignar a</label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="premium-input" style={{ width: '100%', padding: '10px 12px', cursor: 'pointer' }}>
              <option value="">Sin asignar</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
            <button type="button" onClick={closeForm} className="premium-input" style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.04)', fontWeight: 600, border: '1px solid var(--border-light)', cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" style={{
              padding: '10px 20px', background: 'linear-gradient(135deg, var(--accent), #1b5e20)', color: 'white',
              border: 'none', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px var(--accent-shadow)'
            }}>
              {editingTodo ? 'Guardar Cambios' : 'Crear Tarea'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal de confirmación de eliminación */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmar eliminación" maxWidth="400px">
        <p style={{ marginBottom: '24px', fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)' }}>¿Estás seguro de que querés eliminar permanentemente la tarea <strong>"{deleteTarget?.title}"</strong>?</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={() => setDeleteTarget(null)} className="premium-input" style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.04)', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={confirmDelete} style={{
            padding: '10px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
          }}>Eliminar</button>
        </div>
      </Modal>
    </div>
  );
}
