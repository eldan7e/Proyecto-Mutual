import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { 
  LayoutDashboard, FileText, LogOut, User as UserIcon, Sun, Moon, Landmark, Users, ClipboardList, UserPlus, Loader2, Activity, Mail, Bell
} from 'lucide-react';
import ErrorBoundary from './components/ui/ErrorBoundary';
import Modal from './components/Modal';
import { useToast } from './components/ui/ToastProvider';

export default function Layout({ session, theme, toggleTheme }) {
  const location = useLocation();
  const { addToast } = useToast();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const profileRef = useRef(null);

  // Notification states
  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem(`notifications_${session?.user?.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);
  const notificationRef = useRef(null);

  // User management states
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [modalTab, setModalTab] = useState('list'); // 'list' or 'new'
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  const fetchUsuarios = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .order('email');
      if (error) throw error;
      setUsuarios(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isUserModalOpen) {
      fetchUsuarios();
      setModalTab('list');
      setNewUserEmail('');
      setNewUserPassword('');
    }
  }, [isUserModalOpen]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserPassword.trim()) return;

    setCreatingUser(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      const { error } = await tempClient.auth.signUp({
        email: newUserEmail.trim(),
        password: newUserPassword.trim(),
        options: {
          emailRedirectTo: window.location.origin
        }
      });

      if (error) throw error;

      alert('Cuenta registrada con éxito. Se ha enviado un correo de confirmación (si está configurado) o ya puede iniciar sesión.');
      setNewUserEmail('');
      setNewUserPassword('');
      setModalTab('list');
      fetchUsuarios();
    } catch (err) {
      console.error('Error creating user:', err);
      alert('Error al crear el colaborador: ' + (err.message || 'Intente nuevamente'));
    } finally {
      setCreatingUser(false);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Nunca';
    return new Date(isoString).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Sync notifications to localStorage
  useEffect(() => {
    if (session?.user?.id) {
      localStorage.setItem(`notifications_${session.user.id}`, JSON.stringify(notifications));
    }
  }, [notifications, session]);

  // Request browser notification permissions
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Subtle notification chime sound
  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      oscillator.start();
      oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12); // E5
      oscillator.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
      console.warn("Sound playback blocked or unsupported:", e);
    }
  };

  // Supabase Realtime channel subscription for task assignments
  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel('realtime_todos_notifications')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT and UPDATE
          schema: 'public',
          table: 'todos'
        },
        (payload) => {
          const newTodo = payload.new;
          const oldTodo = payload.old;
          
          if (!newTodo) return;

          // Check if the current user is assigned to this task
          const assignedIds = newTodo.assigned_to ? newTodo.assigned_to.split(',') : [];
          const isAssignedToMe = assignedIds.includes(session.user.id);

          if (!isAssignedToMe) return;

          const eventType = payload.eventType;

          // Check if it's a new task or newly assigned
          const wasPreviouslyAssigned = oldTodo?.assigned_to 
            ? oldTodo.assigned_to.split(',').includes(session.user.id)
            : false;

          const isNewAssignment = eventType === 'INSERT' || (eventType === 'UPDATE' && !wasPreviouslyAssigned);

          if (isNewAssignment) {
            // Play chime sound
            playNotificationSound();

            // Native Browser Notification
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(`Nueva Tarea Asignada`, {
                body: `${newTodo.title}\nPrioridad: ${newTodo.priority.toUpperCase()}`,
                icon: '/logo.png'
              });
            }

            // In-app Toast
            addToast(`Nueva tarea asignada: "${newTodo.title}"`, 'info');

            // Add to notification dropdown state
            setNotifications(prev => [
              {
                id: newTodo.id,
                title: newTodo.title,
                description: newTodo.description || '',
                priority: newTodo.priority || 'media',
                timestamp: new Date().toISOString(),
                read: false
              },
              ...prev
            ]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  const formatNotificationTime = (timestamp) => {
    const date = new Date(timestamp);
    const diffSec = Math.floor((new Date() - date) / 1000);
    if (diffSec < 60) return 'ahora';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h`;
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotificationMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Inicio' },
    { path: '/comunidad', icon: Users, label: 'Comunidad' },
    { path: '/facturacion', icon: FileText, label: 'Facturación' },
    { path: '/conciliacion-bancaria', icon: Landmark, label: 'Bancos' },
    { path: '/campanas', icon: Mail, label: 'Comunicación' },
  ];

  const APP_CATEGORIES = [
    { id: 'general', paths: ['/', '/tareas', '/log-diario', '/ingreso-diario'] },
    { id: 'mgmt', paths: ['/comunidad?tab=socios', '/comunidad?tab=grupos', '/comunidad?tab=planes', '/comunidad?tab=descuentos'] },
    { id: 'facturacion', paths: ['/facturacion', '/comprobantes-afip', '/gestion-pagos', '/carga-manual'] },
    { id: 'bancos', paths: ['/cuenta-corriente', '/informe-saldos', '/conciliacion-bancaria', '/movimientos-bancarios'] },
    { id: 'comunicacion', paths: ['/campanas'] },
  ];

  const pageNames = {
    '/': 'Dashboard Principal',
    '/tareas': 'Tablero de Tareas',
    '/log-diario': 'Log Diario',
    '/ingreso-diario': 'Ingreso Diario',
    '/comunidad?tab=socios': 'Socios',
    '/comunidad?tab=grupos': 'Gestión de Grupos',
    '/comunidad?tab=planes': 'Planes y Costos',
    '/comunidad?tab=descuentos': 'Descuentos y Cargos',
    '/comunidad': 'Socios',
    '/socios': 'Socios',
    '/cuenta-corriente': 'Cuenta Corriente por Grupo',
    '/informe-saldos': 'Informe de Saldos',
    '/facturacion': 'Centro de Cobranzas',
    '/comprobantes-afip': 'Comprobantes y AFIP',
    '/gestion-pagos': 'Auditoría',
    '/descuentos': 'Descuentos y Cargos',
    '/carga-manual': 'Carga de Facturación',
    '/planes': 'Planes y Costos',
    '/conciliacion-bancaria': 'Conciliación Bancaria',
    '/movimientos-bancarios': 'Historial de Movimientos',
    '/grupos': 'Gestión de Grupos',
    '/campanas': 'Comunicación'
  };

  const activeCategory = APP_CATEGORIES.find(cat => {
    const currentPath = location.pathname.toLowerCase().replace(/\/$/, '') || '/';
    return cat.paths.some(p => {
      const targetPath = p.split('?')[0].toLowerCase().replace(/\/$/, '') || '/';
      return currentPath === targetPath;
    });
  }) || APP_CATEGORIES[0];

  const categoryNames = {
    'general': 'INICIO',
    'mgmt': 'GESTIÓN COMUNIDAD',
    'facturacion': 'GESTIÓN FACTURACIÓN',
    'bancos': 'CONCILIACIÓN Y CUENTAS BANCARIAS',
    'comunicacion': 'COMUNICACIÓN',
    'admin': 'CONFIGURACIÓN SISTEMA'
  };

  return (
    <div className="app-container">
      
      {/* Sidebar: Floating Pill with Icons Only */}
      <aside className={`floating-sidebar ${isSidebarExpanded ? 'expanded' : ''}`}>
        <div 
          className="sidebar-logo-container" 
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', paddingLeft: '5px', gap: '16px', height: '42px', cursor: 'pointer' }}
        >
          <img src="/logo.png" alt="Aunar Logo" style={{ width: '42px', height: '42px', objectFit: 'contain', flexShrink: 0 }} />
          <span className="icon-text" style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Mutual Aunar</span>
        </div>
        
        <nav 
          style={{ 
            display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, width: '100%',
            overflowY: isSidebarExpanded ? 'auto' : 'visible', 
            msOverflowStyle: 'none', scrollbarWidth: 'none', paddingBottom: '20px' 
          }}
          className="sidebar-nav"
        >
          {navItems.map((item, index) => {
            const currentFullPath = location.pathname + location.search;
            const isActive = item.path === '/' 
              ? (location.pathname === '/' || ['/tareas', '/log-diario', '/ingreso-diario'].includes(location.pathname))
              : item.path === '/comunidad'
                ? location.pathname === '/comunidad'
                : item.path === '/facturacion'
                  ? ['/facturacion', '/comprobantes-afip', '/gestion-pagos', '/descuentos', '/carga-manual'].includes(location.pathname)
                  : item.path === '/conciliacion-bancaria'
                    ? ['/conciliacion-bancaria', '/cuenta-corriente', '/informe-saldos', '/movimientos-bancarios'].includes(location.pathname)
                    : item.path.includes('?') 
                      ? currentFullPath === item.path 
                      : location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-icon ${isActive ? 'active' : ''}`}
                data-tooltip={item.label}
                style={{ 
                  transitionDelay: isSidebarExpanded ? `${index * 0.05}s` : '0s' 
                }}
              >
                <div style={{ width: '22px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={22} />
                </div>
                <span className="icon-text">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          
          <button onClick={handleLogout} className="sidebar-icon" data-tooltip="Cerrar Sesión" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <div style={{ width: '22px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              <LogOut size={22} />
            </div>
            <span className="icon-text">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="main-content">
        
        {/* Top Navigation */}
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="category-label">
              {categoryNames[activeCategory.id]}
            </div>
            <div className="top-nav-pills">
              {activeCategory.paths.map((path) => {
                const currentFullPath = location.pathname + location.search;
                const isPillActive = path.includes('?') 
                  ? (currentFullPath === path || (path === '/comunidad?tab=socios' && location.pathname === '/comunidad' && !location.search))
                  : location.pathname === path;
                return (
                  <Link 
                    key={path} 
                    to={path} 
                    className={`nav-pill ${isPillActive ? 'active' : ''}`}
                  >
                    {pageNames[path]}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="top-bar-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={toggleTheme} 
              style={{ 
                background: 'var(--surface)', cursor: 'pointer', 
                width: '44px', height: '44px', borderRadius: '14px', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)', transition: 'all 0.2s',
                border: '1px solid var(--border-light)',
                boxShadow: 'var(--shadow-soft)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Notification Bell */}
            <div ref={notificationRef} style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowNotificationMenu(!showNotificationMenu)}
                style={{ 
                  background: 'var(--surface)', cursor: 'pointer', 
                  width: '44px', height: '44px', borderRadius: '14px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: showNotificationMenu ? 'var(--accent)' : 'var(--text-secondary)', 
                  transition: 'all 0.2s',
                  border: '1px solid var(--border-light)',
                  boxShadow: 'var(--shadow-soft)',
                  position: 'relative'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                onMouseLeave={(e) => { if (!showNotificationMenu) e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <Bell size={20} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#dc2626',
                    border: '2px solid var(--surface)'
                  }} />
                )}
              </button>

              {showNotificationMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  background: 'var(--modal-bg)',
                  borderRadius: '12px',
                  boxShadow: 'var(--shadow-premium)',
                  padding: '8px',
                  zIndex: 100,
                  minWidth: '280px',
                  maxWidth: '320px',
                  border: '1px solid var(--border-light)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>Notificaciones</span>
                    {notifications.length > 0 && (
                      <button 
                        onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Marcar todo leído
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        <span>No hay notificaciones nuevas</span>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <Link 
                          key={n.id}
                          to="/tareas"
                          onClick={() => {
                            setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item));
                            setShowNotificationMenu(false);
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            background: n.read ? 'transparent' : 'var(--accent-light)',
                            textDecoration: 'none',
                            transition: 'all 0.2s',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{n.title}</span>
                            <span style={{ 
                              fontSize: '9px', 
                              fontWeight: 800, 
                              textTransform: 'uppercase', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              background: n.priority === 'urgente' ? '#fee2e2' : n.priority === 'alta' ? '#ffedd5' : '#dbeafe',
                              color: n.priority === 'urgente' ? '#991b1b' : n.priority === 'alta' ? '#9a3412' : '#1e40af'
                            }}>{n.priority}</span>
                          </div>
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{n.description || 'Sin descripción'}</p>
                          <span style={{ fontSize: '9px', color: 'var(--text-secondary)', alignSelf: 'flex-end' }}>{formatNotificationTime(n.timestamp)}</span>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div ref={profileRef} style={{ position: 'relative' }}>
              <button 
                className="profile-pill" 
                style={{ cursor: 'pointer', border: 'none' }}
                onClick={() => setShowProfileMenu(!showProfileMenu)}
              >
                <UserIcon size={20} />
              </button>
              {showProfileMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  background: 'var(--modal-bg)',
                  borderRadius: '12px',
                  boxShadow: 'var(--shadow-premium)',
                  padding: '8px',
                  zIndex: 100,
                  minWidth: '200px',
                  border: '1px solid var(--border-light)',
                  transform: 'translate3d(0, 0, 0)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-light)', marginBottom: '4px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>Sesión Activa</p>
                    <p style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{session?.user?.email}</p>
                  </div>
                  <button 
                    onClick={() => { setShowProfileMenu(false); setIsUserModalOpen(true); }} 
                    style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-primary)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <Users size={15} /> Gestión de Cuentas
                  </button>
                  <button 
                    onClick={handleLogout} 
                    style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--danger)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <LogOut size={15} /> Cerrar Sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Outlet wrapped in its own space */}
        <div style={{ marginTop: '16px', flex: 1, height: '100%' }}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>

      </main>

      {/* Account Management Modal */}
      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title="Gestión de Cuentas / Colaboradores" maxWidth="600px">
        {/* Tab selection */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '20px' }}>
          <button 
            onClick={() => setModalTab('list')}
            className={`nav-pill ${modalTab === 'list' ? 'active' : ''}`}
            style={{ 
              border: 'none', 
              background: modalTab === 'list' ? 'var(--accent)' : 'transparent', 
              color: modalTab === 'list' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer', 
              padding: '8px 16px', 
              fontWeight: 700, 
              borderRadius: '8px', 
              fontSize: '13px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              boxShadow: modalTab === 'list' ? '0 8px 18px -4px var(--accent-shadow)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Users size={14} /> Colaboradores Activos
          </button>
          <button 
            onClick={() => setModalTab('new')}
            className={`nav-pill ${modalTab === 'new' ? 'active' : ''}`}
            style={{ 
              border: 'none', 
              background: modalTab === 'new' ? 'var(--accent)' : 'transparent', 
              color: modalTab === 'new' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer', 
              padding: '8px 16px', 
              fontWeight: 700, 
              borderRadius: '8px', 
              fontSize: '13px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              boxShadow: modalTab === 'new' ? '0 8px 18px -4px var(--accent-shadow)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <UserPlus size={14} /> Registrar Nueva Cuenta
          </button>
        </div>

        {/* Tab content */}
        {modalTab === 'list' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
            {loadingUsers ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
                <Loader2 className="animate-spin" size={24} style={{ color: 'var(--accent)' }} />
              </div>
            ) : usuarios.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '20px' }}>No hay colaboradores registrados.</p>
            ) : (
              usuarios.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.email}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '10px' }}>
                      <span>Creado: {formatDate(u.created_at)}</span>
                      <span>·</span>
                      <span>Último acceso: {formatDate(u.last_sign_in_at)}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'var(--accent-light)', color: 'var(--accent)' }}>
                    Activo
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Correo Electrónico</label>
              <input 
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="colaborador@admin.com"
                required
                className="form-input"
                style={{ marginBottom: 0 }}
              />
            </div>
            <div>
              <label className="form-label">Contraseña</label>
              <input 
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                className="form-input"
                style={{ marginBottom: 0 }}
              />
            </div>

            <button 
              type="submit" 
              disabled={creatingUser || !newUserEmail.trim() || newUserPassword.length < 6}
              style={{
                marginTop: '8px',
                padding: '12px 20px',
                background: 'linear-gradient(135deg, var(--accent) 0%, #1b5e20 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: (creatingUser || !newUserEmail.trim() || newUserPassword.length < 6) ? 0.6 : 1
              }}
            >
              {creatingUser ? (
                <>
                  <Loader2 className="animate-spin" size={16} /> Creando Cuenta...
                </>
              ) : (
                <>
                  <UserPlus size={16} /> Registrar Colaborador
                </>
              )}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
