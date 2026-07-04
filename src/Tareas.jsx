import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import {
  CheckSquare, Calendar, Clock, AlertTriangle, Plus, Trash2, Check,
  RefreshCw, AlertCircle, ClipboardList, TrendingUp, Info, ChevronDown,
  CheckCircle, ShieldAlert, Square, User, UserCheck, Users, X,
  Edit3, Filter, SlidersHorizontal, ArrowUp, ArrowDown, Zap,
  Eye, MoreHorizontal, Link, Search, UserPlus, Copy
} from 'lucide-react';
import { useToast } from './components/ui/ToastProvider';
import Modal from './components/Modal';

// ---------- SUBCOMPONENTES ----------

// Avatar con inicial
function UserAvatar({ email, size = 24 }) {
  if (!email || email === 'Sin asignar') {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'rgba(0,0,0,0.04)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#94a3b8', border: '1px solid #e2e8f0'
      }}>
        <User size={size * 0.5} />
      </div>
    );
  }
  const colors = ['#2e7d32','#1565c0','#c62828','#ad1457','#6a1b9a','#00838f','#00695c','#f57f17','#d84315','#37474f'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const color = colors[Math.abs(hash) % colors.length];
  const initial = email.charAt(0).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: color, color: 'white',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, fontWeight: 700, textTransform: 'uppercase',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }} title={email}>
      {initial}
    </div>
  );
}

// Barra de progreso SLA
function SlaProgress({ todo, size = 'small' }) {
  if (todo.status === 'completado') return null;
  const elapsed = Math.floor((new Date() - new Date(todo.created_at)) / (1000*60*60*24));
  const total = todo.sla_days;
  let percent = Math.min((elapsed / total) * 100, 100);
  let color = '#22c55e';
  if (elapsed > total) { percent = 100; color = '#dc2626'; }
  else if (total - elapsed <= 1) color = '#f97316';
  const height = size === 'small' ? 4 : 8;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ flex: 1, height, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: color, whiteSpace: 'nowrap' }}>
        {elapsed > total ? 'Vencido' : `${total - elapsed}d rest.`}
      </span>
    </div>
  );
}

// Badge de prioridad
function PriorityBadge({ priority }) {
  const map = {
    baja: { bg: '#dcfce7', text: '#166534', label: 'Baja' },
    media: { bg: '#dbeafe', text: '#1e40af', label: 'Media' },
    alta: { bg: '#ffedd5', text: '#9a3412', label: 'Alta' },
    urgente: { bg: '#fee2e2', text: '#991b1b', label: 'Urgente' }
  };
  const style = map[priority] || map.media;
  return (
    <span style={{
      background: style.bg, color: style.text,
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
      display: 'inline-block'
    }}>{style.label}</span>
  );
}

// Badge de estado SLA
function SlaBadge({ status }) {
  const map = {
    PLAZO: { bg: '#dcfce7', text: '#166534', label: 'En plazo' },
    RIESGO: { bg: '#ffedd5', text: '#9a3412', label: 'En riesgo' },
    VENCIDO: { bg: '#fee2e2', text: '#991b1b', label: 'Vencido' },
    CUMPLIDO: { bg: '#dcfce7', text: '#166534', label: 'SLA cumplido' },
    EXCEDIDO: { bg: '#fee2e2', text: '#991b1b', label: 'SLA excedido' }
  };
  const style = map[status] || map.PLAZO;
  return (
    <span style={{
      background: style.bg, color: style.text,
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      display: 'inline-block'
    }}>{style.label}</span>
  );
}

// ---------- COMPONENTE PRINCIPAL ----------
export default function Tareas() {
  const { addToast } = useToast();
  const [todos, setTodos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Estado del formulario
  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('media');
  const [slaDays, setSlaDays] = useState(3);
  const [assignedTo, setAssignedTo] = useState('');

  // Confirmación de eliminación
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Detalle de ticket seleccionado
  const [selectedTodo, setSelectedTodo] = useState(null);

  // Filtros y orden
  const [activeTab, setActiveTab] = useState('pendientes'); // 'pendientes' | 'historial'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterSlaStatus, setFilterSlaStatus] = useState('ALL');
  const [filterAssignee, setFilterAssignee] = useState('ALL'); // 'ALL' | 'MY_TASKS' | userId
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Debounce búsqueda
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

  // Helpers de tiempo
  const getElapsedDays = (createdAt) => {
    return Math.floor((new Date() - new Date(createdAt)) / (1000*60*60*24));
  };
  const getResolutionDays = (createdAt, completedAt) => {
    return Math.floor((new Date(completedAt) - new Date(createdAt)) / (1000*60*60*24));
  };
  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 60) return 'hace un momento';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `hace ${diffHrs} h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return 'ayer';
    return `hace ${diffDays} días`;
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
  const avgResolution = completedTodos.length
    ? (completedTodos.reduce((acc, t) => acc + getResolutionDays(t.created_at, t.completed_at), 0) / completedTodos.length).toFixed(1)
    : '0';

  // Filtrado y ordenamiento (base)
  const filteredTodos = useMemo(() => {
    let filtered = [...todos];
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(s) ||
        (t.description && t.description.toLowerCase().includes(s))
      );
    }
    if (filterPriority !== 'ALL') filtered = filtered.filter(t => t.priority === filterPriority);
    if (filterSlaStatus !== 'ALL') filtered = filtered.filter(t => getSlaStatus(t) === filterSlaStatus);
    if (filterAssignee === 'MY_TASKS') {
      filtered = filtered.filter(t => t.assigned_to && t.assigned_to.split(',').includes(currentUser?.id));
    } else if (filterAssignee !== 'ALL') {
      filtered = filtered.filter(t => t.assigned_to && t.assigned_to.split(',').includes(filterAssignee));
    }

    filtered.sort((a, b) => {
      let valA, valB;
      if (sortBy === 'created_at') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      } else if (sortBy === 'priority') {
        const order = { urgente:4, alta:3, media:2, baja:1 };
        valA = order[a.priority] || 0;
        valB = order[b.priority] || 0;
      } else if (sortBy === 'sla_remaining') {
        valA = a.status === 'pendiente' ? a.sla_days - getElapsedDays(a.created_at) : 999;
        valB = b.status === 'pendiente' ? b.sla_days - getElapsedDays(b.created_at) : 999;
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
    return filtered;
  }, [todos, debouncedSearch, filterPriority, filterSlaStatus, filterAssignee, sortBy, sortOrder, currentUser]);

  // Separar por pestaña
  const displayTodos = useMemo(() => {
    if (activeTab === 'pendientes') return filteredTodos.filter(t => t.status === 'pendiente');
    else return filteredTodos.filter(t => t.status === 'completado');
  }, [filteredTodos, activeTab]);

  // Acciones
  const openNewForm = () => {
    setEditingTodo(null);
    setTitle(''); setDescription(''); setPriority('media'); setSlaDays(3); setAssignedTo('');
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
      addToast('Tarea eliminada.', 'success');
    } catch (err) {
      addToast('Error al eliminar.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Render de fila (compartido entre pestañas)
  const renderTaskRow = (todo) => {
    const slaStatus = getSlaStatus(todo);
    const assignedIds = todo.assigned_to ? todo.assigned_to.split(',') : [];
    const assignedUsers = assignedIds.map(id => usuarios.find(u => u.id === id)).filter(Boolean);
    const creatorEmail = usuarios.find(u => u.id === todo.user_id)?.email || 'Sistema';
    const isCompleted = todo.status === 'completado';

    return (
      <div
        key={todo.id}
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 100px 1fr 140px 140px 120px 80px',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          background: '#ffffff',
          borderRadius: 8,
          borderLeft: `4px solid ${
            todo.priority === 'urgente' ? '#dc2626' :
            todo.priority === 'alta' ? '#f97316' :
            todo.priority === 'media' ? '#3b82f6' : '#22c55e'
          }`,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          transition: 'all 0.15s ease',
          cursor: 'pointer',
          marginBottom: 4
        }}
        onClick={() => setSelectedTodo(todo)}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {/* Checkbox / estado */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); toggleStatus(todo); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: isCompleted ? '#22c55e' : '#94a3b8'
            }}
            title={isCompleted ? 'Reabrir' : 'Completar'}
          >
            {isCompleted ? <CheckCircle size={20} /> : <Square size={20} />}
          </button>
        </div>

        {/* Prioridad */}
        <PriorityBadge priority={todo.priority} />

        {/* Título + descripción corta */}
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isCompleted && <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{todo.title}</span>}
            {!isCompleted && todo.title}
            {todo.description && (
              <span
                style={{ color: '#94a3b8', fontSize: 12, cursor: 'help' }}
                title={todo.description}
              >
                <Info size={14} />
              </span>
            )}
          </div>
          {todo.description && (
            <div style={{
              fontSize: 12, color: '#64748b', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300
            }}>
              {todo.description}
            </div>
          )}
        </div>

        {/* Asignado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            {assignedUsers.map((u, i) => (
              <div key={u.id} style={{ marginLeft: i > 0 ? -10 : 0, zIndex: 10 - i }}>
                <UserAvatar email={u.email} size={24} />
              </div>
            ))}
            {assignedUsers.length === 0 && (
              <UserAvatar email={null} size={24} />
            )}
          </div>
          <span 
            style={{ fontSize: 12, fontWeight: 500, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}
            title={assignedUsers.map(u => u.email).join(', ')}
          >
            {assignedUsers.length === 0 ? 'Sin asignar' : 
             assignedUsers.length === 1 ? assignedUsers[0].email.split('@')[0] : 
             `${assignedUsers.length} personas`}
          </span>
        </div>

        {/* SLA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {isCompleted ? (
            <span style={{ fontSize: 12, fontWeight: 500, color: '#475569' }}>
              Resuelto en {getResolutionDays(todo.created_at, todo.completed_at)}d
            </span>
          ) : (
            <SlaProgress todo={todo} />
          )}
          <SlaBadge status={slaStatus} />
        </div>

        {/* Fecha */}
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {formatRelativeTime(todo.created_at)}
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button
            onClick={(e) => { e.stopPropagation(); openEditForm(todo); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Editar"
          >
            <Edit3 size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); requestDelete(todo); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 4 }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
            title="Eliminar"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* CABECERA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardList size={28} style={{ color: '#2563eb' }} />
            Tablero de Gestión
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
            {pendingTodos.length} pendientes · {completedTodos.length} completadas
          </p>
        </div>
        <button
          onClick={openNewForm}
          style={{
            background: '#2563eb', color: 'white', border: 'none',
            padding: '10px 20px', borderRadius: 8, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
            transition: '0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <Plus size={18} /> Nueva Solicitud
        </button>
      </div>

      {/* KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '20px',
        marginBottom: '24px'
      }}>
        {/* Card 1: Pendientes */}
        <div 
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '24px',
            padding: '20px 24px',
            boxShadow: 'var(--shadow-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            cursor: 'default'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = 'var(--shadow-premium)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
          }}
        >
          <div style={{ background: '#e3f2fd', color: '#1565c0', padding: '12px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Pendientes
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {pendingTodos.length}
            </div>
            <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px', fontWeight: 500 }}>
              ▲ 0% vs semana ant.
            </div>
          </div>
        </div>

        {/* Card 2: Fuera de SLA */}
        <div 
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '24px',
            padding: '20px 24px',
            boxShadow: 'var(--shadow-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            cursor: 'default'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = 'var(--shadow-premium)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
          }}
        >
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Fuera de SLA
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: overdueCount > 0 ? '#dc2626' : 'var(--text-primary)', lineHeight: 1.1 }}>
              {overdueCount}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>
              {pendingTodos.length > 0 ? `${Math.round((overdueCount / pendingTodos.length) * 100)}% del total` : '0%'}
            </div>
          </div>
        </div>

        {/* Card 3: % SLA Cumplido */}
        <div 
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '24px',
            padding: '20px 24px',
            boxShadow: 'var(--shadow-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            cursor: 'default'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = 'var(--shadow-premium)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
          }}
        >
          <div style={{ background: '#dcfce7', color: '#166534', padding: '12px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              % SLA Cumplido
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {slaMetPercentage}%
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>
              {slaMetCount}/{completedTodos.length} cumplidas
            </div>
          </div>
        </div>

        {/* Card 4: Resolución Promedio */}
        <div 
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '24px',
            padding: '20px 24px',
            boxShadow: 'var(--shadow-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            cursor: 'default'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = 'var(--shadow-premium)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
          }}
        >
          <div style={{ background: '#f1f5f9', color: '#475569', padding: '12px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Resolución Promedio
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {avgResolution} días
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>
              últimas {completedTodos.length} tareas
            </div>
          </div>
        </div>
      </div>

      {/* FILTROS */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        marginBottom: 20, background: '#ffffff', padding: '12px 16px',
        borderRadius: 10, border: '1px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px' }}>
          <Search size={16} style={{ color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Buscar por título, descripción..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              border: 'none', outline: 'none', flex: 1, padding: '6px 0',
              fontSize: 14, background: 'transparent'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setFilterAssignee('ALL')}
            style={{
              padding: '4px 12px', borderRadius: 16, border: '1px solid #e2e8f0',
              background: filterAssignee === 'ALL' ? '#e2e8f0' : 'transparent',
              fontSize: 12, fontWeight: 500, cursor: 'pointer'
            }}
          >Todos</button>
          <button
            onClick={() => setFilterAssignee('MY_TASKS')}
            style={{
              padding: '4px 12px', borderRadius: 16, border: '1px solid #e2e8f0',
              background: filterAssignee === 'MY_TASKS' ? '#e2e8f0' : 'transparent',
              fontSize: 12, fontWeight: 500, cursor: 'pointer'
            }}
          >Mis tareas</button>
          <select
            value={filterAssignee !== 'ALL' && filterAssignee !== 'MY_TASKS' ? filterAssignee : ''}
            onChange={e => setFilterAssignee(e.target.value || 'ALL')}
            style={{
              padding: '3px 8px', borderRadius: 16, border: '1px solid #e2e8f0',
              background: filterAssignee !== 'ALL' && filterAssignee !== 'MY_TASKS' ? '#e2e8f0' : 'transparent',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none'
            }}
          >
            <option value="">Colaborador...</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.email.split('@')[0]}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['ALL','baja','media','alta','urgente'].map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              style={{
                padding: '4px 10px', borderRadius: 16, border: '1px solid #e2e8f0',
                background: filterPriority === p ? '#e2e8f0' : 'transparent',
                fontSize: 12, fontWeight: 500, cursor: 'pointer'
              }}
            >{p === 'ALL' ? 'Prioridad' : p}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['ALL','PLAZO','RIESGO','VENCIDO'].map(s => (
            <button
              key={s}
              onClick={() => setFilterSlaStatus(s)}
              style={{
                padding: '4px 10px', borderRadius: 16, border: '1px solid #e2e8f0',
                background: filterSlaStatus === s ? '#e2e8f0' : 'transparent',
                fontSize: 12, fontWeight: 500, cursor: 'pointer'
              }}
            >{s === 'ALL' ? 'SLA' : s}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}
          >
            <option value="created_at">Fecha</option>
            <option value="priority">Prioridad</option>
            <option value="sla_remaining">SLA restante</option>
          </select>
          <button
            onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
          >
            {sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </button>
        </div>
      </div>

      {/* PESTAÑAS */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('pendientes')}
          style={{
            padding: '10px 20px', background: 'none', border: 'none',
            fontSize: 14, fontWeight: 600, color: activeTab === 'pendientes' ? '#2563eb' : '#64748b',
            borderBottom: activeTab === 'pendientes' ? '2px solid #2563eb' : '2px solid transparent',
            cursor: 'pointer', transition: '0.2s'
          }}
        >
          Pendientes ({pendingTodos.length})
        </button>
        <button
          onClick={() => setActiveTab('historial')}
          style={{
            padding: '10px 20px', background: 'none', border: 'none',
            fontSize: 14, fontWeight: 600, color: activeTab === 'historial' ? '#2563eb' : '#64748b',
            borderBottom: activeTab === 'historial' ? '2px solid #2563eb' : '2px solid transparent',
            cursor: 'pointer', transition: '0.2s'
          }}
        >
          Historial ({completedTodos.length})
        </button>
      </div>

      {/* LISTA DE TAREAS */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <RefreshCw className="animate-spin" size={32} style={{ color: '#2563eb' }} />
        </div>
      ) : displayTodos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <ClipboardList size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontWeight: 500 }}>No hay tareas {activeTab === 'pendientes' ? 'pendientes' : 'completadas'}.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Encabezado de columnas (solo visual) */}
          <div style={{
            display: 'grid', gridTemplateColumns: '40px 100px 1fr 140px 140px 120px 80px',
            gap: 12, padding: '0 16px 8px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5
          }}>
            <span>Estado</span>
            <span>Prioridad</span>
            <span>Título</span>
            <span>Asignado</span>
            <span>SLA</span>
            <span>Fecha</span>
            <span style={{ textAlign: 'right' }}>Acciones</span>
          </div>
          {displayTodos.map(todo => renderTaskRow(todo))}
        </div>
      )}

      {/* MODAL FORMULARIO */}
      <Modal isOpen={showForm} onClose={closeForm} title={editingTodo ? 'Editar Solicitud' : 'Nueva Solicitud'} maxWidth="720px">
        <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Columna izquierda: campos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>Título *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="premium-input"
                style={{ width: '100%', padding: '8px 12px', marginTop: 4 }}
                placeholder="Ej: Cargar grupo en Credicoop"
                required
              />
            </div>
            <div>
              <label style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>Descripción</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                className="premium-input"
                style={{ width: '100%', padding: '8px 12px', marginTop: 4, resize: 'vertical' }}
                placeholder="Detalles adicionales..."
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>Prioridad</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="premium-input"
                  style={{ width: '100%', padding: '8px 12px', marginTop: 4 }}
                >
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>SLA (días)</label>
                <select
                  value={slaDays}
                  onChange={e => setSlaDays(Number(e.target.value))}
                  className="premium-input"
                  style={{ width: '100%', padding: '8px 12px', marginTop: 4 }}
                >
                  {[1,2,3,5,7,15,30].map(d => <option key={d} value={d}>{d} día{d>1?'s':''}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontWeight: 600, fontSize: 12, color: '#475569', display: 'block', marginBottom: '6px' }}>Asignar a (uno o más)</label>
              <div style={{
                maxHeight: '120px',
                overflowY: 'auto',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
                background: 'white',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {usuarios.map(u => {
                  const isChecked = assignedTo ? assignedTo.split(',').includes(u.id) : false;
                  return (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: '#334155' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const currentIds = assignedTo ? assignedTo.split(',') : [];
                          let newIds;
                          if (e.target.checked) {
                            newIds = [...currentIds, u.id];
                          } else {
                            newIds = currentIds.filter(id => id !== u.id);
                          }
                          setAssignedTo(newIds.join(','));
                        }}
                      />
                      <span>{u.email}</span>
                    </label>
                  );
                })}
                {usuarios.length === 0 && <span style={{ fontSize: '12px', color: '#94a3b8' }}>No hay colaboradores disponibles</span>}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" onClick={closeForm} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button type="submit" style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                {editingTodo ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>

          {/* Columna derecha: Preview */}
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 0, marginBottom: 12 }}>Vista previa</p>
            <div style={{
              padding: 12, borderRadius: 8, background: '#ffffff',
              borderLeft: `4px solid ${
                priority === 'urgente' ? '#dc2626' :
                priority === 'alta' ? '#f97316' :
                priority === 'media' ? '#3b82f6' : '#22c55e'
              }`,
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <PriorityBadge priority={priority} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{title || 'Título de la tarea'}</span>
              </div>
              {description && (
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{description}</div>
              )}
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#94a3b8' }}>
                <span>Asignado: {assignedTo ? usuarios.find(u => u.id === assignedTo)?.email || '—' : 'Sin asignar'}</span>
                <span>SLA: {slaDays} días</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <SlaProgress todo={{ status: 'pendiente', created_at: new Date().toISOString(), sla_days: slaDays }} size="small" />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL ELIMINAR */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Eliminar solicitud" maxWidth="400px">
        <p style={{ marginBottom: 24, color: '#0f172a' }}>
          ¿Estás seguro de eliminar la tarea <strong>"{deleteTarget?.title}"</strong>? Esta acción no se puede deshacer.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => setDeleteTarget(null)} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={confirmDelete} style={{ padding: '8px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Eliminar</button>
        </div>
      </Modal>

      {/* MODAL DETALLE DE SOLICITUD */}
      <Modal 
        isOpen={!!selectedTodo} 
        onClose={() => setSelectedTodo(null)} 
        title="Detalle de la Solicitud" 
        maxWidth="600px"
      >
        {selectedTodo && (() => {
          const assignedIds = selectedTodo.assigned_to ? selectedTodo.assigned_to.split(',') : [];
          const assignedUsers = assignedIds.map(id => usuarios.find(u => u.id === id)).filter(Boolean);
          const creatorEmail = usuarios.find(u => u.id === selectedTodo.user_id)?.email || 'Sistema';
          const slaStatus = getSlaStatus(selectedTodo);
          const isCompleted = selectedTodo.status === 'completado';
          const elapsed = getElapsedDays(selectedTodo.created_at);
          const total = selectedTodo.sla_days;
          
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Encabezado */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
                    {selectedTodo.title}
                  </h2>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <PriorityBadge priority={selectedTodo.priority} />
                    <SlaBadge status={slaStatus} />
                  </div>
                </div>
              </div>

              {/* Descripción con botón de copiar */}
              {selectedTodo.description && (
                <div style={{ 
                  background: '#f8fafc', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px', 
                  padding: '12px 16px',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Descripción / Datos</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(selectedTodo.description);
                        addToast('Copiado al portapapeles', 'success');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563eb',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Copy size={12} /> Copiar texto
                    </button>
                  </div>
                  <p style={{ 
                    fontSize: '13px', 
                    color: '#334155', 
                    margin: 0, 
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {selectedTodo.description}
                  </p>
                </div>
              )}

              {/* Grid de Metadatos */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '16px',
                borderTop: '1px solid #f1f5f9',
                paddingTop: '16px'
              }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '6px' }}>Asignado a</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {assignedUsers.map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserAvatar email={u.email} size={28} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>{u.email}</span>
                      </div>
                    ))}
                    {assignedUsers.length === 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserAvatar email={null} size={28} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>Sin asignar</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Creado por</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserAvatar email={creatorEmail} size={28} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>{creatorEmail}</span>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Fecha de creación</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155', fontWeight: 500 }}>
                    <Calendar size={14} style={{ color: '#64748b' }} />
                    <span>{new Date(selectedTodo.created_at).toLocaleString('es-AR')}</span>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>SLA / Plazo</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>
                      {selectedTodo.sla_days} días de plazo
                    </span>
                    {!isCompleted && (
                      <span style={{ fontSize: '11px', color: elapsed > total ? '#dc2626' : '#64748b' }}>
                        {elapsed > total ? `Vencido por ${elapsed - total}d` : `${total - elapsed} días restantes`}
                      </span>
                    )}
                  </div>
                </div>
                
                {isCompleted && selectedTodo.completed_at && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Fecha de resolución</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#22c55e', fontWeight: 600 }}>
                      <CheckCircle size={14} />
                      <span>{new Date(selectedTodo.completed_at).toLocaleString('es-AR')} (Resuelto en {getResolutionDays(selectedTodo.created_at, selectedTodo.completed_at)} días)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Botones de acción inferiores */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: '8px', 
                borderTop: '1px solid #f1f5f9',
                paddingTop: '16px',
                marginTop: '8px'
              }}>
                <button
                  onClick={() => {
                    const t = selectedTodo;
                    setSelectedTodo(null);
                    toggleStatus(t);
                  }}
                  style={{
                    padding: '8px 16px',
                    background: isCompleted ? '#f1f5f9' : '#e6f7e6',
                    color: isCompleted ? '#475569' : '#2e7d32',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isCompleted ? <RefreshCw size={14} /> : <Check size={14} />}
                  {isCompleted ? 'Reabrir Solicitud' : 'Marcar Completada'}
                </button>

                <button
                  onClick={() => {
                    const t = selectedTodo;
                    setSelectedTodo(null);
                    openEditForm(t);
                  }}
                  style={{
                    padding: '8px 16px',
                    background: '#e3f2fd',
                    color: '#1e3a8a',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Edit3 size={14} /> Editar
                </button>

                <button
                  onClick={() => {
                    const t = selectedTodo;
                    setSelectedTodo(null);
                    requestDelete(t);
                  }}
                  style={{
                    padding: '8px 16px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 size={14} /> Eliminar
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTodo(null)}
                  style={{
                    padding: '8px 16px',
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Cerrar
                </button>
              </div>

            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
