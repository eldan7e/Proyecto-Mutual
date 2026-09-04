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
  Copy, Smartphone, ChevronUp, Bookmark, Trash2, PlusCircle,
  Minimize2, Maximize2, ExternalLink
} from 'lucide-react';
import { useToast } from './components/ui/ToastProvider';
import Modal from './components/Modal';
import DOMPurify from 'dompurify';
import * as XLSX from 'xlsx';

export default function Campanas() {
  const { addToast } = useToast();
  
  // Wizard Step (1: Destinatarios, 2: Mensaje, 3: Historial)
  const [currentStep, setCurrentStep] = useState(1);
  
  // Tipo de campaña en paso 1 ('excel' | 'personalizada' | 'bot_wsp')
  const [campaignType, setCampaignType] = useState(null);
  const [personalizadaMode, setPersonalizadaMode] = useState('grupal'); // 'grupal' | 'lineas' | 'nueva'
  const effectiveCampaignType = campaignType === 'personalizada' ? personalizadaMode : campaignType;

  // Campaña activa en despacho con monitoreo en tiempo real
  const [activeCampaign, setActiveCampaign] = useState(() => {
    try {
      const saved = localStorage.getItem('active_campaign_progress');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && !parsed.isFinished && (Date.now() - new Date(parsed.startTime).getTime()) < 7200000) {
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  });

  useEffect(() => {
    if (activeCampaign) {
      localStorage.setItem('active_campaign_progress', JSON.stringify(activeCampaign));
    } else {
      localStorage.removeItem('active_campaign_progress');
    }
  }, [activeCampaign]);

  // Estados de listas y selección
  const [items, setItems] = useState([]); // elementos según tipo
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  
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
  
  // Cupo Brevo y Filtro de Grupos / Socios Notificados
  const [enviosHoy, setEnviosHoy] = useState(0);
  const [filterNotificado, setFilterNotificado] = useState('ALL'); // 'ALL' | 'PENDIENTE' | 'NOTIFICADO'
  const [dailyLimit, setDailyLimit] = useState(() => {
    const s = localStorage.getItem('campanas_daily_limit');
    return s ? parseInt(s, 10) : 300;
  });
  const [autoSelectDailyLimit, setAutoSelectDailyLimit] = useState(() => {
    const s = localStorage.getItem('campanas_auto_select_daily');
    return s !== null ? s === 'true' : true;
  });
  const [isDailyLimitModalOpen, setIsDailyLimitModalOpen] = useState(false);
  const [tempDailyLimit, setTempDailyLimit] = useState(300);

  const availableDailyQuota = Math.max(0, dailyLimit - enviosHoy);

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

  // Plantillas Personalizadas
  const [customTemplates, setCustomTemplates] = useState([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('aunar');
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

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
  const [isConfirmPublishModalOpen, setIsConfirmPublishModalOpen] = useState(false);
  const [publishingBot, setPublishingBot] = useState(false);
  
  // Campaña desde Excel (TODOS)
  const [excelFile, setExcelFile] = useState(null);
  const [excelRawRows, setExcelRawRows] = useState([]);
  const [excelMode, setExcelMode] = useState('lineas_email'); // 'lineas_email' | 'grupo_email'
  const [excelSearch, setExcelSearch] = useState('');
  const [excelEmpresa, setExcelEmpresa] = useState('ALL');
  const [excelPeriodo, setExcelPeriodo] = useState('08-2026');
  const [isExcelDragOver, setIsExcelDragOver] = useState(false);
  const [excelStats, setExcelStats] = useState({ totalLineas: 0, totalFacturado: 0, empresas: {} });

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
      if (effectiveCampaignType === 'nueva') fetchSocios();
      else if (effectiveCampaignType === 'grupal') fetchGrupos();
      else if (effectiveCampaignType === 'lineas') fetchLineas();
    }
  }, [debouncedSearch, filterPago, filterGrupoNumero, filterDeuda, campaignType, effectiveCampaignType, currentStep, debouncedGrupalSearch, debouncedLineasSearch]);

  // Consultar cupo diario consumido hoy en Brevo
  const fetchEnviosHoy = async () => {
    try {
      const hoyInicio = new Date();
      hoyInicio.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from('campanas_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', hoyInicio.toISOString())
        .neq('estado', 'error');
      if (!error && typeof count === 'number') {
        setEnviosHoy(count);
      }
    } catch (e) {
      console.warn('Error al consultar envíos de hoy:', e);
    }
  };

  // Consultar notificaciones recientes en campanas_logs (últimos 35 días para cubrir cambio de mes y períodos)
  const fetchNotificacionesRecientes = async () => {
    try {
      const hace35Dias = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      const { data: logs, error } = await supabase
        .from('campanas_logs')
        .select('destinatario_email, created_at, estado')
        .gte('created_at', hace35Dias.toISOString())
        .neq('estado', 'error')
        .order('created_at', { ascending: false })
        .range(0, 49999);

      if (error) throw error;

      const notifMap = new Map();
      (logs || []).forEach(l => {
        if (l.destinatario_email) {
          const em = l.destinatario_email.trim().toLowerCase();
          if (!notifMap.has(em)) {
            notifMap.set(em, l);
          }
        }
      });
      return notifMap;
    } catch (err) {
      console.warn('Error al consultar notificaciones recientes:', err);
      return new Map();
    }
  };

  // Aplicar selección y filtro automático según estado de notificación y cupo diario disponible
  const applySelectionAndFilters = (newItems, notifCount, pendCount) => {
    setItems(newItems);

    // Si ya existen notificados en el lote, activar vista de PENDIENTES automáticamente para mostrar solo los no enviados
    if (notifCount > 0) {
      setFilterNotificado('PENDIENTE');
    }

    const pendientes = newItems.filter(i => !i.notificado);
    const cupo = Math.max(0, dailyLimit - enviosHoy);

    if (autoSelectDailyLimit) {
      const toSelect = pendientes.slice(0, cupo);
      setSelectedIds(new Set(toSelect.map(i => i.id)));
      if (notifCount > 0 && toSelect.length > 0) {
        addToast(`Se detectaron ${notifCount} ya notificados. Mostrando los ${pendCount} pendientes y seleccionando ${toSelect.length} según cupo diario (${cupo}).`, 'info');
      } else if (toSelect.length > 0) {
        addToast(`Se auto-seleccionaron ${toSelect.length} destinatarios pendientes según tu cupo diario disponible (${cupo}).`, 'info');
      }
    } else {
      // Seleccionar únicamente pendientes (nunca los ya notificados)
      setSelectedIds(new Set(pendientes.map(i => i.id)));
    }
  };

  const handleSelectDailyLimit = () => {
    const pendientes = items.filter(i => !i.notificado);
    const cupo = Math.max(0, dailyLimit - enviosHoy);
    const toSelect = pendientes.slice(0, cupo);
    setSelectedIds(new Set(toSelect.map(i => i.id)));
    setFilterNotificado('PENDIENTE');
    addToast(`Se seleccionaron ${toSelect.length} destinatarios pendientes según el cupo diario disponible (${cupo} de ${dailyLimit}).`, 'success');
  };

  const handleSelectAllPending = () => {
    const pendientes = items.filter(i => !i.notificado);
    setSelectedIds(new Set(pendientes.map(i => i.id)));
    setFilterNotificado('PENDIENTE');
    const cupo = Math.max(0, dailyLimit - enviosHoy);
    if (pendientes.length > cupo) {
      addToast(`Se seleccionaron todos los ${pendientes.length} pendientes. Atención: tu cupo diario disponible es de ${cupo} correos.`, 'warning');
    } else {
      addToast(`Se seleccionaron todos los ${pendientes.length} pendientes.`, 'success');
    }
  };

  useEffect(() => {
    fetchEnviosHoy();
  }, [currentStep, activeCampaign?.isFinished]);

  useEffect(() => {
    if (currentStep === 3) fetchLogs();
  }, [currentStep, debouncedSearchLog, filterLogEstado]);

  // Filtrado de ítems por estado de notificación
  const displayedItems = useMemo(() => {
    if (filterNotificado === 'PENDIENTE') return items.filter(i => !i.notificado);
    if (filterNotificado === 'NOTIFICADO') return items.filter(i => i.notificado);
    return items;
  }, [items, filterNotificado]);

  const countPendientes = useMemo(() => items.filter(i => !i.notificado).length, [items]);
  const countNotificados = useMemo(() => items.filter(i => i.notificado).length, [items]);

  // Helper para estimar tiempo restante según ritmo de Brevo API (~0.8s por mail)
  const calculateRemainingTime = (total, sentCount) => {
    if (sentCount >= total) return 'Finalizado';
    const remainingCount = Math.max(0, total - sentCount);
    const totalSecs = Math.ceil(remainingCount * 0.8);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins > 0) {
      return `~${mins} min ${secs > 0 ? `${secs} seg` : ''}`;
    }
    return `~${secs} seg`;
  };

  // Monitoreo en tiempo real del progreso de la campaña en n8n
  useEffect(() => {
    if (!activeCampaign || activeCampaign.isFinished) return;

    let isMounted = true;

    const pollActiveLogs = async () => {
      try {
        const { data, error } = await supabase
          .from('campanas_logs')
          .select('id, created_at, nombre_campana, destinatario_nombre, destinatario_email, asunto, estado, error_mensaje')
          .eq('nombre_campana', activeCampaign.name)
          .gte('created_at', activeCampaign.startTime)
          .order('id', { ascending: true });

        if (error || !isMounted) return;

        const currentLogs = data || [];
        const successCount = currentLogs.filter(l => l.estado === 'exito').length;
        const errorCount = currentLogs.filter(l => l.estado === 'error').length;
        const sentCount = currentLogs.length;
        const isDone = sentCount >= activeCampaign.total;

        setActiveCampaign(prev => {
          if (!prev) return null;
          if (prev.sentCount === sentCount && prev.isFinished === isDone) return prev;
          return {
            ...prev,
            logs: currentLogs,
            sentCount,
            successCount,
            errorCount,
            isFinished: isDone
          };
        });

        if (isDone) {
          addToast(`¡Campaña "${activeCampaign.name}" finalizada! ${successCount} enviados${errorCount > 0 ? `, ${errorCount} con error` : ''}.`, successCount > 0 ? 'success' : 'error');
          fetchLogs();
          fetchEnviosHoy();
          // Marcar en memoria como notificados inmediatamente a los que salieron con éxito
          const sentEmails = new Set(
            currentLogs.filter(l => l.estado !== 'error').map(l => (l.destinatario_email || '').trim().toLowerCase())
          );
          setItems(prev => prev.map(it => {
            if (sentEmails.has((it.email || '').trim().toLowerCase())) {
              return { ...it, notificado: true, ultimo_envio: new Date().toISOString() };
            }
            return it;
          }));
        }
      } catch (err) {
        console.warn('Error polling campanas_logs:', err);
      }
    };

    pollActiveLogs();
    const interval = setInterval(pollActiveLogs, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeCampaign?.name, activeCampaign?.startTime, activeCampaign?.isFinished, activeCampaign?.total]);

  const handleWebhookUrlChange = (val) => {
    setN8nWebhookUrl(val);
    localStorage.setItem('n8n_webhook_campaign_url', val);
  };

  const handleBotWebhookUrlChange = (val) => {
    setN8nBotWebhookUrl(val);
    localStorage.setItem('n8n_webhook_bot_url', val);
  };

  // --------------- GESTIÓN DE PLANTILLAS PERSONALIZADAS ---------------
  const fetchCustomTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('campanas_plantillas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Aviso: error al consultar campanas_plantillas en Supabase:', error);
        const local = localStorage.getItem('campanas_custom_templates');
        if (local) setCustomTemplates(JSON.parse(local));
      } else if (data) {
        const customOnly = data.filter(t => !t.es_oficial);
        setCustomTemplates(customOnly);
        localStorage.setItem('campanas_custom_templates', JSON.stringify(customOnly));
      }
    } catch (err) {
      console.warn('Fallback a localStorage para plantillas personalizadas:', err);
      const local = localStorage.getItem('campanas_custom_templates');
      if (local) setCustomTemplates(JSON.parse(local));
    }
  };

  useEffect(() => {
    fetchCustomTemplates();
  }, []);

  const handleSaveCustomTemplate = async () => {
    if (!newTemplateName.trim()) {
      return addToast('Ingresá un nombre para la plantilla', 'warning');
    }
    if (!bodyHtml.trim() || bodyHtml === '<br>') {
      return addToast('El editor está vacío. Cargá o redactá contenido primero.', 'warning');
    }

    setSavingTemplate(true);
    try {
      const newTemplateObj = {
        nombre: newTemplateName.trim(),
        asunto: subject.trim(),
        cuerpo_html: bodyHtml,
        es_oficial: false
      };

      const { data, error } = await supabase
        .from('campanas_plantillas')
        .insert([newTemplateObj])
        .select()
        .single();

      let savedItem = data;
      if (error || !savedItem) {
        savedItem = { 
          ...newTemplateObj, 
          id: 'local_' + Date.now(), 
          created_at: new Date().toISOString() 
        };
      }

      const updated = [savedItem, ...customTemplates];
      setCustomTemplates(updated);
      localStorage.setItem('campanas_custom_templates', JSON.stringify(updated));
      setSelectedTemplateKey(`custom_${savedItem.id}`);

      addToast(`¡Plantilla '${newTemplateName.trim()}' guardada con éxito!`, 'success');
      setNewTemplateName('');
      setIsSaveTemplateModalOpen(false);
    } catch (err) {
      console.error('Error al guardar plantilla:', err);
      addToast('Error al guardar la plantilla: ' + err.message, 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteCustomTemplate = async (id, nombre) => {
    if (!window.confirm(`¿Estás seguro de eliminar la plantilla '${nombre}'?`)) return;

    try {
      if (!String(id).startsWith('local_')) {
        await supabase.from('campanas_plantillas').delete().eq('id', id);
      }
      const updated = customTemplates.filter(t => String(t.id) !== String(id));
      setCustomTemplates(updated);
      localStorage.setItem('campanas_custom_templates', JSON.stringify(updated));
      setSelectedTemplateKey('aunar');
      addToast(`Plantilla '${nombre}' eliminada`, 'info');
    } catch (err) {
      console.error('Error al eliminar plantilla:', err);
      addToast('Error al eliminar la plantilla', 'error');
    }
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

  const handleSyncBotBilling = async (actionType = 'preview', vtoParam) => {
    if (!botFile) {
      addToast('Seleccioná un archivo Excel para analizar.', 'warning');
      return;
    }

    if (actionType === 'publish') {
      setPublishingBot(true);
    } else {
      setUploadingBot(true);
    }
    
    const vtoToUse = (vtoParam !== undefined ? vtoParam : customVencimiento).trim();

    try {
      const formData = new FormData();
      formData.append('data', botFile);
      formData.append('file', botFile);
      formData.append('archivo', botFile);
      formData.append('action', actionType); // 'preview' | 'publish'
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
        const isPublished = (actionType === 'publish');
        setBotResult({ ...result, published: isPublished });
        if (result.vencimiento) {
          setCustomVencimiento(result.vencimiento);
        } else if (vtoToUse) {
          setCustomVencimiento(vtoToUse);
        }

        if (isPublished) {
          setIsConfirmPublishModalOpen(false);
          addToast(
            `¡Éxito! Facturación publicada en vivo en el Bot de WhatsApp (${result.lineas_procesadas || 0} líneas, ${result.grupos_actualizados || 0} grupos).`,
            'success'
          );
        } else {
          addToast(
            `Vista previa generada: ${result.lineas_procesadas || 0} líneas analizadas. Revisá los datos y confirmá la publicación.`,
            'info'
          );
        }
      } else {
        throw new Error(result.error || 'Error al procesar el archivo Excel.');
      }
    } catch (err) {
      console.error('Error procesando bot WSP:', err);
      addToast(err.message || 'Error al conectar con el webhook del bot.', 'error');
      setBotResult({ ok: false, error: err.message });
    } finally {
      setUploadingBot(false);
      setPublishingBot(false);
    }
  };

  const handleApplyVencimiento = async (newVto) => {
    const vto = (newVto !== undefined ? newVto : customVencimiento).trim();
    if (!vto) {
      addToast('Ingresá una fecha de vencimiento (ej: 12/09/2026)', 'warning');
      return;
    }

    setCustomVencimiento(vto);
    setApplyingVto(true);

    try {
      // If we have the botResult in preview, update memory and preview
      if (botResult && botResult.ok) {
        const updated = { ...botResult, vencimiento: vto, published: false };
        if (updated.detalle_empresas) {
          Object.keys(updated.detalle_empresas).forEach(emp => {
            if (updated.detalle_empresas[emp]?.lineas) {
              updated.detalle_empresas[emp].lineas = updated.detalle_empresas[emp].lineas.map(l => ({ ...l, vto: vto }));
            }
          });
        }
        if (updated.detalle_grupos) {
          Object.keys(updated.detalle_grupos).forEach(g => {
            if (updated.detalle_grupos[g]) {
              updated.detalle_grupos[g].vto = vto;
            }
          });
        }
        setBotResult(updated);
        addToast(`Vencimiento actualizado a ${vto}. Presioná "Confirmar y Publicar" para impactar en WhatsApp.`, 'info');
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

  // --------------- CAMPAÑA DESDE EXCEL (TODOS) ---------------
  const formatGbsPlan = (plan, gb) => {
    if (gb && String(gb).trim()) {
      let clean = String(gb).trim();
      clean = clean.replace(/(\d+)\s*MB\s*GB/i, '$1 MB');
      clean = clean.replace(/(\d+)\s*MB/i, '$1 MB');
      clean = clean.replace(/\s+/g, ' ');
      const num = parseFloat(clean);
      if (!isNaN(num) && !/(GB|MB)/i.test(clean)) {
        return `${num} GB`;
      }
      return clean;
    }
    if (plan && String(plan).trim()) {
      const str = String(plan).trim();
      const match = str.match(/(\d+(?:[,\.]\d+)?)\s*(GB|MB)/i);
      if (match) {
        return `${match[1]} ${match[2].toUpperCase()}`;
      }
      return str;
    }
    return '-';
  };

  const applyExcelRows = async (rawRows, mode, empresa, searchStr, periodoVal) => {
    if (!rawRows || rawRows.length === 0) {
      setItems([]);
      setSelectedIds(new Set());
      return;
    }

    // 1. Resolver el email representativo de cada grupo por "mayor repetición"
    // y descartando correos comodín institucionales (ej: aunarmutual@yahoo.com.ar) si existen emails personales en el grupo
    const groupEmailFreq = new Map(); // grupoKey -> Map(email -> count)
    const groupTitularCandidates = new Map(); // grupoKey -> Array<{ nombre, email, rawEmail }>

    const isMutualPlaceholder = (em) => {
      const lower = String(em || '').toLowerCase().trim();
      return lower.includes('aunarmutual') || lower.endsWith('@aunar.org.ar') || lower.includes('aunar@');
    };

    rawRows.forEach(r => {
      const gKey = r['GRUPO'] != null ? String(r['GRUPO']).trim() : '';
      if (!gKey) return;

      const emailGpo = String(r['EMAIL GRUPO'] || '').trim();
      const emailIndiv = String(r['EMAIL INDIVIDUAL'] || '').trim();
      const cand = (emailGpo || emailIndiv).toLowerCase();
      const rawCand = emailGpo || emailIndiv;
      const nombre = String(r['APELLIDO, NOMBRE'] || '').trim();

      if (cand && cand.includes('@')) {
        if (!groupEmailFreq.has(gKey)) {
          groupEmailFreq.set(gKey, new Map());
          groupTitularCandidates.set(gKey, []);
        }
        const freqMap = groupEmailFreq.get(gKey);
        freqMap.set(cand, (freqMap.get(cand) || 0) + 1);

        groupTitularCandidates.get(gKey).push({
          nombre,
          email: cand,
          rawEmail: rawCand
        });
      }
    });

    const groupResolved = new Map(); // grupoKey -> { email, nombreTitular }
    groupEmailFreq.forEach((freqMap, gKey) => {
      const candidates = Array.from(freqMap.entries()).map(([email, count]) => ({
        email,
        count,
        isPlaceholder: isMutualPlaceholder(email)
      }));

      // Prioridad: 1) Si no es placeholder de la mutual gana; 2) Mayor cantidad de repeticiones en el grupo
      candidates.sort((a, b) => {
        if (a.isPlaceholder !== b.isPlaceholder) {
          return a.isPlaceholder ? 1 : -1;
        }
        return b.count - a.count;
      });

      const winningEmail = candidates[0]?.email || '';
      const pool = groupTitularCandidates.get(gKey) || [];
      const matchingRows = pool.filter(r => r.email === winningEmail);
      const candidatesForName = matchingRows.length > 0 ? matchingRows : pool;

      // Buscar el titular principal (preferir nombres sin sufijos como '(hijo)', '(mujer)', '(esposa)')
      let bestNombre = candidatesForName[0]?.nombre || '';
      for (const item of candidatesForName) {
        const n = item.nombre.toLowerCase();
        if (!n.includes('(') && !n.includes(')')) {
          bestNombre = item.nombre;
          break;
        }
      }

      const originalEmail = pool.find(r => r.email === winningEmail)?.rawEmail || winningEmail;

      groupResolved.set(gKey, {
        email: originalEmail,
        nombreTitular: bestNombre
      });
    });

    let filtered = rawRows;
    if (empresa && empresa !== 'ALL') {
      filtered = filtered.filter(r => String(r['EMPRESA'] || '').trim().toUpperCase() === empresa);
    }

    const normalizedRows = filtered.map(r => {
      const tarifaAunar = Number(r['T. AUNAR $'] || 0);
      const excedentes = Number(r['EXCED. $ INCL.'] || 0);
      const abonoBase = Math.max(0, tarifaAunar - excedentes);
      const numLinea = r['NUMERO'] != null ? String(r['NUMERO']).trim() : '';
      const emailIndiv = String(r['EMAIL INDIVIDUAL'] || '').trim();
      const rawEmailGpo = String(r['EMAIL GRUPO'] || '').trim();
      const grupo = r['GRUPO'] != null ? String(r['GRUPO']).trim() : '';

      // El email del grupo es el resuelto por mayoría de repeticiones
      const resolvedGpo = grupo ? groupResolved.get(grupo) : null;
      const emailGpo = resolvedGpo?.email || rawEmailGpo;

      // Si la línea tiene email individual legítimo (no institucional mutual), se respeta;
      // si no, se usa el email representativo del grupo
      let emailFinal = emailIndiv;
      if (!emailFinal || isMutualPlaceholder(emailFinal)) {
        emailFinal = emailGpo || rawEmailGpo;
      }

      const nombre = String(r['APELLIDO, NOMBRE'] || '').trim();
      const rawGb = String(r['GB INTERNET'] || '').trim();
      const rawAbono = String(r['ABONO NOMBRE'] || '').trim();
      const plan = formatGbsPlan(rawAbono, rawGb);
      const prov = String(r['EMPRESA'] || '').trim().toUpperCase();
      const fpago = String(r['FPAGO'] || '').trim();
      const cbu = String(r['CBU'] || '').trim();

      return {
        empresa: prov,
        grupo,
        nombre,
        nombreTitular: resolvedGpo?.nombreTitular || nombre,
        numero: numLinea,
        plan,
        gb: rawGb,
        abonoBase,
        excedentes,
        tarifaAunar,
        emailIndiv,
        emailGpo,
        emailFinal,
        fpago,
        cbu
      };
    }).filter(r => r.emailFinal && r.numero);

    let resultItems;

    if (mode === 'lineas_email') {
      const emailMap = new Map();
      normalizedRows.forEach(r => {
        const key = r.emailFinal.toLowerCase();
        if (!emailMap.has(key)) {
          emailMap.set(key, {
            id: `excel_mail_${key}`,
            nombre: r.nombreTitular || r.nombre,
            nombre_socio: r.nombreTitular || r.nombre,
            email: r.emailFinal,
            grupo: r.grupo || 'Sin Grupo',
            lineasSet: new Set(),
            monto_cuota_cel: 0,
            total_cuotas: 0,
            monto_adeudado_num: 0,
            dias_mora: '0',
            periodo: periodoVal || excelPeriodo,
            fpago: r.fpago,
            cbu: r.cbu,
            dni: '',
            cuit: '',
            detalle_lineas: []
          });
        }

        const target = emailMap.get(key);
        target.lineasSet.add(r.numero);
        target.monto_adeudado_num += r.tarifaAunar;
        target.monto_cuota_cel += r.abonoBase;
        if (!target.fpago && r.fpago) target.fpago = r.fpago;
        if (!target.cbu && r.cbu) target.cbu = r.cbu;

        target.detalle_lineas.push({
          numero_linea: r.numero,
          nombre_plan: r.plan,
          gb: r.gb,
          proveedor: r.empresa,
          costo_abono_real: r.abonoBase,
          excedentes: r.excedentes,
          total_linea: r.tarifaAunar
        });
      });

      resultItems = Array.from(emailMap.values()).map(item => ({
        ...item,
        lineas: Array.from(item.lineasSet).join(', '),
        monto_adeudado: item.monto_adeudado_num.toFixed(2),
        monto_cuota_cel: item.monto_cuota_cel.toFixed(2),
        display_detalle: `${item.nombre} (${item.lineasSet.size} ${item.lineasSet.size === 1 ? 'línea' : 'líneas'})`
      }));
    } else {
      // Modo Grupo
      const groupMap = new Map();
      normalizedRows.forEach(r => {
        const key = r.grupo || r.emailGpo || r.emailFinal;
        if (!groupMap.has(key)) {
          const repNombre = r.nombreTitular || r.nombre;
          groupMap.set(key, {
            id: `excel_gpo_${key}`,
            nombre: r.grupo ? `Grupo ${r.grupo} - ${repNombre}` : repNombre,
            nombre_socio: repNombre,
            email: r.emailGpo || r.emailFinal,
            grupo: r.grupo,
            lineasSet: new Set(),
            monto_cuota_cel: 0,
            total_cuotas: 0,
            monto_adeudado_num: 0,
            dias_mora: '0',
            periodo: periodoVal || excelPeriodo,
            fpago: r.fpago,
            cbu: r.cbu,
            dni: '',
            cuit: '',
            detalle_lineas: []
          });
        }

        const target = groupMap.get(key);
        target.lineasSet.add(r.numero);
        target.monto_adeudado_num += r.tarifaAunar;
        target.monto_cuota_cel += r.abonoBase;

        target.detalle_lineas.push({
          numero_linea: r.numero,
          nombre_plan: r.plan,
          gb: r.gb,
          proveedor: r.empresa,
          costo_abono_real: r.abonoBase,
          excedentes: r.excedentes,
          total_linea: r.tarifaAunar
        });
      });

      resultItems = Array.from(groupMap.values()).map(item => ({
        ...item,
        lineas: Array.from(item.lineasSet).join(', '),
        monto_adeudado: item.monto_adeudado_num.toFixed(2),
        monto_cuota_cel: item.monto_cuota_cel.toFixed(2),
        display_detalle: `${item.nombre} (${item.lineasSet.size} líneas)`
      }));
    }

    if (searchStr && searchStr.trim()) {
      const q = searchStr.trim().toLowerCase();
      resultItems = resultItems.filter(item =>
        item.nombre.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.lineas.includes(q) ||
        String(item.grupo).toLowerCase().includes(q)
      );
    }

    // Enriquecer con estado de notificación en campanas_logs (últimos 35 días)
    try {
      const notifMap = await fetchNotificacionesRecientes();

      resultItems.forEach(item => {
        const notif = notifMap.get((item.email || '').trim().toLowerCase());
        item.notificado = !!notif;
        item.ultimo_envio = notif?.created_at || null;
        item.ultimo_estado = notif?.estado || null;
      });
    } catch (e) {
      console.warn('Error al verificar notificaciones en Excel:', e);
    }

    const notifCount = resultItems.filter(i => i.notificado).length;
    const pendCount = resultItems.filter(i => !i.notificado).length;
    applySelectionAndFilters(resultItems, notifCount, pendCount);
  };

  const handleExcelFileSelect = (file) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      addToast('Por favor seleccioná un archivo Excel válido (.xlsx o .xls)', 'error');
      return;
    }
    setLoading(true);
    setExcelFile(file);

    const nameMatch = file.name.match(/\(?(\d{2}[-_]\d{4})\)?/);
    const detectado = nameMatch ? nameMatch[1].replace('_', '-') : excelPeriodo;
    if (nameMatch) {
      setExcelPeriodo(detectado);
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames.includes('SOCIOS') ? 'SOCIOS' : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet);

        setExcelRawRows(rawJson);

        let totFact = 0;
        const empCount = {};
        rawJson.forEach(r => {
          totFact += Number(r['T. AUNAR $'] || 0);
          const emp = String(r['EMPRESA'] || 'OTRO').trim().toUpperCase();
          empCount[emp] = (empCount[emp] || 0) + 1;
        });

        setExcelStats({
          totalLineas: rawJson.length,
          totalFacturado: totFact,
          empresas: empCount
        });

        await applyExcelRows(rawJson, excelMode, excelEmpresa, excelSearch, detectado);
        addToast(`¡Planilla cargada! Se encontraron ${rawJson.length} líneas en '${sheetName}'.`, 'success');
      } catch (err) {
        console.error('Error al parsear Excel:', err);
        addToast('Error al leer el archivo Excel: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
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
          const [{ data: facturacion }, { data: lineasPlan }] = await Promise.all([
            supabase
              .from('v_historial_facturacion_socio')
              .select('socio_id, numero_linea, nombre_plan, proveedor, costo_abono_real, excedentes, bonificaciones, total_linea')
              .eq('periodo', ultimoPeriodo),
            supabase
              .from('lineas')
              .select('numero_linea, planes_abonos:plan_id(gb_incluidos)')
          ]);

          const gbMap = new Map();
          (lineasPlan || []).forEach(lp => {
            if (lp.numero_linea) gbMap.set(lp.numero_linea, lp.planes_abonos?.gb_incluidos);
          });

          const facturacionPorSocio = {};
          (facturacion || []).forEach(f => {
            f.gb = gbMap.get(f.numero_linea);
            if (!facturacionPorSocio[f.socio_id]) facturacionPorSocio[f.socio_id] = [];
            facturacionPorSocio[f.socio_id].push(f);
          });

          // Cargar notificaciones recientes para marcar socios notificados
          const notifMap = await fetchNotificacionesRecientes();

          mapped.forEach(item => {
            const lineasFactura = facturacionPorSocio[item.socio_id_num] || [];
            item.periodo = ultimoPeriodo;
            item.detalle_lineas = lineasFactura;
            const notif = notifMap.get((item.email || '').trim().toLowerCase());
            item.notificado = !!notif;
            item.ultimo_envio = notif?.created_at || null;
            item.ultimo_estado = notif?.estado || null;

            if (lineasFactura.length > 0) {
              item.monto_adeudado = lineasFactura.reduce((sum, l) => sum + Number(l.total_linea || 0), 0).toFixed(2);
              item.lineas = lineasFactura.map(l => l.numero_linea).join(', ');
            }
          });
        }
      } catch (facErr) {
        console.error('Error al enriquecer con facturación:', facErr);
      }

      const notifCount = mapped.filter(i => i.notificado).length;
      const pendCount = mapped.filter(i => !i.notificado).length;
      applySelectionAndFilters(mapped, notifCount, pendCount);
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

      // Enriquecer con última facturación del grupo y detalle completo de líneas
      try {
        const { data: ultLiqs } = await supabase
          .from('liquidaciones_grupos')
          .select('numero_grupo, periodo, monto_total_facturado')
          .order('periodo', { ascending: false });

        let ultimoPeriodo = '';
        const liqsMap = {};
        if (ultLiqs && ultLiqs.length > 0) {
          ultimoPeriodo = ultLiqs[0].periodo;
          ultLiqs.filter(l => l.periodo === ultimoPeriodo).forEach(l => {
            liqsMap[l.numero_grupo] = (liqsMap[l.numero_grupo] || 0) + Number(l.monto_total_facturado || 0);
          });
        }

        if (!ultimoPeriodo) {
          const { data: cData } = await supabase
            .from('consumos_mensuales')
            .select('periodo')
            .order('periodo', { ascending: false })
            .limit(1);
          ultimoPeriodo = cData?.[0]?.periodo || '';
        }

        // Cargar todas las líneas asignadas a grupos con su compañía, plan, GB y socio asignado
        const { data: groupLines } = await supabase
          .from('lineas')
          .select(`
            numero_linea,
            numero_grupo,
            proveedores:proveedor_id (nombre),
            planes_abonos:plan_id (nombre_plan, gb_incluidos),
            socios:socio_id (nombre_completo)
          `)
          .not('numero_grupo', 'is', null)
          .order('numero_linea', { ascending: true });

        // Cargar facturación detallada del último período
        const factMap = new Map();
        if (ultimoPeriodo) {
          const { data: facturacion } = await supabase
            .from('v_historial_facturacion_socio')
            .select('numero_linea, nombre_plan, proveedor, costo_abono_real, excedentes, bonificaciones, total_linea')
            .eq('periodo', ultimoPeriodo);

          (facturacion || []).forEach(f => {
            if (f.numero_linea) factMap.set(f.numero_linea, f);
          });
        }

        // Agrupar líneas por numero_grupo
        const linesByGroup = {};
        (groupLines || []).forEach(l => {
          if (!l.numero_grupo) return;
          if (!linesByGroup[l.numero_grupo]) linesByGroup[l.numero_grupo] = [];
          const fact = factMap.get(l.numero_linea);
          linesByGroup[l.numero_grupo].push({
            numero_linea: l.numero_linea,
            nombre_socio: l.socios?.nombre_completo || '',
            proveedor: fact?.proveedor || l.proveedores?.nombre || 'CLARO',
            nombre_plan: fact?.nombre_plan || l.planes_abonos?.nombre_plan || '',
            gb: l.planes_abonos?.gb_incluidos,
            costo_abono_real: Number(fact?.costo_abono_real || 0),
            excedentes: Number(fact?.excedentes || 0),
            total_linea: Number(fact?.total_linea || fact?.costo_abono_real || 0)
          });
        });

        // Cargar notificaciones de este mes para marcar grupos notificados
        const inicioMes = new Date();
        inicioMes.setDate(1);
        inicioMes.setHours(0, 0, 0, 0);

        const { data: logsMes } = await supabase
          .from('campanas_logs')
          .select('destinatario_email, created_at, estado')
          .gte('created_at', inicioMes.toISOString())
          .neq('estado', 'error');

        const notifMap = new Map();
        (logsMes || []).forEach(l => {
          if (l.destinatario_email) {
            const em = l.destinatario_email.trim().toLowerCase();
            if (!notifMap.has(em)) notifMap.set(em, l);
          }
        });

        mapped.forEach(item => {
          const gLines = linesByGroup[item.grupo] || [];
          item.detalle_lineas = gLines;
          item.periodo = ultimoPeriodo;
          const notif = notifMap.get((item.email || '').trim().toLowerCase());
          item.notificado = !!notif;
          item.ultimo_envio = notif?.created_at || null;
          item.ultimo_estado = notif?.estado || null;

          if (gLines.length > 0) {
            item.lineas = gLines.map(l => l.numero_linea).join(', ');
            const sumLines = gLines.reduce((sum, l) => sum + Number(l.total_linea || 0), 0);
            if (!liqsMap[item.grupo] && sumLines > 0) {
              item.monto_adeudado = sumLines.toFixed(2);
            }
          }
          if (liqsMap[item.grupo]) {
            item.monto_adeudado = Number(liqsMap[item.grupo]).toFixed(2);
          }
        });
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
          const [{ data: facturacion }, { data: lineasPlan }] = await Promise.all([
            supabase
              .from('v_historial_facturacion_socio')
              .select('socio_id, numero_linea, nombre_plan, proveedor, costo_abono_real, excedentes, bonificaciones, total_linea')
              .eq('periodo', ultimoPeriodo),
            supabase
              .from('lineas')
              .select('numero_linea, planes_abonos:plan_id(gb_incluidos)')
          ]);

          const gbMap = new Map();
          (lineasPlan || []).forEach(lp => {
            if (lp.numero_linea) gbMap.set(lp.numero_linea, lp.planes_abonos?.gb_incluidos);
          });

          const factMap = new Map();
          (facturacion || []).forEach(f => {
            f.gb = gbMap.get(f.numero_linea);
            if (f.numero_linea) factMap.set(f.numero_linea, f);
          });

          // Cargar notificaciones del mes para marcar líneas notificadas
          const inicioMes = new Date();
          inicioMes.setDate(1);
          inicioMes.setHours(0, 0, 0, 0);

          const { data: logsMes } = await supabase
            .from('campanas_logs')
            .select('destinatario_email, created_at, estado')
            .gte('created_at', inicioMes.toISOString())
            .neq('estado', 'error');

          const notifMap = new Map();
          (logsMes || []).forEach(l => {
            if (l.destinatario_email) {
              const em = l.destinatario_email.trim().toLowerCase();
              if (!notifMap.has(em)) notifMap.set(em, l);
            }
          });

          mapped.forEach(item => {
            item.periodo = ultimoPeriodo;
            const notif = notifMap.get((item.email || '').trim().toLowerCase());
            item.notificado = !!notif;
            item.ultimo_envio = notif?.created_at || null;
            item.ultimo_estado = notif?.estado || null;

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
    const targetItems = displayedItems || items;
    if (selectedIds.size >= targetItems.length && targetItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(targetItems.map(i => i.id)));
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
      cbu: g.cbu,
      grupo: g.grupo,
      lineas: Array.from(g.lineasSet).join(', ') || 'Sin Línea',
      monto_cuota_cel: g.monto_cuota_cel,
      total_cuotas: g.total_cuotas,
      monto_adeudado: g.monto_adeudado_num.toFixed(2),
      dias_mora: g.dias_mora,
      periodo: g.periodo || excelPeriodo || '08-2026',
      detalle_lineas: g.detalle_lineas || []
    }));

    setSending(true);

    // Sanitizar HTML base antes de procesar
    const sanitizedBaseBody = DOMPurify.sanitize(bodyHtml);

    // Obtener token de sesión para el proxy
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const proxyUrl = 'https://zwncyaviinmfzvminytv.supabase.co/functions/v1/n8n-proxy';

    const campaignStartTime = new Date().toISOString();

    try {
      // 1. Preparar cada destinatario con su HTML y asunto personalizados
      const preparedRecipients = recipients.map(r => {
        const { body: renderedBody, subj: renderedSubj } = renderEmailForRecipient(
          sanitizedBaseBody, 
          subject.trim(), 
          r
        );

        const sIdNum = typeof r.socio_id === 'number' 
          ? r.socio_id 
          : (Number(String(r.socio_id).replace(/\D/g, '')) || null);

        return {
          ...r,
          socio_id: sIdNum,
          subject: renderedSubj,
          bodyHtml: renderedBody
        };
      });

      // 2. Enviar el lote consolidado completo a n8n (Blindado v2 responde en ~30ms y ejecuta en segundo plano)
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
          bodyHtml: sanitizedBaseBody,
          recipients: preparedRecipients
        }),
      });

      if (!response.ok) {
        const errTxt = await response.text().catch(() => '');
        throw new Error(`Error en el servidor webhook (HTTP ${response.status}): ${errTxt}`);
      }

      const resData = await response.json().catch(() => ({}));
      const totalConsolidados = resData.total_destinatarios_consolidados || preparedRecipients.length;

      // 3. Iniciar pantalla de progreso en vivo
      setActiveCampaign({
        name: campaignName.trim(),
        subject: subject.trim(),
        total: totalConsolidados,
        startTime: campaignStartTime,
        logs: [],
        sentCount: 0,
        successCount: 0,
        errorCount: 0,
        isFinished: false,
        isMinimized: false
      });

      addToast(`Campaña iniciada para ${totalConsolidados} destinatarios. Monitoreando en vivo...`, 'success');

      // Limpiar formulario y selección
      setCampaignName('');
      setSubject('');
      setBodyHtml('');
      if (editorRef.current) editorRef.current.innerHTML = '';
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      addToast('Error al iniciar la campaña: ' + err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const renderEmailForRecipient = (templateHtml, templateSubject, r) => {
    let body = templateHtml;
    let subj = templateSubject;

    const periodoStr = r.periodo || excelPeriodo || '08-2026';
    const montoStr = Number(r.monto_adeudado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const abonoStr = Number(r.monto_cuota_cel || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const nombreStr = r.nombre_socio || r.nombre_completo || 'Socio';
    const lineasStr = r.lineas || 'Sin Línea';
    const grupoStr = r.grupo || 'Sin Grupo';
    const fpagoStr = r.fpago === 'D' ? 'Débito CBU' : (r.fpago || 'Efectivo');
    const cbuStr = r.cbu || '';
    const dniStr = r.dni || '-';
    const cuitStr = r.cuit || '-';
    const diasMoraStr = r.dias_mora || '0';

    // Generar filas de la tabla de detalle de líneas (Línea, Compañía, GB Contratados, Abono)
    let tableRows;
    if (r.detalle_lineas && r.detalle_lineas.length > 0) {
      tableRows = r.detalle_lineas.map(l => {
        const lineNum = l.numero_linea || '';
        let lineLabel = lineNum;
        if (l.nombre_socio) {
          const sName = l.nombre_socio.includes(',')
            ? l.nombre_socio.split(',')[1].trim().split(' ')[0]
            : l.nombre_socio.trim().split(' ')[0];
          if (sName && sName.toLowerCase() !== 'socio') {
            lineLabel = `${lineNum} (${sName})`;
          }
        }
        const planGb = formatGbsPlan(l.nombre_plan, l.gb);
        const prov = l.proveedor || '-';
        const total = `$ ${Number(l.total_linea || l.costo_abono_real || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

        return `<tr>
          <td style="border-bottom: 1px solid #eee; padding: 8px; font-size: 13px; font-weight: 600; color: #333;">${lineLabel}</td>
          <td style="border-bottom: 1px solid #eee; padding: 8px; font-size: 13px; color: #555;">${prov}</td>
          <td style="border-bottom: 1px solid #eee; padding: 8px; font-size: 13px; text-align: center; color: #555;">${planGb}</td>
          <td style="border-bottom: 1px solid #eee; padding: 8px; font-size: 13px; text-align: right; color: #555; font-weight: 600;">${total}</td>
        </tr>`;
      }).join('');
    } else {
      tableRows = `<tr>
        <td style="border-bottom: 1px solid #eee; padding: 8px; font-size: 13px; font-weight: 600; color: #333;">${lineasStr}</td>
        <td style="border-bottom: 1px solid #eee; padding: 8px; font-size: 13px; color: #555;">Mutual Aunar</td>
        <td style="border-bottom: 1px solid #eee; padding: 8px; font-size: 13px; text-align: center; color: #555;">-</td>
        <td style="border-bottom: 1px solid #eee; padding: 8px; font-size: 13px; text-align: right; color: #555; font-weight: 600;">$ ${montoStr}</td>
      </tr>`;
    }

    // Asegurar que si el cuerpo trae el encabezado de 3 columnas (Línea / Empresa / Abono), se transforme a 4 columnas con GB
    body = body.replace(
      /<th([^>]*)>(?:Empresa|Compañía)<\/th>\s*<th([^>]*)>Abono<\/th>/gi,
      `<th$1>Compañía</th><th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: center; color: #555;">GB Contratados</th><th$2>Abono</th>`
    );

    // Reemplazar marcador de tabla de líneas o {{detalle_lineas_html}}
    const placeholderRowRegex = /<tr[^>]*data-lineas-placeholder[^>]*>[\s\S]*?<\/tr>/gi;
    if (placeholderRowRegex.test(body)) {
      body = body.replace(placeholderRowRegex, tableRows);
    }
    const commentPlaceholderRegex = /<!--\s*DETALLE_LINEAS_START\s*-->[\s\S]*?<!--\s*DETALLE_LINEAS_END\s*-->/gi;
    if (commentPlaceholderRegex.test(body)) {
      body = body.replace(commentPlaceholderRegex, tableRows);
    }
    body = body.split('{{detalle_lineas_html}}').join(tableRows);

    // Normalizar logo a la versión horizontal oficial en Supabase Storage
    body = body.replace(/https:\/\/proyecto-mutual\.vercel\.app\/logo\.png/g, 'https://zwncyaviinmfzvminytv.supabase.co/storage/v1/object/public/public_assets/logo_aunar.png');
    body = body.replace(/src=["']\/logo\.png["']/g, 'src="https://zwncyaviinmfzvminytv.supabase.co/storage/v1/object/public/public_assets/logo_aunar.png"');
    body = body.replace(/max-width:\s*2[0-9]{2}px/g, 'width: 160px; max-width: 100%');

    // Extraer nombre y apellido
    let firstName = '';
    let lastName = '';
    if (nombreStr.includes(',')) {
      const parts = nombreStr.split(',');
      lastName = parts[0].trim();
      firstName = parts.slice(1).join(' ').trim();
    } else {
      const parts = nombreStr.split(' ');
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }

    // Calcular vencimiento: por defecto día 12 del mes del período (o mes siguiente)
    let vencimientoStr = r.vencimiento;
    if (!vencimientoStr) {
      if (periodoStr && periodoStr.includes('-')) {
        const pParts = periodoStr.split('-');
        let m = parseInt(pParts[0].length === 4 ? pParts[1] : pParts[0], 10);
        let y = parseInt(pParts[0].length === 4 ? pParts[0] : pParts[1], 10);
        m = m + 1;
        if (m > 12) { m = 1; y += 1; }
        vencimientoStr = `12/${String(m).padStart(2, '0')}/${y}`;
      } else {
        vencimientoStr = '12/09/2026';
      }
    }

    // Generar resumen de líneas para el asunto (similar al viejo formato FACT. AUNAR)
    let detalleLineasAsunto = '';
    if (r.detalle_lineas && r.detalle_lineas.length > 0) {
      detalleLineasAsunto = r.detalle_lineas.map(l => {
        const lineNum = l.numero_linea || '';
        // Extraer primer nombre del socio de la línea (si tiene nombre propio diferente)
        const lineSocioName = l.nombre_socio || l.nombre_completo || '';
        let displayName = '';
        if (lineSocioName) {
          if (lineSocioName.includes(',')) {
            displayName = lineSocioName.split(',').slice(1).join(' ').trim().split(' ')[0];
          } else {
            displayName = lineSocioName.split(' ')[0];
          }
        }
        if (!displayName) displayName = firstName || '';
        const totalLinea = `$${Number(l.total_linea || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
        const planStr = formatGbsPlan(l.nombre_plan, l.gb);
        const excStr = `$${Number(l.excedentes || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
        return `[${lineNum} (${displayName}) ${totalLinea} (vto.${vencimientoStr}) Plan: ${planStr} - Excedentes: ${excStr}]`;
      }).join(' ');
    }

    // Mapeo general de variables
    const map = {
      '{{nombre_socio}}': nombreStr,
      '{{nombre}}': firstName || nombreStr,
      '{{apellido}}': lastName,
      '{{first_name}}': firstName || nombreStr,
      '{{last_name}}': lastName,
      '<< Test First Name >>': firstName || nombreStr,
      '<< Test Last Name >>': lastName,
      '<< Test Address >>': grupoStr !== 'Sin Grupo' ? `Grupo #${grupoStr}` : lineasStr,
      '{{lineas}}': lineasStr,
      '{{periodo}}': periodoStr,
      '{{monto_adeudado}}': montoStr,
      '{{vencimiento}}': vencimientoStr,
      '{{monto_cuota_cel}}': abonoStr,
      '{{grupo}}': grupoStr,
      '{{fpago}}': fpagoStr,
      '{{cbu}}': cbuStr,
      '{{dni}}': dniStr,
      '{{cuit}}': cuitStr,
      '{{dias_mora}}': diasMoraStr,
      '{{detalle_lineas_asunto}}': detalleLineasAsunto,
    };

    Object.entries(map).forEach(([tag, val]) => {
      body = body.split(tag).join(val);
      subj = subj.split(tag).join(val);
    });

    return { body, subj };
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

  const buildAunarChassis = (editableTextHtml = '') => {
    return `<div style="font-family: Arial, sans-serif; max-width: 600px; background-color: #ffffff; margin: 0 auto; padding: 20px; border-radius: 8px; border: 1px solid #ddd; color: #333; line-height: 1.5;">

  <!-- Logo AUNAR -->
  <div style="text-align: center; margin-bottom: 20px;">
    <img src="https://zwncyaviinmfzvminytv.supabase.co/storage/v1/object/public/public_assets/logo_aunar.png" alt="Aunar Asociación" style="width: 160px; max-width: 100%; height: auto; display: inline-block;" />
  </div>

  <!-- Saludo -->
  <p style="font-size: 14px; line-height: 1.5; margin-bottom: 15px;">
    &#128075; ¡Hola, <strong>{{nombre_socio}}</strong>!
  </p>
  <p style="font-size: 14px; line-height: 1.5; margin-bottom: 15px;">
    Te enviamos el detalle de tu facturación y el saldo de tu cuenta.
  </p>
  <p style="font-size: 13px; color: #666; margin-bottom: 15px;">Grupo: #{{grupo}} · Período: {{periodo}}</p>

  <!-- Tabla de líneas -->
  <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #e0e0e0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px;">
      <thead>
        <tr>
          <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: left; color: #555;">Línea</th>
          <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: left; color: #555;">Compañía</th>
          <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: center; color: #555;">GB Contratados</th>
          <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: right; color: #555;">Abono</th>
        </tr>
      </thead>
      <tbody>
        <!-- DETALLE_LINEAS_START -->
        <tr data-lineas-placeholder="true">
          <td colspan="4" style="padding: 12px; text-align: center; color: #999; font-size: 13px; font-style: italic;">
            (El detalle de líneas se insertará automáticamente aquí)
          </td>
        </tr>
        <!-- DETALLE_LINEAS_END -->
      </tbody>
    </table>
    <div style="font-size: 16px; font-weight: bold; color: #d9534f; text-align: right; margin-bottom: 5px;">Total a abonar: $ {{monto_adeudado}}</div>
    <div style="font-size: 14px; text-align: right; color: #555; font-weight: bold;">Vencimiento: {{vencimiento}}</div>
  </div>

  ${editableTextHtml || `<!-- Sección informativa -->
  <div style="font-size: 13px; color: #666; margin-top: 20px; line-height: 1.4; border-top: 1px solid #eee; padding-top: 15px;">
    <p style="margin-bottom: 12px;"><strong style="color: #444;">&#129300; ¿Tenés dudas sobre tu factura o tu plan?</strong><br>Estamos para ayudarte y asesorarte sobre las opciones disponibles en Claro, Personal y Movistar.</p>
    <p style="margin-bottom: 12px;"><strong style="color: #444;">&#10084;&#65039; Beneficios y descuentos para vos</strong><br>Contamos con beneficios de portabilidad para nuestros asociados y sus referidos.</p>
    <p style="margin-bottom: 12px;"><strong style="color: #444;">&#9992;&#65039; ¿Vas a viajar al exterior?</strong><br>Avisanos con anticipación y te asesoramos sobre las opciones de roaming para tu línea.</p>
    <p style="margin-bottom: 12px;"><strong style="color: #444;">&#128201; ¿Tu factura vino más alta de lo habitual?</strong><br>Si tenés excedentes de internet, consultanos. Podemos revisar tu plan y ayudarte a encontrar el que mejor se adapte a vos.</p>
    <p style="text-align: center; font-weight: bold; color: #0056b3; margin-top: 20px;">¡Gracias por seguir eligiendo Aunar! &#129309;</p>
    <p style="background-color: #e9ecef; padding: 10px; border-radius: 5px; text-align: center; margin-top: 15px;">
      <strong>&#128161; ¿Sabías que también tenemos internet y TV para tu hogar?</strong><br>
      Consultá por tu zona y te cotizamos en el instante. Resolvé tu conectividad en un solo lugar.
    </p>
  </div>`}

  <!-- Footer -->
  <div style="font-size: 11px; text-align: center; color: #888; margin-top: 30px; line-height: 1.4;">
    <p style="margin-bottom: 8px;">
      <a href="https://twitter.com/aunar" target="_blank" style="color: #0056b3; text-decoration: none;">Twitter</a> |
      <a href="https://facebook.com/aunar" target="_blank" style="color: #0056b3; text-decoration: none;">Facebook</a> |
      <a href="https://aunar.com.ar" target="_blank" style="color: #0056b3; text-decoration: none;">Website</a>
    </p>
    <p style="margin: 0 0 4px 0;">Copyright &copy; 2026 AUNAR MUTUAL. Todos los derechos reservados.</p>
    <p style="margin: 0 0 4px 0;">AUNAR MUTUAL · 46 Diag. 76 · La Plata, Buenos Aires · Argentina</p>
    <p style="margin-top: 15px;">Recibís este correo porque sos asociado activo de Mutual Aunar.<br>Si deseás modificar tus preferencias de contacto, por favor respondé este correo.</p>
  </div>

</div>`;
  };

  const handleLoadTemplate = (type) => {
    setSelectedTemplateKey(type);
    if (!type) return;

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

    if (type === 'aunar_base') {
      const name = `Comunicación Oficial - ${mesAnioCapitalized}`;
      const subj = 'Aunar - Detalle de tu abono, {{nombre_socio}} - Linea: {{lineas}}';
      const body = buildAunarChassis();
      setCampaignName(name);
      setSubject(subj);
      setBodyHtml(body);
      if (editorRef.current) editorRef.current.innerHTML = body;
      addToast('Plantilla Base AUNAR cargada. Editá el texto inferior según tus necesidades.', 'success');
      return;
    }

    if (type.startsWith('custom_')) {
      const customId = type.replace('custom_', '');
      const t = customTemplates.find(c => String(c.id) === String(customId));
      if (t) {
        setCampaignName(t.nombre);
        setSubject(t.asunto || '');
        setBodyHtml(t.cuerpo_html || '');
        if (editorRef.current) editorRef.current.innerHTML = t.cuerpo_html || '';
        addToast(`Plantilla personalizada '${t.nombre}' cargada con éxito.`, 'success');
      }
      return;
    }

    const templates = {
      aunar: {
        name: `Comunicación Oficial - ${mesAnioCapitalized}`,
        subject: 'Aunar - Detalle de tu abono, {{nombre_socio}} - Linea: {{lineas}}',
        body: `<div style="font-family: Arial, sans-serif; max-width: 600px; background-color: #ffffff; margin: 0 auto; padding: 20px; border-radius: 8px; border: 1px solid #ddd; color: #333; line-height: 1.5;">

  <!-- Logo AUNAR -->
  <div style="text-align: center; margin-bottom: 20px;">
    <img src="https://zwncyaviinmfzvminytv.supabase.co/storage/v1/object/public/public_assets/logo_aunar.png" alt="Aunar Asociación" style="width: 160px; max-width: 100%; height: auto; display: inline-block;" />
  </div>

  <!-- Saludo -->
  <p style="font-size: 14px; line-height: 1.5; margin-bottom: 15px;">
    &#128075; ¡Hola, <strong>{{nombre_socio}}</strong>!
  </p>
  <p style="font-size: 14px; line-height: 1.5; margin-bottom: 15px;">
    Te enviamos el detalle de tu facturación y el saldo de tu cuenta.
  </p>
  <p style="font-size: 13px; color: #666; margin-bottom: 15px;">Grupo: #{{grupo}} · Período: {{periodo}}</p>

  <!-- Tabla de líneas -->
  <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #e0e0e0;">
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px;">
      <thead>
        <tr>
          <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: left; color: #555;">Línea</th>
          <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: left; color: #555;">Compañía</th>
          <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: center; color: #555;">GB Contratados</th>
          <th style="border-bottom: 2px solid #ccc; padding: 8px; text-align: right; color: #555;">Abono</th>
        </tr>
      </thead>
      <tbody>
        <!-- DETALLE_LINEAS_START -->
        <tr data-lineas-placeholder="true">
          <td colspan="4" style="padding: 12px; text-align: center; color: #999; font-size: 13px; font-style: italic;">
            (El detalle de líneas se insertará automáticamente aquí)
          </td>
        </tr>
        <!-- DETALLE_LINEAS_END -->
      </tbody>
    </table>
    <div style="font-size: 16px; font-weight: bold; color: #d9534f; text-align: right; margin-bottom: 5px;">Total a abonar: $ {{monto_adeudado}}</div>
    <div style="font-size: 14px; text-align: right; color: #555; font-weight: bold;">Vencimiento: {{vencimiento}}</div>
  </div>

  <!-- Sección informativa -->
  <div style="font-size: 13px; color: #666; margin-top: 20px; line-height: 1.4; border-top: 1px solid #eee; padding-top: 15px;">
    <p style="margin-bottom: 12px;"><strong style="color: #444;">&#129300; ¿Tenés dudas sobre tu factura o tu plan?</strong><br>Estamos para ayudarte y asesorarte sobre las opciones disponibles en Claro, Personal y Movistar.</p>
    <p style="margin-bottom: 12px;"><strong style="color: #444;">&#10084;&#65039; Beneficios y descuentos para vos</strong><br>Contamos con beneficios de portabilidad para nuestros asociados y sus referidos.</p>
    <p style="margin-bottom: 12px;"><strong style="color: #444;">&#9992;&#65039; ¿Vas a viajar al exterior?</strong><br>Avisanos con anticipación y te asesoramos sobre las opciones de roaming para tu línea.</p>
    <p style="margin-bottom: 12px;"><strong style="color: #444;">&#128201; ¿Tu factura vino más alta de lo habitual?</strong><br>Si tenés excedentes de internet, consultanos. Podemos revisar tu plan y ayudarte a encontrar el que mejor se adapte a vos.</p>
    <p style="text-align: center; font-weight: bold; color: #0056b3; margin-top: 20px;">¡Gracias por seguir eligiendo Aunar! &#129309;</p>
    <p style="background-color: #e9ecef; padding: 10px; border-radius: 5px; text-align: center; margin-top: 15px;">
      <strong>&#128161; ¿Sabías que también tenemos internet y TV para tu hogar?</strong><br>
      Consultá por tu zona y te cotizamos en el instante. Resolvé tu conectividad en un solo lugar.
    </p>
  </div>

  <!-- Footer -->
  <div style="font-size: 11px; text-align: center; color: #888; margin-top: 30px; line-height: 1.4;">
    <p style="margin-bottom: 8px;">
      <a href="https://twitter.com/aunar" target="_blank" style="color: #0056b3; text-decoration: none;">Twitter</a> |
      <a href="https://facebook.com/aunar" target="_blank" style="color: #0056b3; text-decoration: none;">Facebook</a> |
      <a href="https://aunar.com.ar" target="_blank" style="color: #0056b3; text-decoration: none;">Website</a>
    </p>
    <p style="margin: 0 0 4px 0;">Copyright &copy; 2026 AUNAR MUTUAL. Todos los derechos reservados.</p>
    <p style="margin: 0 0 4px 0;">AUNAR MUTUAL · 46 Diag. 76 · La Plata, Buenos Aires · Argentina</p>
    <p style="margin-top: 15px;">Recibís este correo porque sos asociado activo de Mutual Aunar.<br>Si deseás modificar tus preferencias de contacto, por favor respondé este correo.</p>
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
    { label: 'Vencimiento', value: '{{vencimiento}}' },
    { label: 'Detalle Líneas (Tabla)', value: '{{detalle_lineas_html}}' },
    { label: 'Detalle Líneas (Asunto)', value: '{{detalle_lineas_asunto}}' }
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
    statusBadge: (status) => {
      let bg = 'rgba(100,116,139,0.1)';
      let color = 'var(--text-secondary)';
      let border = 'rgba(100,116,139,0.15)';
      if (status === 'exito') {
        bg = 'rgba(16,185,129,0.1)';
        color = '#059669';
        border = 'rgba(16,185,129,0.25)';
      } else if (status === 'abierto') {
        bg = 'rgba(147,51,234,0.1)';
        color = '#7e22ce';
        border = 'rgba(147,51,234,0.25)';
      } else if (status === 'click') {
        bg = 'rgba(2,132,199,0.1)';
        color = '#0284c7';
        border = 'rgba(2,132,199,0.25)';
      } else if (status === 'rebotado' || status === 'error') {
        bg = 'rgba(239,68,68,0.1)';
        color = '#dc2626';
        border = 'rgba(239,68,68,0.25)';
      }
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '10.5px',
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: '100px',
        background: bg,
        color: color,
        border: `1px solid ${border}`,
      };
    }
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={S.title}>Campañas de Correo</h2>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  background: (300 - enviosHoy) > 50 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.12)',
                  border: `1px solid ${(300 - enviosHoy) > 50 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.3)'}`,
                  fontSize: '11px',
                  fontWeight: 700,
                  color: (300 - enviosHoy) > 50 ? '#059669' : '#d97706'
                }} title={`Envíos registrados hoy: ${enviosHoy}. Límite gratuito de Brevo: 300 correos por día (se reinicia a las 00:00 UTC).`}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: (300 - enviosHoy) > 50 ? '#10b981' : '#f59e0b', display: 'inline-block' }} />
                  <span>Brevo hoy: <strong>{Math.max(0, 300 - enviosHoy)} disponibles</strong> de 300</span>
                </div>
              </div>
              <p style={S.subtitle}>Envío masivo y personalizado de notificaciones</p>
            </div>
          </div>

          {/* Center: Interactive Wizard */}
          <div style={S.wizardBar}>
            <button 
              type="button"
              style={{ ...S.wizardStep(currentStep === 1 && (!activeCampaign || activeCampaign.isMinimized)), cursor: 'pointer' }}
              onClick={() => {
                if (activeCampaign) setActiveCampaign(prev => ({ ...prev, isMinimized: true }));
                setCurrentStep(1);
              }}
            >
              <div style={S.wizardCircle(currentStep === 1 && (!activeCampaign || activeCampaign.isMinimized))}>1</div>
              <span>Destinatarios</span>
            </button>
            <div style={S.wizardLine} />
            <button 
              type="button"
              style={{ 
                ...S.wizardStep(currentStep === 2 && (!activeCampaign || activeCampaign.isMinimized)), 
                cursor: totalSelected > 0 ? 'pointer' : 'not-allowed' 
              }}
              disabled={totalSelected === 0}
              onClick={() => {
                if (activeCampaign) setActiveCampaign(prev => ({ ...prev, isMinimized: true }));
                if (totalSelected > 0) setCurrentStep(2);
              }}
            >
              <div style={S.wizardCircle(currentStep === 2 && (!activeCampaign || activeCampaign.isMinimized))}>2</div>
              <span>Mensaje</span>
            </button>
            <div style={S.wizardLine} />
            <button 
              type="button"
              style={{ ...S.wizardStep(currentStep === 3 && (!activeCampaign || activeCampaign.isMinimized)), cursor: 'pointer' }}
              onClick={() => {
                if (activeCampaign) setActiveCampaign(prev => ({ ...prev, isMinimized: true }));
                setCurrentStep(3);
              }}
            >
              <div style={S.wizardCircle(currentStep === 3 && (!activeCampaign || activeCampaign.isMinimized))}>3</div>
              <span>Historial</span>
            </button>

            {/* Tab interactivo de campaña en vivo */}
            {activeCampaign && (
              <>
                <div style={S.wizardLine} />
                <button 
                  type="button"
                  style={{ 
                    ...S.wizardStep(!activeCampaign.isMinimized), 
                    cursor: 'pointer',
                    background: !activeCampaign.isMinimized ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                    borderColor: 'rgba(16, 185, 129, 0.4)'
                  }}
                  onClick={() => setActiveCampaign(prev => ({ ...prev, isMinimized: false }))}
                >
                  <div style={{
                    ...S.wizardCircle(!activeCampaign.isMinimized),
                    background: !activeCampaign.isFinished ? '#059669' : '#10b981',
                    color: '#fff',
                    borderColor: '#059669'
                  }}>
                    {!activeCampaign.isFinished ? (
                      <Loader2 className="animate-spin" size={13} />
                    ) : (
                      <Check size={13} />
                    )}
                  </div>
                  <span style={{ color: '#047857', fontWeight: 800 }}>
                    {!activeCampaign.isFinished 
                      ? `En Vivo (${activeCampaign.sentCount}/${activeCampaign.total})` 
                      : 'Completada'}
                  </span>
                </button>
              </>
            )}
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

      {/* ═══════════════════ PANTALLA DE PROGRESO DE CAMPAÑA EN VIVO ═══════════════════ */}
      {activeCampaign && !activeCampaign.isMinimized ? (
        <div style={S.card}>
          {/* Encabezado con estado y acciones */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                {!activeCampaign.isFinished ? (
                  <span style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#047857',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} className="animate-ping" />
                    Despachando en vivo con n8n
                  </span>
                ) : (
                  <span style={{
                    background: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #a7f3d0',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <CheckCircle size={14} color="#059669" />
                    Campaña finalizada
                  </span>
                )}
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Iniciada: {new Date(activeCampaign.startTime).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {activeCampaign.name}
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                Asunto: <strong>{activeCampaign.subject}</strong> • Despacho: <strong>Brevo API (Alta Velocidad)</strong>
              </p>
            </div>

            {/* Acciones de la barra superior */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveCampaign(prev => ({ ...prev, isMinimized: true }))}
                style={{ ...S.btnSecondary, padding: '8px 16px', fontSize: '13px' }}
              >
                <Minimize2 size={15} /> Minimizar
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveCampaign(prev => ({ ...prev, isMinimized: true }));
                  setCurrentStep(3);
                  fetchLogs();
                }}
                style={{ ...S.btnSecondary, padding: '8px 16px', fontSize: '13px' }}
              >
                <FileText size={15} /> Ver en Historial
              </button>
              {activeCampaign.isFinished && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveCampaign(null);
                    setCurrentStep(1);
                    setCampaignType(null);
                  }}
                  style={{ ...S.btnPrimary, padding: '8px 18px', fontSize: '13px' }}
                >
                  <PlusCircle size={15} /> Nueva Campaña
                </button>
              )}
            </div>
          </div>

          {/* Grilla de métricas clave */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.6)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>Progreso de Campaña</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>
                {Math.round((activeCampaign.sentCount / (activeCampaign.total || 1)) * 100)}%
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {activeCampaign.sentCount} de {activeCampaign.total} correos procesados
              </div>
            </div>

            <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.6)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>Tiempo Estimado Restante</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: activeCampaign.isFinished ? '#059669' : '#0284c7' }}>
                {activeCampaign.isFinished ? 'Completado' : calculateRemainingTime(activeCampaign.total, activeCampaign.sentCount)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {activeCampaign.isFinished ? 'Todos los correos despachados' : 'Despacho rápido vía Brevo API'}
              </div>
            </div>

            <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#047857', marginBottom: '4px' }}>Enviados con Éxito</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#059669' }}>
                {activeCampaign.successCount}
              </div>
              <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                Entregados vía Brevo API
              </div>
            </div>

            <div style={{ padding: '16px', borderRadius: '16px', background: activeCampaign.errorCount > 0 ? 'rgba(239, 68, 68, 0.06)' : 'rgba(255,255,255,0.6)', border: `1px solid ${activeCampaign.errorCount > 0 ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-light)'}` }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: activeCampaign.errorCount > 0 ? '#b91c1c' : 'var(--text-secondary)', marginBottom: '4px' }}>Rebotados / Con Error</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: activeCampaign.errorCount > 0 ? '#dc2626' : 'var(--text-primary)' }}>
                {activeCampaign.errorCount}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {activeCampaign.errorCount > 0 ? 'Revisar detalle en el feed' : 'Sin errores reportados'}
              </div>
            </div>
          </div>

          {/* Barra de progreso */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {!activeCampaign.isFinished ? 'Despachando lote en segundo plano con n8n...' : 'Lote completado al 100%'}
              </span>
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {Math.round((activeCampaign.sentCount / (activeCampaign.total || 1)) * 100)}%
              </span>
            </div>
            <div style={{ height: '12px', background: 'rgba(0,0,0,0.06)', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (activeCampaign.sentCount / (activeCampaign.total || 1)) * 100)}%`,
                background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                borderRadius: '6px',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>

          {/* Feed en vivo: Movimiento por movimiento */}
          <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '16px', border: '1px solid var(--border-light)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="var(--accent)" />
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Avance de Envíos en Vivo (Movimiento por movimiento)
                </h4>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {activeCampaign.logs.length} movimientos
              </span>
            </div>

            {activeCampaign.logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-secondary)' }}>
                <Loader2 className="animate-spin" size={28} style={{ margin: '0 auto 12px auto', color: 'var(--accent)' }} />
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Despachando campaña con n8n...
                </div>
                <p style={{ margin: 0, fontSize: '12.5px' }}>
                  El flujo está procesando los destinatarios vía Brevo API.
                </p>
              </div>
            ) : (
              <div 
                style={{ 
                  maxHeight: '340px', 
                  overflowY: 'auto', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '8px', 
                  paddingRight: '6px' 
                }}
                className="premium-scrollbar"
              >
                {activeCampaign.logs.map((log, idx) => (
                  <div
                    key={log.id || `log-${idx}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      background: log.estado === 'exito' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                      border: `1px solid ${log.estado === 'exito' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      {log.estado === 'exito' ? (
                        <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0 }} />
                      ) : (
                        <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.destinatario_nombre || 'Destinatario'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.destinatario_email} {log.asunto ? `• ${log.asunto}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, textAlign: 'right' }}>
                      <div>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: log.estado === 'exito' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: log.estado === 'exito' ? '#047857' : '#b91c1c'
                        }}>
                          {log.estado === 'exito' ? 'Enviado' : 'Error'}
                        </span>
                        {log.error_mensaje && (
                          <div style={{ fontSize: '10.5px', color: '#b91c1c', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }} title={log.error_mensaje}>
                            {log.error_mensaje}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '55px' }}>
                        {new Date(log.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Banner informativo */}
          <div style={{ marginTop: '20px', padding: '12px 16px', borderRadius: '12px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              💡 Podés minimizar esta pantalla o cambiar de pestaña. El proceso continúa ejecutándose de forma autónoma en el servidor de n8n.
            </span>
            {!activeCampaign.isFinished ? (
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={13} /> Despacho activo
              </span>
            ) : (
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Check size={13} /> Proceso concluido
              </span>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ═══════════════════ STEP 1: RECIPIENTS / BOT SYNC ═══════════════════ */}
          {currentStep === 1 && (
        <div style={S.card}>
          {/* Selector de tipo de campaña */}
          {!campaignType ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '22px', padding: '16px' }}>
              {/* Opción 1: Campaña de mail desde Excel */}
              <div
                onClick={() => { setCampaignType('excel'); }}
                style={{ 
                  ...S.uploadZone, 
                  cursor: 'pointer', 
                  flexDirection: 'column', 
                  padding: '32px 24px',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.16) 100%)',
                  borderColor: 'rgba(16, 185, 129, 0.5)',
                  position: 'relative',
                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.08)'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: '#059669',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 900,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  letterSpacing: '0.5px'
                }}>
                  RECOMENDADO
                </div>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <FileSpreadsheet size={30} />
                </div>
                <h3 style={{ margin: '8px 0 6px 0', color: 'var(--text-primary)', fontSize: '16px', fontWeight: 800 }}>
                  Campaña de mail desde Excel
                </h3>
                <p style={{ textAlign: 'center', fontSize: '13px', margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Facturación oficial directa desde el Excel mensual con líneas, grupos y montos exactos de cobro.
                </p>
              </div>

              {/* Opción 2: Campaña de mail personalizada */}
              <div
                onClick={() => { 
                  setCampaignType('personalizada'); 
                  setPersonalizadaMode('grupal');
                  fetchGrupos(); 
                }}
                style={{ 
                  ...S.uploadZone, 
                  cursor: 'pointer', 
                  flexDirection: 'column', 
                  padding: '32px 24px',
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.06) 0%, rgba(37, 99, 235, 0.12) 100%)',
                  borderColor: 'rgba(59, 130, 246, 0.4)',
                  position: 'relative',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.06)'
                }}
              >
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(59, 130, 246, 0.15)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <Mail size={30} />
                </div>
                <h3 style={{ margin: '8px 0 6px 0', color: 'var(--text-primary)', fontSize: '16px', fontWeight: 800 }}>
                  Campaña de mail personalizada
                </h3>
                <p style={{ textAlign: 'center', fontSize: '13px', margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Envío a medida desde la base del sistema con opciones para filtrar por <strong>Grupos</strong> o por <strong>Líneas individuales</strong>.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8' }}>
                    # Por Grupos
                  </span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', color: '#047857' }}>
                    📞 Por Líneas
                  </span>
                </div>
              </div>

              {/* Opción 3: Bot WhatsApp */}
              <div
                onClick={() => { setCampaignType('bot_wsp'); setBotResult(null); }}
                style={{ 
                  ...S.uploadZone, 
                  cursor: 'pointer', 
                  flexDirection: 'column', 
                  padding: '32px 24px',
                  background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.08) 0%, rgba(18, 140, 126, 0.14) 100%)',
                  borderColor: 'rgba(37, 211, 102, 0.45)',
                  boxShadow: '0 4px 14px rgba(37, 211, 102, 0.06)'
                }}
              >
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(37, 211, 102, 0.15)', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <MessageSquare size={30} />
                </div>
                <h3 style={{ margin: '8px 0 6px 0', color: 'var(--text-primary)', fontSize: '16px', fontWeight: 800 }}>
                  Bot WhatsApp
                </h3>
                <p style={{ textAlign: 'center', fontSize: '13px', margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Actualizar facturación y respuestas automáticas de WhatsApp desde el archivo Excel mensual.
                </p>
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
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: botResult?.published ? '#25D366' : '#f59e0b' }} />
                  <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageSquare size={18} style={{ color: '#25D366' }} /> Bot de WhatsApp – Facturación & Consultas
                  </span>
                </div>
              </div>

              {/* Contenedor Principal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* ─── Carga y Previsualización Inicial ─── */}
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
                        placeholder="ej: 12/09/2026"
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
                      onClick={(e) => { e.stopPropagation(); handleSyncBotBilling('preview'); }}
                      disabled={!botFile || uploadingBot}
                      style={{
                        ...S.btnPrimary,
                        padding: '8px 20px',
                        fontSize: '13px',
                        borderRadius: '10px',
                        background: !botFile ? 'rgba(0,0,0,0.1)' : 'linear-gradient(135deg, #0288d1 0%, #01579b 100%)',
                        color: '#ffffff',
                        boxShadow: !botFile ? 'none' : '0 4px 12px rgba(2, 136, 209, 0.3)',
                        opacity: !botFile || uploadingBot ? 0.6 : 1,
                        cursor: !botFile || uploadingBot ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {uploadingBot ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Analizando Excel...</span>
                        </>
                      ) : (
                        <>
                          <Search size={15} />
                          <span>{botResult ? 'Re-analizar Excel' : 'Analizar y Previsualizar'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* ─── PANTALLA INFORMATIVA CON RESULTADOS ─── */}
                {botResult && botResult.ok && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* ─── BANNER DE ESTADO (BORRADOR vs PUBLICADO) ─── */}
                    {!botResult.published ? (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.12) 100%)',
                        border: '1.5px solid rgba(245, 158, 11, 0.35)',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '14px',
                        boxShadow: '0 4px 14px rgba(245, 158, 11, 0.08)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Eye size={22} />
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', fontWeight: 900, background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.4px' }}>
                                VISTA PREVIA (BORRADOR)
                              </span>
                              <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                Facturación analizada y lista para revisión
                              </span>
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                              Los datos de abajo han sido calculados para su control. <strong>Aún NO se han publicado en el bot de WhatsApp</strong>. Verificá el vencimiento y confirmá para impactar en producción.
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (!customVencimiento.trim()) {
                              addToast('Por favor, ingresá la fecha de vencimiento abajo antes de confirmar la publicación.', 'warning');
                              return;
                            }
                            setIsConfirmPublishModalOpen(true);
                          }}
                          disabled={publishingBot}
                          style={{
                            ...S.btnPrimary,
                            padding: '12px 24px',
                            fontSize: '13.5px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                            color: '#ffffff',
                            fontWeight: 800,
                            boxShadow: '0 6px 20px rgba(37, 211, 102, 0.4)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          {publishingBot ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Publicando...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={16} />
                              <span>Confirmar y Publicar en Bot de WhatsApp</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.08) 0%, rgba(18, 140, 126, 0.14) 100%)',
                        border: '1.5px solid rgba(37, 211, 102, 0.35)',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '14px',
                        boxShadow: '0 4px 14px rgba(37, 211, 102, 0.1)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <CheckCircle size={22} />
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 900, background: '#25D366', color: '#fff', padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.4px' }}>
                                PUBLICADO EN VIVO
                              </span>
                              <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                ¡Facturación activa y operativa en WhatsApp!
                              </span>
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                              Las {botResult.lineas_procesadas} líneas y {botResult.grupos_actualizados} grupos están respondiendo en vivo a los socios con vencimiento <strong>{botResult.vencimiento}</strong>.
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setIsConfirmPublishModalOpen(true)}
                            style={{ ...S.btnSecondary, fontSize: '12px', padding: '8px 16px', borderRadius: '10px' }}
                          >
                            Republicar con Cambios
                          </button>
                        </div>
                      </div>
                    )}

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
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>Vencimiento</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: customVencimiento || botResult.vencimiento ? 'var(--text-primary)' : 'var(--danger)', marginTop: '6px' }}>
                          {customVencimiento || botResult.vencimiento || 'Sin Vencimiento'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {customVencimiento || botResult.vencimiento ? (botResult.published ? 'Activo en producción' : 'Pendiente de confirmación') : 'Completalo abajo y aplicá'}
                        </div>
                      </div>
                    </div>

                    {/* Barra de Ajuste Rápido de Vencimiento */}
                    <div style={{
                      background: 'rgba(255,255,255,0.6)',
                      border: '1px solid var(--border-light)',
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
                            Fecha de Vencimiento de Facturación
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            Ingresá o cambiá la fecha para recalcular la vista previa antes de publicar.
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="text"
                          value={customVencimiento}
                          onChange={(e) => setCustomVencimiento(e.target.value)}
                          placeholder="ej: 12/09/2026"
                          style={{ ...S.input, width: '140px', padding: '7px 12px', fontSize: '13px', fontWeight: 700 }}
                        />
                        <button
                          type="button"
                          onClick={() => handleApplyVencimiento()}
                          disabled={applyingVto || !customVencimiento.trim()}
                          style={{
                            ...S.btnSecondary,
                            padding: '7px 16px',
                            fontSize: '12.5px',
                            borderRadius: '10px'
                          }}
                        >
                          {applyingVto ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          <span>Actualizar Fecha</span>
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

                {/* Modal de Confirmación de Publicación en Producción */}
                {isConfirmPublishModalOpen && (
                  <Modal
                    isOpen={isConfirmPublishModalOpen}
                    onClose={() => { if (!publishingBot) setIsConfirmPublishModalOpen(false); }}
                    title="Confirmar Publicación en el Bot de WhatsApp"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
                      <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        ¿Estás seguro de que deseas publicar y activar esta facturación en el <strong>Bot de WhatsApp en producción</strong>?
                      </p>

                      <div style={{
                        background: 'rgba(0,0,0,0.03)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '12px',
                        padding: '14px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '12px',
                        fontSize: '13px'
                      }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Líneas a Actualizar:</span>
                          <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)', marginTop: '2px' }}>{botResult?.lineas_procesadas || 0}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Grupos Consolidados:</span>
                          <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)', marginTop: '2px' }}>{botResult?.grupos_actualizados || 0}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Empresas Detectadas:</span>
                          <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)', marginTop: '2px' }}>{botResult?.empresas?.join(', ') || 'Todas'}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Fecha de Vencimiento:</span>
                          <div style={{ fontWeight: 900, fontSize: '14px', color: '#16a34a', marginTop: '2px' }}>{customVencimiento || 'Sin Vencimiento'}</div>
                        </div>
                      </div>

                      <div style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        fontSize: '12px',
                        color: 'var(--danger)',
                        lineHeight: 1.4
                      }}>
                        ⚠️ <strong>Atención:</strong> Esta acción reemplazará inmediatamente el archivo <code style={{ fontWeight: 700 }}>respuestas.json</code> en el servidor. A partir de este momento, todos los socios que consulten por WhatsApp recibirán estos datos con la fecha de vencimiento configurada.
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                        <button
                          type="button"
                          onClick={() => setIsConfirmPublishModalOpen(false)}
                          style={S.btnSecondary}
                          disabled={publishingBot}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSyncBotBilling('publish', customVencimiento)}
                          disabled={publishingBot}
                          style={{
                            ...S.btnPrimary,
                            background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                            color: '#fff',
                            fontWeight: 800,
                            padding: '10px 20px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          {publishingBot ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Publicando en Producción...</span>
                            </>
                          ) : (
                            <>
                              <Check size={16} />
                              <span>Sí, Publicar en Vivo</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </Modal>
                )}

              </div>
            </div>
          ) : (
            <>
              {/* Barra de controles y volver a elegir tipo */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button onClick={() => { setCampaignType(null); setItems([]); setSelectedIds(new Set()); }} style={S.btnSecondary}>
                  <ArrowLeft size={16} /> Volver a opciones
                </button>
                <span style={{ fontWeight: 700 }}>
                  {campaignType === 'excel' && 'Campaña desde Excel – Facturación Oficial (TODOS)'}
                  {campaignType === 'personalizada' && `Campaña Personalizada – ${personalizadaMode === 'grupal' ? 'Por Grupos' : (personalizadaMode === 'lineas' ? 'Por Líneas Individuales' : 'Base de Socios')}`}
                  {campaignType === 'nueva' && 'Campaña General – Socios'}
                  {campaignType === 'grupal' && 'Campaña Grupal – Representantes de grupo'}
                  {campaignType === 'lineas' && 'Campaña por Líneas – Líneas individuales'}
                </span>
              </div>

              {/* Sub-selector de modalidad para Campaña Personalizada */}
              {campaignType === 'personalizada' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  padding: '12px 18px',
                  background: 'rgba(255,255,255,0.7)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '16px',
                  marginBottom: '20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Destinatarios:
                    </span>
                    <div style={{ display: 'inline-flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (personalizadaMode !== 'grupal') {
                            setPersonalizadaMode('grupal');
                            setItems([]);
                            setSelectedIds(new Set());
                            fetchGrupos();
                          }
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 16px',
                          borderRadius: '9px',
                          border: 'none',
                          fontSize: '13px',
                          fontWeight: personalizadaMode === 'grupal' ? 800 : 500,
                          background: personalizadaMode === 'grupal' ? '#fff' : 'transparent',
                          color: personalizadaMode === 'grupal' ? '#0369a1' : '#64748b',
                          boxShadow: personalizadaMode === 'grupal' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Hash size={15} color={personalizadaMode === 'grupal' ? '#0284c7' : 'currentColor'} />
                        Por Grupos
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (personalizadaMode !== 'lineas') {
                            setPersonalizadaMode('lineas');
                            setItems([]);
                            setSelectedIds(new Set());
                            fetchLineas();
                          }
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 16px',
                          borderRadius: '9px',
                          border: 'none',
                          fontSize: '13px',
                          fontWeight: personalizadaMode === 'lineas' ? 800 : 500,
                          background: personalizadaMode === 'lineas' ? '#fff' : 'transparent',
                          color: personalizadaMode === 'lineas' ? '#047857' : '#64748b',
                          boxShadow: personalizadaMode === 'lineas' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Phone size={15} color={personalizadaMode === 'lineas' ? '#10b981' : 'currentColor'} />
                        Por Líneas Individuales
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (personalizadaMode !== 'nueva') {
                            setPersonalizadaMode('nueva');
                            setItems([]);
                            setSelectedIds(new Set());
                            fetchSocios();
                          }
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 16px',
                          borderRadius: '9px',
                          border: 'none',
                          fontSize: '13px',
                          fontWeight: personalizadaMode === 'nueva' ? 800 : 500,
                          background: personalizadaMode === 'nueva' ? '#fff' : 'transparent',
                          color: personalizadaMode === 'nueva' ? '#7c3aed' : '#64748b',
                          boxShadow: personalizadaMode === 'nueva' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Users size={15} color={personalizadaMode === 'nueva' ? '#8b5cf6' : 'currentColor'} />
                        Base de Socios
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {personalizadaMode === 'grupal' && 'Solo emails asignados a cabezas o representantes de cada grupo comercial'}
                    {personalizadaMode === 'lineas' && 'Emails asignados directamente a cada línea de celular individual'}
                    {personalizadaMode === 'nueva' && 'Todos los socios registrados con filtros por forma de pago y deuda'}
                  </div>
                </div>
              )}

              {/* Controles para Campaña desde Excel */}
              {campaignType === 'excel' && (
                <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {!excelFile ? (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsExcelDragOver(true); }}
                      onDragLeave={() => setIsExcelDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsExcelDragOver(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleExcelFileSelect(file);
                      }}
                      onClick={() => document.getElementById('excel-campaign-file-input')?.click()}
                      style={{
                        border: `2px dashed ${isExcelDragOver ? '#059669' : 'var(--border-light)'}`,
                        borderRadius: '16px',
                        padding: '36px 20px',
                        textAlign: 'center',
                        background: isExcelDragOver ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.4)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px'
                      }}
                    >
                      <input
                        id="excel-campaign-file-input"
                        type="file"
                        accept=".xlsx, .xls"
                        style={{ display: 'none' }}
                        onChange={(e) => handleExcelFileSelect(e.target.files?.[0])}
                      />
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.12)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <UploadCloud size={28} />
                      </div>
                      <div>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          Cargá tu planilla mensual de cobros (.xlsx / .xls)
                        </h4>
                        <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                          Arrastrá aquí <strong>"TODOS (08-2026) COBROS PERSONAL, MOVISTAR Y CLARO.xlsx"</strong> o hacé clic para buscarla.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                        background: 'rgba(16, 185, 129, 0.06)',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                        padding: '12px 18px',
                        borderRadius: '14px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <FileSpreadsheet size={22} style={{ color: '#059669' }} />
                          <div>
                            <span style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text-primary)' }}>{excelFile.name}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>({(excelFile.size / 1024).toFixed(1)} KB)</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Período:</span>
                            <input
                              type="text"
                              value={excelPeriodo}
                              onChange={(e) => setExcelPeriodo(e.target.value)}
                              placeholder="08-2026"
                              style={{ ...S.input, width: '100px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, textAlign: 'center' }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => { setExcelFile(null); setExcelRawRows([]); setItems([]); setSelectedIds(new Set()); }}
                            style={{ ...S.btnSecondary, padding: '5px 12px', fontSize: '11.5px', color: 'var(--danger)' }}
                          >
                            <X size={13} /> Cambiar Archivo
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '12px 16px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Líneas en Planilla</div>
                          <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>{excelStats.totalLineas}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '12px 16px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Destinatarios a Enviar</div>
                          <div style={{ fontSize: '20px', fontWeight: 900, color: '#059669', marginTop: '2px' }}>{items.length}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '12px 16px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Total Facturado</div>
                          <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
                            $ {excelStats.totalFacturado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '12px 16px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Distribución</div>
                          <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '6px' }}>
                            Claro ({excelStats.empresas['CLARO'] || 0}) · Personal ({excelStats.empresas['PERSONAL'] || 0}) · Movistar ({excelStats.empresas['MOVISTAR'] || 0})
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'inline-flex', background: 'rgba(0,0,0,0.05)', padding: '3px', borderRadius: '10px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setExcelMode('lineas_email');
                              applyExcelRows(excelRawRows, 'lineas_email', excelEmpresa, excelSearch, excelPeriodo);
                            }}
                            style={{
                              border: 'none',
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              background: excelMode === 'lineas_email' ? '#059669' : 'transparent',
                              color: excelMode === 'lineas_email' ? '#ffffff' : 'var(--text-primary)',
                              transition: 'all 0.2s'
                            }}
                          >
                            Consolidado por Email (Líneas)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExcelMode('grupo_email');
                              applyExcelRows(excelRawRows, 'grupo_email', excelEmpresa, excelSearch, excelPeriodo);
                            }}
                            style={{
                              border: 'none',
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              background: excelMode === 'grupo_email' ? '#059669' : 'transparent',
                              color: excelMode === 'grupo_email' ? '#ffffff' : 'var(--text-primary)',
                              transition: 'all 0.2s'
                            }}
                          >
                            Por Grupo (Representantes)
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          {['ALL', 'CLARO', 'PERSONAL', 'MOVISTAR'].map(emp => (
                            <button
                              key={emp}
                              type="button"
                              onClick={() => {
                                setExcelEmpresa(emp);
                                applyExcelRows(excelRawRows, excelMode, emp, excelSearch, excelPeriodo);
                              }}
                              style={{
                                border: '1px solid var(--border-light)',
                                padding: '5px 12px',
                                borderRadius: '8px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: excelEmpresa === emp ? '#1e293b' : 'rgba(255,255,255,0.7)',
                                color: excelEmpresa === emp ? '#ffffff' : 'var(--text-primary)'
                              }}
                            >
                              {emp === 'ALL' ? 'Todas' : emp}
                            </button>
                          ))}
                        </div>

                        <div style={{ position: 'relative', minWidth: '240px', flex: 1, maxWidth: '360px' }}>
                          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                          <input
                            type="text"
                            value={excelSearch}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExcelSearch(val);
                              applyExcelRows(excelRawRows, excelMode, excelEmpresa, val, excelPeriodo);
                            }}
                            placeholder="Buscar por socio, línea, grupo o email..."
                            style={{ ...S.input, paddingLeft: '36px', paddingRight: excelSearch ? '30px' : '10px', fontSize: '12px' }}
                          />
                          {excelSearch && (
                            <button
                              type="button"
                              onClick={() => {
                                setExcelSearch('');
                                applyExcelRows(excelRawRows, excelMode, excelEmpresa, '', excelPeriodo);
                              }}
                              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Filtros según el tipo */}
              {effectiveCampaignType === 'nueva' && (
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

              {effectiveCampaignType === 'grupal' && (
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

              {effectiveCampaignType === 'lineas' && (
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

                  {/* Filtro por estado de notificación del mes */}
                  <div style={{ display: 'inline-flex', background: 'rgba(0,0,0,0.04)', padding: '3px', borderRadius: '10px', gap: '2px', border: '1px solid var(--border-light)' }}>
                    <button
                      type="button"
                      onClick={() => setFilterNotificado('ALL')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '7px',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: filterNotificado === 'ALL' ? '#fff' : 'transparent',
                        color: filterNotificado === 'ALL' ? 'var(--text-primary)' : 'var(--text-secondary)',
                        boxShadow: filterNotificado === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                      }}
                    >
                      Todos ({items.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterNotificado('PENDIENTE')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '7px',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: filterNotificado === 'PENDIENTE' ? '#fff' : 'transparent',
                        color: filterNotificado === 'PENDIENTE' ? '#d97706' : 'var(--text-secondary)',
                        boxShadow: filterNotificado === 'PENDIENTE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                      }}
                    >
                      ⏳ Pendientes ({countPendientes})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterNotificado('NOTIFICADO')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '7px',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: filterNotificado === 'NOTIFICADO' ? '#fff' : 'transparent',
                        color: filterNotificado === 'NOTIFICADO' ? '#059669' : 'var(--text-secondary)',
                        boxShadow: filterNotificado === 'NOTIFICADO' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                      }}
                    >
                      ✅ Notificados ({countNotificados})
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {countPendientes > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const pendientes = items.filter(i => !i.notificado);
                        setSelectedIds(new Set(pendientes.map(i => i.id)));
                      }}
                      style={{
                        ...S.btnSecondary,
                        padding: '6px 12px',
                        fontSize: '12px',
                        color: '#d97706',
                        borderColor: 'rgba(245, 158, 11, 0.4)',
                        background: 'rgba(245, 158, 11, 0.08)',
                        fontWeight: 700
                      }}
                      title="Selecciona automáticamente todos los grupos o socios pendientes de notificación"
                    >
                      ⚡ Seleccionar pendientes ({countPendientes})
                    </button>
                  )}
                  <button onClick={toggleSelectAll} style={{ ...S.btnSecondary, padding: '6px 14px', fontSize: '12px' }}>
                    {selectedIds.size === displayedItems.length && displayedItems.length > 0 ? 'Deseleccionar todos' : 'Seleccionar mostrados'}
                  </button>
                  {totalSelected > 0 && (
                    <button onClick={clearSelection} style={{ ...S.btnSecondary, padding: '6px 14px', fontSize: '12px' }}><X size={12} /> Limpiar</button>
                  )}
                </div>
              </div>

              <div style={S.tableWrapper}>
                {loading ? (
                  <div style={S.emptyState}><Loader2 className="animate-spin" size={32} /></div>
                ) : displayedItems.length === 0 ? (
                  <div style={S.emptyState}>
                    <AlertCircle size={40} style={{ marginBottom: '12px' }} />
                    <h4>Sin resultados</h4>
                    <p style={{ fontSize: '12px', margin: '4px 0 0' }}>No hay destinatarios que coincidan con los filtros aplicados.</p>
                  </div>
                ) : (
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, width: '48px', textAlign: 'center' }}></th>
                        <th style={S.th}>Nombre / Detalle</th>
                        <th style={S.th}>Email</th>
                        {effectiveCampaignType === 'nueva' && <th style={{ ...S.th, textAlign: 'center', width: '80px' }}>Pago</th>}
                        <th style={{ ...S.th, textAlign: 'center', width: '80px' }}>
                          {effectiveCampaignType === 'grupal' || campaignType === 'excel' ? 'Grupo' : 'Línea'}
                        </th>
                        {campaignType === 'excel' && <th style={{ ...S.th, textAlign: 'center' }}>Líneas</th>}
                        <th style={{ ...S.th, textAlign: 'right', width: campaignType === 'excel' ? '120px' : '80px' }}>
                          {campaignType === 'excel' ? 'Total Facturado' : (effectiveCampaignType === 'nueva' ? 'Cuotas' : 'Monto')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedItems.map(item => {
                        const sel = selectedIds.has(item.id);
                        return (
                          <tr key={item.id} onClick={() => toggleItem(item.id)} style={{ cursor: 'pointer', background: sel ? 'rgba(46,125,50,0.06)' : 'transparent' }}>
                            <td style={{ ...S.td, textAlign: 'center' }}>
                              {sel ? <CheckSquare size={18} style={{ color: 'var(--accent)' }} /> : <Square size={18} />}
                            </td>
                            <td style={S.td}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700 }}>{item.display_detalle || item.nombre}</span>
                                {item.notificado ? (
                                  <span style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: 'rgba(16, 185, 129, 0.12)',
                                    color: '#059669',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }} title={item.ultimo_envio ? `Enviado el ${new Date(item.ultimo_envio).toLocaleString('es-AR')}` : 'Notificado este mes'}>
                                    <Check size={11} /> Notificado
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: '12px',
                                    background: 'rgba(245, 158, 11, 0.08)',
                                    color: '#d97706',
                                    border: '1px solid rgba(245, 158, 11, 0.25)',
                                  }}>
                                    Pendiente
                                  </span>
                                )}
                              </div>
                              {item.dni && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>DNI: {item.dni}</div>}
                              {campaignType === 'excel' && item.cbu && <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>CBU: {item.cbu}</div>}
                            </td>
                            <td style={S.td}>{item.email}</td>
                            {effectiveCampaignType === 'nueva' && (
                              <td style={{ ...S.td, textAlign: 'center' }}>
                                <span style={S.fpagoBadge(item.fpago)}>{item.fpago === 'D' ? 'CBU' : 'Efectivo'}</span>
                              </td>
                            )}
                            <td style={{ ...S.td, textAlign: 'center' }}>
                              {effectiveCampaignType === 'grupal' || campaignType === 'excel' ? `#${item.grupo}` : item.lineas}
                            </td>
                            {campaignType === 'excel' && (
                              <td style={{ ...S.td, textAlign: 'center', fontSize: '11.5px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{item.lineas}</span>
                              </td>
                            )}
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: campaignType === 'excel' ? 800 : 500, color: campaignType === 'excel' ? '#059669' : (item.total_cuotas > 0 ? 'var(--danger)' : 'var(--accent)') }}>
                              {campaignType === 'excel' 
                                ? `$ ${Number(item.monto_adeudado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                                : (effectiveCampaignType === 'nueva' ? item.total_cuotas || 0 : `$ ${item.monto_adeudado || 0}`)
                              }
                            </td>
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
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Plantilla:</span>
                <select 
                  value={selectedTemplateKey}
                  onChange={(e) => handleLoadTemplate(e.target.value)} 
                  style={{ ...S.input, minWidth: '240px', padding: '6px 12px', background: 'rgba(255,255,255,0.85)', fontWeight: 500 }}
                >
                  <optgroup label="🏛️ Plantillas Oficiales AUNAR">
                    <option value="aunar">Oficial Completa (Factura + FAQ + Banner)</option>
                    <option value="aunar_base">Chasis Base AUNAR (Logo + Factura + Texto Libre)</option>
                    <option value="deuda">Aviso de Deuda / Cobro de Cuota</option>
                    <option value="bienvenida">Bienvenida Nuevos Socios</option>
                    <option value="aumento">Notificación de Aumento / Ajuste</option>
                  </optgroup>
                  {customTemplates.length > 0 && (
                    <optgroup label="⭐ Mis Plantillas Personalizadas">
                      {customTemplates.map(ct => (
                        <option key={ct.id} value={`custom_${ct.id}`}>
                          {ct.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Opciones">
                    <option value="vacia">Limpiar Mensaje (Vacío)</option>
                  </optgroup>
                </select>

                {/* Botón rápido Chasis Base AUNAR */}
                <button
                  type="button"
                  onClick={() => handleLoadTemplate('aunar_base')}
                  style={{ ...S.btnSecondary, padding: '6px 12px', fontSize: '12px', gap: '6px' }}
                  title="Cargar estructura oficial AUNAR con logo y facturación lista para redactar el texto inferior"
                >
                  <Sparkles size={13} style={{ color: 'var(--accent)' }} />
                  <span>Base AUNAR</span>
                </button>

                {/* Botón para guardar plantilla actual */}
                <button
                  type="button"
                  onClick={() => {
                    setNewTemplateName(campaignName || '');
                    setIsSaveTemplateModalOpen(true);
                  }}
                  style={{ ...S.btnSecondary, padding: '6px 12px', fontSize: '12px', gap: '6px', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#047857' }}
                  title="Guardar el diseño actual como una nueva plantilla personalizada"
                >
                  <Bookmark size={13} />
                  <span>Guardar Plantilla</span>
                </button>

                {/* Botón para eliminar plantilla personalizada activa */}
                {selectedTemplateKey && selectedTemplateKey.startsWith('custom_') && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedTemplateKey.replace('custom_', '');
                      const ct = customTemplates.find(t => String(t.id) === String(id));
                      if (ct) handleDeleteCustomTemplate(ct.id, ct.nombre);
                    }}
                    style={{ ...S.btnSecondary, padding: '6px 10px', fontSize: '12px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                    title="Eliminar esta plantilla personalizada"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
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
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej: Aunar - Detalle de tu abono, {{nombre_socio}} - Linea: {{lineas}}" style={S.input} />
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
                  <>
                    <Loader2 className="animate-spin" size={15} />
                    <span>
                      {sendProgress ? `Enviando ${sendProgress.current} de ${sendProgress.total}...` : 'Despachando...'}
                    </span>
                  </>
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
          {/* Alerta de campaña activa en segundo plano */}
          {activeCampaign && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '16px',
              padding: '14px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {!activeCampaign.isFinished ? (
                  <Loader2 className="animate-spin" size={20} color="#059669" />
                ) : (
                  <CheckCircle size={20} color="#059669" />
                )}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Campaña en curso: {activeCampaign.name} ({activeCampaign.sentCount}/{activeCampaign.total} procesados • {Math.round((activeCampaign.sentCount / (activeCampaign.total || 1)) * 100)}%)
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {!activeCampaign.isFinished 
                      ? `Tiempo restante estimado: ${calculateRemainingTime(activeCampaign.total, activeCampaign.sentCount)} • Despacho Brevo API`
                      : `¡Campaña finalizada! ${activeCampaign.successCount} enviados exitosamente.`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveCampaign(prev => ({ ...prev, isMinimized: false }))}
                style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: '12px', gap: '6px' }}
              >
                <Maximize2 size={13} /> Ver pantalla completa
              </button>
            </div>
          )}

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
                  <option value="exito">Enviados</option>
                  <option value="abierto">Abiertos (Vistos)</option>
                  <option value="click">Clics</option>
                  <option value="rebotado">Rebotados</option>
                  <option value="error">Con Error</option>
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
                          {log.estado === 'abierto' ? (
                            <><Eye size={11} /><span>Abierto</span></>
                          ) : log.estado === 'click' ? (
                            <><ExternalLink size={11} /><span>Clic</span></>
                          ) : log.estado === 'rebotado' ? (
                            <><AlertTriangle size={11} /><span>Rebotado</span></>
                          ) : log.estado === 'exito' ? (
                            <><Check size={11} /><span>Enviado</span></>
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
        </>
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

      {/* Modal: Guardar Plantilla Personalizada */}
      <Modal
        isOpen={isSaveTemplateModalOpen}
        onClose={() => setIsSaveTemplateModalOpen(false)}
        title="Guardar como Plantilla Personalizada"
        maxWidth="520px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Guardá el diseño actual del correo para reutilizarlo en futuras campañas. Incluye el <strong>logo oficial de Aunar</strong>, las variables de facturación y el texto que redactaste.
          </p>

          <div>
            <label style={{ ...S.label, marginBottom: '6px' }}>Nombre de la Plantilla</label>
            <input 
              type="text" 
              value={newTemplateName} 
              onChange={(e) => setNewTemplateName(e.target.value)} 
              placeholder="Ej: Recordatorio 2do Vencimiento, Promo Roaming..." 
              style={S.input}
              autoFocus
            />
          </div>

          <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-light)', fontSize: '12.5px', color: '#475569' }}>
            <div style={{ marginBottom: '6px' }}>
              <strong>Asunto predeterminado:</strong> {subject || '(Sin asunto definido)'}
            </div>
            <div style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <Check size={14} /> Mantiene el logo, saludo institucional y la tabla de líneas con GBs
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button 
              type="button" 
              onClick={() => setIsSaveTemplateModalOpen(false)} 
              style={S.btnSecondary}
            >
              Cancelar
            </button>
            <button 
              type="button" 
              onClick={handleSaveCustomTemplate} 
              disabled={savingTemplate || !newTemplateName.trim()}
              style={{ ...S.btnPrimary, opacity: savingTemplate || !newTemplateName.trim() ? 0.6 : 1, gap: '6px' }}
            >
              {savingTemplate ? <Loader2 className="animate-spin" size={15} /> : <Bookmark size={15} />}
              <span>{savingTemplate ? 'Guardando...' : 'Guardar Plantilla'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Widget flotante minimizado cuando se navega en otros pasos */}
      {activeCampaign && activeCampaign.isMinimized && (
        <div
          onClick={() => setActiveCampaign(prev => ({ ...prev, isMinimized: false }))}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
            borderRadius: '16px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            zIndex: 9999,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          {!activeCampaign.isFinished ? (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 className="animate-spin" size={22} color="#059669" />
            </div>
          ) : (
            <CheckCircle size={22} color="#059669" />
          )}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{activeCampaign.name}</span>
              <span style={{ fontSize: '10.5px', fontWeight: 900, color: '#047857', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 7px', borderRadius: '10px' }}>
                {Math.round((activeCampaign.sentCount / (activeCampaign.total || 1)) * 100)}%
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {!activeCampaign.isFinished 
                ? `${activeCampaign.sentCount}/${activeCampaign.total} envíos • ${calculateRemainingTime(activeCampaign.total, activeCampaign.sentCount)} restantes`
                : `Finalizado: ${activeCampaign.successCount} enviados con éxito`
              }
            </div>
          </div>
          <button
            type="button"
            style={{
              border: 'none',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            Ver avance <ChevronRight size={13} />
          </button>
        </div>
      )}

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
