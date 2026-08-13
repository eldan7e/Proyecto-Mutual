import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { registrarAuditoria } from './utils/auditLogger';
import { 
  Search, Edit2, Trash2, Plus, Mail, Users, 
  ChevronRight, CreditCard, User as UserIcon, Shield, Hash,
  Clock, CheckCircle2, MessageSquare, Flag, TrendingUp, AlertCircle, Save, Loader2,
  Phone, Activity
} from 'lucide-react';
import { fetchSocioConsumosData, fetchSocioIncidentsData } from './services/socioService';
import { useNavigate } from 'react-router-dom';
import SocioFicha from './components/Socios/SocioFicha';
import Modal from './components/Modal';

export default function Socios({ hideHeader = false }) {
  const navigate = useNavigate();
  const [socios, setSocios] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedSocioId, setSelectedSocioId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentSocio, setCurrentSocio] = useState(null);
  const [socioIncidents, setSocioIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalRecords, setTotalRecords] = useState(0);
  const [kpis, setKpis] = useState({ total: 0, conDto: 0, sinGrupo: 0, banco: 0, lineasActivas: 0, lineasTotales: 0 });

  async function fetchKpis() {
    try {
      const { data, error } = await supabase.from('v_socios_kpis').select('*').single();
      if (error) throw error;
      if (data) {
        setKpis({
          total: data.total,
          conDto: data.con_dto,
          sinGrupo: data.sin_grupo,
          banco: data.banco,
          lineasActivas: data.lineas_activas ?? data.lineas ?? 0,
          lineasTotales: data.lineas_totales ?? data.lineas ?? 0
        });
      }
    } catch (err) {
      console.error("Error fetching KPIs:", err);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchProviders();
    fetchKpis();
  }, []);

  async function fetchProviders() {
    try {
      const { data: provData } = await supabase.from('proveedores').select('proveedor_id, nombre').order('nombre');
      setProveedores(provData || []);
    } catch (err) {
      console.error("Error fetching providers:", err);
    }
  }

  const [socioLines, setSocioLines] = useState([]);
  const [socioConsumos, setSocioConsumos] = useState([]);
  const [loadingConsumos, setLoadingConsumos] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const [filterGrupo, setFilterGrupo] = useState('ALL');
  const [filterGrupoNumero, setFilterGrupoNumero] = useState('');
  const [filterPago, setFilterPago] = useState('ALL');
  const [filterDni, setFilterDni] = useState('ALL');
  const [filterEmail, setFilterEmail] = useState('ALL');
  const [sortField, setSortField] = useState('nombre');
  const [sortOrder, setSortOrder] = useState('asc');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedProvider, filterGrupo, filterGrupoNumero, filterPago, filterDni, filterEmail, sortField, sortOrder]);

  useEffect(() => {
    fetchSocios();
  }, [currentPage, pageSize, debouncedSearch, selectedProvider, filterGrupo, filterGrupoNumero, filterPago, filterDni, filterEmail, sortField, sortOrder]);

  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const paginatedSocios = socios;

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) return <span style={{ opacity: 0.4, marginLeft: '6px', fontSize: '11px' }}>⇅</span>;
    return <span style={{ color: 'var(--accent)', fontWeight: 900, marginLeft: '6px', fontSize: '11px' }}>{sortOrder === 'asc' ? ' ▲' : ' ▼'}</span>;
  };

  useEffect(() => {
    if (isModalOpen && currentSocio) {
      loadSocioIncidents(currentSocio.socio_id);
    } else {
      setSocioIncidents([]);
    }
  }, [isModalOpen, currentSocio]);

  useEffect(() => {
    if (isHistoryModalOpen && currentSocio) {
      loadSocioConsumos(currentSocio.socio_id);
    } else {
      setSocioLines([]);
      setSocioConsumos([]);
    }
  }, [isHistoryModalOpen, currentSocio]);

  async function loadSocioConsumos(socioId) {
    setLoadingConsumos(true);
    try {
      const { lines, consumos } = await fetchSocioConsumosData(socioId);
      setSocioLines(lines);
      setSocioConsumos(consumos);
    } catch (err) {
      console.error("Error al cargar consumos del socio:", err.message);
    } finally {
      setLoadingConsumos(false);
    }
  }

  async function loadSocioIncidents(socioId) {
    try {
      const incidents = await fetchSocioIncidentsData(socioId);
      setSocioIncidents(incidents);
    } catch (err) {
      console.error("Error al cargar incidentes:", err);
    }
  }

  async function fetchSocios() {
    setLoading(true);
    try {
      const term = debouncedSearch.trim();

      let query = supabase
        .from('v_socios_busqueda')
        .select('*', { count: 'exact' });

      // Apply Smart Search Filter
      if (term) {
        const isNumeric = /^\d+$/.test(term);

        if (isNumeric) {
          const orConditions = [
            `grupo_codigo_str.imatch.\\y${term}\\y`,
            `dni.ilike.%${term}%`,
            `cuit.ilike.%${term}%`,
            `nombre_completo.ilike.%${term}%`,
            `codigo_lex.ilike.%${term}%`
          ];

          const parsedNum = parseInt(term, 10);
          if (!isNaN(parsedNum)) {
            orConditions.push(`nro_socio.eq.${parsedNum}`);
          }

          // Solo buscar dentro de search_text (líneas/teléfonos) para búsquedas numéricas de 6+ dígitos
          if (term.length >= 6) {
            orConditions.push(`search_text.ilike.%${term}%`);
          }

          query = query.or(orConditions.join(','));
        } else {
          // Búsqueda por texto (nombres, email, código lex)
          query = query.or(`nombre_completo.ilike.%${term}%,email.ilike.%${term}%,codigo_lex.ilike.%${term}%,search_text.ilike.%${term}%`);
        }
      }

      // Apply Specific Group Number Filter
      if (filterGrupoNumero) {
        query = query.filter('grupo_codigo_str', 'imatch', '\\y' + filterGrupoNumero + '\\y');
      }

      // Apply Provider Filter
      if (selectedProvider) {
        query = query.contains('proveedor_ids', [parseInt(selectedProvider, 10)]);
      }

      // Apply Grupo Filter
      if (filterGrupo === 'CON_GRUPO') {
        query = query.eq('tiene_grupo', true);
      } else if (filterGrupo === 'LIBRE') {
        query = query.eq('tiene_grupo', false);
      }

      // Apply Forma Pago Filter
      if (filterPago !== 'ALL') {
        query = query.eq('fpago', filterPago);
      }

      // Apply DNI Filter
      if (filterDni === 'SIN_DNI') {
        query = query.eq('tiene_dni', false);
      } else if (filterDni === 'CON_DNI') {
        query = query.eq('tiene_dni', true);
      }

      // Apply Email Filter
      if (filterEmail === 'SIN_EMAIL') {
        query = query.eq('tiene_email', false);
      } else if (filterEmail === 'CON_EMAIL') {
        query = query.eq('tiene_email', true);
      }

      // Apply Sorting
      let dbSortField = 'nombre_completo';
      if (sortField === 'grupo') {
        dbSortField = 'grupo_codigo_str';
      } else if (sortField === 'nombre') {
        dbSortField = 'nombre_completo';
      } else if (sortField === 'dni') {
        dbSortField = 'dni';
      } else if (sortField === 'contacto') {
        dbSortField = 'email';
      } else if (sortField === 'pago') {
        dbSortField = 'fpago';
      } else if (sortField === 'nro_socio') {
        dbSortField = 'nro_socio';
      }
      query = query.order(dbSortField, { ascending: sortOrder === 'asc' });

      // Apply Pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      
      if (error) throw error;

      setSocios(data || []);
      setTotalRecords(count || 0);
    } catch (err) {
      console.error("Error fetching socios:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.target);
    const socioData = Object.fromEntries(formData);

    const { numero_linea, proveedor_id, numero_grupo, ...socioFields } = socioData;

    // Clean up empty fields to null and parse correct types
    if (socioFields.nro_socio === '') socioFields.nro_socio = null;
    else socioFields.nro_socio = parseInt(socioFields.nro_socio, 10);

    if (socioFields.desc_adicionales === '') socioFields.desc_adicionales = null;
    else socioFields.desc_adicionales = parseFloat(socioFields.desc_adicionales);

    if (socioFields.cta_numero === '') socioFields.cta_numero = null;
    else socioFields.cta_numero = parseInt(socioFields.cta_numero, 10);

    if (socioFields.total_cuotas === '') socioFields.total_cuotas = null;
    else socioFields.total_cuotas = parseInt(socioFields.total_cuotas, 10);

    if (socioFields.dni === '') socioFields.dni = null;
    if (socioFields.cuit === '') socioFields.cuit = null;
    if (socioFields.email === '') socioFields.email = null;

    let hasError = false;
    let socioIdToUse = currentSocio?.socio_id || null;

    if (currentSocio) {
      const { error } = await supabase.from('socios').update(socioFields).eq('socio_id', currentSocio.socio_id);
      if (error) {
        alert(error.message);
        hasError = true;
      } else {
        await registrarAuditoria({
          tipo_evento: 'EDIT_SOCIO',
          descripcion: `Actualizada información del socio "${socioFields.nombre_completo}"`,
          numero_grupo: numero_grupo ? parseInt(numero_grupo, 10) : null
        });
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('socios')
        .insert([socioFields])
        .select('socio_id')
        .single();

      if (error) {
        alert(error.message);
        hasError = true;
      } else if (inserted) {
        socioIdToUse = inserted.socio_id;
        await registrarAuditoria({
          tipo_evento: 'CREAR_SOCIO',
          descripcion: `Registrado nuevo socio "${socioFields.nombre_completo}"`,
          numero_grupo: numero_grupo ? parseInt(numero_grupo, 10) : null
        });
      }
    }

    // Si no hubo error y se especificó un grupo, asociarlo
    if (!hasError && numero_grupo && socioIdToUse) {
      try {
        const grupoNum = parseInt(numero_grupo, 10);
        
        // Asegurar que el grupo exista
        await supabase
          .from('grupos')
          .upsert({ numero_grupo: grupoNum }, { onConflict: 'numero_grupo' });

        // Eliminar asociaciones previas (por las dudas)
        await supabase
          .from('grupo_socio')
          .delete()
          .eq('socio_id', socioIdToUse);

        // Asociar al grupo
        const { error: assocErr } = await supabase
          .from('grupo_socio')
          .insert({ 
            numero_grupo: grupoNum, 
            socio_id: socioIdToUse, 
            es_titular: false 
          });

        if (assocErr) throw assocErr;
      } catch (assocErr) {
        alert("Socio guardado, pero error al asociar grupo: " + assocErr.message);
      }
    }

    // Si no hubo error y se especificó un número de línea, asociarlo
    if (!hasError && numero_linea && socioIdToUse) {
      try {
        const { data: existingLine } = await supabase
          .from('lineas')
          .select('numero_linea')
          .eq('numero_linea', numero_linea.trim())
          .maybeSingle();

        const linePayload = {
          numero_linea: numero_linea.trim(),
          socio_id: socioIdToUse,
          proveedor_id: proveedor_id ? parseInt(proveedor_id, 10) : null,
          estado: 'ACTIVA',
          numero_grupo: numero_grupo ? parseInt(numero_grupo, 10) : null
        };

        if (existingLine) {
          // Re-asociar línea existente
          const { error: lineErr } = await supabase
            .from('lineas')
            .update({ 
              socio_id: socioIdToUse, 
              proveedor_id: linePayload.proveedor_id,
              numero_grupo: linePayload.numero_grupo
            })
            .eq('numero_linea', numero_linea.trim());

          if (lineErr) throw lineErr;
        } else {
          // Crear nueva línea
          const { error: lineErr } = await supabase
            .from('lineas')
            .insert([linePayload]);

          if (lineErr) throw lineErr;
        }
      } catch (lineErr) {
        alert("Socio guardado, pero error al procesar la línea: " + lineErr.message);
      }
    }

    setLoading(false);
    if (!hasError) {
      setIsModalOpen(false);
      setCurrentSocio(null);
      fetchSocios();
      fetchKpis();
    }
  }

  async function handleDelete(id) {
    const socioTarget = socios.find(s => s.socio_id === id);
    if (window.confirm('¿Estás seguro de eliminar este socio?')) {
      const { error } = await supabase.from('socios').delete().eq('socio_id', id);
      if (error) alert(error.message);
      else {
        await registrarAuditoria({
          tipo_evento: 'ELIMINAR_SOCIO',
          descripcion: `Eliminado socio "${socioTarget?.nombre_completo || id}"`
        });
        fetchSocios();
        fetchKpis();
      }
    }
  }

  async function handleCreateIncident() {
    const num = prompt("Ingrese el número de línea para el reclamo:");
    if (!num) return;
    const { error } = await supabase.from('incidentes_lineas').insert({
      numero_linea: num,
      tipo_incidente: 'Otro',
      descripcion_problema: 'Reclamo manual abierto desde perfil de socio.',
      estado: 'Abierto'
    });
    if (error) alert(error.message);
    else loadSocioIncidents(currentSocio.socio_id);
  }

  // Los KPIs se consultan desde el estado kpis actualizado del servidor

  return (
    <div style={{ padding: hideHeader ? '0' : '32px', position: 'relative' }}>
      
      {/* CAPA DE FICHA DEL SOCIO */}
      {selectedSocioId && (
        <div style={{ animation: 'slideUpFade 0.4s ease' }}>
          <SocioFicha 
            id={selectedSocioId} 
            onBack={() => setSelectedSocioId(null)} 
          />
        </div>
      )}

      {/* CONTENIDO PRINCIPAL (Se oculta visualmente si hay ficha abierta para no perder el state/scroll) */}
      <div style={{ display: selectedSocioId ? 'none' : 'block' }}>
        {!hideHeader && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <div>
              <h1 style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '8px' }}>Gestión de Socios</h1>
              <p style={{ color: 'var(--text-secondary)' }}>Mantené al día la base de datos de tu mutual</p>
            </div>
            <button 
              onClick={() => { setCurrentSocio(null); setIsModalOpen(true); }}
              className="action-button" style={{ padding: '12px 24px', fontSize: '15px' }}
            >
              <Plus size={20} style={{ marginRight: '8px' }} /> Nuevo Socio
            </button>
          </div>
        )}

      <div style={{ display: 'block' }}>
        <>
          {/* Dashboard Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            <div 
              className="glass-panel" 
              style={{ padding: '20px', borderRadius: '20px', borderLeft: '4px solid var(--accent)', cursor: 'pointer', transition: 'transform 0.2s' }}
              onClick={() => {
                setFilterGrupo('ALL');
                setFilterGrupoNumero('');
                setFilterPago('ALL');
                setFilterDni('ALL');
                setFilterEmail('ALL');
                setSelectedProvider('');
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>TOTAL SOCIOS</span>
                <Users size={16} color="var(--accent)" />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 900 }}>{kpis.total}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Integrantes registrados</div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', borderLeft: '4px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>LÍNEAS ACTIVAS</span>
                <Phone size={16} color="#10b981" />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#10b981' }}>{kpis.lineasActivas}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>En servicio operativo</div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', borderLeft: '4px solid #6366f1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>LÍNEAS TOTALES</span>
                <Hash size={16} color="#6366f1" />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#6366f1' }}>{kpis.lineasTotales}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {kpis.lineasActivas} activas + {kpis.lineasTotales - kpis.lineasActivas} bajas
              </div>
            </div>

            <div 
              className="glass-panel" 
              style={{ padding: '20px', borderRadius: '20px', cursor: 'pointer', transition: 'transform 0.2s' }}
              onClick={() => setFilterPago('BC')}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>PAGO BANCO</span>
                <CreditCard size={16} color="#8b5cf6" />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 900 }}>{kpis.banco}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Débito automático</div>
            </div>

            <div 
              className="glass-panel" 
              style={{ padding: '20px', borderRadius: '20px', cursor: 'pointer', transition: 'transform 0.2s' }}
              onClick={() => setFilterGrupo('LIBRE')}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>SIN GRUPO</span>
                <AlertCircle size={16} color="#f59e0b" />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 900 }}>{kpis.sinGrupo}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Líneas individuales</div>
            </div>
          </div>

          {/* Filters & Table */}
          <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div className="search-bar" style={{ flex: 1 }}>
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Buscar por nombre, DNI, Nro Socio, Nro Grupo o línea..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ background: 'none', border: 'none', outline: 'none', width: '100%' }}
                />
              </div>

              <select 
                className="premium-input" 
                style={{ width: '220px', padding: '10px 16px' }}
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                <option value="">Filtrar por Proveedor</option>
                {proveedores.map(p => (
                  <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>
                ))}
              </select>
              {hideHeader && (
                <button 
                  onClick={() => { setCurrentSocio(null); setIsModalOpen(true); }}
                  className="action-button" 
                  style={{ padding: '10px 18px', fontSize: '13px', borderRadius: '12px', height: '42px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
                >
                  <Plus size={16} /> Nuevo Socio
                </button>
              )}
            </div>

            {/* Custom Column Filters Row */}
            <div style={{ 
              padding: '12px 24px', 
              background: 'rgba(255, 255, 255, 0.02)', 
              borderBottom: '1px solid var(--border-light)', 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '12px', 
              alignItems: 'center' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginRight: '4px', letterSpacing: '0.05em' }}>
                <Shield size={12} color="var(--accent)" /> Filtros:
              </div>

              {/* Grupo Dropdown */}
              <select 
                className="premium-input" 
                style={{ padding: '6px 12px', fontSize: '12px', minWidth: '130px', borderRadius: '10px', height: '34px' }}
                value={filterGrupo}
                onChange={(e) => setFilterGrupo(e.target.value)}
              >
                <option value="ALL">Grupo: Todos</option>
                <option value="CON_GRUPO">Asociados a un Grupo</option>
                <option value="LIBRE">Individuales (Sin Grupo)</option>
              </select>

              {/* Grupo Número input (dedicated) */}
              <input
                type="text"
                className="premium-input"
                style={{ padding: '6px 12px', fontSize: '12px', width: '110px', borderRadius: '10px', height: '34px' }}
                placeholder="Nº Grupo..."
                value={filterGrupoNumero}
                onChange={(e) => setFilterGrupoNumero(e.target.value.replace(/\D/g, ''))}
              />

              {/* Forma Pago Dropdown */}
              <select 
                className="premium-input" 
                style={{ padding: '6px 12px', fontSize: '12px', minWidth: '150px', borderRadius: '10px', height: '34px' }}
                value={filterPago}
                onChange={(e) => setFilterPago(e.target.value)}
              >
                <option value="ALL">Forma Pago: Todas</option>
                <option value="BC">DÉBITO CBU</option>
                <option value="R">RECIBO SUELDO</option>
                <option value="M">PAGO MUTUAL</option>
              </select>

              {/* DNI Dropdown */}
              <select 
                className="premium-input" 
                style={{ padding: '6px 12px', fontSize: '12px', minWidth: '130px', borderRadius: '10px', height: '34px' }}
                value={filterDni}
                onChange={(e) => setFilterDni(e.target.value)}
              >
                <option value="ALL">DNI/CUIT: Todos</option>
                <option value="CON_DNI">Con DNI/CUIT</option>
                <option value="SIN_DNI">Sin DNI/CUIT</option>
              </select>

              {/* Email Dropdown */}
              <select 
                className="premium-input" 
                style={{ padding: '6px 12px', fontSize: '12px', minWidth: '130px', borderRadius: '10px', height: '34px' }}
                value={filterEmail}
                onChange={(e) => setFilterEmail(e.target.value)}
              >
                <option value="ALL">Contacto: Todos</option>
                <option value="CON_EMAIL">Con Correo</option>
                <option value="SIN_EMAIL">Sin Correo</option>
              </select>

              {/* Ordenar Dropdown */}
              <select 
                className="premium-input" 
                style={{ padding: '6px 12px', fontSize: '12px', minWidth: '175px', borderRadius: '10px', height: '34px' }}
                value={`${sortField}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-');
                  setSortField(field);
                  setSortOrder(order);
                }}
              >
                <option value="nombre-asc">Nombre (A-Z)</option>
                <option value="nombre-desc">Nombre (Z-A)</option>
                <option value="grupo-asc">Nº Grupo (Menor a Mayor)</option>
                <option value="grupo-desc">Nº Grupo (Mayor a Menor)</option>
                <option value="nro_socio-asc">Nº Socio (Menor a Mayor)</option>
                <option value="nro_socio-desc">Nº Socio (Mayor a Menor)</option>
              </select>

              {/* Clear Filters Button */}
              {(selectedProvider || filterGrupo !== 'ALL' || filterGrupoNumero !== '' || filterPago !== 'ALL' || filterDni !== 'ALL' || filterEmail !== 'ALL') && (
                <button 
                  onClick={() => {
                    setSelectedProvider('');
                    setFilterGrupo('ALL');
                    setFilterGrupoNumero('');
                    setFilterPago('ALL');
                    setFilterDni('ALL');
                    setFilterEmail('ALL');
                  }}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    height: '34px',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}
                >
                  Limpiar Filtros
                </button>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="premium-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th onClick={() => handleSort('grupo')} style={{ padding: '16px 24px', cursor: 'pointer', userSelect: 'none', transition: 'background-color 0.2s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Grupo {renderSortIcon('grupo')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('nombre')} style={{ cursor: 'pointer', userSelect: 'none', transition: 'background-color 0.2s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Nombre y Datos {renderSortIcon('nombre')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('dni')} style={{ cursor: 'pointer', userSelect: 'none', transition: 'background-color 0.2s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        DNI / CUIT {renderSortIcon('dni')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('contacto')} style={{ cursor: 'pointer', userSelect: 'none', transition: 'background-color 0.2s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Contacto {renderSortIcon('contacto')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('pago')} style={{ cursor: 'pointer', userSelect: 'none', transition: 'background-color 0.2s', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        Forma Pago {renderSortIcon('pago')}
                      </div>
                    </th>
                    <th style={{ textAlign: 'right', paddingRight: '24px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="6" style={{ padding: '100px', textAlign: 'center' }}><Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent)' }} /></td></tr>
                  ) : paginatedSocios.length === 0 ? (
                    <tr><td colSpan="6" style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600 }}>Ningún socio coincide con los filtros aplicados.</td></tr>
                  ) : paginatedSocios.map(s => (
                    <tr key={s.socio_id}>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ 
                            width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent-light)', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' 
                          }}>
                            <Hash size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '15px' }}>
                              {s.grupo_socio?.map(g => g.numero_grupo).join(', ') || 'LIBRE'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '15px' }}>{s.nombre_completo}</div>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          <span>Nº SOCIO: {s.nro_socio || '---'}</span>
                          <span>•</span>
                          <span>CÓD. LEX: {s.codigo_lex || '---'}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>{s.dni || '---'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{s.cuit || 'Sin CUIT'}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          <Mail size={14} /> {s.email || 'Sin Correo'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ 
                          display: 'inline-block',
                          whiteSpace: 'nowrap',
                          padding: '6px 12px', borderRadius: '100px', fontSize: '10px', fontWeight: 900,
                          background: s.fpago === 'BC' ? 'rgba(37, 99, 235, 0.1)' : s.fpago === 'R' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)', 
                          color: s.fpago === 'BC' ? '#2563eb' : s.fpago === 'R' ? '#8b5cf6' : 'var(--accent)',
                        }}>
                          {s.fpago === 'BC' ? 'DÉBITO CBU' : s.fpago === 'R' ? 'RECIBO SUELDO' : 'PAGO MUTUAL'}
                        </span>
                      </td>
                      <td style={{ paddingRight: '24px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setSelectedSocioId(s.socio_id)} className="air-btn" style={{ padding: '6px 12px', fontSize: '12px' }}>
                            Ver Ficha
                          </button>
                          <button onClick={() => handleDelete(s.socio_id)} className="icon-button-delete" title="Eliminar Socio"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación Premium */}
            {totalRecords > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px 32px',
                borderTop: '1px solid var(--border-light)',
                flexWrap: 'wrap',
                gap: '16px',
                background: 'var(--surface-light)',
                borderBottomLeftRadius: '24px',
                borderBottomRightRadius: '24px'
              }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Mostrando <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{Math.min(totalRecords, (currentPage - 1) * pageSize + 1)}-{Math.min(totalRecords, currentPage * pageSize)}</span> de <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{totalRecords}</span> registros
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="pagination-btn-nav"
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                  >
                    Anterior
                  </button>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {(() => {
                      const pages = [];
                      for (let i = 1; i <= totalPages; i++) {
                        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                          pages.push(
                            <button
                              key={i}
                              onClick={() => setCurrentPage(i)}
                              className={`pagination-btn-page ${currentPage === i ? 'active' : ''}`}
                            >
                              {i}
                            </button>
                          );
                        } else if (i === currentPage - 2 || i === currentPage + 2) {
                          pages.push(<span key={`dots-${i}`} style={{ padding: '0 4px', opacity: 0.5 }}>...</span>);
                        }
                      }
                      return pages;
                    })()}
                  </div>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="pagination-btn-nav"
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                  >
                    Siguiente
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>Filas por página:</span>
                  <select
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="premium-input"
                    style={{ padding: '4px 8px', borderRadius: '8px', fontSize: '13px', height: '32px', minWidth: '70px' }}
                  >
                    {[25, 50, 100, 200].map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </>
      </div>

      {/* Modal para Crear/Editar Socio */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setCurrentSocio(null); }} 
        title={currentSocio ? "Editar Socio" : "Nuevo Socio"}
        maxWidth="600px"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label className="form-label">Nombre Completo</label>
            <input 
              className="form-input" 
              name="nombre_completo" 
              defaultValue={currentSocio?.nombre_completo || ''} 
              required 
              placeholder="Ej: Juan Pérez"
              style={{ width: '100%', marginBottom: 0 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">DNI</label>
              <input 
                className="form-input" 
                name="dni" 
                defaultValue={currentSocio?.dni || ''} 
                placeholder="Sin puntos"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>
            <div>
              <label className="form-label">CUIT</label>
              <input 
                className="form-input" 
                name="cuit" 
                defaultValue={currentSocio?.cuit || ''} 
                placeholder="Ej: 20-XXXXXXXX-X"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">Código Lex</label>
              <input 
                className="form-input" 
                name="codigo_lex" 
                defaultValue={currentSocio?.codigo_lex || ''} 
                placeholder="Código Lex"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>
            <div>
              <label className="form-label">Email Principal</label>
              <input 
                className="form-input" 
                type="email" 
                name="email" 
                defaultValue={currentSocio?.email || ''} 
                placeholder="correo@ejemplo.com"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">Forma de Pago</label>
              <select 
                className="form-input" 
                name="fpago" 
                defaultValue={currentSocio?.fpago || 'M'}
                style={{ width: '100%', marginBottom: 0 }}
              >
                <option value="M">Mutual (M)</option>
                <option value="BC">Banco (BC)</option>
                <option value="R">Recibo (R)</option>
              </select>
            </div>
            <div>
              <label className="form-label">Nro Socio</label>
              <input 
                className="form-input" 
                type="number" 
                name="nro_socio" 
                defaultValue={currentSocio?.nro_socio || ''} 
                placeholder="Nº Socio"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">CBU / CVU</label>
              <input 
                className="form-input" 
                name="cbu" 
                defaultValue={currentSocio?.cbu || ''} 
                placeholder="22 dígitos" 
                maxLength={22} 
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>
            <div>
              <label className="form-label">Grupo de Facturación</label>
              <input 
                className="form-input" 
                type="number"
                name="numero_grupo" 
                placeholder="Nº Grupo" 
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">Número de Línea</label>
              <input 
                className="form-input" 
                name="numero_linea" 
                placeholder="Ej: 2212345678"
                style={{ width: '100%', marginBottom: 0 }}
              />
            </div>
            <div>
              <label className="form-label">Proveedor</label>
              <select 
                className="form-input" 
                name="proveedor_id" 
                style={{ width: '100%', marginBottom: 0 }}
              >
                <option value="">Seleccione Proveedor</option>
                {proveedores.map(p => (
                  <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
            <button 
              type="button" 
              className="pagination-btn-nav" 
              onClick={() => { setIsModalOpen(false); setCurrentSocio(null); }}
              style={{ padding: '10px 20px' }}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="action-button" 
              style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Guardar
            </button>
          </div>
        </form>
      </Modal>
      </div>
    </div>
  );
}
