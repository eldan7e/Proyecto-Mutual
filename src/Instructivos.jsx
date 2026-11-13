import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, Search, Download, ArrowRight, ExternalLink,
  UploadCloud, FileText, Calculator, Mail, Users, LayoutDashboard,
  CheckCircle2, AlertTriangle, Info, HelpCircle, Smartphone,
  Layers, Clock, ZoomIn, X, ChevronRight, FileSpreadsheet, Eye
} from 'lucide-react';

export default function Instructivos() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('carga_datos');
  const [search, setSearch] = useState('');
  const [lightboxImg, setLightboxImg] = useState(null);

  // Definición completa de cada componente del sistema
  const componentGuides = useMemo(() => [
    {
      id: 'carga_datos',
      title: 'Carga de Facturación, Auditoría & Liquidación',
      componentName: 'CargaManual.jsx',
      route: '/carga-manual',
      icon: UploadCloud,
      color: '#3b82f6',
      badge: 'Procedimiento Oficial',
      pdfUrl: null,
      summary: 'Guía paso a paso para importar las facturas de Claro, Movistar y Personal, auditar discrepancias de abonos y líneas huérfanas, y guardar la liquidación definitiva en la base de datos.',
      explanation: 'Este componente es el motor central de ingreso mensual. Permite volcar los extractos de las 3 compañías telefónicas, cruzar línea por línea contra el padrón de socios de Supabase, segregar consumos excedentes, actualizar tarifas sugeridas de la mutual y generar el lote auditado.',
      sections: [
        {
          title: 'Fase 1: Preparación y Carga de la Factura (Paso a Paso)',
          desc: 'Procedimiento para ingresar los consumos mensuales brutos según la compañía telefónica:',
          points: [
            '1. Obtención del Archivo de la Operadora:',
            '   • Claro: Descargar la factura y planilla CSV oficial de cobros. El archivo debe estar delimitado por punto y coma (;). El parser lee las columnas de Valor Plan (Abono), Bonificaciones, Excedentes (Gigas extras y llamadas) y Total por Línea.',
            '   • Movistar: Descargar el archivo PDF oficial "Cuadro Resumen" de Telefónica. Abrir el documento, seleccionar y copiar la tabla de consumos donde se desglosan Cargos Fijos (Abono Base) y Cargos Variables (Excedentes).',
            '   • Personal: Descargar la factura PDF de Telecom. Copiar el bloque de líneas móviles con su desglose de consumos.',
            '2. Ingreso al Sistema: Acceder a Carga de Facturación (/carga-manual) desde el menú lateral o el enlace superior.',
            '3. Configurar Período de Factura: Seleccionar el año y mes a liquidar (ej: 2026-09). El sistema pre-cargará automáticamente el historial del período anterior para calcular las variaciones porcentuales.',
            '4. Seleccionar Prestadora: Hacer clic en el botón de la operadora que vas a procesar: Movistar (PDF), Personal (PDF) o Claro (CSV / Copiado).',
            '5. Pegado de Datos: Pegar el texto copiado en el cuadro de texto central o arrastrar el archivo directamente.',
            '6. Validación Antierror: El sistema cuenta con protección cruzada (verificarTextoCruzado). Si detecta que pegaste un archivo de Personal teniendo seleccionada la pestaña de Claro, emitirá una alerta preventiva para evitar errores.',
            '7. Clic en "Procesar Datos": El sistema iniciará el parseo de líneas e importará los datos a la grilla de auditoría.'
          ],
          tip: 'Podés usar el botón "+ Copiar Todo" si necesitás copiar rápidamente el texto pegado para llevarlo a un bloc de notas o cotejarlo externamente.',
          image: '/instructivos/images/screenshot_facturacion_historial.png',
          imageCaption: 'Paso 1 • Selección de período, prestadora telefónica y carga del extracto.'
        },
        {
          title: 'Fase 2: Auditoría Integral en la Grilla Interactiva (Paso a Paso)',
          desc: 'Cómo revisar, corregir y validar línea por línea antes de asentar los cobros:',
          points: [
            '1. Cruce Automático con Supabase: Al procesar, el motor de auditoría (auditEngine) cruza cada número celular contra la tabla lineas, socios y planes_abonos de la base de datos.',
            '2. Columnas de Control de la Grilla:',
            '   • Línea: Número de teléfono normalizado (sin guiones ni espacios).',
            '   • Socio Asignado: Nombre completo del titular según el padrón oficial.',
            '   • Plan Oficial vs. Plan Factura: Muestra si la operadora cobró el plan pactado o si hubo un cambio de abono o gigas.',
            '   • Abono Real vs. Precio Lista: Compara si la empresa aplicó el descuento correspondiente (85% en Claro, 80% en Movistar y Personal).',
            '   • Excedentes: Consumos por fuera del abono contratado (Gigas extras, roaming, SMS especiales).',
            '   • Monto Factura: Total cobrado por la operadora.',
            '   • Monto a Cobrar al Socio: Importe auditado final que se le liquidará al grupo familiar o comercial.',
            '3. Resolución de Líneas Huérfanas (Sin Socio Asignado):',
            '   • Si una línea aparece en naranja con la leyenda "Socio no identificado", utilizá el selector "+ Vincular Socio..." directamente dentro de la celda.',
            '   • Escribí el nombre o DNI del socio en el buscador integrado y seleccionalo para vincular la línea de forma inmediata.',
            '4. Resolución de Discrepancias de Planes:',
            '   • Si la operadora actualizó el plan del socio, aparecerá el botón azul "Actualizar Plan" en la fila.',
            '   • Podés pulsar "Actualizar Plan" individualmente, o utilizar el botón superior "Actualizar Planes en Masa" para sincronizar todos los planes modificados con un solo clic.',
            '5. Apertura de Reclamos a la Compañía:',
            '   • Si la operadora cobró de más o incumplió una bonificación, hacé clic en el botón de Ticket para abrir un reclamo con tipo, monto y descripción para que quede auditado.',
            '6. Filtros de Navegación Rápida: Alterná entre las pestañas "Todas las Líneas", "Con Discrepancias / Anomalías", "Sin Socio" y "Líneas Sueltas" para depurar la grilla de forma ágil.'
          ],
          alert: 'REGLA DE ORO: Antes de avanzar a la confirmación, asegurate de que la cantidad de líneas sin socio o sin plan sea CERO o esté debidamente justificada.',
          image: '/instructivos/images/screenshot_facturacion_socios.png',
          imageCaption: 'Paso 2 • Grilla de auditoría interactiva con alertas de discrepancia y vinculador de socios.'
        },
        {
          title: 'Fase 3: Ventana de Confirmación de Liquidación & Aumentos',
          desc: 'Revisión del resumen estadístico previo al guardado:',
          points: [
            '1. Presionar "Guardar Lote de Facturación": Al estar conforme con la grilla, hacé clic en el botón verde inferior.',
            '2. Se abrirá la ventana modal "Confirmar Liquidación", que realiza un control exhaustivo:',
            '   • Comparativa de Líneas: Líneas Mes Anterior vs. Líneas Mes Actual y la diferencia neta de altas o bajas.',
            '   • Variación Promedio por Plan: Calcula el incremento porcentual que aplicó la operadora en sus precios de lista respecto al mes previo (ej: Claro +4.2%, Movistar +5.0%).',
            '   • Chequeo de Bloqueo Preventivo: Muestra el recuento de líneas sin plan, sin socio o sin grupo. Si existen diferencias, el botón de guardado se bloqueará automáticamente para evitar inconsistencias en la base de datos.',
            '3. Casilla "Forzar Guardado":',
            '   • Si existen diferencias de líneas respecto al mes anterior pero ya fueron verificadas y aprobadas por administración, tildá la casilla: "[X] He revisado las discrepancias y deseo forzar el guardado del lote". Esto desbloqueará el botón de confirmación.',
            '4. Actualización de Tarifa Sugerida AUNAR:',
            '   • El sistema analiza el aumento de la compañía y te sugiere nuevas tarifas para la Mutual (ej: aumento del 3%, 4%, 5% o aumento ponderado).',
            '   • Si deseás que el sistema actualice los precios de venta a los socios en la base de datos, tildá la opción correspondiente.'
          ],
          tip: 'La sugerencia de tarifa Aunar redondea inteligentemente los importes a múltiplos de $5 para facilitar los pagos en efectivo y transferencias.',
          image: '/instructivos/images/screenshot_facturacion_grupos.png',
          imageCaption: 'Paso 3 • Modal de confirmación con comparativa de líneas y sugerencia de aumentos.'
        },
        {
          title: 'Fase 4: Guardado Definitivo en Base de Datos y Pantalla de Éxito',
          desc: 'Qué sucede internamente al confirmar el lote y cómo continuar el flujo operativo:',
          points: [
            '1. Ejecución del Guardado (saveFacturacion): Al presionar "Confirmar Guardado", el sistema realiza las siguientes operaciones transaccionales en PostgreSQL:',
            '   • Registra el lote con estado AUDITADO en lotes_facturacion guardando el período, prestadora y costo.',
            '   • Inserta el detalle de cada línea telefónica con su abono y excedente segregado en consumos_mensuales.',
            '   • Agrupa y consolida automáticamente los consumos por cuenta comercial en liquidaciones_grupos con su número de grupo y titular.',
            '   • Si se seleccionó actualización tarifaria, actualiza los valores en planes_abonos.',
            '2. Pantalla de Éxito (Step3SuccessScreen):',
            '   • Se exhibe el panel verde de confirmación con el total facturado, total a operadoras y cantidad de líneas asentadas.',
            '3. Acciones Posteriores Recomendadas:',
            '   • "Ver en Facturación": Te redirige al Centro de Cobranzas (/facturacion) para auditar el lote y descargar el Resumen por Grupos.',
            '   • "Ir a Campañas": Te lleva a Comunicación (/campanas) para emitir la campaña de correos electrónicos con la factura adjunta a cada socio.',
            '   • "Cargar otra prestadora": Limpia los campos y te devuelve al Paso 1 para ingresar la siguiente compañía telefónica.'
          ],
          alert: 'Una vez guardado el lote, la información impacta inmediatamente en las cuentas corrientes y en la consulta de saldos del bot de WhatsApp.',
          image: '/instructivos/images/screenshot_facturacion_liquidaciones.png',
          imageCaption: 'Paso 4 • Pantalla de éxito con resumen del lote grabado y enlaces de continuidad.'
        }
      ]
    },
    {
      id: 'facturacion',
      title: 'Facturación & Liquidaciones de Lotes',
      componentName: 'Facturacion.jsx',
      route: '/facturacion',
      icon: FileText,
      color: '#10b981',
      badge: 'Manual Oficial PDF',
      pdfUrl: '/instructivos/Instructivo_Facturacion_Aunar.pdf',
      summary: 'Centro de control de recaudación global, seguimiento de lotes procesados, resumen consolidado por grupos y liquidación individual por socio.',
      explanation: 'Facturación es el módulo de consulta y auditoría financiera mensual. Permite verificar que lo recaudado cubra los costos de las prestadoras, controlar el margen mutual, exportar planillas para contabilidad y auditar consumos línea por línea.',
      sections: [
        {
          title: '1. Pestaña "Historial de Lotes" - Centro de Cobranzas',
          desc: 'Ofrece una vista macro del estado financiero de cada período:',
          points: [
            '• KPIs de Cabecera: Recaudación Total (monto liquidado a cobrar), Costo Operadoras (lo abonado a las compañías) y Margen Mutual (beneficio retenido para la gestión).',
            '• Tarjetas de Lotes Mensuales: Cada lote guardado se visualiza con su fecha, cantidad de líneas procesadas, estado (Auditado/Cerrado) y prestadora.',
            '• Botón "Ver Liquidación": Te lleva directamente al desglose de líneas correspondiente a ese lote.',
            '• Selector de Período y Filtro de Operadora: Permite comparar meses anteriores o filtrar únicamente Claro, Movistar o Personal.'
          ],
          tip: 'Revisá siempre que el porcentaje de margen mutual sea coherente con las bonificaciones acordadas con las empresas de telefonía.',
          image: '/instructivos/images/screenshot_facturacion_historial.png',
          imageCaption: 'Historial de Lotes • Métricas de recaudación, margen de gestión y lotes mensuales.'
        },
        {
          title: '2. Pestaña "Resumen por Grupos" - Cobranzas Grupales',
          desc: 'Agrupa la facturación según las unidades comerciales o familiares:',
          points: [
            '• Cuentas Grupales: Muestra los totales a cobrar agrupados por número de grupo comercial.',
            '• Desglose Desplegable: Al hacer clic sobre cualquier fila de grupo, se expande la lista de las líneas que lo componen con su titular y consumo individual.',
            '• Exportación a CSV / Excel: Descargá con un clic la planilla de cobro grupal para conciliar con bancos o el sistema contable.'
          ],
          image: '/instructivos/images/screenshot_facturacion_grupos.png',
          imageCaption: 'Resumen por Grupos • Desglose desplegable de líneas y exportación a planilla.'
        },
        {
          title: '3. Pestaña "Liquidaciones por Socio" - Detalle Individual',
          desc: 'Permite auditar minuciosamente socio por socio:',
          points: [
            '• Buscador Rápido: Buscá por nombre, DNI o número celular para revisar consumos específicos.',
            '• Totalizador en Vivo: La cabecera suma en tiempo real los importes de todas las filas resultantes de tu búsqueda o filtro.',
            '• Enlace a la Ficha: Haciendo clic en el nombre del socio podés abrir su ficha completa en Comunidad.'
          ],
          image: '/instructivos/images/screenshot_facturacion_socios.png',
          imageCaption: 'Liquidaciones por Socio • Detalle individual con buscador y filtros por prestadora.'
        }
      ]
    },
    {
      id: 'contaduria',
      title: 'Contaduría, Conciliación Bancaria & Caja',
      componentName: 'Contaduria.jsx / ConciliacionBancaria.jsx',
      route: '/contaduria',
      icon: Calculator,
      color: '#f59e0b',
      badge: 'Tesorería & Bancos',
      pdfUrl: '/instructivos/Instructivo de Conciliación Bancaria y Pagos en Efectivo.pdf',
      summary: 'Gestión integral de tesorería: conciliación de extractos bancarios de Banco Nación y Credicoop, cobros en efectivo en ventanilla y recibos oficiales.',
      explanation: 'Este componente centraliza los ingresos de dinero a la Mutual. Automatiza el cotejo de transferencias bancarias sugiriendo el socio pagador y registra los cobros en efectivo con imputación inteligente de saldo deudor e intereses.',
      sections: [
        {
          title: '1. Conciliación Bancaria - Opción Copiar y Pegar',
          desc: 'Cómo conciliar transferencias desde el portal bancario en minutos:',
          points: [
            '• Acceso: Entrá a Contaduría (/contaduria) y hacé clic en "Conciliación Bancaria".',
            '• Copiar Movimientos: Ingresá a la web del banco (Nación o Credicoop), seleccioná las transferencias y copialas.',
            '• Configuración: Seleccioná el período contable y la entidad bancaria en pantalla.',
            '• Pegar y Procesar: Pegá el texto en la caja y pulsá "Procesar Movimientos".',
            '• Clasificación Automática: El sistema analiza el CBU/Alias y sugiere automáticamente el socio titular y el número de grupo.',
            '• Control de Pagos Asignados: El sistema detecta si un pago ya fue conciliado anteriormente y te bloquea procesarlo dos veces.',
            '• Búsqueda Manual: Si la transferencia vino a nombre de un familiar o tercero, podés buscar al socio por nombre o grupo y hacer clic en "Conciliar".'
          ],
          tip: 'Cada vez que asignás manualmente una transferencia, el sistema registra el alias para que el mes siguiente lo sugiera de forma automática.',
          image: '/instructivos/images/image003.png',
          imageCaption: 'Conciliación Bancaria • Pegado de movimientos bancarios y procesamiento inteligente.'
        },
        {
          title: '2. Conciliación Bancaria - Opción Archivo Excel',
          desc: 'Para lotes de pagos ya controlados en una planilla:',
          points: [
            '• Hacé clic en "Seleccionar Archivo" y cargá el archivo Excel (.xlsx).',
            '• Verificá en la grilla que todos los importes, fechas y grupos sugeridos sean correctos.',
            '• Presioná "Aplicar Pagos" para impactar automáticamente la conciliación en la cuenta corriente de cada socio.'
          ],
          image: '/instructivos/images/image009.png',
          imageCaption: 'Conciliación Excel • Carga y aplicación masiva de pagos auditados.'
        },
        {
          title: '3. Procesamiento de Pagos en Efectivo (Caja)',
          desc: 'Cómo registrar cobranzas en ventanilla:',
          points: [
            '• Acceso: Desde Contaduría (/contaduria), el sistema carga por defecto el período en curso.',
            '• Selección de Grupo: Buscá el grupo por número o titular. Podés cobrar la totalidad con "Cobrar Total" o tildar líneas específicas.',
            '• Configuración de Pago: Definí el medio de cobro (Efectivo, Tarjeta, Débito) y el monto abonado.',
            '• Saldo a Favor: Si el socio paga un monto mayor al adeudado, el sobrante se acredita automáticamente a su favor en la cuenta corriente.',
            '• Notas Internas: Espacio para comentarios del grupo que persisten de un mes al otro para que todo el equipo esté enterado.',
            '• Interés por Mora: Si el pago se realiza fuera de término, el sistema calcula y exhibe el desglose del recargo.',
            '• Emisión de Recibo: Al presionar "Confirmar Cobro y Ver Recibo", se genera el comprobante oficial con número y membrete imprimible.'
          ],
          image: '/instructivos/images/image012.png',
          imageCaption: 'Ventana de Cobro • Configuración de medio de pago, notas internas y emisión de recibo.'
        }
      ]
    },
    {
      id: 'campanas',
      title: 'Comunicación, Mails & Bot WhatsApp',
      componentName: 'Campanas.jsx',
      route: '/campanas',
      icon: Mail,
      color: '#8b5cf6',
      badge: 'Comunicación Masiva',
      pdfUrl: '/instructivos/Instructivo_Campanas_Aunar.pdf',
      summary: 'Emisión masiva de facturación mensual por correo electrónico mediante planilla Excel o comunicados específicos, con control anti-spam y sincronización con bot.',
      explanation: 'El módulo de Comunicación se encarga del despacho de las notificaciones de deuda hacia los socios. Cuenta con un motor de consolidación inteligente por titular y protección de reputación de dominio para asegurar que los correos no terminen en Spam.',
      sections: [
        {
          title: '1. Menú de Opciones de Envío',
          desc: 'Al ingresar a Comunicación verás 3 alternativas según el objetivo del envío:',
          points: [
            '• 1. Campaña desde Excel (Recomendado): Para el cobro mensual masivo. Arrastrás la planilla mensual y el sistema agrupa automáticamente todas las líneas de un titular en un solo correo.',
            '• 2. Campaña personalizada: Para redactar comunicados institucionales filtrando a los socios por Grupos o por Líneas individuales.',
            '• 3. Bot WhatsApp: Para sincronizar las respuestas de auto-consulta de facturación en el bot de atención institucional.'
          ],
          image: '/instructivos/images/foto1_opciones_principales.png',
          imageCaption: 'Opciones de Comunicación • Selector principal de modalidades de despacho.'
        },
        {
          title: '2. Campaña Masiva desde Planilla Excel',
          desc: 'Cómo despachar la facturación mensual oficial a todos los socios:',
          points: [
            '• Arrastrá el archivo Excel de facturación mensual (ej: TODOS (09-2026) COBROS.xlsx).',
            '• El sistema lee titulares, teléfonos, planes, importes y correos de cada socio.',
            '• Consolidación automática: Si un socio tiene a su cargo 4 líneas, recibe un único mail con la tabla ordenada de sus 4 consumos y el total unificado a abonar.',
            '• Revisión de Destinatarios: Antes de enviar, podés consultar la lista de correos y la cantidad de personas que recibirán el comunicado.'
          ],
          image: '/instructivos/images/foto5_campana_excel.png',
          imageCaption: 'Campaña Excel • Consolidación inteligente de líneas por titular.'
        },
        {
          title: '3. Redacción de Mensaje, Plantilla Base AUNAR y Despacho',
          desc: 'Diseño del correo y monitoreo del envío:',
          points: [
            '• Plantilla Base AUNAR: Al pulsar el botón "Base AUNAR" se carga el chasis institucional con logo, colores y tabla formateada.',
            '• Variables Dinámicas: Podés intercalar {{nombre_socio}}, {{periodo}}, {{monto_total}} para personalizar el mensaje.',
            '• Cadencia Anti-Spam: El despacho se procesa con una pausa de 8 segundos entre cada correo para proteger la reputación del servidor.',
            '• Historial de Envíos: Seguí el despacho en tiempo real con indicador de éxito o rebote, y usá el botón "Ver" para inspeccionar el correo tal cual como le llegó al socio.'
          ],
          image: '/instructivos/images/foto4_configuracion_mensaje.png',
          imageCaption: 'Editor de Mensaje • Plantilla oficial con variables y vista previa.'
        }
      ]
    },
    {
      id: 'comunidad',
      title: 'Comunidad: Socios, Grupos, Planes & Descuentos',
      componentName: 'Comunidad.jsx / Socios.jsx / Planes.jsx / Descuentos.jsx',
      route: '/comunidad',
      icon: Users,
      color: '#06b6d4',
      badge: 'Padrón & Catálogo',
      pdfUrl: '/instructivos/Instructivo_Comunidad_Aunar.pdf',
      summary: 'Administración del padrón de más de 740 socios, 380 cuentas grupales, catálogo oficial de planes y bonificaciones temporales.',
      explanation: 'Comunidad es el núcleo de datos del sistema. Define quiénes son los socios, a qué grupos pertenecen, qué líneas tienen activas y qué abonos o descuentos especiales tienen asignados.',
      sections: [
        {
          title: '1. Padrón de Socios y Ficha Individual (/comunidad?tab=socios)',
          desc: 'Gestión completa de los integrantes de la Mutual:',
          points: [
            '• Buscador Universal: Búsqueda instantánea por nombre, DNI, número de socio o línea celular.',
            '• Forma de Pago: Indica si el socio abona por CBU (débito automático) o por Mutual (ventanilla/transferencia).',
            '• Ficha del Socio: Podés hacer clic en un socio para ver su historial de facturación de los últimos 12 meses, líneas asociadas y notas de seguimiento.'
          ],
          image: '/instructivos/images/screenshot_comunidad_socios.png',
          imageCaption: 'Padrón de Socios • Búsqueda, medios de cobro y acceso a ficha técnica.'
        },
        {
          title: '2. Gestión de Grupos Comerciales (/comunidad?tab=grupos)',
          desc: 'Unidades de facturación que consolidan múltiples líneas:',
          points: [
            '• Administración de cuentas comerciales, familiares o corporativas.',
            '• Configuración de titulares de facturación, correos de envío y números de expediente.',
            '• Permite visualizar el total de líneas asignadas a cada grupo.'
          ],
          image: '/instructivos/images/screenshot_comunidad_grupos.png',
          imageCaption: 'Grupos Comerciales • Catálogo de cuentas unificadas y cabezas de grupo.'
        },
        {
          title: '3. Planes y Costos (/comunidad?tab=planes)',
          desc: 'Catálogo oficial de abonos de telefonía:',
          points: [
            '• Configuración de planes para Claro, Movistar y Personal.',
            '• Detalle de gigabytes incluidos, costo pactado con la prestadora y costo mutual.',
            '• Botón "+ Nuevo Plan" para dar de alta planes actualizados.'
          ],
          image: '/instructivos/images/screenshot_comunidad_planes.png',
          imageCaption: 'Catálogo de Planes • Panel de abonos por prestadora, gigas y costos.'
        },
        {
          title: '4. Descuentos y Bonificaciones (/comunidad?tab=descuentos)',
          desc: 'Control de beneficios temporales y cuotas:',
          points: [
            '• Bonificaciones especiales con control de fecha de inicio y vencimiento.',
            '• Cargos por financiamiento de equipos celulares en cuotas fijas.',
            '• Sistema de alertas de vencimiento para dar de baja o renovar beneficios a término.'
          ],
          image: '/instructivos/images/screenshot_comunidad_descuentos.png',
          imageCaption: 'Descuentos y Bonificaciones • Monitor de cuotas y vencimientos.'
        }
      ]
    },
    {
      id: 'dashboard',
      title: 'Dashboard Principal, Log Diario & Tareas',
      componentName: 'Dashboard.jsx / LogDiario.jsx / Tareas.jsx',
      route: '/',
      icon: LayoutDashboard,
      color: '#ec4899',
      badge: 'Gestión Operativa',
      pdfUrl: '/instructivos/Instructivo_Inicio_Dashboard_Tareas.pdf',
      summary: 'Visión general de la mutual en tiempo real, bitácora de llamadas y contactos de WhatsApp, y tablero ágil de tickets con SLA.',
      explanation: 'Este conjunto de componentes permite monitorear el desempeño global de la Mutual, registrar la atención diaria que se le brinda a cada socio y resolver tareas de manera coordinada entre los colaboradores.',
      sections: [
        {
          title: '1. Dashboard Principal (/)',
          desc: 'Radiografía en tiempo real del estado de la Mutual:',
          points: [
            '• Métricas Financieras: Recaudación acumulada, facturación del mes corriente y cobros registrados.',
            '• Distribución de Líneas: Gráfico de torta con la cuota de mercado entre Claro, Movistar y Personal.',
            '• Comparativas Mensuales: Gráfico de barras de evolución de ingresos mes a mes.'
          ],
          image: '/instructivos/images/screenshot_dashboard.png',
          imageCaption: 'Dashboard Principal • Indicadores comerciales, métricas de recaudación y líneas.'
        },
        {
          title: '2. Log Diario de Contacto (/log-diario)',
          desc: 'Bitácora de atención al cliente y seguimiento de consultas:',
          points: [
            '• Permite registrar llamadas telefónicas, mensajes de WhatsApp y visitas a la sede.',
            '• Asocia el contacto al socio y al colaborador que lo atendió.',
            '• Búsqueda histórica por fecha o motivo de consulta.'
          ],
          image: '/instructivos/images/screenshot_log_diario.png',
          imageCaption: 'Log Diario • Bitácora de atención al socio y seguimiento de consultas.'
        },
        {
          title: '3. Tablero de Gestión de Tareas (/tareas)',
          desc: 'Control de solicitudes, reclamos y tiempos de respuesta (SLA):',
          points: [
            '• Gestión de tickets de reclamos de operadoras, bajas de líneas y compras de equipos.',
            '• Semáforo de prioridades (Alta, Media, Baja) y cálculo de SLA en tiempo real.',
            '• Asignación a colaboradores con notificaciones automáticas.'
          ],
          image: '/instructivos/images/screenshot_tareas.png',
          imageCaption: 'Tablero de Tareas • Gestión ágil de solicitudes y control de SLA.'
        }
      ]
    }
  ], []);

  // Filtrado por buscador
  const filteredGuides = useMemo(() => {
    if (!search.trim()) return componentGuides;
    const q = search.toLowerCase();

    return componentGuides.map(g => {
      const matchHeader = g.title.toLowerCase().includes(q) ||
                          g.summary.toLowerCase().includes(q) ||
                          g.componentName.toLowerCase().includes(q) ||
                          g.explanation.toLowerCase().includes(q);
      const matchSections = g.sections.filter(s => 
        s.title.toLowerCase().includes(q) ||
        s.desc.toLowerCase().includes(q) ||
        s.points.some(p => p.toLowerCase().includes(q)) ||
        (s.tip && s.tip.toLowerCase().includes(q)) ||
        (s.alert && s.alert.toLowerCase().includes(q))
      );

      if (matchHeader || matchSections.length > 0) {
        return {
          ...g,
          sections: matchSections.length > 0 ? matchSections : g.sections
        };
      }
      return null;
    }).filter(Boolean);
  }, [componentGuides, search]);

  const currentGuide = useMemo(() => {
    const found = filteredGuides.find(g => g.id === activeTab);
    return found || filteredGuides[0] || componentGuides[0];
  }, [filteredGuides, activeTab, componentGuides]);

  return (
    <div style={{ padding: '32px', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* ── HEADER PRINCIPAL ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '36px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span className="category-label">Manual de Operaciones & Guías</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700 }}>
              <Clock size={14} /> Instructivos Oficiales Mutual AUNAR
            </div>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
            Instructivos de Componentes
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginTop: '8px', fontWeight: 500, maxWidth: '800px' }}>
            Guía completa paso a paso sobre cómo utilizar cada pantalla, componente y herramienta del sistema (carga de facturas, auditoría, cobranzas, conciliación bancaria y comunicación).
          </p>
        </div>

        {/* Buscador de temas */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="search-bar" style={{ width: '360px' }}>
            <Search size={18} />
            <input 
              placeholder="Buscar por componente, función o paso..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── SELECTOR DE COMPONENTES (PILLS GRANDES) ── */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
          gap: '14px', 
          marginBottom: '36px' 
        }}
      >
        {filteredGuides.map(guide => {
          const Icon = guide.icon;
          const isSelected = guide.id === currentGuide.id;

          return (
            <button
              key={guide.id}
              onClick={() => setActiveTab(guide.id)}
              className="hover-lift"
              style={{
                padding: '18px 20px',
                borderRadius: '18px',
                border: isSelected 
                  ? `2px solid ${guide.color}` 
                  : '1px solid var(--border-light)',
                background: isSelected 
                  ? `linear-gradient(135deg, ${guide.color}15, var(--surface))` 
                  : 'var(--surface)',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: isSelected ? 'var(--shadow-soft)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <div 
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '14px',
                  background: isSelected ? guide.color : 'rgba(255,255,255,0.05)',
                  color: isSelected ? '#ffffff' : guide.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Icon size={22} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: isSelected ? 900 : 700, 
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {guide.title.split('&')[0].trim()}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'monospace' }}>
                  {guide.componentName.split('/')[0].trim()}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── CUERPO DEL INSTRUCTIVO SELECCIONADO ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        
        {/* Banner de Cabecera del Componente */}
        <div 
          className="bento-card"
          style={{
            padding: '28px 32px',
            borderRadius: '24px',
            background: `linear-gradient(135deg, ${currentGuide.color}18, var(--surface))`,
            border: `1px solid ${currentGuide.color}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '20px'
          }}
        >
          <div style={{ maxWidth: '820px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span 
                style={{
                  fontSize: '11px',
                  fontWeight: 900,
                  padding: '4px 10px',
                  borderRadius: '8px',
                  background: currentGuide.color,
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}
              >
                {currentGuide.badge}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                Archivo: {currentGuide.componentName}
              </span>
            </div>
            <h2 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 8px 0', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              {currentGuide.title}
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', margin: '0 0 6px 0', fontWeight: 600, lineHeight: 1.5 }}>
              {currentGuide.summary}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              {currentGuide.explanation}
            </p>
          </div>

          {/* Botones de Acción */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {currentGuide.pdfUrl && (
              <a 
                href={currentGuide.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="hover-lift"
                style={{
                  height: '44px',
                  padding: '0 18px',
                  borderRadius: '14px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textDecoration: 'none'
                }}
              >
                <Download size={16} /> Descargar PDF Oficial
              </a>
            )}
            <button 
              onClick={() => navigate(currentGuide.route)}
              className="hover-lift"
              style={{
                height: '44px',
                padding: '0 20px',
                borderRadius: '14px',
                border: 'none',
                background: currentGuide.color,
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              Abrir Componente en el Sistema <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Pasos y Guías Visuales */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {currentGuide.sections.map((section, idx) => (
            <div 
              key={idx}
              className="bento-card"
              style={{
                padding: '28px 32px',
                borderRadius: '20px',
                border: '1px solid var(--border-light)',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
              }}
            >
              {/* Título de la sección */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span 
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '12px',
                    background: `${currentGuide.color}22`,
                    color: currentGuide.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '15px',
                    fontWeight: 900,
                    flexShrink: 0
                  }}
                >
                  {idx + 1}
                </span>
                <div>
                  <h3 style={{ fontSize: '19px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                    {section.title}
                  </h3>
                  {section.desc && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0', fontWeight: 500 }}>
                      {section.desc}
                    </p>
                  )}
                </div>
              </div>

              {/* Puntos y viñetas explicativas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '50px' }}>
                {section.points.map((p, pIdx) => (
                  <div 
                    key={pIdx}
                    style={{
                      fontSize: '14px',
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

              {/* Alertas / Consejos */}
              {section.alert && (
                <div 
                  style={{
                    marginLeft: '50px',
                    padding: '14px 18px',
                    borderRadius: '14px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    color: '#f87171',
                    fontSize: '13px',
                    fontWeight: 600,
                    lineHeight: 1.5
                  }}
                >
                  <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>{section.alert}</div>
                </div>
              )}

              {section.tip && (
                <div 
                  style={{
                    marginLeft: '50px',
                    padding: '14px 18px',
                    borderRadius: '14px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    color: '#60a5fa',
                    fontSize: '13px',
                    lineHeight: 1.5
                  }}
                >
                  <Info size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div><strong>Consejo operativo:</strong> {section.tip}</div>
                </div>
              )}

              {/* Captura de Pantalla Interactiva con Zoom */}
              {section.image && (
                <div style={{ marginLeft: '50px', marginTop: '6px' }}>
                  <div 
                    onClick={() => setLightboxImg({ src: section.image, caption: section.imageCaption })}
                    className="hover-lift"
                    style={{
                      position: 'relative',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      border: '1px solid var(--border-light)',
                      cursor: 'pointer',
                      background: 'rgba(0, 0, 0, 0.2)',
                      maxHeight: '300px'
                    }}
                  >
                    <img 
                      src={section.image} 
                      alt={section.title}
                      style={{
                        width: '100%',
                        height: '280px',
                        objectFit: 'cover',
                        objectPosition: 'top',
                        display: 'block'
                      }}
                    />
                    <div 
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 60%)',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        color: '#ffffff'
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>
                        {section.imageCaption || 'Clic para ampliar captura'}
                      </span>
                      <span 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: 'rgba(255,255,255,0.2)',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          backdropFilter: 'blur(6px)'
                        }}
                      >
                        <ZoomIn size={14} /> Ampliar Captura
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── LIGHTBOX PARA VISUALIZAR CAPTURAS COMPLETAS ── */}
      {lightboxImg && (
        <div 
          onClick={() => setLightboxImg(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
            background: 'rgba(10, 12, 18, 0.94)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
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
              background: 'rgba(255, 255, 255, 0.15)',
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
              boxShadow: '0 25px 60px rgba(0,0,0,0.9)',
              objectFit: 'contain'
            }}
            onClick={(e) => e.stopPropagation()}
          />
          {lightboxImg.caption && (
            <div 
              style={{
                marginTop: '18px',
                color: '#f8fafc',
                fontSize: '15px',
                fontWeight: 700,
                textAlign: 'center',
                maxWidth: '900px'
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
