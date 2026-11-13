import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, BookOpen, Search, Download, ExternalLink, ArrowRight, 
  CheckCircle2, AlertTriangle, Info, HelpCircle, FileText, 
  Smartphone, UploadCloud, Calculator, Mail, Users, 
  LayoutDashboard, ZoomIn, ChevronRight, Layers, FileSpreadsheet
} from 'lucide-react';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

export default function HelpModal({ isOpen, onClose, initialCategory = 'carga_datos' }) {
  useBodyScrollLock(isOpen);
  const navigate = useNavigate();

  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxImg, setLightboxImg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setActiveCategory(initialCategory);
      setSearchQuery('');
    }
  }, [isOpen, initialCategory]);

  // Manejo de tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (lightboxImg) {
          setLightboxImg(null);
        } else if (isOpen) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, lightboxImg, onClose]);

  // Base de datos completa de Instructivos
  const categories = useMemo(() => [
    {
      id: 'carga_datos',
      title: 'Carga de Datos (Operadoras)',
      shortTitle: 'Carga de Datos',
      icon: UploadCloud,
      color: '#3b82f6',
      badge: 'Mensual - Operadoras',
      route: '/carga-manual',
      routeLabel: 'Ir al Módulo de Carga',
      pdfUrl: null, // Proceso directo en sistema
      description: 'Procedimiento mensual de importación y auditoría de consumos de Claro (CSV), Movistar (PDF) y Personal (PDF/Texto) con detección inteligente de discrepancias.',
      steps: [
        {
          num: 'Paso 1',
          title: 'Configuración de Período y Selección de Prestadora',
          content: [
            'Ingresar a Carga de Facturación (/carga-manual) desde el menú de Facturación.',
            'Seleccionar el Período a liquidar (ej: 2026-09 o mes corriente). El sistema calcula automáticamente el período previo para comparar variaciones.',
            'Elegir la operadora correspondiente según el archivo recibido de la compañía:',
            '• Claro (CSV / Planilla): Archivo delimitado por punto y coma (;). El sistema extrae Valor Plan (Abono), Bonificaciones, Excedentes (Gigas y adicionales) y Total de Línea.',
            '• Movistar (PDF Cuadro Resumen): Archivo PDF oficial emitido por Telefónica. El parser extrae la tabla de consumos separando Cargos Fijos (Abono Base) y Cargos Variables (Excedentes).',
            '• Personal (PDF / Texto): Se extrae el detalle línea por línea identificando el consumo total y calculando el excedente restando el abono pactado.',
            'Pegar el contenido copiado o arrastrar el archivo en el área de texto central y presionar "Procesar Datos".'
          ],
          tip: 'El sistema valida automáticamente que no se pegue por error un archivo de Claro estando seleccionada la pestaña de Movistar o viceversa, avisando con una alerta en pantalla.',
          image: '/instructivos/images/screenshot_facturacion_historial.png',
          imageCaption: 'Vista 1.0 • Configuración del período de facturación y preparación del lote.'
        },
        {
          num: 'Paso 2',
          title: 'Auditoría Cruzada & Detección de Discrepancias',
          content: [
            'Una vez procesados los datos, el motor de auditoría (auditEngine) cruza automáticamente cada línea del archivo contra la base de datos de socios en Supabase.',
            'Verificaciones automáticas en tiempo real:',
            '• Líneas en Base de Datos: Identifica si el número celular pertenece a un socio activo o si es una línea dada de baja / no registrada.',
            '• Control de Abono Oficial: Compara el precio cobrado por la operadora contra la tabla oficial de planes_abonos. Si hay un incremento no pactado, resalta la discrepancia en amarillo/rojo.',
            '• Segregación de Excedentes: Los consumos extras de datos o llamadas fuera del plan se separan en una columna independiente para auditarlos antes de liquidar.',
            '• Herramientas de Corrección: Podés editar importes directamente sobre la grilla interactiva, aplicar la tarifa sugerida oficial o crear un reclamo formal con un solo clic.'
          ],
          alert: 'IMPORTANTE: Las discrepancias detectadas se pueden corregir en masa con el botón "Aplicar Tarifa Sugerida Aunar" antes de asentar el lote definitivo.',
          image: '/instructivos/images/screenshot_facturacion_socios.png',
          imageCaption: 'Vista 2.0 • Grilla de auditoría línea por línea con alerta de diferencias y consumos.'
        },
        {
          num: 'Paso 3',
          title: 'Confirmación y Guardado del Lote Mensual',
          content: [
            'Al hacer clic en "Guardar Lote de Facturación", el sistema presenta una ventana de confirmación con el resumen global:',
            '• Total a Recaudar de Socios vs. Total Costo a Operadoras.',
            '• Margen operativo generado para la Mutual.',
            '• Cantidad de líneas auditadas, aprobadas y con anomalías resueltas.',
            'Una vez confirmado, el sistema graba los registros en las tablas lotes_facturacion, consumos_mensuales y liquidaciones_grupos.',
            'El lote queda automáticamente disponible para ser auditado en el Centro de Cobranzas y listo para despachar en Campañas de Mails.'
          ],
          tip: 'Si una línea no está registrada en el padrón, el sistema te permite asociarla a un socio o darla de alta rápidamente sin perder el procesamiento del resto del archivo.',
          image: '/instructivos/images/screenshot_facturacion_liquidaciones.png',
          imageCaption: 'Vista 3.0 • Resumen consolidado y confirmación del lote definitivo en base de datos.'
        }
      ]
    },
    {
      id: 'facturacion',
      title: 'Facturación & Liquidaciones',
      shortTitle: 'Facturación',
      icon: FileText,
      color: '#10b981',
      badge: 'Manual Oficial PDF',
      route: '/facturacion',
      routeLabel: 'Ir a Facturación',
      pdfUrl: '/instructivos/Instructivo_Facturacion_Aunar.pdf',
      description: 'Control de lotes mensuales, recaudación global, margen de gestión de la mutual, auditoría de cobranzas por grupo y liquidaciones detalladas por socio.',
      steps: [
        {
          num: 'Paso 1',
          title: 'Centro de Cobranzas e Historial de Lotes',
          content: [
            'Ubicación: Pestaña Historial de Lotes (/facturacion?tab=historial).',
            'Esta pantalla consolida la facturación global importada cada mes para todas las líneas telefónicas:',
            '• Recaudación Total: Importe total liquidado a cobrar a los socios en el período activo (más de $18.7M mensuales).',
            '• Costo Operadoras y Margen: Desglose automático de lo que se le abona a Claro, Movistar y Personal, contra el beneficio neto generado para la Mutual.',
            '• Botón "Ver Liquidación": Permite ingresar directamente al desglose completo de líneas del lote auditado.',
            'Flujo mensual recomendado: Al recibir y procesar las facturas de las operadoras en Carga Manual, el lote impacta aquí automáticamente y queda listo para la emisión de la campaña de cobros.'
          ],
          tip: 'Desde el historial podés consultar cualquier mes histórico para verificar el cumplimiento del margen mutual y costos operativos.',
          image: '/instructivos/images/screenshot_facturacion_historial.png',
          imageCaption: 'Vista 1.0 • Recaudación total, costo a operadoras, margen mutual y lote mensual auditado.'
        },
        {
          num: 'Paso 2',
          title: 'Auditoría y Cobranza por Grupos Comerciales',
          content: [
            'Ubicación: Pestaña Resumen por Grupos (/facturacion?tab=resumen).',
            'La pestaña muestra los totales a cobrar consolidados por cada cuenta comercial o familiar:',
            '• Selector de Período: Permite alternar entre períodos históricos o el mes en curso.',
            '• Desglose Desplegable: Al hacer clic en la fila de un grupo, se expanden automáticamente todas las líneas individuales que lo componen con su titular y consumo.',
            '• Exportación Inteligente: Botón "Exportar a CSV" y "Exportar a Excel" para descargar la planilla completa y conciliar directamente con Tesorería o Contabilidad.'
          ],
          alert: 'La consolidación por grupo garantiza que a un mismo titular que posea múltiples líneas se le cobre el importe unificado sin duplicar costos.',
          image: '/instructivos/images/screenshot_facturacion_grupos.png',
          imageCaption: 'Vista 2.0 • Totales a liquidar por grupo comercial, cantidad de líneas y exportación a planilla.'
        },
        {
          num: 'Paso 3',
          title: 'Detalle Individual por Socio y Línea',
          content: [
            'Ubicación: Pestaña Liquidaciones por Socio (/facturacion?tab=socios).',
            'Permite auditar línea por línea el importe liquidado a cada socio antes del cobro bancario o por caja:',
            '• Buscador Universal: Encontrá al instante cualquier número celular, DNI o titular escribiendo parte de su nombre.',
            '• Filtro por Prestadora: Permite filtrar exclusivamente líneas de Claro, Movistar o Personal para cotejar con las facturas oficiales.',
            '• Totalizador en Vivo: En la cabecera se exhibe en tiempo real la sumatoria de las líneas filtradas en pantalla.'
          ],
          tip: 'Haciendo clic en el titular podés acceder directamente a su ficha de socio en la Comunidad para revisar sus formas de cobro o datos de contacto.',
          image: '/instructivos/images/screenshot_facturacion_socios.png',
          imageCaption: 'Vista 3.0 • Detalle individual por socio con búsqueda rápida, ordenamiento y filtros.'
        }
      ]
    },
    {
      id: 'conciliacion',
      title: 'Conciliación Bancaria & Pagos en Efectivo',
      shortTitle: 'Conciliación y Caja',
      icon: Calculator,
      color: '#f59e0b',
      badge: 'Tesorería & Bancos',
      route: '/conciliacion-bancaria',
      routeLabel: 'Ir a Conciliación Bancaria',
      pdfUrl: '/instructivos/Instructivo de Conciliación Bancaria y Pagos en Efectivo.pdf',
      description: 'Guía operativa oficial para el procesamiento de extractos bancarios de Banco Nación y Credicoop (copia/pega o Excel) y registro de cobros en efectivo con emisión de recibos.',
      steps: [
        {
          num: 'Módulo I',
          title: 'Conciliación Bancaria - Opción 1: Ingreso Manual (Copiar y Pegar)',
          content: [
            '1. Ingresar a la Gestión Bancaria desde el ícono de la calculadora (Contaduría) y seleccionar Conciliación Bancaria.',
            '2. Paso A - Copiar Movimientos: Copiar toda la información de las transferencias directamente desde el portal web del banco (Banco Credicoop o Banco Nación).',
            '3. Paso B - Configuración: Seleccionar el período contable a conciliar y la entidad bancaria correspondiente.',
            '4. Paso C - Pegar y Procesar: Pegar los movimientos en el cuadro de texto y pulsar "Procesar Movimientos".',
            '5. Paso D - Clasificación Inteligente: El sistema clasifica y ordena automáticamente los movimientos sugiriendo el titular y el número de grupo.',
            '6. Paso E - Control de Pagos ya Asignados: El sistema muestra cuándo fue conciliado un pago previo y bloquea la doble conciliación.',
            '7. Paso F - Búsqueda Manual: Si el remitente de la transferencia es un tercero o familiar, se puede buscar por nombre o número de grupo y presionar "Conciliar".'
          ],
          tip: 'La inteligencia de sugerencia del sistema aprende de los alias y CBU de los socios para reconocer automáticamente futuras transferencias.',
          image: '/instructivos/images/image003.png',
          imageCaption: 'Paso a Paso • Copiado de movimientos bancarios y procesamiento automatizado.'
        },
        {
          num: 'Módulo I-B',
          title: 'Conciliación Bancaria - Opción 2: Archivo Excel Controlado',
          content: [
            'Esta opción se utiliza cuando ya se dispone de una planilla de pagos controlados con su número de grupo asignado:',
            '1. Hacer clic en "Seleccionar Archivo" y cargar la planilla Excel (.xlsx).',
            '2. Controlar en la grilla que todos los importes, fechas y grupos sugeridos coincidan con la tesorería.',
            '3. Una vez validado el listado, presionar el botón "Aplicar Pagos" para impactar la conciliación en la cuenta corriente de cada socio.'
          ],
          alert: 'Al aplicar los pagos por Excel, los saldos adeudados se descuentan de forma inmediata del módulo de Gestión de Deuda.',
          image: '/instructivos/images/image009.png',
          imageCaption: 'Opción Excel • Carga directa de archivo de cobranzas auditado.'
        },
        {
          num: 'Módulo II',
          title: 'Procesamiento de Pagos en Efectivo (Contaduría)',
          content: [
            '1. Ingreso: Acceder mediante el menú a Contaduría (/contaduria) o con el enlace directo.',
            '2. Período: Se carga por defecto el período en curso con los saldos actualizados.',
            '3. Selección de Grupo: Buscar el grupo por número o titular. Es posible cobrar la totalidad con el botón "Cobrar Total" o tildar líneas individuales específicas.',
            '4. Configuración del Pago: Al presionar "Cobrar", se abre la ventana donde se define el medio de pago y el monto abonado (si excede la deuda del período, el excedente queda automáticamente como saldo a favor en cuenta corriente).',
            '5. Notas Internas e Intereses: En el pie de la ventana se pueden consultar notas del grupo (persisten mes a mes) y el detalle de interés por mora en caso de pagos fuera de término.',
            '6. Emisión de Recibo: Al presionar "Confirmar Cobro y Ver Recibo", el sistema emite el comprobante oficial con número correlativo, membrete y detalle de imputación.'
          ],
          tip: 'El recibo emitido puede descargarse en formato PDF o imprimirse directamente para entregarlo al socio como comprobante de pago.',
          image: '/instructivos/images/image012.png',
          imageCaption: 'Ventana de Cobro • Configuración de monto, imputación de conceptos y notas internas.'
        }
      ]
    },
    {
      id: 'campanas',
      title: 'Campañas & Comunicación',
      shortTitle: 'Campañas de Mail',
      icon: Mail,
      color: '#8b5cf6',
      badge: 'Comunicación Oficial',
      route: '/campanas',
      routeLabel: 'Ir a Comunicación',
      pdfUrl: '/instructivos/Instructivo_Campanas_Aunar.pdf',
      description: 'Emisión masiva de facturación mensual por correo electrónico mediante planilla Excel o mensajes personalizados por grupo/línea, con protección anti-spam.',
      steps: [
        {
          num: 'Paso 1',
          title: 'Las 3 Opciones de Envío del Módulo',
          content: [
            'Al acceder a Comunicación en la barra lateral, disponés de 3 modalidades según el requerimiento:',
            '1. Campaña de mail desde Excel (Recomendada): Para enviar la liquidación mensual masiva arrastrando la planilla oficial de cobros.',
            '2. Campaña de mail personalizada: Para redactar comunicados específicos filtrando socios por Grupos (cabezas de grupo) o por Líneas individuales.',
            '3. Bot WhatsApp: Para sincronizar las respuestas automáticas de consulta de deuda en el bot de atención institucional.'
          ],
          tip: 'La modalidad desde Excel agrupa automáticamente todas las líneas de un mismo socio para enviarle un único correo ordenado en lugar de múltiples avisos.',
          image: '/instructivos/images/foto1_opciones_principales.png',
          imageCaption: 'Vista 1.0 • Menú de modalidades de envío en el módulo de Comunicación.'
        },
        {
          num: 'Paso 2',
          title: 'Campaña Masiva desde Excel (Facturación Oficial)',
          content: [
            'Arrastrar o seleccionar la planilla mensual de facturación (ej: TODOS (09-2026) COBROS.xlsx).',
            'El sistema lee automáticamente los socios, números de teléfono, períodos, importes y direcciones de correo registradas.',
            'Consolidación inteligente: Si una persona tiene 3 líneas a su cargo, el sistema arma una tabla resumen con el subtotal de cada línea y el monto total final a pagar.'
          ],
          alert: 'Antes de disparar el envío, el sistema te muestra la lista de destinatarios únicos con su cantidad de líneas consolidadas.',
          image: '/instructivos/images/foto5_campana_excel.png',
          imageCaption: 'Vista 2.0 • Carga directa de planilla mensual con consolidación automática.'
        },
        {
          num: 'Paso 3',
          title: 'Diseño del Correo, Plantilla Base AUNAR y Despacho Seguro',
          content: [
            'Editor de Mensajes: Con el botón "Base AUNAR" se carga la plantilla oficial con el logo institucional, colores de la mutual y tabla formateada.',
            'Variables Dinámicas: Usá {{nombre_socio}}, {{periodo}}, {{monto_total}} para personalizar el contenido de cada correo de forma automática.',
            'Cadencia Anti-Spam: Al pulsar "Enviar Campaña", el sistema despacha los correos con un intervalo de 8 segundos entre cada uno para proteger la reputación del dominio de la mutual y garantizar que no caigan en Spam.',
            'Historial y Auditoría: En la pestaña Historial podés seguir el despacho en tiempo real, ver si fue entregado con éxito o si rebotó, e inspeccionar el correo tal cual como lo recibió el socio mediante el botón "Ver".'
          ],
          tip: 'El botón "Ver" en el historial permite comprobar la apariencia visual exacta del correo recibido por cualquier socio ante cualquier consulta.',
          image: '/instructivos/images/foto4_configuracion_mensaje.png',
          imageCaption: 'Vista 3.0 • Editor de mensaje con chasis oficial AUNAR y variables dinámicas.'
        }
      ]
    },
    {
      id: 'comunidad',
      title: 'Comunidad (Socios, Grupos y Planes)',
      shortTitle: 'Comunidad',
      icon: Users,
      color: '#06b6d4',
      badge: 'Padrón & Catálogo',
      route: '/comunidad',
      routeLabel: 'Ir a Comunidad',
      pdfUrl: '/instructivos/Instructivo_Comunidad_Aunar.pdf',
      description: 'Administración integral de los más de 740 socios, 380 cuentas grupales, catálogo de planes con abonos y gigabytes, y control de bonificaciones temporales.',
      steps: [
        {
          num: 'Paso 1',
          title: 'Padrón de Socios y Ficha Individual',
          content: [
            'Pestaña Socios (/comunidad?tab=socios): Centraliza los integrantes registrados con sus números de socio, CBU y líneas asignadas.',
            'Buscador universal: Encuentra por nombre, DNI, número de socio o línea.',
            'Ficha del Socio: Permite revisar el historial de facturación de cada socio, líneas activas y notas de seguimiento.'
          ],
          image: '/instructivos/images/screenshot_comunidad_socios.png',
          imageCaption: 'Padrón de Socios • Búsqueda, forma de cobro (CBU/Mutual) y líneas activas.'
        },
        {
          num: 'Paso 2',
          title: 'Gestión de Grupos y Cuentas Comerciales',
          content: [
            'Pestaña Grupos (/comunidad?tab=grupos): Administra las más de 380 cuentas grupales donde se consolidan múltiples líneas bajo un titular o empresa.',
            'Permite editar el correo de contacto, titular comercial, número de expediente y estado de cuenta.'
          ],
          image: '/instructivos/images/screenshot_comunidad_grupos.png',
          imageCaption: 'Grupos Comerciales • Catálogo de cuentas unificadas y cabezas de grupo.'
        },
        {
          num: 'Paso 3',
          title: 'Catálogo de Planes, Descuentos y Cuotas de Equipos',
          content: [
            'Planes (/comunidad?tab=planes): Configuración de los abonos vigentes para Claro, Movistar y Personal, gigas incluidos y costo mutual.',
            'Descuentos (/comunidad?tab=descuentos): Control de bonificaciones temporales y cargos en cuotas por financiamiento de equipos con alertas de vencimiento.'
          ],
          image: '/instructivos/images/screenshot_comunidad_planes.png',
          imageCaption: 'Catálogo de Planes • Tarifas oficiales, gigas incluidos y costos por operadora.'
        }
      ]
    },
    {
      id: 'dashboard',
      title: 'Dashboard, Log Diario & Tareas',
      shortTitle: 'Dashboard & Tareas',
      icon: LayoutDashboard,
      color: '#ec4899',
      badge: 'Gestión Operativa',
      route: '/',
      routeLabel: 'Ir al Inicio',
      pdfUrl: '/instructivos/Instructivo_Inicio_Dashboard_Tareas.pdf',
      description: 'Métricas comerciales clave en tiempo real, bitácora de llamadas y contactos de WhatsApp (Log Diario) y tablero de tickets operativos con tiempos de respuesta (SLA).',
      steps: [
        {
          num: 'Paso 1',
          title: 'Dashboard Principal y KPIs',
          content: [
            'Ofrece una radiografía en tiempo real del estado de la mutual al iniciar la sesión:',
            '• Recaudación global acumulada y cobranzas del mes.',
            '• Distribución de líneas por prestadora (Claro, Movistar, Personal).',
            '• Gráficos comparativos de evolución de ventas y consumos.'
          ],
          image: '/instructivos/images/screenshot_dashboard.png',
          imageCaption: 'Dashboard Principal • Indicadores comerciales, métricas de recaudación y líneas.'
        },
        {
          num: 'Paso 2',
          title: 'Log Diario de Contacto y Atención',
          content: [
            'Ubicación: Inicio / Log Diario (/log-diario).',
            'Permite asentar cada consulta, llamado telefónico o mensaje de WhatsApp recibido de un socio.',
            'Filtros por fecha, colaborador y motivo de contacto para garantizar trazabilidad en la atención.'
          ],
          image: '/instructivos/images/screenshot_log_diario.png',
          imageCaption: 'Log Diario • Bitácora de atención al socio y seguimiento de consultas.'
        },
        {
          num: 'Paso 3',
          title: 'Tablero de Gestión de Tareas y SLA',
          content: [
            'Ubicación: Inicio / Tareas (/tareas).',
            'Centraliza todos los reclamos, altas de líneas y gestiones pendientes del equipo con semáforo de prioridad y control de tiempos de respuesta acordados.'
          ],
          image: '/instructivos/images/screenshot_tareas.png',
          imageCaption: 'Tablero de Tareas • Gestión ágil de solicitudes y control de SLA.'
        }
      ]
    }
  ], []);

  // Filtrado de instructivos por búsqueda
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const query = searchQuery.toLowerCase();

    return categories.map(cat => {
      const matchCat = cat.title.toLowerCase().includes(query) ||
                       cat.description.toLowerCase().includes(query);
      const matchingSteps = cat.steps.filter(step => 
        step.title.toLowerCase().includes(query) ||
        step.content.some(c => c.toLowerCase().includes(query)) ||
        (step.tip && step.tip.toLowerCase().includes(query)) ||
        (step.alert && step.alert.toLowerCase().includes(query))
      );

      if (matchCat || matchingSteps.length > 0) {
        return {
          ...cat,
          steps: matchingSteps.length > 0 ? matchingSteps : cat.steps
        };
      }
      return null;
    }).filter(Boolean);
  }, [categories, searchQuery]);

  const currentCategory = useMemo(() => {
    const found = filteredCategories.find(c => c.id === activeCategory);
    return found || filteredCategories[0] || categories[0];
  }, [filteredCategories, activeCategory, categories]);

  if (!isOpen) return null;

  return (
    <div 
      className="help-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 12, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bento-card help-modal-container"
        style={{
          width: '100%',
          maxWidth: '1280px',
          height: '92vh',
          maxHeight: '900px',
          background: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-light, rgba(255, 255, 255, 0.1))',
          borderRadius: '24px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          color: 'var(--text-primary, #f8fafc)'
        }}
      >
        {/* ── HEADER MODAL ── */}
        <div 
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid var(--border-light, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            background: 'var(--surface-hover, rgba(255, 255, 255, 0.02))'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div 
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.2))',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent, #3b82f6)'
              }}
            >
              <BookOpen size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>
                  Centro de Ayuda e Instructivos Operativos
                </h2>
                <span 
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 9px',
                    borderRadius: '20px',
                    background: 'var(--accent-light, rgba(59, 130, 246, 0.15))',
                    color: 'var(--accent, #3b82f6)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase'
                  }}
                >
                  Mutual AUNAR
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', margin: '3px 0 0 0' }}>
                Guías oficiales paso a paso, carga de datos, facturación mensual, conciliación bancaria y tesorería
              </p>
            </div>
          </div>

          {/* Buscador y Botón Cerrar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div 
              style={{
                position: 'relative',
                width: '280px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Search 
                size={16} 
                style={{
                  position: 'absolute',
                  left: '14px',
                  color: 'var(--text-secondary, #94a3b8)'
                }}
              />
              <input 
                type="text"
                placeholder="Buscar en instructivos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  paddingLeft: '38px',
                  paddingRight: '14px',
                  borderRadius: '12px',
                  background: 'var(--surface, rgba(0, 0, 0, 0.2))',
                  border: '1px solid var(--border-light, rgba(255, 255, 255, 0.1))',
                  fontSize: '13px',
                  color: 'var(--text-primary, #f8fafc)',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button 
              onClick={onClose}
              className="hover-lift"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                border: '1px solid var(--border-light, rgba(255, 255, 255, 0.1))',
                background: 'var(--surface, rgba(255, 255, 255, 0.05))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary, #94a3b8)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title="Cerrar (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── CUERPO: SIDEBAR + CONTENIDO ── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          
          {/* Navegación Lateral de Categorías */}
          <div 
            style={{
              width: '280px',
              borderRight: '1px solid var(--border-light, rgba(255, 255, 255, 0.08))',
              padding: '16px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              overflowY: 'auto',
              background: 'var(--surface-hover, rgba(0, 0, 0, 0.05))',
              flexShrink: 0
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', padding: '6px 12px' }}>
              Temas Principales
            </div>

            {filteredCategories.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                No se encontraron coincidencias para "{searchQuery}"
              </div>
            ) : (
              filteredCategories.map((cat) => {
                const Icon = cat.icon;
                const isSelected = currentCategory.id === cat.id;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className="hover-lift"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '14px',
                      border: isSelected 
                        ? `1px solid ${cat.color}66` 
                        : '1px solid transparent',
                      background: isSelected 
                        ? `${cat.color}15` 
                        : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      width: '100%'
                    }}
                  >
                    <div 
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '10px',
                        background: isSelected ? `${cat.color}33` : 'rgba(255, 255, 255, 0.05)',
                        color: isSelected ? cat.color : 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontSize: '13px', 
                        fontWeight: isSelected ? 800 : 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {cat.shortTitle}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.8 }}>
                        {cat.steps.length} {cat.steps.length === 1 ? 'sección' : 'pasos'}
                      </div>
                    </div>
                    {isSelected && (
                      <ChevronRight size={16} style={{ color: cat.color }} />
                    )}
                  </button>
                );
              })
            )}

            {/* Accesos Rápidos a Documentos PDF Oficiales */}
            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-light, rgba(255, 255, 255, 0.08))' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', padding: '6px 12px' }}>
                Archivos PDF Oficiales
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <a 
                  href="/instructivos/Instructivo_Facturacion_Aunar.pdf" 
                  target="_blank" 
                  rel="noreferrer"
                  className="hover-lift"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textDecoration: 'none'
                  }}
                >
                  <FileText size={15} style={{ color: '#10b981' }} /> Facturación y Lotes
                </a>
                <a 
                  href="/instructivos/Instructivo de Conciliación Bancaria y Pagos en Efectivo.pdf" 
                  target="_blank" 
                  rel="noreferrer"
                  className="hover-lift"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textDecoration: 'none'
                  }}
                >
                  <Calculator size={15} style={{ color: '#f59e0b' }} /> Conciliación y Caja
                </a>
                <a 
                  href="/instructivos/Instructivo_Campanas_Aunar.pdf" 
                  target="_blank" 
                  rel="noreferrer"
                  className="hover-lift"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textDecoration: 'none'
                  }}
                >
                  <Mail size={15} style={{ color: '#8b5cf6' }} /> Campañas de Mail
                </a>
              </div>
            </div>
          </div>

          {/* Panel de Contenido Principal */}
          <div 
            style={{
              flex: 1,
              padding: '28px 36px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px'
            }}
          >
            {/* Banner de la Categoría Activa */}
            <div 
              style={{
                padding: '24px',
                borderRadius: '20px',
                background: `linear-gradient(135deg, ${currentCategory.color}15, rgba(255, 255, 255, 0.02))`,
                border: `1px solid ${currentCategory.color}33`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}
            >
              <div style={{ maxWidth: '650px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span 
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: '8px',
                      background: currentCategory.color,
                      color: '#ffffff',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    {currentCategory.badge}
                  </span>
                  <h3 style={{ fontSize: '22px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
                    {currentCategory.title}
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  {currentCategory.description}
                </p>
              </div>

              {/* Acciones de Navegación y PDF */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {currentCategory.pdfUrl && (
                  <a 
                    href={currentCategory.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover-lift"
                    style={{
                      height: '42px',
                      padding: '0 16px',
                      borderRadius: '12px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      textDecoration: 'none'
                    }}
                  >
                    <Download size={16} /> Descargar PDF
                  </a>
                )}
                {currentCategory.route && (
                  <button 
                    onClick={() => {
                      onClose();
                      navigate(currentCategory.route);
                    }}
                    className="hover-lift"
                    style={{
                      height: '42px',
                      padding: '0 18px',
                      borderRadius: '12px',
                      border: 'none',
                      background: currentCategory.color,
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    {currentCategory.routeLabel} <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Pasos e Instrucciones Detalladas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {currentCategory.steps.map((step, idx) => (
                <div 
                  key={idx}
                  className="bento-card"
                  style={{
                    padding: '24px',
                    borderRadius: '18px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span 
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: `${currentCategory.color}22`,
                          color: currentCategory.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '13px',
                          fontWeight: 900
                        }}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: currentCategory.color, letterSpacing: '0.05em' }}>
                          {step.num}
                        </span>
                        <h4 style={{ fontSize: '17px', fontWeight: 800, margin: '2px 0 0 0', letterSpacing: '-0.01em' }}>
                          {step.title}
                        </h4>
                      </div>
                    </div>
                  </div>

                  {/* Lista de Contenido */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '44px' }}>
                    {step.content.map((p, pIdx) => (
                      <div 
                        key={pIdx} 
                        style={{ 
                          fontSize: '13.5px', 
                          color: p.startsWith('•') ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontWeight: p.startsWith('•') ? 600 : 400,
                          lineHeight: 1.6,
                          paddingLeft: p.startsWith('•') ? '8px' : '0'
                        }}
                      >
                        {p}
                      </div>
                    ))}
                  </div>

                  {/* Alertas / Tips */}
                  {step.alert && (
                    <div 
                      style={{
                        marginLeft: '44px',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        color: '#f87171',
                        fontSize: '12.5px',
                        lineHeight: 1.5,
                        fontWeight: 600
                      }}
                    >
                      <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>{step.alert}</div>
                    </div>
                  )}

                  {step.tip && (
                    <div 
                      style={{
                        marginLeft: '44px',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        color: '#60a5fa',
                        fontSize: '12.5px',
                        lineHeight: 1.5
                      }}
                    >
                      <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div><strong>Consejo operativo:</strong> {step.tip}</div>
                    </div>
                  )}

                  {/* Captura de Pantalla con Zoom */}
                  {step.image && (
                    <div style={{ marginLeft: '44px', marginTop: '6px' }}>
                      <div 
                        onClick={() => setLightboxImg({ src: step.image, caption: step.imageCaption })}
                        className="hover-lift"
                        style={{
                          position: 'relative',
                          borderRadius: '14px',
                          overflow: 'hidden',
                          border: '1px solid var(--border-light)',
                          cursor: 'pointer',
                          background: 'rgba(0, 0, 0, 0.2)',
                          maxHeight: '260px'
                        }}
                      >
                        <img 
                          src={step.image} 
                          alt={step.title}
                          style={{
                            width: '100%',
                            height: '240px',
                            objectFit: 'cover',
                            objectPosition: 'top',
                            display: 'block'
                          }}
                        />
                        <div 
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'space-between',
                            padding: '14px 18px',
                            color: '#ffffff'
                          }}
                        >
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>
                            {step.imageCaption || 'Clic para ampliar captura'}
                          </span>
                          <span 
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              background: 'rgba(255,255,255,0.2)',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              backdropFilter: 'blur(4px)'
                            }}
                          >
                            <ZoomIn size={12} /> Ampliar
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── LIGHTBOX PARA AMPLIAR IMÁGENES ── */}
      {lightboxImg && (
        <div 
          onClick={() => setLightboxImg(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          <button 
            onClick={() => setLightboxImg(null)}
            style={{
              position: 'absolute',
              top: '24px',
              right: '24px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer'
            }}
          >
            <X size={24} />
          </button>
          <img 
            src={lightboxImg.src} 
            alt="Captura ampliada"
            style={{
              maxWidth: '92vw',
              maxHeight: '82vh',
              borderRadius: '16px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              objectFit: 'contain'
            }}
            onClick={(e) => e.stopPropagation()}
          />
          {lightboxImg.caption && (
            <div 
              style={{
                marginTop: '16px',
                color: '#e2e8f0',
                fontSize: '14px',
                fontWeight: 600,
                textAlign: 'center',
                maxWidth: '800px'
              }}
            >
              {lightboxImg.caption}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
