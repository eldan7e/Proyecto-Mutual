import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { 
  Search, Mail, Send, CheckCircle2, AlertCircle, 
  Bold, Italic, Underline, List, AlignLeft, AlignCenter, 
  AlignRight, CheckSquare, Square, Loader2, 
  Settings, ChevronRight, ChevronDown, RefreshCw, Eye,
  ArrowLeft, Users, FileText, X, Check, Clock, Hash, Phone, Tag,
  Bot, MessageSquare, UploadCloud, FileSpreadsheet, Sparkles, Database,
  CheckCircle, AlertTriangle, Calendar, Play, Building2, HelpCircle,
  Copy, Smartphone, ChevronUp
} from 'lucide-react';
import { useToast } from './components/ui/ToastProvider';
import Modal from './components/Modal';
import DOMPurify from 'dompurify';

export default function Campanas() {
  const { addToast } = useToast();
  
  // Wizard Step (1: Destinatarios, 2: Mensaje, 3: Historial)
  const [currentStep, setCurrentStep] = useState(1);
  
  // Tipo de campaña en paso 1
  const [campaignType, setCampaignType] = useState(null); // 'nueva' | 'grupal' | 'lineas' | 'bot_wsp'

  // Estados de listas y selección
  const [items, setItems] = useState([]); // elementos según tipo
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  
  // Filtros comunes para campaña "nueva"
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterPago, setFilterPago] = useState('ALL');
  const [filterGrupoNumero, setFilterGrupoNumero] = useState('');
  const [filterDeuda, setFilterDeuda] = useState('ALL');

  // Filtros para campañas grupal / por líneas (solo búsqueda simple)
  const [grupalSearch, setGrupalSearch] = useState('');
  const [debouncedGrupalSearch, setDebouncedGrupalSearch] = useState('');
  const [lineasSearch, setLineasSearch] = useState('');
  const [debouncedLineasSearch, setDebouncedLineasSearch] = useState('');
  
  // Historial (Step 3)
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchLog, setSearchLog] = useState('');
  const [debouncedSearchLog, setDebouncedSearchLog] = useState('');
  const [filterLogEstado, setFilterLogEstado] = useState('ALL');

  // Modal detail state for Step 3
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  
  // Composición
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState(
    localStorage.getItem('n8n_webhook_campaign_url') || 'http://34.176.65.52:5678/webhook/envio-campana'
  );

  // Bot WhatsApp Sincronizador de Facturación
  const [botFile, setBotFile] = useState(null);
  const [uploadingBot, setUploadingBot] = useState(false);
  const [botResult, setBotResult] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [n8nBotWebhookUrl, setN8nBotWebhookUrl] = useState(
    localStorage.getItem('n8n_webhook_bot_url') || 'http://34.176.65.52:5678/webhook/actualizar-bot-respuestas'
  );

  // Bot WhatsApp - Pantalla Informativa y Simulador
  const [botActiveTab, setBotActiveTab] = useState('resumen'); // 'resumen' | 'lineas' | 'grupos' | 'test_bot'
  const [botFilterEmpresa, setBotFilterEmpresa] = useState('ALL');
  const [botSearch, setBotSearch] = useState('');
  const [customVencimiento, setCustomVencimiento] = useState('');
  const [applyingVto, setApplyingVto] = useState(false);
  const [botTestQuery, setBotTestQuery] = useState('');
  const [botTestResult, setBotTestResult] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  
  const editorRef = useRef(null);

  // Debounce búsquedas
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedGrupalSearch(grupalSearch), 300);
    return () => clearTimeout(timer);
  }, [grupalSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedLineasSearch(lineasSearch), 300);
    return () => clearTimeout(timer);
  }, [lineasSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchLog(searchLog), 300);
    return () => clearTimeout(timer);
  }, [searchLog]);

  // Cargar datos según tipo de campaña
  useEffect(() => {
    if (currentStep === 1 && campaignType) {
      if (campaignType === 'nueva') fetchSocios();
      else if (campaignType === 'grupal') fetchGrupos();
      else if (campaignType === 'lineas') fetchLineas();
    }
  }, [debouncedSearch, filterPago, filterGrupoNumero, filterDeuda, campaignType, currentStep, debouncedGrupalSearch, debouncedLineasSearch]);

  useEffect(() => {
    if (currentStep === 3) fetchLogs();
  }, [currentStep, debouncedSearchLog, filterLogEstado]);

  const handleWebhookUrlChange = (val) => {
    setN8nWebhookUrl(val);
    localStorage.setItem('n8n_webhook_campaign_url', val);
  };

  const handleBotWebhookUrlChange = (val) => {
    setN8nBotWebhookUrl(val);
    localStorage.setItem('n8n_webhook_bot_url', val);
  };

  const handleBotFileSelect = (file) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      addToast('Por favor seleccioná un archivo Excel válido (.xlsx o .xls)', 'error');
      return;
    }
    setBotFile(file);
    setBotResult(null);
    setBotTestResult(null);
  };

  const handleSyncBotBilling = async (vtoParam) => {
    if (!botFile) {
      addToast('Seleccioná un archivo Excel para sincronizar.', 'warning');
      return;
    }

    setUploadingBot(true);
    const vtoToUse = (vtoParam !== undefined ? vtoParam : customVencimiento).trim();

    try {
      const formData = new FormData();
      formData.append('data', botFile);
      formData.append('file', botFile);
      formData.append('archivo', botFile);
      if (vtoToUse) {
        formData.append('vencimiento', vtoToUse);
      }

      const targetUrl = n8nBotWebhookUrl || 'http://34.176.65.52:5678/webhook/actualizar-bot-respuestas';
      
      const response = await fetch(targetUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`El servidor respondió con error (${response.status}): ${errorText || response.statusText}`);
      }

      const result = await response.json();
      if (result.ok || result.success) {
        setBotResult(result);
        if (result.vencimiento) {
          setCustomVencimiento(result.vencimiento);
        } else if (vtoToUse) {
          setCustomVencimiento(vtoToUse);
        }
        addToast(
          `¡Éxito! Se procesaron ${result.lineas_procesadas || 0} líneas de ${result.empresas?.join(', ') || 'la prestadora'}.`,
          'success'
        );
      } else {
        throw new Error(result.error || 'Error al procesar el archivo Excel.');
      }
    } catch (err) {
      console.error('Error sincronizando bot WSP:', err);
      addToast(err.message || 'Error al conectar con el webhook del bot.', 'error');
      setBotResult({ ok: false, error: err.message });
    } finally {
      setUploadingBot(false);
    }
  };

  const handleApplyVencimiento = async () => {
    if (!customVencimiento.trim()) {
      addToast('Ingresá una fecha de vencimiento (ej: 15/08/2026)', 'warning');
      return;
    }

    setApplyingVto(true);
    try {
      // If we have the original botFile, re-sync with server
      if (botFile) {
        await handleSyncBotBilling(customVencimiento);
        addToast(`¡Vencimiento ${customVencimiento} aplicado y sincronizado en el servidor!`, 'success');
      } else if (botResult && botResult.ok) {
        // In-memory update
        const updated = { ...botResult, vencimiento: customVencimiento };
        if (updated.detalle_empresas) {
          Object.keys(updated.detalle_empresas).forEach(emp => {
            if (updated.detalle_empresas[emp]?.lineas) {
              updated.detalle_empresas[emp].lineas = updated.detalle_empresas[emp].lineas.map(l => ({ ...l, vto: customVencimiento }));
            }
          });
        }
        if (updated.detalle_grupos) {
          Object.keys(updated.detalle_grupos).forEach(g => {
            if (updated.detalle_grupos[g]) {
              updated.detalle_grupos[g].vto = customVencimiento;
            }
          });
        }
        setBotResult(updated);
        addToast(`Vencimiento actualizado a ${customVencimiento}`, 'success');
      }
    } catch (err) {
      console.error('Error al aplicar vencimiento:', err);
      addToast('Error al actualizar el vencimiento', 'error');
    } finally {
      setApplyingVto(false);
    }
  };

  // Formateadores idénticos a los del bot de WhatsApp en n8n
  const emprolijarGrupo = (groupNum, total, vto, lineas = []) => {
    const formattedGroup = String(groupNum).padStart(4, '0');
    const vtoStr = vto && vto.trim() ? vto.trim() : 's/d';
    const linesFormatted = (lineas || []).map(item => {
      const num = item.numero || '';
      const last4 = num.length >= 4 ? num.slice(-4) : num;
      return `• ...${last4} ${item.nombre}: $ ${item.total_str}`;
    });

    return `📊 *Detalle de Facturación - Grupo ${formattedGroup}* 📊\n\n` +
           `📅 *Vencimiento:* ${vtoStr}\n` +
           `💰 *Total del Grupo:* $ ${total}\n\n` +
           `📱 *Desglose de Líneas:*\n` +
           (linesFormatted.length > 0 ? linesFormatted.join('\n') : '• Sin líneas registradas');
  };

  const emprolijarCelular = (line, phoneNum, vto) => {
    const name = line.nombre || '';
    const vtoStr = vto && vto.trim() ? vto.trim() : (line.vto || 's/d');
    const total = line.total_str || '0';
    const grupo = line.grupo ? line.grupo : null;
    const plan = line.plan ? line.plan.trim() : null;
    const exc = line.excedente_str && line.excedente_str !== '0' ? line.excedente_str : null;
    const comp = line.empresa ? line.empresa : '';

    return `📱 *Detalle de tu Factura* 📱\n\n` +
           `¡Hola ${name}! Te enviamos los detalles de tu línea:\n\n` +
           `📞 *Número:* ${phoneNum}\n` +
           (comp ? `🏢 *Empresa:* ${comp}\n` : '') +
           (plan ? `📦 *Plan:* ${plan}\n` : '') +
           `📅 *Vencimiento:* ${vtoStr}\n\n` +
           `💰 *Importe:* $ ${total} (luego del vencimiento aplica +10%)\n` +
           (exc ? `⚠️ *Excedentes:* $ ${exc}\n\n` : '\n') +
           (grupo ? `👥 *Grupo:* #${grupo}` : '');
  };

  const handleTestBotQuery = (queryText) => {
    const q = (queryText !== undefined ? queryText : botTestQuery).trim();
    if (!q) {
      setBotTestResult(null);
      return;
    }
    
    setBotTestQuery(q);
    const qClean = q.replace(/\D/g, '');
    const vtoActual = customVencimiento || botResult?.vencimiento || '';

    // Comandos estáticos con el formato exacto del Bot
    const staticCommands = {
      '#menu': `¡Hola! Gracias por comunicarte con Aunar Mutual.\n⏰ Atención Lunes a Viernes | 08:45 a 13:45 hs.\n\n🤖 *Menú Auto-Consulta:*\nEscribí el texto con el # incluido para la respuesta:\n👉 Ejemplo *#2216210369* (Importe de factura)\n🧑🤝🧑 *#* + núm de grupo (Importe del grupo)\n📊 *#abono* (Formas de Consultar Abono y Saldo en curso)\n🔄 *#recarga* (Opciones de Recargar Datos, o saldo para Llamadas)\n🤝 *#pago* (Formas de pago)\n\n⚙️ *Otras:*\n• 📶 *#red* (Por Inconvenientes técnicos y posibles soluciones)\n• 📱 *#equipos* (Compras de equipos)\n• 🛟 *#autogestion* (comunicarse con la empresa prestadora del servicio)\n• ✈️ *#roaming* (¿Te vas de viaje? Averiguá sobre el roaming)\n\n🚨 *Urgencias* (si fuera de horario no podés usar tu móvil: WhatsApp al 👉 *2216260506*)`,
      'menu': `¡Hola! Gracias por comunicarte con Aunar Mutual.\n⏰ Atención Lunes a Viernes | 08:45 a 13:45 hs.\n\n🤖 *Menú Auto-Consulta:*\nEscribí el texto con el # incluido para la respuesta:\n👉 Ejemplo *#2216210369* (Importe de factura)\n🧑🤝🧑 *#* + núm de grupo (Importe del grupo)\n📊 *#abono* (Formas de Consultar Abono y Saldo en curso)\n🔄 *#recarga* (Opciones de Recargar Datos, o saldo para Llamadas)\n🤝 *#pago* (Formas de pago)\n\n⚙️ *Otras:*\n• 📶 *#red* (Por Inconvenientes técnicos y posibles soluciones)\n• 📱 *#equipos* (Compras de equipos)\n• 🛟 *#autogestion* (comunicarse con la empresa prestadora del servicio)\n• ✈️ *#roaming* (¿Te vas de viaje? Averiguá sobre el roaming)\n\n🚨 *Urgencias* (si fuera de horario no podés usar tu móvil: WhatsApp al 👉 *2216260506*)`,
      '#pago': `🤝 *Medios de Pago Mutual AUNAR:*\n\n1️⃣ *Transferencia Bancaria / CBU / Alias*\nSolicitá los datos de cuenta institucional a nuestro WhatsApp de atención.\n\n2️⃣ *Débito Automático en Cuenta (CBU)*\nPodés adherirte enviándonos tu constancia de CBU por este medio.\n\n3️⃣ *Cobro en Efectivo / Cobranzas*\nLunes a Viernes de 08:45 a 13:45 hs en sede mutual.`,
      'pago': `🤝 *Medios de Pago Mutual AUNAR:*\n\n1️⃣ *Transferencia Bancaria / CBU / Alias*\nSolicitá los datos de cuenta institucional a nuestro WhatsApp de atención.\n\n2️⃣ *Débito Automático en Cuenta (CBU)*\nPodés adherirte enviándonos tu constancia de CBU por este medio.\n\n3️⃣ *Cobro en Efectivo / Cobranzas*\nLunes a Viernes de 08:45 a 13:45 hs en sede mutual.`,
      '#red': `📶 *Inconvenientes Técnicos y Red de Cobertura:*\n\nSi experimentás falta de señal o datos móviles:\n1. Reiniciá tu teléfono durante 30 segundos.\n2. Verificá que el 'Modo Avión' esté desactivado.\n3. Asegurate de tener los 'Datos Móviles' e 'Itinerancia' activados.\n4. Si el problema persiste, comunicate al soporte técnico de guardia.`,
      'red': `📶 *Inconvenientes Técnicos y Red de Cobertura:*\n\nSi experimentás falta de señal o datos móviles:\n1. Reiniciá tu teléfono durante 30 segundos.\n2. Verificá que el 'Modo Avión' esté desactivado.\n3. Asegurate de tener los 'Datos Móviles' e 'Itinerancia' activados.\n4. Si el problema persiste, comunicate al soporte técnico de guardia.`,
      '#autogestion': `🛟 *Autogestión por Prestadora:*\n\n• *Claro:* App 'Mi Claro' o marcá *611#\n• *Personal:* App 'Mi Personal' o marcá *111\n• *Movistar:* App 'Mi Movistar' o marcá *611`,
      'autogestion': `🛟 *Autogestión por Prestadora:*\n\n• *Claro:* App 'Mi Claro' o marcá *611#\n• *Personal:* App 'Mi Personal' o marcá *111\n• *Movistar:* App 'Mi Movistar' o marcá *611`
    };

    const lowerQ = q.toLowerCase();
    if (staticCommands[lowerQ]) {
      setBotTestResult({
        ok: true,
        query: q,
        tipo: 'comando',
        respuesta: staticCommands[lowerQ]
      });
      return;
    }

    if (botResult && botResult.ok) {
      // 1. Buscar en líneas individuales
      let foundLine = null;
      if (botResult.detalle_empresas) {
        for (const emp of Object.keys(botResult.detalle_empresas)) {
          const lines = botResult.detalle_empresas[emp]?.lineas || [];
          const match = lines.find(l => l.numero === qClean || (qClean.length >= 6 && l.numero.endsWith(qClean)));
          if (match) {
            foundLine = { ...match, empresa: emp };
            break;
          }
        }
      }

      if (foundLine) {
        const lineVto = foundLine.vto || vtoActual;
        const respFormatted = emprolijarCelular(foundLine, foundLine.numero, lineVto);
        setBotTestResult({
          ok: true,
          query: q,
          tipo: 'linea',
          detalle: foundLine,
          respuesta: respFormatted
        });
        return;
      }

      // 2. Buscar en grupos
      if (botResult.detalle_grupos) {
        const groupData = botResult.detalle_grupos[q] || botResult.detalle_grupos[qClean];
        if (groupData) {
          const gVto = groupData.vto || vtoActual;
          const respFormatted = emprolijarGrupo(qClean || q, groupData.total, gVto, groupData.lineas);
          setBotTestResult({
            ok: true,
            query: q,
            tipo: 'grupo',
            detalle: groupData,
            respuesta: respFormatted
          });
          return;
        }
      }
    }

    setBotTestResult({
      ok: false,
      query: q,
      tipo: 'no_encontrado',
      respuesta: `⚠️ No se encontró ninguna línea ni grupo correspondiente a "${q}". Verificá que el número de 10 dígitos o el ID de grupo esté cargado en el archivo Excel.`
    });
  };

  const toggleGroupExpand = (groupId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // --------------- FETCHS PARA CADA TIPO ---------------
  async function fetchSocios() {
    setLoading(true);
    try {
      let query = supabase
        .from('v_socios_busqueda')
        .select('socio_id, nombre_completo, email, dni, cuit, fpago, monto_cuota_cel, cta_numero, total_cuotas, grupo_codigo_str, lineas')
        .eq('tiene_email', true);

      if (debouncedSearch.trim()) {
        query = query.ilike('search_text', `%${debouncedSearch.toLowerCase()}%`);
      }
      if (filterPago !== 'ALL') query = query.eq('fpago', filterPago);
      if (filterGrupoNumero.trim()) {
        query = query.ilike('grupo_codigo_str', `%${filterGrupoNumero.trim()}%`);
      }
      if (filterDeuda === 'CON_DEUDA') query = query.gt('total_cuotas', 0);
      else if (filterDeuda === 'SIN_DEUDA') query = query.eq('total_cuotas', 0);

      query = query.order('nombre_completo', { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      
      const mapped = (data || []).map(s => ({
        id: `socio_${s.socio_id}`,
        socio_id_num: s.socio_id,
        nombre: s.nombre_completo,
        email: s.email,
        dni: s.dni || '',
        cuit: s.cuit || '',
        fpago: s.fpago || '',
        grupo: s.grupo_codigo_str || 'Sin Grupo',
        lineas: s.lineas ? (Array.isArray(s.lineas) ? s.lineas.map(l => l.numero_linea).join(', ') : String(s.lineas)) : 'Sin Línea',
        total_cuotas: s.total_cuotas || 0,
        monto_cuota_cel: s.monto_cuota_cel || 0,
        monto_adeudado: (Number(s.total_cuotas || 0) * Number(s.monto_cuota_cel || 0)).toFixed(2),
        dias_mora: s.total_cuotas > 0 ? String(s.total_cuotas * 30) : '0',
        periodo: '',
        detalle_lineas: []
      }));

      // --- Enriquecer con facturación del último período ---
      try {
        const { data: periodoData } = await supabase
          .from('consumos_mensuales')
          .select('periodo')
          .order('periodo', { ascending: false })
          .limit(1);
        const ultimoPeriodo = periodoData?.[0]?.periodo;

        if (ultimoPeriodo) {
          const { data: facturacion } = await supabase
            .from('v_historial_facturacion_socio')
            .select('socio_id, numero_linea, nombre_plan, proveedor, costo_abono_real, excedentes, bonificaciones, total_linea')
            .eq('periodo', ultimoPeriodo);

          const facturacionPorSocio = {};
          (facturacion || []).forEach(f => {
            if (!facturacionPorSocio[f.socio_id]) facturacionPorSocio[f.socio_id] = [];
            facturacionPorSocio[f.socio_id].push(f);
          });

          mapped.forEach(item => {
            const lineasFactura = facturacionPorSocio[item.socio_id_num] || [];
            item.periodo = ultimoPeriodo;
            item.detalle_lineas = lineasFactura;
            if (lineasFactura.length > 0) {
              item.monto_adeudado = lineasFactura.reduce((sum, l) => sum + Number(l.total_linea || 0), 0).toFixed(2);
              item.lineas = lineasFactura.map(l => l.numero_linea).join(', ');
            }
          });
        }
      } catch (facErr) {
        console.error('Error al enriquecer con facturación:', facErr);
      }

      setItems(mapped);
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      addToast('Error al cargar socios', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchGrupos() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('grupos')
        .select('numero_grupo, alias_grupo, email_facturacion')
        .not('email_facturacion', 'is', null)
        .order('numero_grupo', { ascending: true });

      if (error) throw error;

      let list = data || [];
      const term = debouncedGrupalSearch.trim().toLowerCase();
      if (term) {
        list = list.filter(g => 
          String(g.numero_grupo).includes(term) ||
          (g.alias_grupo && g.alias_grupo.toLowerCase().includes(term)) ||
          (g.email_facturacion && g.email_facturacion.toLowerCase().includes(term))
        );
      }

      const mapped = list.map(g => ({
        id: `grupo_${g.numero_grupo}`,
        nombre: `Grupo ${g.numero_grupo}${g.alias_grupo ? ` - ${g.alias_grupo}` : ''}`,
        email: g.email_facturacion,
        grupo: g.numero_grupo,
        lineas: `Gpo ${g.numero_grupo}`,
        dni: '',
        cuit: '',
        fpago: 'Grupo',
        monto_cuota_cel: 0,
        total_cuotas: 0,
        monto_adeudado: 0,
        dias_mora: '0',
        periodo: '',
        detalle_lineas: []
      }));

      // Enriquecer con última facturación del grupo
      try {
        const { data: ultLiqs } = await supabase
          .from('liquidaciones_grupos')
          .select('numero_grupo, periodo, monto_total_facturado')
          .order('periodo', { ascending: false });

        if (ultLiqs && ultLiqs.length > 0) {
          const ultimoPeriodo = ultLiqs[0].periodo;
          const liqsMap = {};
          ultLiqs.filter(l => l.periodo === ultimoPeriodo).forEach(l => {
            liqsMap[l.numero_grupo] = (liqsMap[l.numero_grupo] || 0) + Number(l.monto_total_facturado || 0);
          });
          mapped.forEach(item => {
            if (liqsMap[item.grupo]) {
              item.monto_adeudado = liqsMap[item.grupo].toFixed(2);
              item.periodo = ultimoPeriodo;
            }
          });
        }
      } catch (e) {
        console.warn('Error al enriquecer facturación grupal:', e);
      }

      setItems(mapped);
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      addToast('Error al cargar grupos', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchLineas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_lineas_email')
        .select('linea_id, numero_linea, email_contacto, nombre_socio')
        .order('numero_linea', { ascending: true });

      if (error) throw error;

      let list = (data || []).filter(l => l.numero_linea && !l.numero_linea.startsWith('000') && l.numero_linea.length >= 8);
      const term = debouncedLineasSearch.trim().toLowerCase();
      if (term) {
        list = list.filter(l =>
          (l.numero_linea && l.numero_linea.includes(term)) ||
          (l.nombre_socio && l.nombre_socio.toLowerCase().includes(term)) ||
          (l.email_contacto && l.email_contacto.toLowerCase().includes(term))
        );
      }

      const mapped = list.map(l => ({
        id: `linea_${l.linea_id}`,
        nombre: l.nombre_socio || 'Sin nombre',
        nombre_socio: l.nombre_socio || 'Sin nombre',
        display_detalle: `${l.nombre_socio || 'Sin nombre'} (Línea: ${l.numero_linea})`,
        email: l.email_contacto,
        grupo: 'Sin Grupo',
        lineas: l.numero_linea,
        dni: '',
        cuit: '',
        fpago: 'Línea',
        monto_cuota_cel: 0,
        total_cuotas: 0,
        monto_adeudado: 0,
        dias_mora: '0',
        periodo: '',
        detalle_lineas: []
      }));

      // Enriquecer con facturación del último período
      try {
        const { data: periodoData } = await supabase
          .from('consumos_mensuales')
          .select('periodo')
          .order('periodo', { ascending: false })
          .limit(1);
        const ultimoPeriodo = periodoData?.[0]?.periodo;

        if (ultimoPeriodo) {
          const { data: facturacion } = await supabase
            .from('v_historial_facturacion_socio')
            .select('socio_id, numero_linea, nombre_plan, proveedor, costo_abono_real, excedentes, bonificaciones, total_linea')
            .eq('periodo', ultimoPeriodo);

          const factMap = new Map();
          (facturacion || []).forEach(f => {
            if (f.numero_linea) factMap.set(f.numero_linea, f);
          });

          mapped.forEach(item => {
            item.periodo = ultimoPeriodo;
            const fact = factMap.get(item.lineas);
            if (fact) {
              item.detalle_lineas = [fact];
              item.monto_adeudado = Number(fact.total_linea || 0).toFixed(2);
              if (fact.costo_abono_real) item.monto_cuota_cel = fact.costo_abono_real;
            }
          });
        }
      } catch (e) {
        console.warn('Error al enriquecer facturación por líneas:', e);
      }

      setItems(mapped);
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      addToast('Error al cargar líneas', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchLogs() {
    setLoadingLogs(true);
    try {
      let query = supabase.from('campanas_logs').select('*');
      if (debouncedSearchLog.trim()) {
        const s = `%${debouncedSearchLog.trim().toLowerCase()}%`;
        query = query.or(`nombre_campana.ilike.${s},destinatario_nombre.ilike.${s},destinatario_email.ilike.${s},asunto.ilike.${s}`);
      }
      if (filterLogEstado !== 'ALL') query = query.eq('estado', filterLogEstado);
      query = query.order('created_at', { ascending: false }).limit(200);
      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error(err);
      addToast('Error al cargar historial', 'error');
    } finally {
      setLoadingLogs(false);
    }
  }

  // --------------- MANEJO DE SELECCIÓN ---------------
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length && items.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const toggleItem = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // --------------- ENVÍO ---------------
  const handleSendCampaign = async () => {
    if (!campaignName.trim()) return addToast('Introduce un nombre de campaña', 'warning');
    if (!subject.trim()) return addToast('Introduce un asunto', 'warning');
    if (!bodyHtml.trim() || bodyHtml === '<br>') return addToast('El cuerpo del correo está vacío', 'warning');
    if (selectedIds.size === 0) return addToast('Selecciona al menos un destinatario', 'warning');
    if (!n8nWebhookUrl.trim()) return addToast('Falta la URL del webhook', 'warning');

    setSending(true);

    const selectedItems = items.filter(i => selectedIds.has(i.id));

    // Consolidar destinatarios por email para que si una persona tiene múltiples líneas reciba un único correo agrupado
    const emailGroups = new Map();
    selectedItems.forEach(item => {
      const emailKey = (item.email || '').trim().toLowerCase();
      if (!emailKey) return;

      if (!emailGroups.has(emailKey)) {
        emailGroups.set(emailKey, {
          socio_id: item.id,
          nombre_completo: item.nombre_socio || item.nombre,
          nombre_socio: item.nombre_socio || item.nombre,
          email: item.email,
          dni: item.dni || '',
          cuit: item.cuit || '',
          fpago: item.fpago || '',
          grupo: item.grupo || 'Sin Grupo',
          lineasSet: new Set(),
          monto_cuota_cel: item.monto_cuota_cel || 0,
          total_cuotas: item.total_cuotas || 0,
          monto_adeudado_num: 0,
          dias_mora: item.dias_mora || '0',
          periodo: item.periodo || '',
          detalle_lineas: []
        });
      }

      const g = emailGroups.get(emailKey);

      // Agregar números de línea
      if (item.lineas) {
        String(item.lineas).split(',').forEach(l => {
          const trimmed = l.trim();
          if (trimmed && trimmed !== 'Sin Línea') g.lineasSet.add(trimmed);
        });
      }

      // Sumar monto adeudado
      g.monto_adeudado_num += Number(item.monto_adeudado || 0);

      // Consolidar detalles de líneas evitando duplicados
      if (item.detalle_lineas && item.detalle_lineas.length > 0) {
        item.detalle_lineas.forEach(dl => {
          if (!g.detalle_lineas.some(existing => existing.numero_linea === dl.numero_linea)) {
            g.detalle_lineas.push(dl);
          }
        });
      }

      if (item.periodo && !g.periodo) g.periodo = item.periodo;
      if (item.dni && !g.dni) g.dni = item.dni;
      if (item.cuit && !g.cuit) g.cuit = item.cuit;
      if (item.fpago && !g.fpago) g.fpago = item.fpago;
    });

    const recipients = Array.from(emailGroups.values()).map(g => ({
      socio_id: g.socio_id,
      nombre_completo: g.nombre_completo,
      nombre_socio: g.nombre_socio,
      email: g.email,
      dni: g.dni,
      cuit: g.cuit,
      fpago: g.fpago,
      grupo: g.grupo,
      lineas: Array.from(g.lineasSet).join(', ') || 'Sin Línea',
      monto_cuota_cel: g.monto_cuota_cel,
      total_cuotas: g.total_cuotas,
      monto_adeudado: g.monto_adeudado_num.toFixed(2),
      dias_mora: g.dias_mora,
      periodo: g.periodo,
      detalle_lineas_html: g.detalle_lineas.map(l =>
        `<tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding:8px; font-size:13px;">${l.numero_linea}</td>
          <td style="padding:8px; font-size:13px;">${l.nombre_plan || '-'}</td>
          <td style="padding:8px; font-size:13px;">${l.proveedor || '-'}</td>
          <td style="padding:8px; font-size:13px; text-align:right;">$ ${Number(l.costo_abono_real || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
          <td style="padding:8px; font-size:13px; text-align:right;">$ ${Number(l.excedentes || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
          <td style="padding:8px; font-size:13px; text-align:right; font-weight:bold;">$ ${Number(l.total_linea || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
        </tr>`
      ).join('')
    }));

    try {
      // Sanitizar HTML antes de enviar
      const sanitizedBody = DOMPurify.sanitize(bodyHtml);

      // Obtener token de sesión para el proxy
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const proxyUrl = 'https://zwncyaviinmfzvminytv.supabase.co/functions/v1/n8n-proxy';
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-target-url': n8nWebhookUrl.trim(),
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          campaignName: campaignName.trim(),
          subject: subject.trim(),
          bodyHtml: sanitizedBody,
          recipients,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const consolidatedInfo = selectedItems.length > recipients.length ? ` (${selectedItems.length} líneas consolidadas)` : '';
      addToast(`Campaña enviada para ${recipients.length} destinatarios únicos${consolidatedInfo}`, 'success');
      setCampaignName('');
      setSubject('');
      setBodyHtml('');
      if (editorRef.current) editorRef.current.innerHTML = '';
      setSelectedIds(new Set());
      setCurrentStep(3);
    } catch (err) {
      console.error(err);
      addToast('Error al conectar con n8n', 'error');
    } finally {
      setSending(false);
    }
  };

  const runCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    if (editorRef.current) setBodyHtml(editorRef.current.innerHTML);
  };

  const insertVariable = (variable) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const textNode = document.createTextNode(variable);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
    setBodyHtml(editor.innerHTML);
  };

  const handleLoadTemplate = (type) => {
    if (type === 'vacia') {
      setCampaignName('');
      setSubject('');
      setBodyHtml('');
      if (editorRef.current) editorRef.current.innerHTML = '';
      return;
    }
    const now = new Date();
    const mesAnio = now.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
    const mesAnioCapitalized = mesAnio.charAt(0).toUpperCase() + mesAnio.slice(1);

    const templates = {
      aunar: {
        name: `Comunicación Oficial - ${mesAnioCapitalized}`,
        subject: 'Información Importante de Telefonía Celular - {{nombre_socio}}',
        body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #334155;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="https://proyecto-mutual.vercel.app/logo.png" alt="Aunar Asociación" style="max-width: 240px; height: auto;" />
  </div>
  
  <h2 style="font-size: 16px; font-weight: bold; color: #1e293b; margin-bottom: 16px;">Estimado Socio de AUNAR</h2>
  
  <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 12px 16px; margin-bottom: 20px; border-radius: 8px;">
    <p style="margin: 0; font-size: 14px; font-weight: bold; color: #1e293b;">
      {{nombre_socio}} — Facturación Período {{periodo}}
    </p>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
    <thead>
      <tr style="background-color: #10b981; color: #ffffff;">
        <th style="padding: 8px 10px; text-align: left; font-size: 13px;">Línea</th>
        <th style="padding: 8px 10px; text-align: left; font-size: 13px;">Plan</th>
        <th style="padding: 8px 10px; text-align: left; font-size: 13px;">Empresa</th>
        <th style="padding: 8px 10px; text-align: right; font-size: 13px;">Abono</th>
        <th style="padding: 8px 10px; text-align: right; font-size: 13px;">Excedentes</th>
        <th style="padding: 8px 10px; text-align: right; font-size: 13px;">Total</th>
      </tr>
    </thead>
    <tbody>
      {{detalle_lineas_html}}
    </tbody>
  </table>

  <div style="background-color: #f0fdf4; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; text-align: right;">
    <p style="margin: 0; font-size: 15px; font-weight: bold; color: #166534;">Total del período: $ {{monto_adeudado}}</p>
  </div>
  
  <p style="font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
    Tenemos el agrado de asegurarte que en todos los casos y en las distintas modalidades, los abonos que te ofrecemos siguen siendo siempre los más económicos (si precisas más información nosotros llevamos tablas comparativas con todas las empresas).
  </p>
  <p style="font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
    Contamos con flota en Claro, Personal y Movistar, para seguir ofreciéndote siempre lo mejor. Aún se mantienen las opciones de portabilidad y descuentos de % por 12 meses en los abonos de cada empresa, nosotros nos encargamos de todo el trámite, en caso de estar interesado, consúltanos.
  </p>
  <p style="font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
    También estamos ofreciendo un descuento especial para vos y para quienes acerques como nuevos asociados, ingresando a cualquiera de la flotas.
  </p>
  <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
    Si estás por viajar fuera del país, comunicate con anticipación suficiente (1 mes previamente es lo ideal) para poder asesorarte de las tarifas roaming de tu abono, y también así poder también activar el mismo.
  </p>
  
  <p style="font-size: 14px; line-height: 1.6; margin-bottom: 24px; font-style: italic;">
    Gracias por confiar siempre en nosotros, esperamos te haya interesado la información brindada, y ante cualquier duda o sugerencia comunícate, te enviamos un afectuoso saludo desde la Mutual Aunar.
  </p>
  
  <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
    <div style="margin-bottom: 12px;">
      <a href="#" style="color: #64748b; text-decoration: none; margin: 0 8px;">Facebook</a> | 
      <a href="#" style="color: #64748b; text-decoration: none; margin: 0 8px;">Instagram</a> | 
      <a href="#" style="color: #64748b; text-decoration: none; margin: 0 8px;">Twitter</a>
    </div>
    <p style="margin: 0 0 4px 0;">Copyright &copy; 2026 AUNAR MUTUAL. Todos los derechos reservados.</p>
    <p style="margin: 0 0 12px 0;">Has recibido este correo electrónico porque lo has aceptado en nuestro sitio web.</p>
    <p style="margin: 0; font-weight: bold;">AUNAR MUTUAL · 46 Diag. 76 · La Plata, Buenos Aires · Argentina</p>
  </div>
</div>`
      },
      deuda: {
        name: `Cobro y Vencimiento de Cuotas - ${mesAnioCapitalized}`,
        subject: 'Aviso de Vencimiento de Telefonía Celular - {{nombre_socio}}',
        body: `<p>Estimado/a <strong>{{nombre_socio}}</strong>,</p>
<p>Nos comunicamos desde la <strong>Asociación Mutual Aunar</strong> para recordarte que tu abono de telefonía celular posee saldo pendiente.</p>
<p><strong>Detalle actual de tu cuenta:</strong></p>
<ul>
  <li><strong>Grupo Asociado:</strong> #{{grupo}}</li>
  <li><strong>Línea/s:</strong> {{lineas}}</li>
  <li><strong>Forma de Pago:</strong> {{fpago}}</li>
  <li><strong>Cuotas Pendientes:</strong> {{dias_mora}} días de mora</li>
  <li><strong>Monto Adeudado:</strong> $ {{monto_adeudado}}</li>
</ul>
<p>Por favor, si ya realizaste el pago o estás adherido al débito automático, desestima este mensaje. De lo contrario, recordá regularizar tu situación a la brevedad mediante transferencia al CBU habitual de la mutual.</p>
<p>Quedamos a tu disposición ante cualquier consulta.</p>
<p>Saludos cordiales,<br><strong>Asociación Mutual Aunar</strong></p>`
      },
      bienvenida: {
        name: 'Bienvenida Nuevos Socios',
        subject: '¡Te damos la bienvenida a la Mutual Aunar, {{nombre_socio}}!',
        body: `<p>Hola <strong>{{nombre_socio}}</strong>,</p>
<p>¡Te damos la bienvenida a la <strong>Asociación Mutual Aunar</strong>!</p>
<p>Tu línea de telefonía celular ya se encuentra activa y asociada a los beneficios corporativos de la mutual.</p>
<p>A continuación te recordamos los datos de tu alta:</p>
<ul>
  <li><strong>Nombre del Asociado:</strong> {{nombre_socio}}</li>
  <li><strong>D.N.I.:</strong> {{dni}}</li>
  <li><strong>Línea/s Asignada/s:</strong> {{lineas}}</li>
  <li><strong>Grupo Asignado:</strong> #{{grupo}}</li>
  <li><strong>Forma de Pago:</strong> {{fpago}}</li>
</ul>
<p>Cualquier duda o consulta técnica sobre tu línea podés comunicarte directamente con nosotros o con el operador correspondiente.</p>
<p>¡Gracias por confiar en nosotros!<br><strong>Asociación Mutual Aunar</strong></p>`
      },
      aumento: {
        name: `Notificación de Aumento - ${mesAnioCapitalized}`,
        subject: 'Actualización de tarifas abono de telefonía - {{nombre_socio}}',
        body: `<p>Estimado/a <strong>{{nombre_socio}}</strong>,</p>
<p>Te escribimos para informarte que, debido a los ajustes de tarifas aplicados por las prestatarias telefónicas, el abono mensual de tu línea sufrirá una actualización.</p>
<p><strong>Nuevo detalle estimado de tu línea:</strong></p>
<ul>
  <li><strong>Socio:</strong> {{nombre_socio}}</li>
  <li><strong>Línea/s:</strong> {{lineas}}</li>
  <li><strong>Nuevo Valor de Abono Mensual:</strong> $ {{monto_cuota_cel}}</li>
</ul>
<p>Seguimos trabajando para mantener las mejores tarifas corporativas posibles para todos nuestros asociados.</p>
<p>Quedamos a tu entera disposición ante cualquier consulta.</p>
<p>Saludos cordiales,<br><strong>Asociación Mutual Aunar</strong></p>`
      }
    }[type];

    if (templates) {
      setCampaignName(templates.name);
      setSubject(templates.subject);
      setBodyHtml(templates.body);
      if (editorRef.current) editorRef.current.innerHTML = templates.body;
      addToast('Plantilla cargada con éxito.', 'success');
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoString;
    }
  };

  const openLogDetail = (log) => {
    setSelectedLog(log);
    setIsDetailModalOpen(true);
  };

  const variables = [
    { label: 'Nombre Completo', value: '{{nombre_socio}}' },
    { label: 'Líneas', value: '{{lineas}}' },
    { label: 'D.N.I.', value: '{{dni}}' },
    { label: 'C.U.I.T.', value: '{{cuit}}' },
    { label: 'Forma de Pago', value: '{{fpago}}' },
    { label: 'Monto de Cuota', value: '{{monto_cuota_cel}}' },
    { label: 'Nro de Grupo', value: '{{grupo}}' },
    { label: 'Monto Adeudado', value: '{{monto_adeudado}}' },
    { label: 'Días de Mora', value: '{{dias_mora}}' },
    { label: 'Período Facturado', value: '{{periodo}}' },
    { label: 'Detalle Líneas (Tabla)', value: '{{detalle_lineas_html}}' }
  ];

  const totalSelected = selectedIds.size;
  const selectedRecipientsList = items.filter(i => selectedIds.has(i.id));
  const uniqueEmailsCount = useMemo(() => {
    const emails = new Set(selectedRecipientsList.map(i => (i.email || '').trim().toLowerCase()).filter(Boolean));
    return emails.size;
  }, [selectedRecipientsList]);

  /* ─────────────────────── Inline Styles ─────────────────────── */

  const S = {
    uploadZone: {
      border: '2px dashed var(--border-light)',
      borderRadius: '16px',
      padding: '16px',
      textAlign: 'center',
      background: 'rgba(255,255,255,0.2)',
      marginBottom: '16px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
    },
    loadedZone: {
      background: 'linear-gradient(135deg, rgba(46,125,50,0.05) 0%, rgba(46,125,50,0.1) 100%)',
      border: '1px solid rgba(46,125,50,0.2)',
      borderRadius: '16px',
      padding: '12px 18px',
      marginBottom: '16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    page: {
      padding: '32px',
      maxWidth: '1400px',
      margin: '0 auto',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    },
    card: {
      background: 'var(--surface)',
      backdropFilter: 'blur(16px) saturate(140%)',
      WebkitBackdropFilter: 'blur(16px) saturate(140%)',
      border: '1px solid var(--border-light)',
      borderRadius: '24px',
      boxShadow: 'var(--shadow-soft)',
      padding: '24px',
      marginBottom: '20px',
    },
    headerRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '16px',
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
    },
    iconCircle: {
      width: '44px',
      height: '44px',
      borderRadius: '14px',
      background: 'linear-gradient(135deg, var(--accent-light) 0%, rgba(46,125,50,0.18) 100%)',
      color: 'var(--accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    title: {
      fontSize: '18px',
      fontWeight: 800,
      margin: 0,
      color: 'var(--text-primary)',
      letterSpacing: '-0.02em',
    },
    subtitle: {
      fontSize: '12px',
      margin: 0,
      color: 'var(--text-secondary)',
      fontWeight: 500,
    },
    wizardBar: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '6px 20px',
      background: 'rgba(255,255,255,0.4)',
      border: '1px solid var(--border-light)',
      borderRadius: '100px',
    },
    wizardStep: (active) => ({
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '13px',
      fontWeight: 600,
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
      opacity: active ? 1 : 0.55,
      transition: 'all 0.3s',
      border: 'none',
      background: 'none',
      padding: 0,
    }),
    wizardCircle: (active) => ({
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      border: `2px solid ${active ? 'var(--accent)' : 'var(--text-secondary)'}`,
      background: active ? 'var(--accent-light)' : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      fontWeight: 700,
    }),
    wizardLine: {
      width: '40px',
      height: '2px',
      background: 'var(--border-light)',
    },
    label: {
      fontSize: '10px',
      fontWeight: 700,
      color: 'var(--text-secondary)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: '4px',
    },
    input: {
      background: 'rgba(255,255,255,0.5)',
      border: '1px solid var(--border-light)',
      borderRadius: '10px',
      padding: '9px 14px',
      fontSize: '13px',
      color: 'var(--text-primary)',
      outline: 'none',
      width: '100%',
      transition: 'all 0.2s',
    },
    filtersGrid: {
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr 100px',
      gap: '12px',
      alignItems: 'end',
      marginBottom: '16px',
    },
    badge: {
      background: 'var(--accent-light)',
      color: 'var(--accent)',
      fontSize: '12px',
      fontWeight: 700,
      padding: '6px 14px',
      borderRadius: '100px',
      border: '1px solid var(--border-light)',
      whiteSpace: 'nowrap',
    },
    table: {
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: 0,
    },
    th: {
      fontSize: '11px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--text-secondary)',
      padding: '14px 16px',
      borderBottom: '2px solid var(--border-light)',
      textAlign: 'left',
      position: 'sticky',
      top: 0,
      background: 'var(--surface)',
      zIndex: 5,
    },
    td: {
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-light)',
      verticalAlign: 'middle',
    },
    btnPrimary: {
      background: 'linear-gradient(135deg, var(--accent) 0%, #1b5e20 100%)',
      color: '#ffffff',
      border: 'none',
      fontWeight: 600,
      fontSize: '14px',
      padding: '12px 24px',
      borderRadius: '12px',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 6px 16px var(--accent-shadow)',
      transition: 'all 0.25s ease',
    },
    btnSecondary: {
      background: 'rgba(0,0,0,0.04)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-light)',
      fontWeight: 600,
      fontSize: '14px',
      padding: '12px 20px',
      borderRadius: '12px',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      transition: 'all 0.2s',
    },
    chip: {
      background: 'var(--accent-light)',
      border: '1px dashed var(--accent)',
      color: 'var(--text-primary)',
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      transition: 'all 0.15s ease',
      whiteSpace: 'nowrap',
    },
    editorWrapper: {
      border: '1px solid var(--border-light)',
      borderRadius: '14px',
      overflow: 'hidden',
      background: 'rgba(255,255,255,0.5)',
    },
    editorToolbar: {
      display: 'flex',
      gap: '2px',
      padding: '8px 10px',
      background: 'rgba(255,255,255,0.8)',
      borderBottom: '1px solid var(--border-light)',
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    toolbarBtn: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--text-secondary)',
      padding: '6px 7px',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.15s',
    },
    editorArea: {
      padding: '16px 18px',
      minHeight: '320px',
      fontSize: '14px',
      lineHeight: 1.6,
      color: 'var(--text-primary)',
      outline: 'none',
    },
    recipientMini: {
      background: 'rgba(255,255,255,0.4)',
      border: '1px solid var(--border-light)',
      borderRadius: '10px',
      padding: '10px 14px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    splitLayout: {
      display: 'grid',
      gridTemplateColumns: '300px 1fr',
      gap: '20px',
      alignItems: 'start',
    },
    sectionTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    sectionTitleText: {
      fontSize: '15px',
      fontWeight: 700,
      margin: 0,
      color: 'var(--text-primary)',
    },
    emptyState: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      color: 'var(--text-secondary)',
    },
    fpagoBadge: (fpago) => {
      let bg = 'rgba(180,83,9,0.1)';
      let fg = '#b45309';
      let border = '1px solid rgba(180,83,9,0.15)';
      
      if (fpago === 'D') {
        bg = 'rgba(3,105,161,0.1)';
        fg = '#0369a1';
        border = '1px solid rgba(3,105,161,0.15)';
      } else if (fpago === 'Grupo') {
        bg = 'rgba(109,40,217,0.1)';
        fg = '#6d28d9';
        border = '1px solid rgba(109,40,217,0.15)';
      } else if (fpago === 'Línea') {
        bg = 'rgba(79,70,229,0.1)';
        fg = '#4f46e5';
        border = '1px solid rgba(79,70,229,0.15)';
      }
      
      return {
        fontSize: '10px',
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: '6px',
        background: bg,
        color: fg,
        border: border
      };
    },
    tableWrapper: {
      maxHeight: '500px',
      overflowY: 'auto',
      borderRadius: '16px',
      border: '1px solid var(--border-light)',
    },
    statusBadge: (status) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '10.5px',
      fontWeight: 700,
      padding: '4px 10px',
      borderRadius: '100px',
      background: status === 'exito' ? 'rgba(46,125,50,0.1)' : 'rgba(211,47,47,0.1)',
      color: status === 'exito' ? 'var(--accent)' : 'var(--danger)',
      border: status === 'exito' ? '1px solid rgba(46,125,50,0.15)' : '1px solid rgba(211,47,47,0.15)',
    })
  };

  return (
    <div style={S.page}>

      {/* ═══════════════════ HEADER CARD ═══════════════════ */}
      <div style={S.card}>
        <div style={S.headerRow}>
          {/* Left: Title */}
          <div style={S.headerLeft}>
            <div style={S.iconCircle}>
              <Mail size={22} />
            </div>
            <div>
              <h2 style={S.title}>Campañas de Correo</h2>
              <p style={S.subtitle}>Envío masivo y personalizado de notificaciones</p>
            </div>
          </div>

          {/* Center: Interactive Wizard */}
          <div style={S.wizardBar}>
            <button 
              type="button"
              style={{ ...S.wizardStep(currentStep === 1), cursor: 'pointer' }}
              onClick={() => setCurrentStep(1)}
            >
              <div style={S.wizardCircle(currentStep === 1)}>1</div>
              <span>Destinatarios</span>
            </button>
            <div style={S.wizardLine} />
            <button 
              type="button"
              style={{ 
                ...S.wizardStep(currentStep === 2), 
                cursor: totalSelected > 0 ? 'pointer' : 'not-allowed' 
              }}
              disabled={totalSelected === 0}
              onClick={() => {
                if (totalSelected > 0) setCurrentStep(2);
              }}
            >
              <div style={S.wizardCircle(currentStep === 2)}>2</div>
              <span>Mensaje</span>
            </button>
            <div style={S.wizardLine} />
            <button 
              type="button"
              style={{ ...S.wizardStep(currentStep === 3), cursor: 'pointer' }}
              onClick={() => setCurrentStep(3)}
            >
              <div style={S.wizardCircle(currentStep === 3)}>3</div>
              <span>Historial</span>
            </button>
          </div>

          {/* Right: Webhook */}
          <div style={{ maxWidth: '260px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <Settings size={11} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ ...S.label, marginBottom: 0 }}>Webhook n8n</span>
            </div>
            <input 
              type="text"
              value={n8nWebhookUrl}
              onChange={(e) => handleWebhookUrlChange(e.target.value)}
              placeholder="http://..."
              style={{ ...S.input, padding: '7px 12px', fontSize: '12px' }}
            />
          </div>
        </div>
      </div>

      {/* ═══════════════════ STEP 1: RECIPIENTS / BOT SYNC ═══════════════════ */}
      {currentStep === 1 && (
        <div style={S.card}>
          {/* Selector de tipo de campaña */}
          {!campaignType ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', padding: '20px' }}>
              <div
                onClick={() => { setCampaignType('nueva'); fetchSocios(); }}
                style={{ ...S.uploadZone, cursor: 'pointer', flexDirection: 'column', padding: '32px' }}
              >
                <Mail size={32} />
                <h3 style={{ margin: '8px 0' }}>Nueva Campaña</h3>
                <p style={{ textAlign: 'center', fontSize: '13px' }}>Seleccionar destinatarios de la base de socios</p>
              </div>
              <div
                onClick={() => { setCampaignType('grupal'); fetchGrupos(); }}
                style={{ ...S.uploadZone, cursor: 'pointer', flexDirection: 'column', padding: '32px' }}
              >
                <Hash size={32} />
                <h3 style={{ margin: '8px 0' }}>Campaña Grupal</h3>
                <p style={{ textAlign: 'center', fontSize: '13px' }}>Solo emails que representan a cada grupo</p>
              </div>
              <div
                onClick={() => { setCampaignType('lineas'); fetchLineas(); }}
                style={{ ...S.uploadZone, cursor: 'pointer', flexDirection: 'column', padding: '32px' }}
              >
                <Phone size={32} />
                <h3 style={{ margin: '8px 0' }}>Campaña por Líneas</h3>
                <p style={{ textAlign: 'center', fontSize: '13px' }}>Líneas individuales con email</p>
              </div>
              <div
                onClick={() => { setCampaignType('bot_wsp'); setBotResult(null); }}
                style={{ 
                  ...S.uploadZone, 
                  cursor: 'pointer', 
                  flexDirection: 'column', 
                  padding: '32px',
                  background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.08) 0%, rgba(18, 140, 126, 0.12) 100%)',
                  borderColor: 'rgba(37, 211, 102, 0.4)'
                }}
              >
                <div style={{ color: '#25D366' }}>
                  <MessageSquare size={32} />
                </div>
                <h3 style={{ margin: '8px 0', color: 'var(--text-primary)' }}>Bot WhatsApp</h3>
                <p style={{ textAlign: 'center', fontSize: '13px' }}>Actualizar facturación de líneas y grupos (XLS)</p>
              </div>
            </div>
          ) : campaignType === 'bot_wsp' ? (
            <div>
              {/* Barra de volver */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <button onClick={() => { setCampaignType(null); setBotFile(null); setBotResult(null); setBotTestResult(null); }} style={S.btnSecondary}>
                  <ArrowLeft size={16} /> Volver a opciones
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#25D366' }} />
                  <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageSquare size={18} style={{ color: '#25D366' }} /> Bot de WhatsApp – Facturación & Consultas
                  </span>
                </div>
              </div>

              {/* Contenedor Principal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* ─── Carga y Sincronización Inicial ─── */}
                <div style={{
                  background: 'rgba(255,255,255,0.4)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '20px',
                  padding: '20px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Bot size={20} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          Carga de Facturación Mensual (.xlsx / .xls)
                        </h4>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Soporta Claro, Personal y Movistar (hoja SOCIOS).
                        </p>
                      </div>
                    </div>

                    {/* Vencimiento input inline */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={15} style={{ color: 'var(--text-secondary)' }} />
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Vencimiento:</span>
                      <input
                        type="text"
                        value={customVencimiento}
                        onChange={(e) => setCustomVencimiento(e.target.value)}
                        placeholder="ej: 15/08/2026"
                        style={{ ...S.input, width: '130px', padding: '5px 10px', fontSize: '12.5px', fontWeight: 600 }}
                      />
                    </div>
                  </div>

                  {/* Dropzone Compacto */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleBotFileSelect(file);
                    }}
                    onClick={() => document.getElementById('bot-excel-file-input')?.click()}
                    style={{
                      border: `2px dashed ${isDragOver ? '#25D366' : 'var(--border-light)'}`,
                      borderRadius: '16px',
                      padding: '20px',
                      textAlign: 'center',
                      background: isDragOver ? 'rgba(37, 211, 102, 0.08)' : 'rgba(255,255,255,0.3)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '16px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <input
                      id="bot-excel-file-input"
                      type="file"
                      accept=".xlsx, .xls"
                      style={{ display: 'none' }}
                      onChange={(e) => handleBotFileSelect(e.target.files?.[0])}
                    />

                    {botFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, justifyContent: 'center' }}>
                        <FileSpreadsheet size={24} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{botFile.name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>({(botFile.size / 1024).toFixed(1)} KB)</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setBotFile(null); setBotResult(null); setBotTestResult(null); }}
                          style={{ ...S.btnSecondary, padding: '4px 8px', fontSize: '11px', marginLeft: '8px' }}
                        >
                          <X size={12} /> Quitar
                        </button>
                      </div>
                    ) : (
                      <>
                        <UploadCloud size={24} style={{ color: '#128C7E' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Arrastrá el archivo Excel de facturación aquí o hacé click para seleccionar
                        </span>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleSyncBotBilling(); }}
                      disabled={!botFile || uploadingBot}
                      style={{
                        ...S.btnPrimary,
                        padding: '8px 20px',
                        fontSize: '13px',
                        borderRadius: '10px',
                        background: !botFile ? 'rgba(0,0,0,0.1)' : 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                        color: '#ffffff',
                        boxShadow: !botFile ? 'none' : '0 4px 12px rgba(37, 211, 102, 0.3)',
                        opacity: !botFile || uploadingBot ? 0.6 : 1,
                        cursor: !botFile || uploadingBot ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {uploadingBot ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Procesando...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} />
                          <span>{botResult ? 'Reprocesar Excel' : 'Procesar Facturación'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* ─── PANTALLA INFORMATIVA CON RESULTADOS ─── */}
                {botResult && botResult.ok && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Tarjetas Métricas Superiores */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '14px'
                    }}>
                      <div style={{ background: 'rgba(255,255,255,0.7)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>Líneas Procesadas</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>
                          {botResult.lineas_procesadas || 0}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '2px', fontWeight: 600 }}>✓ Respuestas individuales</div>
                      </div>

                      <div style={{ background: 'rgba(255,255,255,0.7)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>Grupos Consolidados</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>
                          {botResult.grupos_actualizados || 0}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '2px', fontWeight: 600 }}>✓ Totales calculados</div>
                      </div>

                      <div style={{ background: 'rgba(255,255,255,0.7)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>Empresas Detectadas</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {botResult.empresas?.map(emp => (
                            <span key={emp} style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontWeight: 800,
                              background: emp === 'CLARO' ? 'rgba(229, 57, 53, 0.12)' : emp === 'PERSONAL' ? 'rgba(2, 136, 209, 0.12)' : 'rgba(0, 137, 123, 0.12)',
                              color: emp === 'CLARO' ? '#E53935' : emp === 'PERSONAL' ? '#0288D1' : '#00897B'
                            }}>
                              {emp}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div style={{ background: 'rgba(255,255,255,0.7)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>Vencimiento Activo</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: customVencimiento || botResult.vencimiento ? 'var(--text-primary)' : 'var(--danger)', marginTop: '6px' }}>
                          {customVencimiento || botResult.vencimiento || 'Sin Vencimiento'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {customVencimiento || botResult.vencimiento ? 'Se incluye en cada mensaje' : 'Completalo abajo y presioná Aplicar'}
                        </div>
                      </div>
                    </div>

                    {/* Barra de Ajuste Rápido de Vencimiento */}
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.08) 0%, rgba(18, 140, 126, 0.12) 100%)',
                      border: '1px solid rgba(37, 211, 102, 0.3)',
                      borderRadius: '16px',
                      padding: '14px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Calendar size={18} style={{ color: '#128C7E' }} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            Modificar Fecha de Vencimiento para todas las respuestas
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            Cambiá la fecha y presioná "Aplicar Vencimiento" para actualizar los textos de socios y grupos.
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="text"
                          value={customVencimiento}
                          onChange={(e) => setCustomVencimiento(e.target.value)}
                          placeholder="ej: 15/08/2026"
                          style={{ ...S.input, width: '140px', padding: '7px 12px', fontSize: '13px', fontWeight: 700 }}
                        />
                        <button
                          type="button"
                          onClick={handleApplyVencimiento}
                          disabled={applyingVto || !customVencimiento.trim()}
                          style={{
                            ...S.btnPrimary,
                            padding: '7px 16px',
                            fontSize: '12.5px',
                            borderRadius: '10px',
                            background: '#128C7E',
                            color: '#fff'
                          }}
                        >
                          {applyingVto ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          <span>Aplicar Vencimiento</span>
                        </button>
                      </div>
                    </div>

                    {/* ─── Pestañas de Navegación ─── */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setBotActiveTab('resumen')}
                        style={{
                          padding: '10px 18px',
                          fontSize: '13px',
                          fontWeight: 700,
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          borderBottom: botActiveTab === 'resumen' ? '3px solid #25D366' : '3px solid transparent',
                          color: botActiveTab === 'resumen' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Building2 size={16} /> Resumen por Empresa
                      </button>

                      <button
                        onClick={() => setBotActiveTab('lineas')}
                        style={{
                          padding: '10px 18px',
                          fontSize: '13px',
                          fontWeight: 700,
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          borderBottom: botActiveTab === 'lineas' ? '3px solid #25D366' : '3px solid transparent',
                          color: botActiveTab === 'lineas' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Phone size={16} /> Líneas y Socios ({botResult.lineas_procesadas || 0})
                      </button>

                      <button
                        onClick={() => setBotActiveTab('grupos')}
                        style={{
                          padding: '10px 18px',
                          fontSize: '13px',
                          fontWeight: 700,
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          borderBottom: botActiveTab === 'grupos' ? '3px solid #25D366' : '3px solid transparent',
                          color: botActiveTab === 'grupos' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Hash size={16} /> Grupos Consolidados ({botResult.grupos_actualizados || 0})
                      </button>

                      <button
                        onClick={() => setBotActiveTab('test_bot')}
                        style={{
                          padding: '10px 18px',
                          fontSize: '13px',
                          fontWeight: 800,
                          border: 'none',
                          background: botActiveTab === 'test_bot' ? 'rgba(37, 211, 102, 0.12)' : 'none',
                          borderRadius: '8px 8px 0 0',
                          cursor: 'pointer',
                          borderBottom: botActiveTab === 'test_bot' ? '3px solid #25D366' : '3px solid transparent',
                          color: botActiveTab === 'test_bot' ? '#128C7E' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Bot size={16} style={{ color: '#25D366' }} /> Probar Respuestas del Bot (Simulador)
                      </button>
                    </div>

                    {/* ─── TAB 1: RESUMEN POR EMPRESA ─── */}
                    {botActiveTab === 'resumen' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                          {Object.entries(botResult.detalle_empresas || {}).map(([empresaName, data]) => {
                            const isClaro = empresaName === 'CLARO';
                            const isPersonal = empresaName === 'PERSONAL';
                            const isMovistar = empresaName === 'MOVISTAR';
                            const accentColor = isClaro ? '#E53935' : isPersonal ? '#0288D1' : '#00897B';

                            return (
                              <div
                                key={empresaName}
                                style={{
                                  background: 'rgba(255,255,255,0.7)',
                                  border: `1px solid ${accentColor}33`,
                                  borderRadius: '18px',
                                  padding: '20px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '12px',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{
                                    fontSize: '12px',
                                    fontWeight: 900,
                                    padding: '4px 12px',
                                    borderRadius: '8px',
                                    background: `${accentColor}18`,
                                    color: accentColor,
                                    letterSpacing: '0.5px'
                                  }}>
                                    {empresaName}
                                  </span>
                                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    {data.cantidad} líneas
                                  </span>
                                </div>

                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                                    Monto Total Facturado
                                  </div>
                                  <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
                                    $ {data.total}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
                                  <button
                                    onClick={() => {
                                      setBotFilterEmpresa(empresaName);
                                      setBotActiveTab('lineas');
                                    }}
                                    style={{
                                      ...S.btnSecondary,
                                      flex: 1,
                                      justifyContent: 'center',
                                      fontSize: '12px',
                                      padding: '6px 12px'
                                    }}
                                  >
                                    Ver {data.cantidad} Líneas
                                  </button>

                                  {data.lineas?.[0] && (
                                    <button
                                      onClick={() => {
                                        setBotTestQuery(data.lineas[0].numero);
                                        handleTestBotQuery(data.lineas[0].numero);
                                        setBotActiveTab('test_bot');
                                      }}
                                      style={{
                                        ...S.btnSecondary,
                                        fontSize: '12px',
                                        padding: '6px 10px',
                                        color: '#128C7E'
                                      }}
                                      title="Probar primera línea en el bot"
                                    >
                                      <Play size={13} /> Probar
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ─── TAB 2: LÍNEAS Y SOCIOS ─── */}
                    {botActiveTab === 'lineas' && (() => {
                      // Consolidate lines across all empresas
                      let allLines = [];
                      Object.entries(botResult.detalle_empresas || {}).forEach(([emp, data]) => {
                        (data.lineas || []).forEach(l => {
                          allLines.push({ ...l, empresa: emp });
                        });
                      });

                      // Filter by company
                      if (botFilterEmpresa !== 'ALL') {
                        allLines = allLines.filter(l => l.empresa === botFilterEmpresa);
                      }

                      // Filter by search
                      if (botSearch.trim()) {
                        const q = botSearch.toLowerCase().trim();
                        allLines = allLines.filter(l => 
                          l.nombre?.toLowerCase().includes(q) ||
                          l.numero?.includes(q) ||
                          l.grupo?.toLowerCase().includes(q) ||
                          l.plan?.toLowerCase().includes(q) ||
                          l.abono?.toLowerCase().includes(q) ||
                          l.empresa?.toLowerCase().includes(q)
                        );
                      }

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {/* Controles de Filtro */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            {/* Buscador */}
                            <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '400px' }}>
                              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                              <input
                                type="text"
                                value={botSearch}
                                onChange={(e) => setBotSearch(e.target.value)}
                                placeholder="Buscar por socio, número, grupo, plan..."
                                style={{ ...S.input, paddingLeft: '36px', fontSize: '12.5px' }}
                              />
                            </div>

                            {/* Filtro de Empresas */}
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {['ALL', ...(botResult.empresas || [])].map(emp => (
                                <button
                                  key={emp}
                                  onClick={() => setBotFilterEmpresa(emp)}
                                  style={{
                                    padding: '5px 12px',
                                    borderRadius: '8px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    border: '1px solid var(--border-light)',
                                    cursor: 'pointer',
                                    background: botFilterEmpresa === emp ? '#128C7E' : 'rgba(255,255,255,0.7)',
                                    color: botFilterEmpresa === emp ? '#fff' : 'var(--text-primary)'
                                  }}
                                >
                                  {emp === 'ALL' ? 'Todas las Empresas' : emp}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            Mostrando {allLines.length} líneas de socios
                          </div>

                          {/* Tabla de Líneas */}
                          <div style={{ ...S.tableContainer, maxHeight: '500px', overflowY: 'auto' }}>
                            <table style={S.table}>
                              <thead>
                                <tr>
                                  <th style={S.th}>Socio</th>
                                  <th style={{ ...S.th, textAlign: 'center' }}>Línea</th>
                                  <th style={{ ...S.th, textAlign: 'center' }}>Empresa</th>
                                  <th style={{ ...S.th, textAlign: 'center' }}>Grupo</th>
                                  <th style={{ ...S.th, textAlign: 'center' }}>Plan / GB</th>
                                  <th style={{ ...S.th, textAlign: 'right' }}>Total $</th>
                                  <th style={{ ...S.th, textAlign: 'right' }}>Excedente $</th>
                                  <th style={{ ...S.th, textAlign: 'center', width: '90px' }}>Acción</th>
                                </tr>
                              </thead>
                              <tbody>
                                {allLines.slice(0, 200).map((line, idx) => (
                                  <tr key={idx}>
                                    <td style={S.td}>
                                      <div style={{ fontWeight: 700, fontSize: '12.5px' }}>{line.nombre}</div>
                                      {line.abono && <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>{line.abono}</div>}
                                    </td>
                                    <td style={{ ...S.td, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>
                                      {line.numero}
                                    </td>
                                    <td style={{ ...S.td, textAlign: 'center' }}>
                                      <span style={{
                                        fontSize: '10.5px',
                                        padding: '2px 7px',
                                        borderRadius: '5px',
                                        fontWeight: 800,
                                        background: line.empresa === 'CLARO' ? 'rgba(229, 57, 53, 0.1)' : line.empresa === 'PERSONAL' ? 'rgba(2, 136, 209, 0.1)' : 'rgba(0, 137, 123, 0.1)',
                                        color: line.empresa === 'CLARO' ? '#E53935' : line.empresa === 'PERSONAL' ? '#0288D1' : '#00897B'
                                      }}>
                                        {line.empresa}
                                      </span>
                                    </td>
                                    <td style={{ ...S.td, textAlign: 'center', fontWeight: 600 }}>
                                      #{line.grupo}
                                    </td>
                                    <td style={{ ...S.td, textAlign: 'center', fontSize: '11.5px' }}>
                                      {line.plan || '—'}
                                    </td>
                                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 800 }}>
                                      $ {line.total_str}
                                    </td>
                                    <td style={{ ...S.td, textAlign: 'right', color: line.excedente_str !== '0' ? 'var(--danger)' : 'var(--text-secondary)', fontSize: '11.5px' }}>
                                      $ {line.excedente_str}
                                    </td>
                                    <td style={{ ...S.td, textAlign: 'center' }}>
                                      <button
                                        onClick={() => {
                                          setBotTestQuery(line.numero);
                                          handleTestBotQuery(line.numero);
                                          setBotActiveTab('test_bot');
                                        }}
                                        style={{
                                          ...S.btnSecondary,
                                          padding: '3px 8px',
                                          fontSize: '11px',
                                          color: '#128C7E',
                                          borderColor: 'rgba(37, 211, 102, 0.4)'
                                        }}
                                        title="Probar respuesta del bot para esta línea"
                                      >
                                        <Bot size={12} /> Probar
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {allLines.length > 200 && (
                              <div style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                Mostrando las primeras 200 de {allLines.length} líneas. Usá el buscador arriba para filtrar.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ─── TAB 3: GRUPOS CONSOLIDADOS ─── */}
                    {botActiveTab === 'grupos' && (() => {
                      let groupEntries = Object.entries(botResult.detalle_grupos || {});

                      if (botSearch.trim()) {
                        const q = botSearch.toLowerCase().trim();
                        groupEntries = groupEntries.filter(([gid, gdata]) => 
                          gid.includes(q) ||
                          gdata.empresa?.toLowerCase().includes(q) ||
                          (gdata.lineas || []).some(l => l.nombre?.toLowerCase().includes(q) || l.numero?.includes(q))
                        );
                      }

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '400px' }}>
                              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                              <input
                                type="text"
                                value={botSearch}
                                onChange={(e) => setBotSearch(e.target.value)}
                                placeholder="Buscar por número de grupo o socio integrante..."
                                style={{ ...S.input, paddingLeft: '36px', fontSize: '12.5px' }}
                              />
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {groupEntries.length} grupos consolidados
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto' }}>
                            {groupEntries.slice(0, 100).map(([groupId, group]) => {
                              const isExpanded = expandedGroups.has(groupId);

                              return (
                                <div
                                  key={groupId}
                                  style={{
                                    background: 'rgba(255,255,255,0.7)',
                                    border: '1px solid var(--border-light)',
                                    borderRadius: '14px',
                                    padding: '14px 18px',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <div style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '10px',
                                        background: 'rgba(0,0,0,0.05)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 800,
                                        fontSize: '13px'
                                      }}>
                                        #{groupId}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>
                                          Grupo #{groupId}
                                        </div>
                                        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                          {group.cantidad_lineas} {group.cantidad_lineas === 1 ? 'línea' : 'líneas'} • {group.empresa || 'Varios'}
                                        </div>
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                      <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Total Grupo</div>
                                        <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--accent)' }}>$ {group.total}</div>
                                      </div>

                                      <button
                                        onClick={() => toggleGroupExpand(groupId)}
                                        style={{ ...S.btnSecondary, padding: '6px 10px', fontSize: '11.5px' }}
                                      >
                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        <span>{isExpanded ? 'Ocultar' : 'Ver Líneas'}</span>
                                      </button>

                                      <button
                                        onClick={() => {
                                          setBotTestQuery(groupId);
                                          handleTestBotQuery(groupId);
                                          setBotActiveTab('test_bot');
                                        }}
                                        style={{
                                          ...S.btnSecondary,
                                          padding: '6px 12px',
                                          fontSize: '11.5px',
                                          color: '#128C7E',
                                          borderColor: 'rgba(37, 211, 102, 0.4)'
                                        }}
                                      >
                                        <Play size={12} /> Probar Bot
                                      </button>
                                    </div>
                                  </div>

                                  {/* Desglose Expandido de Líneas del Grupo */}
                                  {isExpanded && (
                                    <div style={{
                                      marginTop: '12px',
                                      paddingTop: '12px',
                                      borderTop: '1px solid var(--border-light)',
                                      display: 'grid',
                                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                      gap: '8px'
                                    }}>
                                      {(group.lineas || []).map((l, lIdx) => (
                                        <div
                                          key={lIdx}
                                          style={{
                                            background: 'rgba(255,255,255,0.8)',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-light)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                          }}
                                        >
                                          <div>
                                            <div style={{ fontSize: '12px', fontWeight: 700 }}>{l.nombre}</div>
                                            <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>...{l.numero?.slice(-4)} ({l.plan})</div>
                                          </div>
                                          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                            $ {l.total_str}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ─── TAB 4: SIMULADOR DE RESPUESTAS DEL BOT ─── */}
                    {botActiveTab === 'test_bot' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '750px', margin: '0 auto', width: '100%' }}>
                        
                        {/* Explicación */}
                        <div style={{
                          background: 'rgba(255,255,255,0.6)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '16px',
                          padding: '16px 20px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px'
                        }}>
                          <Smartphone size={24} style={{ color: '#25D366', flexShrink: 0 }} />
                          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            <strong>Simulador en Vivo:</strong> Ingresá cualquier número de línea (10 dígitos), número de grupo o comando para verificar exactamente qué mensaje devolverá el bot a un socio por WhatsApp.
                          </div>
                        </div>

                        {/* Input de Consulta */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            value={botTestQuery}
                            onChange={(e) => setBotTestQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleTestBotQuery(); }}
                            placeholder="Ingresá línea (ej: 1121566192), grupo (ej: 5037) o comando (#menu, #pago)..."
                            style={{ ...S.input, padding: '12px 16px', fontSize: '14px', flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={() => handleTestBotQuery()}
                            style={{
                              ...S.btnPrimary,
                              padding: '12px 24px',
                              fontSize: '13.5px',
                              borderRadius: '12px',
                              background: '#25D366',
                              color: '#fff'
                            }}
                          >
                            <Send size={15} />
                            <span>Consultar</span>
                          </button>
                        </div>

                        {/* Chips de Prueba Rápida */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                            Pruebas rápidas:
                          </span>
                          {Object.values(botResult.detalle_empresas || {})[0]?.lineas?.[0] && (
                            <button
                              type="button"
                              onClick={() => handleTestBotQuery(Object.values(botResult.detalle_empresas)[0].lineas[0].numero)}
                              style={{ ...S.btnSecondary, padding: '4px 10px', fontSize: '11px', borderRadius: '14px' }}
                            >
                              📱 Línea: {Object.values(botResult.detalle_empresas)[0].lineas[0].numero}
                            </button>
                          )}
                          {Object.keys(botResult.detalle_grupos || {})[0] && (
                            <button
                              type="button"
                              onClick={() => handleTestBotQuery(Object.keys(botResult.detalle_grupos)[0])}
                              style={{ ...S.btnSecondary, padding: '4px 10px', fontSize: '11px', borderRadius: '14px' }}
                            >
                              👥 Grupo: #{Object.keys(botResult.detalle_grupos)[0]}
                            </button>
                          )}
                          {['#menu', '#pago', '#red', '#autogestion'].map(cmd => (
                            <button
                              key={cmd}
                              type="button"
                              onClick={() => handleTestBotQuery(cmd)}
                              style={{ ...S.btnSecondary, padding: '4px 10px', fontSize: '11px', borderRadius: '14px' }}
                            >
                              {cmd}
                            </button>
                          ))}
                        </div>

                        {/* Mockup de Chat de WhatsApp */}
                        {botTestResult && (
                          <div style={{
                            background: '#EFEAE2',
                            borderRadius: '20px',
                            overflow: 'hidden',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                            border: '1px solid rgba(0,0,0,0.1)'
                          }}>
                            {/* WhatsApp Header */}
                            <div style={{
                              background: '#075E54',
                              color: '#ffffff',
                              padding: '12px 18px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                                  <Bot size={18} />
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '13.5px' }}>Bot Mutual AUNAR</div>
                                  <div style={{ fontSize: '10.5px', color: '#B2DFDB' }}>en línea</div>
                                </div>
                              </div>
                              <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.15)', padding: '3px 8px', borderRadius: '6px' }}>
                                Tipo: {botTestResult.tipo === 'linea' ? '📱 Consulta de Línea' : botTestResult.tipo === 'grupo' ? '👥 Consulta de Grupo' : botTestResult.tipo === 'comando' ? '📋 Comando' : '⚠️ No encontrado'}
                              </span>
                            </div>

                            {/* Chat Body */}
                            <div style={{
                              padding: '24px 20px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '14px',
                              minHeight: '180px'
                            }}>
                              {/* Mensaje del Usuario (Derecha) */}
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <div style={{
                                  background: '#DCF8C6',
                                  padding: '8px 14px',
                                  borderRadius: '12px 12px 0 12px',
                                  maxWidth: '80%',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                  fontSize: '13.5px',
                                  color: '#111827'
                                }}>
                                  {botTestResult.query}
                                </div>
                              </div>

                              {/* Mensaje del Bot (Izquierda) */}
                              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{
                                  background: '#ffffff',
                                  padding: '12px 16px',
                                  borderRadius: '12px 12px 12px 0',
                                  maxWidth: '85%',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                  fontSize: '13.5px',
                                  color: '#111827',
                                  lineHeight: 1.5,
                                  whiteSpace: 'pre-line'
                                }}>
                                  {botTestResult.respuesta}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    )}

                  </div>
                )}

              </div>
            </div>
          ) : (
            <>
              {/* Barra de controles y volver a elegir tipo */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button onClick={() => { setCampaignType(null); setItems([]); setSelectedIds(new Set()); }} style={S.btnSecondary}>
                  <ArrowLeft size={16} /> Cambiar tipo
                </button>
                <span style={{ fontWeight: 700 }}>
                  {campaignType === 'nueva' && 'Campaña General – Socios'}
                  {campaignType === 'grupal' && 'Campaña Grupal – Representantes de grupo'}
                  {campaignType === 'lineas' && 'Campaña por Líneas – Líneas individuales'}
                </span>
              </div>

              {/* Filtros según el tipo */}
              {campaignType === 'nueva' && (
                <div style={S.filtersGrid}>
                  <div>
                    <div style={S.label}>Buscar socio</div>
                    <div style={{ position: 'relative' }}>
                      <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, DNI, email..." style={{ ...S.input, paddingLeft: '36px' }} />
                    </div>
                  </div>
                  <div>
                    <div style={S.label}>Forma de pago</div>
                    <select value={filterPago} onChange={e => setFilterPago(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                      <option value="ALL">Todos</option>
                      <option value="M">Efectivo (M)</option>
                      <option value="D">CBU (D)</option>
                    </select>
                  </div>
                  <div>
                    <div style={S.label}>Estado de deuda</div>
                    <select value={filterDeuda} onChange={e => setFilterDeuda(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                      <option value="ALL">Todos</option>
                      <option value="CON_DEUDA">Con Deuda</option>
                      <option value="SIN_DEUDA">Sin Deuda</option>
                    </select>
                  </div>
                  <div>
                    <div style={S.label}>Grupo</div>
                    <input value={filterGrupoNumero} onChange={e => setFilterGrupoNumero(e.target.value)} placeholder="Nro" style={S.input} />
                  </div>
                </div>
              )}

              {campaignType === 'grupal' && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={S.label}>Buscar grupo</div>
                  <div style={{ position: 'relative', maxWidth: '400px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                      value={grupalSearch}
                      onChange={e => setGrupalSearch(e.target.value)}
                      placeholder="Buscar por número de grupo, alias o email..."
                      style={{ ...S.input, paddingLeft: '36px', paddingRight: grupalSearch ? '32px' : '12px' }}
                    />
                    {grupalSearch && (
                      <button
                        type="button"
                        onClick={() => setGrupalSearch('')}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          padding: 0
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {campaignType === 'lineas' && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={S.label}>Buscar línea</div>
                  <div style={{ position: 'relative', maxWidth: '400px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                      value={lineasSearch}
                      onChange={e => setLineasSearch(e.target.value)}
                      placeholder="Buscar línea, nombre o email..."
                      style={{ ...S.input, paddingLeft: '36px', paddingRight: lineasSearch ? '32px' : '12px' }}
                    />
                    {lineasSearch && (
                      <button
                        type="button"
                        onClick={() => setLineasSearch('')}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          padding: 0
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Selección y tabla */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={S.badge}>{totalSelected} seleccionados</span>
                  {totalSelected > 0 && uniqueEmailsCount < totalSelected && (
                    <span style={{
                      fontSize: '12px',
                      color: '#059669',
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}>
                      ⚡ Se consolidarán en <strong>{uniqueEmailsCount}</strong> {uniqueEmailsCount === 1 ? 'único correo' : 'correos únicos'}
                    </span>
                  )}
                </div>
                <div>
                  <button onClick={toggleSelectAll} style={{ ...S.btnSecondary, padding: '6px 14px', fontSize: '12px', marginRight: '8px' }}>
                    {selectedIds.size === items.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                  {totalSelected > 0 && (
                    <button onClick={clearSelection} style={{ ...S.btnSecondary, padding: '6px 14px', fontSize: '12px' }}><X size={12} /> Limpiar</button>
                  )}
                </div>
              </div>

              <div style={S.tableWrapper}>
                {loading ? (
                  <div style={S.emptyState}><Loader2 className="animate-spin" size={32} /></div>
                ) : items.length === 0 ? (
                  <div style={S.emptyState}>
                    <AlertCircle size={40} style={{ marginBottom: '12px' }} />
                    <h4>Sin resultados</h4>
                  </div>
                ) : (
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, width: '48px', textAlign: 'center' }}></th>
                        <th style={S.th}>Nombre / Detalle</th>
                        <th style={S.th}>Email</th>
                        {campaignType === 'nueva' && <th style={{ ...S.th, textAlign: 'center', width: '80px' }}>Pago</th>}
                        <th style={{ ...S.th, textAlign: 'center', width: '80px' }}>
                          {campaignType === 'grupal' ? 'Grupo' : 'Línea'}
                        </th>
                        {campaignType === 'nueva' && <th style={{ ...S.th, textAlign: 'right', width: '80px' }}>Cuotas</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => {
                        const sel = selectedIds.has(item.id);
                        return (
                          <tr key={item.id} onClick={() => toggleItem(item.id)} style={{ cursor: 'pointer', background: sel ? 'rgba(46,125,50,0.06)' : 'transparent' }}>
                            <td style={{ ...S.td, textAlign: 'center' }}>
                              {sel ? <CheckSquare size={18} style={{ color: 'var(--accent)' }} /> : <Square size={18} />}
                            </td>
                            <td style={S.td}>
                              <div style={{ fontWeight: 700 }}>{item.display_detalle || item.nombre}</div>
                              {item.dni && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>DNI: {item.dni}</div>}
                            </td>
                            <td style={S.td}>{item.email}</td>
                            {campaignType === 'nueva' && (
                              <td style={{ ...S.td, textAlign: 'center' }}>
                                <span style={S.fpagoBadge(item.fpago)}>{item.fpago === 'D' ? 'CBU' : 'Efectivo'}</span>
                              </td>
                            )}
                            <td style={{ ...S.td, textAlign: 'center' }}>
                              {campaignType === 'grupal' ? `#${item.grupo}` : item.lineas}
                            </td>
                            {campaignType === 'nueva' && (
                              <td style={{ ...S.td, textAlign: 'right', color: item.total_cuotas > 0 ? 'var(--danger)' : 'var(--accent)' }}>
                                {item.total_cuotas || 0}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  onClick={() => { if (totalSelected > 0) setCurrentStep(2); }}
                  disabled={totalSelected === 0}
                  style={{ ...S.btnPrimary, opacity: totalSelected === 0 ? 0.5 : 1, cursor: totalSelected === 0 ? 'not-allowed' : 'pointer' }}
                >
                  Configurar Mensaje ({uniqueEmailsCount < totalSelected ? `${uniqueEmailsCount} correos (${totalSelected} líneas)` : totalSelected}) <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════ STEP 2: COMPOSE ═══════════════════ */}
      {currentStep === 2 && (
        <div style={S.splitLayout}>

          {/* ── Left sidebar: Recipients summary ── */}
          <div style={S.card}>
            <div style={S.sectionTitle}>
              <Users size={16} style={{ color: 'var(--accent)' }} />
              <h3 style={S.sectionTitleText}>Destinatarios ({totalSelected})</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto', marginBottom: '16px' }}>
              {selectedRecipientsList.map(s => (
                <div key={s.id} style={S.recipientMini}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12.5px' }}>{s.nombre}</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.email}</div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: s.total_cuotas > 0 ? 'var(--danger)' : 'var(--accent)', whiteSpace: 'nowrap' }}>
                    {s.total_cuotas > 0 ? `${s.total_cuotas} cuotas` : 'Al día'}
                  </span>
                </div>
              ))}
            </div>

            <button 
              onClick={() => setCurrentStep(1)}
              style={{ ...S.btnSecondary, width: '100%', justifyContent: 'center' }}
            >
              <ArrowLeft size={14} />
              <span>Cambiar Destinatarios</span>
            </button>
          </div>

          {/* ── Right main: Compose form ── */}
          <div style={S.card}>
            {/* Header with Title and Template Selector */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border-light)' }}>
              <div style={S.sectionTitle}>
                <FileText size={16} style={{ color: 'var(--accent)' }} />
                <h3 style={S.sectionTitleText}>Diseño de Campaña</h3>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Plantilla:</span>
                <select 
                  onChange={(e) => handleLoadTemplate(e.target.value)} 
                  style={{ ...S.input, width: '250px', padding: '6px 12px', background: 'rgba(255,255,255,0.7)' }}
                  defaultValue=""
                >
                  <option value="" disabled>-- Cargar plantilla predefinida --</option>
                  <option value="aunar">Plantilla Oficial Mutual AUNAR</option>
                  <option value="deuda">Aviso de Deuda / Cobro de Cuota</option>
                  <option value="bienvenida">Bienvenida Nuevos Socios</option>
                  <option value="aumento">Notificación de Aumento / Ajuste</option>
                  <option value="vacia">Limpiar Mensaje (Vacío)</option>
                </select>
              </div>
            </div>

            {/* Inputs side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <div style={S.label}>Nombre de Campaña (interno)</div>
                <input type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Ej: Cobro Cuota Julio 2026" style={S.input} />
              </div>
              <div>
                <div style={S.label}>Asunto del Correo</div>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej: Detalle de tu abono - Aunar Mutual" style={S.input} />
              </div>
            </div>

            {/* Dynamic variables */}
            <div style={{ marginBottom: '16px' }}>
              <div style={S.label}>Insertar campo dinámico</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {variables.map(v => (
                  <button 
                    key={v.value}
                    type="button"
                    onClick={() => insertVariable(v.value)}
                    style={S.chip}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderStyle = 'solid'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-light)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderStyle = 'dashed'; }}
                  >
                    <span>{v.label}</span>
                    <code style={{ fontSize: '9.5px', opacity: 0.7 }}>{v.value}</code>
                  </button>
                ))}
              </div>
            </div>

            {/* Editor */}
            <div style={{ marginBottom: '20px' }}>
              <div style={S.label}>Contenido del correo</div>
              <div style={S.editorWrapper}>
                <div style={S.editorToolbar}>
                  <button onClick={() => runCommand('bold')} style={S.toolbarBtn} title="Negrita"><Bold size={15} /></button>
                  <button onClick={() => runCommand('italic')} style={S.toolbarBtn} title="Cursiva"><Italic size={15} /></button>
                  <button onClick={() => runCommand('underline')} style={S.toolbarBtn} title="Subrayado"><Underline size={15} /></button>
                  <div style={{ width: '1px', height: '14px', background: 'var(--border-light)', margin: '0 4px' }} />
                  <button onClick={() => runCommand('insertUnorderedList')} style={S.toolbarBtn} title="Lista"><List size={15} /></button>
                  <div style={{ width: '1px', height: '14px', background: 'var(--border-light)', margin: '0 4px' }} />
                  <button onClick={() => runCommand('justifyLeft')} style={S.toolbarBtn} title="Izquierda"><AlignLeft size={15} /></button>
                  <button onClick={() => runCommand('justifyCenter')} style={S.toolbarBtn} title="Centrar"><AlignCenter size={15} /></button>
                  <button onClick={() => runCommand('justifyRight')} style={S.toolbarBtn} title="Derecha"><AlignRight size={15} /></button>
                </div>
                <div 
                  id="rich-editor"
                  ref={editorRef}
                  contentEditable={true}
                  onInput={(e) => setBodyHtml(e.currentTarget.innerHTML)}
                  style={S.editorArea}
                  data-placeholder="Redactá el correo aquí... Usá las variables del panel de arriba para personalizar cada mensaje."
                />
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
              <button onClick={() => setCurrentStep(1)} style={S.btnSecondary}>
                <ArrowLeft size={15} />
                <span>Atrás</span>
              </button>
              <button 
                onClick={handleSendCampaign}
                disabled={sending}
                style={{ ...S.btnPrimary, opacity: sending ? 0.6 : 1, cursor: sending ? 'not-allowed' : 'pointer' }}
              >
                {sending ? (
                  <><Loader2 className="animate-spin" size={15} /><span>Despachando...</span></>
                ) : (
                  <><Send size={15} /><span>Enviar Campaña</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ STEP 3: LOGS & HISTORY ═══════════════════ */}
      {currentStep === 3 && (
        <div style={S.card}>
          {/* Header row & filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: '280px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type="text"
                  value={searchLog}
                  onChange={(e) => setSearchLog(e.target.value)}
                  placeholder="Buscar campaña, destinatario, asunto..."
                  style={{ ...S.input, paddingLeft: '36px' }}
                />
              </div>
              <div style={{ width: '150px' }}>
                <select 
                  value={filterLogEstado} 
                  onChange={(e) => setFilterLogEstado(e.target.value)} 
                  style={{ ...S.input, cursor: 'pointer' }}
                >
                  <option value="ALL">Todos los estados</option>
                  <option value="exito">Éxito</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>
            
            <button 
              onClick={fetchLogs} 
              disabled={loadingLogs}
              style={{ ...S.btnSecondary, padding: '10px 16px' }}
            >
              <RefreshCw size={14} className={loadingLogs ? "animate-spin" : ""} />
              <span>Actualizar</span>
            </button>
          </div>

          {/* Logs Table */}
          <div style={S.tableWrapper}>
            {loadingLogs ? (
              <div style={S.emptyState}>
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }} />
              </div>
            ) : logs.length === 0 ? (
              <div style={S.emptyState}>
                <Clock size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>Sin registros</h4>
                <p style={{ fontSize: '12px', margin: '6px 0 0', opacity: 0.7 }}>No se encontraron correos enviados con estos criterios.</p>
              </div>
            ) : (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: '120px' }}>Fecha</th>
                    <th style={S.th}>Campaña</th>
                    <th style={S.th}>Destinatario</th>
                    <th style={S.th}>Asunto</th>
                    <th style={{ ...S.th, width: '120px', textAlign: 'center' }}>Estado</th>
                    <th style={{ ...S.th, width: '100px', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr 
                      key={log.id} 
                      style={{ transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-light)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ ...S.td, fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {formatDate(log.created_at)}
                      </td>
                      <td style={{ ...S.td, fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px' }}>
                        {log.nombre_campana}
                      </td>
                      <td style={S.td}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12.5px' }}>
                          {log.destinatario_nombre}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {log.destinatario_email}
                        </div>
                      </td>
                      <td style={{ ...S.td, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                        {log.asunto}
                      </td>
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        <span style={S.statusBadge(log.estado)}>
                          {log.estado === 'exito' ? (
                            <><Check size={11} /><span>Éxito</span></>
                          ) : (
                            <><X size={11} /><span>Error</span></>
                          )}
                        </span>
                        {log.estado === 'error' && log.error_mensaje && (
                          <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '4px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.error_mensaje}>
                            {log.error_mensaje}
                          </div>
                        )}
                      </td>
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        <button 
                          onClick={() => openLogDetail(log)}
                          style={{ ...S.btnSecondary, padding: '6px 10px', fontSize: '11px', borderRadius: '8px' }}
                          title="Ver Contenido del Correo"
                        >
                          <Eye size={12} />
                          <span>Ver</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ DETAIL MODAL ═══════════════════ */}
      <Modal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)} 
        title="Detalle del Correo Enviado"
        maxWidth="650px"
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(0,0,0,0.02)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '6px', fontSize: '13px' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Para:</strong>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {selectedLog.destinatario_nombre} &lt;{selectedLog.destinatario_email}&gt;
                </span>
                
                <strong style={{ color: 'var(--text-secondary)' }}>Campaña:</strong>
                <span style={{ color: 'var(--text-primary)' }}>{selectedLog.nombre_campana}</span>
                
                <strong style={{ color: 'var(--text-secondary)' }}>Fecha:</strong>
                <span style={{ color: 'var(--text-primary)' }}>{formatDate(selectedLog.created_at)}</span>
                
                <strong style={{ color: 'var(--text-secondary)' }}>Asunto:</strong>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedLog.asunto}</span>
                
                <strong style={{ color: 'var(--text-secondary)' }}>Estado:</strong>
                <span style={{ color: selectedLog.estado === 'exito' ? 'var(--accent)' : 'var(--danger)', fontWeight: 700 }}>
                  {selectedLog.estado === 'exito' ? 'Enviado con Éxito' : `Error: ${selectedLog.error_mensaje || 'Desconocido'}`}
                </span>
              </div>
            </div>

            <div>
              <div style={S.label}>Cuerpo del Correo</div>
              <div 
                style={{ 
                  background: '#ffffff', 
                  color: '#1a1a1a', 
                  padding: '24px', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border-light)', 
                  maxHeight: '380px', 
                  overflowY: 'auto',
                  fontSize: '14px',
                  lineHeight: 1.6
                }}
                dangerouslySetInnerHTML={{ __html: selectedLog.cuerpo_html || '<em>Sin contenido</em>' }}
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                style={S.btnPrimary}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Placeholder style for contentEditable */}
      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: var(--text-secondary);
          opacity: 0.55;
          pointer-events: none;
        }
        [data-theme='dark'] .campaigns-editor-wrapper {
          background: rgba(18, 26, 22, 0.4) !important;
        }
      `}</style>
    </div>
  );
}
