import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { registrarAuditoria } from './utils/auditLogger';
import { 
  Search, Edit2, Trash2, Plus, Mail, Users, 
  ChevronRight, CreditCard, User as UserIcon, Shield, Hash,
  Clock, CheckCircle2, MessageSquare, Flag, TrendingUp, AlertCircle, Save, Loader2,
  Phone, Activity, X, Copy, Check, ExternalLink, CheckCircle
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

  // Estado para la búsqueda y verificación directa de números de teléfono en base de datos
  const [isLineSearchModalOpen, setIsLineSearchModalOpen] = useState(false);
  const [lineSearchInput, setLineSearchInput] = useState('');
  const [lineSearchResult, setLineSearchResult] = useState(null);
  const [searchingLine, setSearchingLine] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(null);

  const executeLineLookup = async (phoneToSearch) => {
    const raw = (phoneToSearch !== undefined ? phoneToSearch : lineSearchInput).trim();
    const cleanNum = raw.replace(/\D/g, '');
    if (!cleanNum || cleanNum.length < 3) return;

    setSearchingLine(true);
    setLineSearchResult(null);

    try {
      const { data, error } = await supabase
        .from('lineas')
        .select(`
          numero_linea,
          estado,
          numero_grupo,
          socio_id,
          cargo_equipo,
          created_at,
          proveedores:proveedor_id (nombre),
          planes_abonos:plan_id (nombre_plan, gb_incluidos, tarifa_aunar, precio),
          socios:socio_id (socio_id, nro_socio, nombre_completo, dni, cuit, email, fpago)
        `)
        .or(`numero_linea.eq.${cleanNum},numero_linea.ilike.%${cleanNum}%`)
        .limit(20);

      if (error) throw error;

      setLineSearchResult({
        searched: true,
        query: cleanNum,
        found: !!(data && data.length > 0),
        lines: data || []
      });
    } catch (err) {
      console.error('Error al consultar línea:', err);
      try {
        const { data: simpleData } = await supabase
          .from('lineas')
          .select('*')
          .or(`numero_linea.eq.${cleanNum},numero_linea.ilike.%${cleanNum}%`);
        setLineSearchResult({
          searched: true,
          query: cleanNum,
          found: !!(simpleData && simpleData.length > 0),
          lines: simpleData || []
        });
      } catch (err2) {
        setLineSearchResult({ searched: true, query: cleanNum, found: false, lines: [], error: err.message });
      }
    } finally {
      setSearchingLine(false);
    }
  };

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
        const cleanDigits = term.replace(/\D/g, '');
        const isNumeric = /^\d+$/.test(term);

        if (isNumeric) {
          const orConditions = [
            `dni.ilike.%${term}%`,
            `cuit.ilike.%${term}%`,
            `nombre_completo.ilike.%${term}%`,
            `codigo_lex.ilike.%${term}%`
          ];

          // Búsqueda por número de grupo exacto (solo números cortos de hasta 5 dígitos)
          if (term.length <= 5) {
            orConditions.push(`grupo_codigo_str.imatch.\\y${term}\\y`);
          }

          // Solo buscar por nro_socio si es un número válido y menor a 2.147.483.647 (para no desbordar INTEGER en Postgres)
          const parsedNum = parseInt(term, 10);
          if (!isNaN(parsedNum) && parsedNum > 0 && parsedNum <= 2147483647 && term.length <= 6) {
            orConditions.push(`nro_socio.eq.${parsedNum}`);
          }

          // Para números de 6+ dígitos (líneas telefónicas, celulares, DNIs largos) buscar dentro de search_text
          if (term.length >= 6) {
            orConditions.push(`search_text.ilike.%${term}%`);
          }

          query = query.or(orConditions.join(','));
        } else {
          // Búsqueda por texto (nombres, email, código lex, search_text)
          // Si incluye dígitos mezclados (ej. teléfono con guiones o espacios), también buscar los dígitos en search_text
          let textOr = `nombre_completo.ilike.%${term}%,email.ilike.%${term}%,codigo_lex.ilike.%${term}%,search_text.ilike.%${term}%`;
          if (cleanDigits.length >= 6 && cleanDigits !== term) {
            textOr += `,search_text.ilike.%${cleanDigits}%`;
          }
          query = query.or(textOr);
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
              onClick={() => setFilterGrupo('LIBRE')}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>SIN GRUPO</span>
                <AlertCircle size={16} color="#f59e0b" />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 900 }}>{kpis.sinGrupo}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Socios sin grupo asignado</div>
            </div>
          </div>

          {/* Filters & Table */}
          <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="search-bar" style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Buscar por nombre, DNI, Nro Socio, Nro Grupo o teléfono..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ background: 'none', border: 'none', outline: 'none', width: '100%', paddingRight: search ? '28px' : '0' }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    title="Limpiar búsqueda"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Botón directo: Consultar Teléfono en BD */}
              <button
                type="button"
                onClick={() => {
                  const digits = search.replace(/\D/g, '');
                  if (digits.length >= 4) {
                    setLineSearchInput(digits);
                    executeLineLookup(digits);
                  }
                  setIsLineSearchModalOpen(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '12px',
                  height: '42px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#059669',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
                title="Comprobar directamente si un número de línea telefónica existe en la base de datos"
              >
                <Phone size={15} />
                <span>Consultar Teléfono</span>
              </button>

              <select 
                className="premium-input" 
                style={{ width: '200px', padding: '10px 16px', height: '42px' }}
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

            {/* Banner informativo si el usuario está buscando un número de teléfono */}
            {search.replace(/\D/g, '').length >= 7 && (
              <div style={{
                margin: '14px 24px 0 24px',
                padding: '12px 18px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Phone size={16} color="#059669" />
                  <span>
                    Buscando línea telefónica: <strong style={{ color: '#047857', letterSpacing: '0.5px' }}>{search}</strong>
                    {totalRecords > 0 ? ` — ${totalRecords} socio${totalRecords === 1 ? '' : 's'} vinculado${totalRecords === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const digits = search.replace(/\D/g, '');
                    setLineSearchInput(digits);
                    executeLineLookup(digits);
                    setIsLineSearchModalOpen(true);
                  }}
                  style={{
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(5,150,105,0.2)'
                  }}
                >
                  <Search size={13} /> Consultar detalles de la línea en BD
                </button>
              </div>
            )}

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
                        <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, flexWrap: 'wrap' }}>
                          <span>Nº SOCIO: {s.nro_socio || '---'}</span>
                          <span>•</span>
                          <span>CÓD. LEX: {s.codigo_lex || '---'}</span>
                        </div>
                        {s.lineas && s.lineas.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '5px' }}>
                            {s.lineas.slice(0, 3).map((l, idx) => {
                              const cleanDigits = search.replace(/\D/g, '');
                              const isMatch = cleanDigits.length >= 4 && l.numero_linea && l.numero_linea.includes(cleanDigits);
                              return (
                                <span
                                  key={idx}
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: isMatch ? 800 : 600,
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    background: isMatch ? 'rgba(16, 185, 129, 0.18)' : 'rgba(0, 0, 0, 0.04)',
                                    color: isMatch ? '#047857' : 'var(--text-secondary)',
                                    border: `1px solid ${isMatch ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-light)'}`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <Phone size={10} /> {l.numero_linea}
                                </span>
                              );
                            })}
                            {s.lineas.length > 3 && (
                              <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: 600, alignSelf: 'center' }}>
                                +{s.lineas.length - 3} más
                              </span>
                            )}
                          </div>
                        )}
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

      {/* Modal para Consultar y Verificar Línea Telefónica */}
      <Modal
        isOpen={isLineSearchModalOpen}
        onClose={() => {
          setIsLineSearchModalOpen(false);
        }}
        title="📱 Consultar Línea Telefónica en Base de Datos"
        maxWidth="650px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)' }}>
            Ingresá un número de teléfono (completo o parcial) para verificar en tiempo real si existe en el sistema, ver su estado, prestador, plan y a qué socio o grupo pertenece.
          </p>

          {/* Formulario de búsqueda rápida */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeLineLookup();
            }}
            style={{ display: 'flex', gap: '10px' }}
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Ej: 2213080854..."
                value={lineSearchInput}
                onChange={(e) => setLineSearchInput(e.target.value)}
                autoFocus
                style={{ width: '100%', marginBottom: 0, fontSize: '15px', fontWeight: 600, paddingRight: '36px' }}
              />
              {lineSearchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setLineSearchInput('');
                    setLineSearchResult(null);
                  }}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="action-button"
              disabled={searchingLine || !lineSearchInput.trim()}
              style={{
                padding: '0 22px',
                height: '42px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              {searchingLine ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
              <span>Consultar</span>
            </button>
          </form>

          {/* Resultados de la búsqueda */}
          {searchingLine && (
            <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-secondary)' }}>
              <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto 12px auto', color: 'var(--accent)' }} />
              <div style={{ fontWeight: 600 }}>Buscando línea en la base de datos...</div>
            </div>
          )}

          {!searchingLine && lineSearchResult?.searched && (
            <div>
              {lineSearchResult.found ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 14px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '10px',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    color: '#059669',
                    fontSize: '13px',
                    fontWeight: 700
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={16} />
                      {lineSearchResult.lines.length} {lineSearchResult.lines.length === 1 ? 'línea encontrada' : 'líneas coincidentes'}
                    </span>
                    <span style={{ fontSize: '11px', opacity: 0.8 }}>Búsqueda: {lineSearchResult.query}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '50vh', overflowY: 'auto' }}>
                    {lineSearchResult.lines.map((l, idx) => {
                      const isActive = String(l.estado || '').toUpperCase() === 'ACTIVA' || String(l.estado || '').toUpperCase() === 'ACTIVO';
                      const isCopied = copiedPhone === l.numero_linea;

                      return (
                        <div
                          key={idx}
                          style={{
                            border: '1px solid var(--border-light)',
                            borderRadius: '14px',
                            padding: '16px',
                            background: 'var(--card-bg, rgba(255,255,255,0.02))',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                          }}
                        >
                          {/* Cabecera de la línea */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '0.5px' }}>
                                {l.numero_linea}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(l.numero_linea);
                                  setCopiedPhone(l.numero_linea);
                                  setTimeout(() => setCopiedPhone(null), 2000);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  color: isCopied ? '#059669' : 'var(--text-secondary)'
                                }}
                                title="Copiar número"
                              >
                                {isCopied ? <Check size={14} /> : <Copy size={14} />}
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 800,
                                background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: isActive ? '#059669' : '#dc2626',
                                border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                              }}>
                                {l.estado || 'SIN ESTADO'}
                              </span>
                              {l.proveedores?.nombre && (
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  color: '#2563eb',
                                  border: '1px solid rgba(59, 130, 246, 0.25)'
                                }}>
                                  {l.proveedores.nombre}
                                </span>
                              )}
                              {l.numero_grupo && (
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  color: '#d97706',
                                  border: '1px solid rgba(245, 158, 11, 0.25)'
                                }}>
                                  Grupo #{l.numero_grupo}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Datos del Plan */}
                          {l.planes_abonos && (
                            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                              <span><strong>Plan:</strong> {l.planes_abonos.nombre_plan || 'S/D'}</span>
                              {l.planes_abonos.gb_incluidos !== undefined && (
                                <span><strong>Datos:</strong> {l.planes_abonos.gb_incluidos} GB</span>
                              )}
                              {l.planes_abonos.tarifa_aunar && (
                                <span><strong>Tarifa:</strong> ${Number(l.planes_abonos.tarifa_aunar).toLocaleString('es-AR')}</span>
                              )}
                              {l.cargo_equipo ? (
                                <span><strong>Cargo Equipo:</strong> ${Number(l.cargo_equipo).toLocaleString('es-AR')}</span>
                              ) : null}
                            </div>
                          )}

                          {/* Socio Vinculado */}
                          <div style={{
                            marginTop: '4px',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            background: 'rgba(0, 0, 0, 0.03)',
                            border: '1px dashed var(--border-light)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px'
                          }}>
                            {l.socios ? (
                              <>
                                <div>
                                  <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>
                                    {l.socios.nombre_completo}
                                  </div>
                                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
                                    <span>Nº Socio: <strong>{l.socios.nro_socio || 'S/D'}</strong></span>
                                    {l.socios.dni && <span>DNI: {l.socios.dni}</span>}
                                    {l.socios.cuit && <span>CUIT: {l.socios.cuit}</span>}
                                    {l.socios.email && <span>Email: {l.socios.email}</span>}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsLineSearchModalOpen(false);
                                      setSelectedSocioId(l.socios.socio_id);
                                    }}
                                    className="action-button"
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '12px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}
                                  >
                                    <ExternalLink size={13} /> Ver Ficha del Socio
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsLineSearchModalOpen(false);
                                      setSearch(l.numero_linea);
                                    }}
                                    style={{
                                      background: 'none',
                                      border: '1px solid var(--border-light)',
                                      padding: '6px 12px',
                                      borderRadius: '8px',
                                      fontSize: '12px',
                                      cursor: 'pointer',
                                      color: 'var(--text-primary)',
                                      fontWeight: 600
                                    }}
                                  >
                                    Filtrar en Lista
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <span style={{ fontSize: '13px', color: '#d97706', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <AlertCircle size={15} /> Línea registrada sin socio asignado
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsLineSearchModalOpen(false);
                                    setCurrentSocio(null);
                                    setIsModalOpen(true);
                                  }}
                                  style={{
                                    background: 'var(--accent)',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  + Asignar a Nuevo Socio
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '24px 18px',
                  borderRadius: '14px',
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ef4444'
                  }}>
                    <AlertCircle size={26} />
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 800, color: '#b91c1c' }}>
                      La línea no existe en la base de datos
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px' }}>
                      No se encontró ningún registro para el número <strong style={{ color: 'var(--text-primary)' }}>{lineSearchResult.query}</strong> en la tabla de líneas ni vinculado a ningún socio.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsLineSearchModalOpen(false);
                        setCurrentSocio(null);
                        setIsModalOpen(true);
                      }}
                      className="action-button"
                      style={{
                        padding: '8px 18px',
                        fontSize: '13px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Plus size={15} /> Crear Nuevo Socio
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLineSearchInput('');
                        setLineSearchResult(null);
                      }}
                      style={{
                        background: 'none',
                        border: '1px solid var(--border-light)',
                        padding: '8px 16px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      Probar con otro número
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer del Modal */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-light)', paddingTop: '14px', marginTop: '4px' }}>
            <button
              type="button"
              className="pagination-btn-nav"
              onClick={() => setIsLineSearchModalOpen(false)}
              style={{ padding: '8px 20px', fontSize: '13px' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>
      </div>
    </div>
  );
}
