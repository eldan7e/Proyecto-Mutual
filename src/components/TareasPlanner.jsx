import React, { useState, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, Plus, CheckCircle, Square,
  AlertCircle, Clock, User, Filter, Search, Check, Sparkles, X,
  CalendarDays, ArrowRight, ArrowLeft, Flag
} from 'lucide-react';

// Nombres en español
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEK_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const WEEK_DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Formateador local YYYY-MM-DD para evitar desfasajes horarios UTC
function formatLocalDate(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Formatear títulos de tareas del sistema para que no saturen la tarjeta
function formatTaskTitle(title) {
  if (!title) return '';
  if (title.toUpperCase().includes('VENCIMIENTO BONIFICACION')) {
    const match = title.match(/(\d+)\s*\(([^)]+)\)/);
    if (match) {
      const [_, phone, name] = match;
      const shortName = name.split(',')[0].trim();
      return `Bonif. ${phone} (${shortName})`;
    }
    return title.replace(/VENCIMIENTO BONIFICACION\s*-\s*/i, 'Bonif. ');
  }
  return title;
}

// Avatar con inicial
function PlannerUserAvatar({ email, size = 18 }) {
  if (!email || email === 'Sin asignar') {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: '#e2e8f0', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', color: '#64748b'
      }}>
        <User size={size * 0.55} />
      </div>
    );
  }
  const colors = ['#2e7d32','#1565c0','#c62828','#ad1457','#6a1b9a','#00838f','#00695c','#f57f17','#d84315','#37474f'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const color = colors[Math.abs(hash) % colors.length];
  const initial = email.charAt(0).toUpperCase();
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        backgroundColor: color, color: 'white',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.max(9, Math.floor(size * 0.5)), fontWeight: 700, textTransform: 'uppercase',
        flexShrink: 0
      }}
      title={email}
    >
      {initial}
    </div>
  );
}

// Obtener fecha del planner para una tarea
export function getTodoPlannerDate(todo) {
  if (todo.due_date) {
    return todo.due_date.split('T')[0];
  }
  if (todo.created_at) {
    const created = new Date(todo.created_at);
    created.setDate(created.getDate() + (Number(todo.sla_days) || 3));
    return formatLocalDate(created);
  }
  return null;
}

export default function TareasPlanner({
  todos = [],
  usuarios = [],
  currentUser = null,
  onSelectTodo,
  onNewTask,
  onToggleStatus,
  onReschedule
}) {
  // Estado del mes y año visualizados en el calendario
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDayModal, setSelectedDayModal] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false); // Ocultas por defecto para no saturar los días
  const [dragOverDate, setDragOverDate] = useState(null);
  const [hoveredCardDate, setHoveredCardDate] = useState(null);

  // Filtros internos del planner
  const [plannerSearch, setPlannerSearch] = useState('');
  const [plannerAssignee, setPlannerAssignee] = useState('ALL');
  const [plannerPriority, setPlannerPriority] = useState('ALL');

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Fecha de hoy en formato string YYYY-MM-DD
  const todayStr = useMemo(() => formatLocalDate(new Date()), []);

  // Navegación de meses
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleMonthSelect = (m) => {
    setCurrentDate(new Date(currentYear, Number(m), 1));
  };

  const handleYearSelect = (y) => {
    setCurrentDate(new Date(Number(y), currentMonth, 1));
  };

  // Tareas filtradas para el planner
  const filteredTodos = useMemo(() => {
    return todos.filter(t => {
      // Filtro de completadas
      if (!showCompleted && t.status === 'completado') return false;

      // Filtro de búsqueda
      if (plannerSearch.trim()) {
        const q = plannerSearch.toLowerCase();
        const matchesTitle = t.title?.toLowerCase().includes(q);
        const matchesDesc = t.description?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }

      // Filtro de asignado
      if (plannerAssignee === 'MY_TASKS') {
        if (!t.assigned_to || !t.assigned_to.split(',').includes(currentUser?.id)) return false;
      } else if (plannerAssignee !== 'ALL') {
        if (!t.assigned_to || !t.assigned_to.split(',').includes(plannerAssignee)) return false;
      }

      // Filtro de prioridad
      if (plannerPriority !== 'ALL' && t.priority !== plannerPriority) return false;

      return true;
    });
  }, [todos, showCompleted, plannerSearch, plannerAssignee, plannerPriority, currentUser]);

  // Mapa de tareas agrupadas por fecha (YYYY-MM-DD)
  const tasksByDate = useMemo(() => {
    const map = {};
    for (const todo of filteredTodos) {
      const dateStr = getTodoPlannerDate(todo);
      if (!dateStr) continue;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(todo);
    }
    // Ordenar tareas dentro de cada día: pendientes primero, luego por prioridad
    const priorityWeight = { urgente: 4, alta: 3, media: 2, baja: 1 };
    Object.keys(map).forEach(date => {
      map[date].sort((a, b) => {
        if (a.status === 'completado' && b.status !== 'completado') return 1;
        if (a.status !== 'completado' && b.status === 'completado') return -1;
        return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
      });
    });
    return map;
  }, [filteredTodos]);

  // Cálculo de días a renderizar en la cuadrícula del mes
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    // Lunes = 0, Domingo = 6
    const startWeekdayOffset = (firstDayOfMonth.getDay() + 6) % 7;
    const cells = [];

    // 1. Días del mes anterior
    for (let i = startWeekdayOffset - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(currentYear, currentMonth - 1, dayNum);
      const dateStr = formatLocalDate(prevDate);
      cells.push({
        dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isPrevMonth: true,
        isToday: dateStr === todayStr,
        tasks: tasksByDate[dateStr] || []
      });
    }

    // 2. Días del mes actual
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const curDate = new Date(currentYear, currentMonth, d);
      const dateStr = formatLocalDate(curDate);
      cells.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isPrevMonth: false,
        isToday: dateStr === todayStr,
        tasks: tasksByDate[dateStr] || []
      });
    }

    // 3. Días del próximo mes para completar la cuadrícula (35 o 42 celdas)
    const totalCells = cells.length <= 35 ? 35 : 42;
    const remaining = totalCells - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(currentYear, currentMonth + 1, d);
      const dateStr = formatLocalDate(nextDate);
      cells.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isNextMonth: true,
        isToday: dateStr === todayStr,
        tasks: tasksByDate[dateStr] || []
      });
    }

    return cells;
  }, [currentYear, currentMonth, todayStr, tasksByDate]);

  // Métricas del mes actual en pantalla
  const monthStats = useMemo(() => {
    const prefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const monthTasks = todos.filter(t => {
      const d = getTodoPlannerDate(t);
      return d && d.startsWith(prefix);
    });
    const total = monthTasks.length;
    const completed = monthTasks.filter(t => t.status === 'completado').length;
    const pending = monthTasks.filter(t => t.status === 'pendiente').length;
    const inProcess = monthTasks.filter(t => t.status === 'en_proceso').length;
    const overdue = monthTasks.filter(t => {
      if (t.status === 'completado') return false;
      const d = getTodoPlannerDate(t);
      return d && d < todayStr;
    }).length;

    return { total, completed, pending, inProcess, overdue };
  }, [todos, currentYear, currentMonth, todayStr]);

  // Drag and drop handlers
  const handleDragStart = (e, todo) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ todoId: todo.id, title: todo.title }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, dateStr) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dateStr) {
      setDragOverDate(dateStr);
    }
  };

  const handleDragLeave = (e, dateStr) => {
    if (dragOverDate === dateStr) {
      setDragOverDate(null);
    }
  };

  const handleDrop = (e, targetDateStr) => {
    e.preventDefault();
    setDragOverDate(null);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data?.todoId && onReschedule) {
        onReschedule(data.todoId, targetDateStr);
      }
    } catch (err) {
      console.error('Error en drop:', err);
    }
  };

  // Color de prioridad
  const getPriorityStyle = (priority) => {
    switch (priority) {
      case 'urgente': return { border: '#ef4444', bg: '#fef2f2', text: '#991b1b', dot: '#dc2626', label: 'Urgente' };
      case 'alta': return { border: '#f97316', bg: '#fff7ed', text: '#9a3412', dot: '#ea580c', label: 'Alta' };
      case 'media': return { border: '#3b82f6', bg: '#eff6ff', text: '#1e40af', dot: '#2563eb', label: 'Media' };
      case 'baja': default: return { border: '#22c55e', bg: '#f0fdf4', text: '#166534', dot: '#16a34a', label: 'Baja' };
    }
  };

  // Formatear fecha para el modal de detalle del día
  const formatDayTitle = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* BARRA SUPERIOR DEL PLANNER */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '16px 20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16
      }}>
        {/* Controles de Navegación del Mes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={handlePrevMonth}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#334155',
                transition: 'all 0.15s ease'
              }}
              title="Mes anterior"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={handleToday}
              style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '0 12px',
                height: 36,
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
                cursor: 'pointer'
              }}
              title="Ir al mes y día actual"
            >
              Hoy
            </button>
            <button
              onClick={handleNextMonth}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#334155',
                transition: 'all 0.15s ease'
              }}
              title="Mes siguiente"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Título y Selectores de Mes / Año */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={currentMonth}
              onChange={(e) => handleMonthSelect(e.target.value)}
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#0f172a',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 6,
                outline: 'none'
              }}
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx}>{m}</option>
              ))}
            </select>

            <select
              value={currentYear}
              onChange={(e) => handleYearSelect(e.target.value)}
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#64748b',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 6,
                outline: 'none'
              }}
            >
              {[2024, 2025, 2026, 2027, 2028, 2029].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtros rápidos del Planner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Búsqueda rápida */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 13
          }}>
            <Search size={14} style={{ color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Buscar en el mes..."
              value={plannerSearch}
              onChange={(e) => setPlannerSearch(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 13,
                width: 130
              }}
            />
            {plannerSearch && (
              <button
                onClick={() => setPlannerSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Asignado */}
          <select
            value={plannerAssignee}
            onChange={(e) => setPlannerAssignee(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              fontSize: 13,
              fontWeight: 500,
              color: '#334155',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="ALL">Colaborador: Todos</option>
            <option value="MY_TASKS">Mis asignaciones</option>
            {usuarios.map(u => (
              <option key={u.id} value={u.id}>{u.email.split('@')[0]}</option>
            ))}
          </select>

          {/* Prioridad */}
          <select
            value={plannerPriority}
            onChange={(e) => setPlannerPriority(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              fontSize: 13,
              fontWeight: 500,
              color: '#334155',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="ALL">Prioridad: Todas</option>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>

          {/* Botón toggle completadas */}
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              fontWeight: 600,
              color: showCompleted ? '#2563eb' : '#64748b',
              background: showCompleted ? '#eff6ff' : '#f8fafc',
              padding: '7px 12px',
              borderRadius: 8,
              border: showCompleted ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title={showCompleted ? 'Ocultar tareas completadas del calendario' : 'Mostrar también las tareas ya completadas'}
          >
            <CheckCircle size={14} style={{ color: showCompleted ? '#2563eb' : '#94a3b8' }} />
            <span>{showCompleted ? 'Completadas (visibles)' : 'Ocultando completadas'}</span>
          </button>

          {/* Botón Agendar en Hoy */}
          <button
            onClick={() => onNewTask && onNewTask(todayStr)}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 'none',
              padding: '7px 14px',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37,99,235,0.2)'
            }}
          >
            <Plus size={16} /> Agendar
          </button>
        </div>
      </div>

      {/* STRIP DE MÉTRICAS DEL MES */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 12
      }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: '#eff6ff', color: '#2563eb', padding: 8, borderRadius: 10, display: 'flex' }}>
            <CalendarDays size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Agendadas ({MONTH_NAMES[currentMonth]})</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{monthStats.total}</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: '#fff7ed', color: '#ea580c', padding: 8, borderRadius: 10, display: 'flex' }}>
            <Clock size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Pendientes</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{monthStats.pending}</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: '#e0f2fe', color: '#0369a1', padding: 8, borderRadius: 10, display: 'flex' }}>
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>En Proceso</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{monthStats.inProcess}</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: '#f0fdf4', color: '#16a34a', padding: 8, borderRadius: 10, display: 'flex' }}>
            <CheckCircle size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Completadas</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>{monthStats.completed}</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: monthStats.overdue > 0 ? '#fef2f2' : '#f8fafc', color: monthStats.overdue > 0 ? '#dc2626' : '#94a3b8', padding: 8, borderRadius: 10, display: 'flex' }}>
            <AlertCircle size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Vencidas</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: monthStats.overdue > 0 ? '#dc2626' : '#64748b' }}>{monthStats.overdue}</div>
          </div>
        </div>
      </div>

      {/* CONTENEDOR DEL CALENDARIO: TARJETAS REDONDEADAS POR DÍA */}
      <div style={{
        background: '#ffffff',
        borderRadius: 20,
        border: '1px solid #e2e8f0',
        padding: 16,
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
      }}>
        {/* Cabecera de Días de la Semana (Pills elegantes exactamente alineadas) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 10
        }}>
          {WEEK_DAYS.map((dayName, idx) => (
            <div
              key={dayName}
              style={{
                padding: '9px 4px',
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: idx >= 5 ? '#94a3b8' : '#334155',
                background: '#f8fafc',
                borderRadius: 10,
                border: '1px solid #f1f5f9',
                textTransform: 'uppercase',
                letterSpacing: '0.6px'
              }}
            >
              <span>{dayName}</span>
            </div>
          ))}
        </div>

        {/* Cuadrícula de Tarjetas de Días */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 10
        }}>
          {calendarCells.map((cell) => {
            const isDragTarget = dragOverDate === cell.dateStr;
            const isHovered = hoveredCardDate === cell.dateStr;
            const hasTasks = cell.tasks && cell.tasks.length > 0;
            const maxVisible = 2; // Mostrar máximo 2 para no romper la altura
            const visibleTasks = cell.tasks.slice(0, maxVisible);
            const extraCount = cell.tasks.length - maxVisible;

            // Estilos del cuadrado según si es hoy, mes actual u otro mes
            let cardBg = '#ffffff';
            let cardBorder = '1px solid #e2e8f0';
            let cardShadow = '0 1px 3px rgba(0,0,0,0.02)';
            let cardOpacity = 1;

            if (isDragTarget) {
              cardBg = '#eff6ff';
              cardBorder = '2px dashed #2563eb';
              cardShadow = '0 0 0 3px rgba(37,99,235,0.15)';
            } else if (cell.isToday) {
              cardBg = '#ffffff';
              cardBorder = '2px solid #2563eb';
              cardShadow = '0 4px 14px rgba(37,99,235,0.12)';
            } else if (!cell.isCurrentMonth) {
              cardBg = '#fafbfd';
              cardBorder = '1px dashed #e2e8f0';
              cardOpacity = 0.55;
            }

            return (
              <div
                key={cell.dateStr}
                onMouseEnter={() => setHoveredCardDate(cell.dateStr)}
                onMouseLeave={() => setHoveredCardDate(null)}
                onDragOver={(e) => handleDragOver(e, cell.dateStr)}
                onDragLeave={(e) => handleDragLeave(e, cell.dateStr)}
                onDrop={(e) => handleDrop(e, cell.dateStr)}
                onClick={() => {
                  if (hasTasks) {
                    setSelectedDayModal(cell);
                  } else {
                    onNewTask && onNewTask(cell.dateStr);
                  }
                }}
                style={{
                  minHeight: 135,
                  minWidth: 0, // Evita que se ensanche la columna
                  background: cardBg,
                  border: cardBorder,
                  borderRadius: 14,
                  padding: '10px 10px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  transition: 'all 0.16s ease',
                  boxShadow: isHovered && !cell.isToday ? '0 4px 12px rgba(0,0,0,0.06)' : cardShadow,
                  transform: isHovered && !cell.isToday ? 'translateY(-1px)' : 'none',
                  opacity: cardOpacity,
                  cursor: 'pointer',
                  position: 'relative'
                }}
              >
                {/* Cabecera de la Tarjeta del Día */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minHeight: 26
                }}>
                  {/* Número de día */}
                  <div>
                    {cell.isToday ? (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: '#2563eb',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 800,
                        boxShadow: '0 2px 6px rgba(37,99,235,0.3)'
                      }}>
                        <span>{cell.dayNumber}</span>
                        <span style={{ fontSize: 9.5, letterSpacing: 0.5 }}>HOY</span>
                      </div>
                    ) : (
                      <span style={{
                        fontSize: 14.5,
                        fontWeight: 700,
                        color: cell.isCurrentMonth ? '#1e293b' : '#94a3b8'
                      }}>
                        {cell.dayNumber}
                      </span>
                    )}
                  </div>

                  {/* Acciones del día: Contador y botón '+' en hover */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {hasTasks && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDayModal(cell);
                        }}
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: '#2563eb',
                          background: '#eff6ff',
                          padding: '1px 6px',
                          borderRadius: 8,
                          border: '1px solid #dbeafe',
                          cursor: 'pointer'
                        }}
                        title={`${cell.tasks.length} tareas agendadas`}
                      >
                        {cell.tasks.length}
                      </span>
                    )}

                    {/* Botón '+' solo aparece en hover del día */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewTask && onNewTask(cell.dateStr);
                      }}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: 'none',
                        background: isHovered ? '#eff6ff' : 'transparent',
                        color: isHovered ? '#2563eb' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'all 0.15s ease'
                      }}
                      title={`Agendar para el ${cell.dateStr}`}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>

                {/* Lista de Fichas de Tareas para este día */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  {visibleTasks.map((todo) => {
                    const isCompleted = todo.status === 'completado';
                    const isPastDue = !isCompleted && cell.dateStr < todayStr;
                    const pCol = getPriorityStyle(todo.priority);
                    const assignedIds = todo.assigned_to ? todo.assigned_to.split(',') : [];
                    const assignedUsers = assignedIds.map(id => usuarios.find(u => u.id === id)).filter(Boolean);
                    const cleanTitle = formatTaskTitle(todo.title);

                    return (
                      <div
                        key={todo.id}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, todo)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTodo && onSelectTodo(todo);
                        }}
                        style={{
                          background: isCompleted ? '#f8fafc' : pCol.bg,
                          border: `1px solid ${isPastDue ? '#fca5a5' : '#e2e8f0'}`,
                          borderLeft: `3px solid ${isPastDue ? '#dc2626' : pCol.border}`,
                          borderRadius: 7,
                          padding: '3px 6px',
                          fontSize: 11,
                          cursor: 'grab',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          transition: 'all 0.15s ease',
                          opacity: isCompleted ? 0.65 : 1,
                          minWidth: 0
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        title={todo.title}
                      >
                        {/* Checkbox rápido */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleStatus && onToggleStatus(todo);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: isCompleted ? '#16a34a' : '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0
                          }}
                          title={isCompleted ? 'Reabrir' : 'Completar'}
                        >
                          {isCompleted ? <CheckCircle size={12} /> : <Square size={12} />}
                        </button>

                        {/* Título de la tarea estilizado */}
                        <span
                          style={{
                            fontWeight: 600,
                            color: isCompleted ? '#64748b' : pCol.text,
                            textDecoration: isCompleted ? 'line-through' : 'none',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1,
                            minWidth: 0
                          }}
                        >
                          {cleanTitle}
                        </span>

                        {isPastDue && (
                          <AlertCircle size={11} style={{ color: '#dc2626', flexShrink: 0 }} title="Vencida" />
                        )}

                        {assignedUsers.length > 0 && (
                          <PlannerUserAvatar email={assignedUsers[0].email} size={15} />
                        )}
                      </div>
                    );
                  })}

                  {/* Botón "+X más..." si hay muchas tareas */}
                  {extraCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDayModal(cell);
                      }}
                      style={{
                        background: '#eff6ff',
                        border: '1px solid #dbeafe',
                        borderRadius: 6,
                        padding: '3px 6px',
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: '#2563eb',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 1,
                        width: '100%'
                      }}
                    >
                      <span>+{extraCount} más</span>
                      <ArrowRight size={10} />
                    </button>
                  )}

                  {/* Estado vacío con prompt suave en hover */}
                  {!hasTasks && isHovered && (
                    <div style={{
                      margin: 'auto 0 0 0',
                      fontSize: 10.5,
                      color: '#94a3b8',
                      textAlign: 'center',
                      padding: '4px 0',
                      fontWeight: 500
                    }}>
                      + Agendar
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL DETALLE DEL DÍA */}
      {selectedDayModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            maxWidth: 580,
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}>
            {/* Header Modal Día */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>
                  {formatDayTitle(selectedDayModal.dateStr)}
                </h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {selectedDayModal.tasks?.length || 0} solicitudes agendadas
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => {
                    const date = selectedDayModal.dateStr;
                    setSelectedDayModal(null);
                    onNewTask && onNewTask(date);
                  }}
                  style={{
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Plus size={14} /> Agendar tarea
                </button>
                <button
                  onClick={() => setSelectedDayModal(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: 4,
                    borderRadius: 6
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Lista de Tareas del Día */}
            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedDayModal.tasks?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8' }}>
                  <Calendar size={36} style={{ opacity: 0.4, marginBottom: 8 }} />
                  <p style={{ margin: 0, fontSize: 14 }}>No hay tareas agendadas para este día.</p>
                </div>
              ) : (
                selectedDayModal.tasks.map(t => {
                  const isCompleted = t.status === 'completado';
                  const pCol = getPriorityStyle(t.priority);
                  const assignedIds = t.assigned_to ? t.assigned_to.split(',') : [];
                  const assignedUsers = assignedIds.map(id => usuarios.find(u => u.id === id)).filter(Boolean);

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedDayModal(null);
                        onSelectTodo && onSelectTodo(t);
                      }}
                      style={{
                        padding: '12px 14px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderLeft: `4px solid ${pCol.border}`,
                        borderRadius: 10,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStatus && onToggleStatus(t);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: isCompleted ? '#16a34a' : '#94a3b8',
                          marginTop: 2,
                          padding: 0
                        }}
                      >
                        {isCompleted ? <CheckCircle size={18} /> : <Square size={18} />}
                      </button>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: pCol.bg,
                            color: pCol.text
                          }}>
                            {pCol.label}
                          </span>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: isCompleted ? '#dcfce7' : t.status === 'en_proceso' ? '#e0f2fe' : '#ffedd5',
                            color: isCompleted ? '#166534' : t.status === 'en_proceso' ? '#0369a1' : '#9a3412'
                          }}>
                            {isCompleted ? 'Completada' : t.status === 'en_proceso' ? 'En Proceso' : 'Pendiente'}
                          </span>
                        </div>

                        <div style={{
                          fontWeight: 600,
                          fontSize: 14,
                          color: '#0f172a',
                          textDecoration: isCompleted ? 'line-through' : 'none',
                          marginBottom: t.description ? 4 : 0
                        }}>
                          {t.title}
                        </div>

                        {t.description && (
                          <div style={{
                            fontSize: 12,
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {t.description}
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 11.5, color: '#64748b' }}>
                          <span>SLA: {t.sla_days} días</span>
                          {assignedUsers.length > 0 ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <PlannerUserAvatar email={assignedUsers[0].email} size={16} />
                              {assignedUsers.map(u => u.email.split('@')[0]).join(', ')}
                            </span>
                          ) : (
                            <span>Sin asignar</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Modal Día */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
              <button
                onClick={() => setSelectedDayModal(null)}
                style={{
                  padding: '6px 16px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 12.5,
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
