import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import Modal from '../Modal';
import { 
  History, 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  User, 
  Calendar, 
  FileText, 
  ShieldAlert, 
  ChevronLeft, 
  ChevronRight,
  Layers,
  Users,
  CreditCard,
  PhoneCall
} from 'lucide-react';

const EVENT_TYPES = [
  { id: 'ALL', label: 'Todos los Eventos' },
  { id: 'USER_MGMT', label: 'Cuentas / Usuarios', prefix: ['EDIT_USUARIO', 'CREAR_USUARIO', 'DESACTIVAR_USUARIO', 'ROL_USUARIO'] },
  { id: 'SOCIOS', label: 'Socios y Grupos', prefix: ['EDIT_SOCIO', 'CREAR_SOCIO', 'EDIT_GRUPO', 'ALTA_SOCIO', 'BAJA_SOCIO'] },
  { id: 'PLANES', label: 'Planes y Costos', prefix: ['EDIT_PLAN', 'CREAR_PLAN', 'TARIFA_AUNAR', 'PRECIO_ABONO'] },
  { id: 'FACTURACION', label: 'Facturación / Cargas', prefix: ['CARGA_FACTURA', 'CARGA_FACTURA_N8N', 'FACTURA'] },
  { id: 'PAGOS', label: 'Pagos y Conciliación', prefix: ['PAGO', 'CONCILIACION', 'REVERSION', 'COBRO'] },
];

export default function AuditLogModal({ isOpen, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('30'); // '7', '30', '90', 'ALL'
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('fecha', { ascending: false });

      if (dateFilter !== 'ALL') {
        const days = parseInt(dateFilter, 10);
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - days);
        query = query.gte('fecha', dateLimit.toISOString());
      }

      const { data, error } = await query.limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error al cargar logs de auditoría:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      setCurrentPage(1);
    }
  }, [isOpen, dateFilter]);

  // Filter logs based on search & event category
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Filter by category
      if (selectedCategory !== 'ALL') {
        const cat = EVENT_TYPES.find(c => c.id === selectedCategory);
        if (cat && cat.prefix) {
          const matchesCategory = cat.prefix.some(p => 
            (log.tipo_evento || '').toUpperCase().includes(p)
          );
          if (!matchesCategory) return false;
        }
      }

      // Filter by search term
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const descMatch = (log.descripcion || '').toLowerCase().includes(term);
        const userMatch = (log.usuario || '').toLowerCase().includes(term);
        const typeMatch = (log.tipo_evento || '').toLowerCase().includes(term);
        const lineMatch = (log.numero_linea || '').toLowerCase().includes(term);
        const groupMatch = String(log.numero_grupo || '').includes(term);

        return descMatch || userMatch || typeMatch || lineMatch || groupMatch;
      }

      return true;
    });
  }, [logs, selectedCategory, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = ['ID', 'Fecha', 'Usuario', 'Tipo Evento', 'Descripción', 'Línea', 'Grupo', 'Monto'];
    const rows = filteredLogs.map(l => [
      l.id,
      new Date(l.fecha).toLocaleString('es-AR'),
      `"${(l.usuario || '').replace(/"/g, '""')}"`,
      `"${(l.tipo_evento || '').replace(/"/g, '""')}"`,
      `"${(l.descripcion || '').replace(/"/g, '""')}"`,
      l.numero_linea || '',
      l.numero_grupo || '',
      l.monto || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getEventBadgeStyle = (tipo) => {
    const t = (tipo || '').toUpperCase();
    if (t.includes('CREAR') || t.includes('EXITO') || t.includes('ALTA')) {
      return { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
    }
    if (t.includes('EDIT') || t.includes('UPDATE') || t.includes('TARIFA') || t.includes('PRECIO')) {
      return { bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' };
    }
    if (t.includes('ELIMINAR') || t.includes('BAJA') || t.includes('REVERSION') || t.includes('ERROR')) {
      return { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' };
    }
    if (t.includes('FACTURA') || t.includes('PAGO') || t.includes('COBRO')) {
      return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
    }
    return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registro de Actividad / Logs del Sistema" maxWidth="960px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Controls & Filters Bar */}
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '12px', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: 'var(--accent-light)',
          padding: '14px',
          borderRadius: '12px',
          border: '1px solid var(--border-light)'
        }}>
          
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text"
              placeholder="Buscar por usuario, línea, grupo o descripción..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: 'var(--card-bg)',
                fontSize: '13px',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          {/* Date Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={15} style={{ color: 'var(--text-secondary)' }} />
            <select 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: 'var(--card-bg)',
                fontSize: '13px',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
            >
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="ALL">Todo el Historial</option>
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={fetchLogs}
              disabled={loading}
              className="secondary-btn"
              style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', borderRadius: '8px', cursor: 'pointer' }}
              title="Recargar logs"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refrescar
            </button>
            <button 
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="secondary-btn"
              style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', borderRadius: '8px', cursor: 'pointer' }}
              title="Exportar a CSV"
            >
              <Download size={14} /> Exportar CSV
            </button>
          </div>
        </div>

        {/* Categories Pills */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {EVENT_TYPES.map(cat => (
            <button
              key={cat.id}
              onClick={() => { setSelectedCategory(cat.id); setCurrentPage(1); }}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                border: '1px solid',
                borderColor: selectedCategory === cat.id ? 'var(--accent)' : 'var(--border-light)',
                background: selectedCategory === cat.id ? 'var(--accent)' : 'var(--card-bg)',
                color: selectedCategory === cat.id ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Logs Table */}
        <div style={{ 
          border: '1px solid var(--border-light)', 
          borderRadius: '12px', 
          overflow: 'hidden',
          background: 'var(--card-bg)',
          minHeight: '340px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '12px' }}>
              <RefreshCw className="spin" size={28} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Cargando registros de auditoría...</span>
            </div>
          ) : paginatedLogs.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '8px' }}>
              <ShieldAlert size={36} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>No se encontraron registros</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Intenta ajustar los filtros de búsqueda o fecha.</span>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, rgba(0,0,0,0.02))', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '10px 14px' }}>Fecha</th>
                    <th style={{ padding: '10px 14px' }}>Usuario</th>
                    <th style={{ padding: '10px 14px' }}>Evento</th>
                    <th style={{ padding: '10px 14px' }}>Descripción / Detalle</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Monto / Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log) => {
                    const badge = getEventBadgeStyle(log.tipo_evento);
                    const formattedDate = new Date(log.fecha).toLocaleString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    return (
                      <tr 
                        key={log.id} 
                        style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.015)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '11.5px', fontWeight: 500 }}>
                          {formattedDate}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            <User size={12} style={{ color: 'var(--text-secondary)' }} />
                            {log.usuario || 'Sistema'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            letterSpacing: '0.02em'
                          }}>
                            {log.tipo_evento}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          <span>{log.descripcion}</span>
                          {(log.numero_linea || log.numero_grupo) && (
                            <div style={{ display: 'flex', gap: '8px', marginTop: '3px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {log.numero_linea && <span>Línea: <b>{log.numero_linea}</b></span>}
                              {log.numero_grupo && <span>Grupo: <b>#{log.numero_grupo}</b></span>}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {log.monto !== null && log.monto !== undefined ? (
                            `$${Number(log.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer & Pagination */}
          <div style={{ 
            padding: '10px 14px', 
            borderTop: '1px solid var(--border-light)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            background: 'var(--table-header-bg, rgba(0,0,0,0.01))',
            fontSize: '12px',
            color: 'var(--text-secondary)'
          }}>
            <span>
              Mostrando {filteredLogs.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, filteredLogs.length)} de {filteredLogs.length} eventos
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--card-bg)',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontWeight: 600 }}>Página {currentPage} de {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--card-bg)',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

      </div>
    </Modal>
  );
}
