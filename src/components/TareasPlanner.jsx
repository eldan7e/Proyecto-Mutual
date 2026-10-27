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

// Avatar con inicial
function PlannerUserAvatar({ email, size = 20 }) {
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
    // Si viene en formato YYYY-MM-DD o ISO
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
  const [selectedDayModal, setSelectedDayModal] = useState(null); // Para modal detalle del día
  const [showCompleted, setShowCompleted] = useState(true);
  const [dragOverDate, setDragOverDate] = useState(null);

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

    // En JS getDay(): 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    // Ajustamos para que la semana empiece el Lunes (0 = Lunes, 6 = Domingo)
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

  // Métricas específicas del mes actual en pantalla
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
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgente': return { border: '#dc2626', bg: '#fef2f2', text: '#991b1b', label: 'Urgente' };
      case 'alta': return { border: '#ea580c', bg: '#fff7ed', text: '#9a3412', label: 'Alta' };
      case 'media': return { border: '#2563eb', bg: '#eff6ff', text: '#1e40af', label: 'Media' };
      case 'baja': default: return { border: '#16a34a', bg: '#f0fdf4', text: '#166534', label: 'Baja' };
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                width: 140
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
            <option value="ALL">Todos los colaboradores</option>
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
            <option value="ALL">Todas las prioridades</option>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>

          {/* Toggle completadas */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            fontWeight: 500,
            color: '#475569',
            cursor: 'pointer',
            userSelect: 'none',
            background: showCompleted ? '#f1f5f9' : 'transparent',
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #e2e8f0'
          }}>
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Completadas</span>
          </label>

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

      {/* CUADRÍCULA DEL CALENDARIO */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
      }}>
        {/* Cabecera de Días de la Semana */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0'
        }}>
          {WEEK_DAYS.map((dayName, idx) => (
            <div
              key={dayName}
              style={{
                padding: '12px 8px',
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: idx >= 5 ? '#94a3b8' : '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.6px'
              }}
            >
              <span>{dayName}</span>
            </div>
          ))}
        </div>

        {/* Celdas de los Días */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: '#e2e8f0', // Color para líneas de rejilla
          gap: 1
        }}>
          {calendarCells.map((cell) => {
            const isDragTarget = dragOverDate === cell.dateStr;
            const hasTasks = cell.tasks && cell.tasks.length > 0;
            const maxVisible = 3;
            const visibleTasks = cell.tasks.slice(0, maxVisible);
            const extraCount = cell.tasks.length - maxVisible;

            return (
              <div
                key={cell.dateStr}
                onDragOver={(e) => handleDragOver(e, cell.dateStr)}
                onDragLeave={(e) => handleDragLeave(e, cell.dateStr)}
                onDrop={(e) => handleDrop(e, cell.dateStr)}
                style={{
                  minHeight: 125,
                  background: isDragTarget
                    ? '#eff6ff'
                    : cell.isCurrentMonth
                      ? '#ffffff'
                      : '#fbfcfd',
                  padding: '8px 8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'background-color 0.15s ease',
                  border: isDragTarget ? '2px dashed #2563eb' : 'none',
                  position: 'relative'
                }}
              >
                {/* Cabecera del Día */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 2
                }}>
                  {/* Número de día y badge 'Hoy' */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      onClick={() => hasTasks && setSelectedDayModal(cell)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12.5,
                        fontWeight: cell.isToday ? 800 : cell.isCurrentMonth ? 600 : 400,
                        color: cell.isToday
                          ? '#ffffff'
                          : cell.isCurrentMonth
                            ? '#0f172a'
                            : '#94a3b8',
                        background: cell.isToday ? '#2563eb' : 'transparent',
                        cursor: hasTasks ? 'pointer' : 'default',
                        boxShadow: cell.isToday ? '0 2px 6px rgba(37,99,235,0.35)' : 'none'
                      }}
                    >
                      {cell.dayNumber}
                    </span>

                    {cell.isToday && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#2563eb',
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px'
                      }}>
                        Hoy
                      </span>
                    )}
                  </div>

                  {/* Acciones del día: Contador y Botón rápido '+' */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {hasTasks && (
                      <span
                        onClick={() => setSelectedDayModal(cell)}
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: '#64748b',
                          background: '#f1f5f9',
                          padding: '1px 6px',
                          borderRadius: 10,
                          cursor: 'pointer'
                        }}
                        title={`${cell.tasks.length} tarea(s)`}
                      >
                        {cell.tasks.length}
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewTask && onNewTask(cell.dateStr);
                      }}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        color: '#94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#eff6ff';
                        e.currentTarget.style.color = '#2563eb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#94a3b8';
                      }}
                      title={`Agendar para el ${cell.dateStr}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* Lista de Fichas de Tareas para este día */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  {visibleTasks.map((todo) => {
                    const isCompleted = todo.status === 'completado';
                    const isPastDue = !isCompleted && cell.dateStr < todayStr;
                    const pCol = getPriorityColor(todo.priority);
                    const assignedIds = todo.assigned_to ? todo.assigned_to.split(',') : [];
                    const assignedUsers = assignedIds.map(id => usuarios.find(u => u.id === id)).filter(Boolean);

                    return (
                      <div
                        key={todo.id}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, todo)}
                        onClick={() => onSelectTodo && onSelectTodo(todo)}
                        style={{
                          background: isCompleted ? '#f8fafc' : '#ffffff',
                          border: `1px solid ${isPastDue ? '#fca5a5' : '#e2e8f0'}`,
                          borderLeft: `3px solid ${isPastDue ? '#dc2626' : pCol.border}`,
                          borderRadius: 6,
                          padding: '4px 6px',
                          fontSize: 11.5,
                          cursor: 'grab',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.15s ease',
                          opacity: isCompleted ? 0.65 : 1
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                        }}
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
                          {isCompleted ? <CheckCircle size={13} /> : <Square size={13} />}
                        </button>

                        {/* Título de la tarea */}
                        <span
                          style={{
                            fontWeight: 600,
                            color: isCompleted ? '#64748b' : '#0f172a',
                            textDecoration: isCompleted ? 'line-through' : 'none',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1
                          }}
                          title={todo.title}
                        >
                          {todo.title}
                        </span>

                        {/* Avatar o alerta si está vencida */}
                        {isPastDue && (
                          <AlertCircle size={12} style={{ color: '#dc2626', flexShrink: 0 }} title="Tarea con fecha vencida" />
                        )}

                        {assignedUsers.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 2 }}>
                            <PlannerUserAvatar email={assignedUsers[0].email} size={16} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Botón "+X más" */}
                  {extraCount > 0 && (
                    <button
                      onClick={() => setSelectedDayModal(cell)}
                      style={{
                        background: '#f1f5f9',
                        border: 'none',
                        borderRadius: 4,
                        padding: '3px 6px',
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: '#2563eb',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 2
                      }}
                    >
                      <span>+{extraCount} más...</span>
                      <ArrowRight size={10} />
                    </button>
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
                  const pCol = getPriorityColor(t.priority);
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
