# Aunar - Sistema de Gestión de Deuda, Facturación y Conciliación Bancaria

Aunar es una plataforma web completa desarrollada para la gestión administrativa y financiera de asociaciones mutuales. El sistema centraliza la administración de líneas telefónicas corporativas (Claro, Movistar, Personal), la facturación mensual por grupos de socios, el control consolidado de deuda, la conciliación automática de extractos bancarios y la emisión automatizada de comprobantes de AFIP.

Este proyecto ha sido diseñado bajo exigentes estándares de arquitectura de software frontend, priorizando la separación de responsabilidades, la optimización del rendimiento en conjuntos de datos a gran escala y una experiencia de usuario premium con estética **Glassmorphism**.

---

## 🚀 Módulos Principales

### 1. 📊 Gestión de Deuda Consolidada
* **Paginación del Lado del Servidor**: Optimización mediante consultas por rango (`.range()`) de Supabase para manejar eficientemente miles de registros históricos sin degradación de memoria.
* **Consolidación por Grupos**: Agrupamiento inteligente de liquidaciones por grupo familiar/responsable.
* **KPIs Financieros Globales**: Indicadores dinámicos de recaudación (Total Facturado, Total Cobrado, Deuda Pendiente, Tasa de Cobro) calculados en tiempo real.
* **Edición Manual Auditada**: Modal de conciliación manual para ajustar abonos y estados, generando un registro inmutable en el log de auditoría.

### 2. 🧾 Facturación y Lotes
* **Historial de Lotes**: Administración de subidas masivas por período y operadora, con soporte para eliminación en cascada de consumos asociados.
* **Caché y Sincronización Server-State**: Implementación de **React Query** (`useQuery` y `useMutation`) para optimizar tiempos de respuesta, evitar peticiones redundantes e invalidar cachés tras mutaciones de datos.
* **Auditoría de Socios**: Detalle analítico por socio con desglose de abonos base, cargos excedentes y bonificaciones manuales.

### 3. 🏦 Conciliación Bancaria
* **Parser de Extractos**: Procesamiento y mapeo automático de texto plano copiado directamente de extractos de bancos nacionales (Credicoop, Banco Nación, etc.).
* **Asociación de Cobros**: Algoritmo inteligente de coincidencia cruzada de importes y conceptos para vincular transferencias bancarias con las liquidaciones correspondientes.
* **Registro de Auditoría**: Generación automática de logs para cada acción de conciliación.

### 4. 🎯 Panel de Tareas y SLA (Service Level Agreement)
* **Monitoreo SLA Visual**: Barras de progreso dinámicas con código de colores (verde/naranja/rojo) según la urgencia y el tiempo restante de resolución.
* **Métricas Circulares**: KPI de porcentaje de cumplimiento SLA renderizado mediante un componente de progreso circular SVG animado.
* **Avatares Dinámicos**: Generación automática de iniciales de colaboradores con colores de fondo basados en un hash único de su correo electrónico.
* **Tiempos Relativos**: Conversión de marcas de tiempo a formato relativo amigable (p. ej., *"hace 2 horas"*, *"ayer"*).

---

## 🛠️ Tecnologías y Librerías

* **Frontend**: React (Vite), React Router DOM (Manejo de rutas dinámicas).
* **Manejo de Estado del Servidor**: `@tanstack/react-query` (Caché, sincronización automática y reintentos).
* **Base de Datos y Backend**: **Supabase** (Autenticación de usuarios, Base de Datos PostgreSQL, Canal de Suscripción Realtime para actualizaciones automáticas y Edge Functions en Deno).
* **Integraciones**: SDK de AFIP (`afip.js`) integrado en Edge Functions para facturación electrónica en entornos mock y producción.
* **Diseño**: CSS Glassmorphism personalizado con variables HSL adaptables a temas claro/oscuro, micro-animaciones en CSS nativo y Lucide Icons.

---

## 📐 Decisiones de Arquitectura y Buenas Prácticas

1. **Capa de Servicios Desacoplada (`src/services/`)**: Toda la interacción con la base de datos de Supabase está aislada en servicios independientes (`conciliacionService.js`, `liquidacionService.js`, `facturacionService.js`). Esto facilita la mantenibilidad y la escritura de pruebas unitarias.
2. **Hooks Personalizados (`src/hooks/`)**: Abstracción de lógica compleja de componentes en hooks reutilizables como `usePagination.js`, `useTableFilters.js`, `useFacturacionData.js` y `useDebounce.js`.
3. **Memoización (`React.memo` / `useMemo`)**: Optimización de renders en componentes que muestran listados extensos de información (como `GroupRow` en gestión de deuda) para garantizar una tasa de refresco fluida de 60fps.
4. **Validadores y Formateadores Centralizados (`src/utils/`)**: Métodos estandarizados para monedas, números de teléfono, correos electrónicos, CUITs, CBU y DNI en archivos únicos para evitar duplicidad de lógica.
5. **Seguridad e Ignorado Estratégico**: Configuración estricta en `.gitignore` para asegurar que claves privadas de AFIP, credenciales de entorno y bases de datos locales en formato `.json` o `.csv` nunca sean expuestas en el repositorio público.

---

## 💻 Instalación y Configuración Local

1. Clona el repositorio:
   ```bash
   git clone https://github.com/eldan7e/Proyecto-Mutual.git
   cd Proyecto-Mutual
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Crea un archivo `.env` en la raíz del proyecto basándote en la siguiente plantilla:
   ```env
   VITE_SUPABASE_URL=tu-url-de-supabase
   VITE_SUPABASE_ANON_KEY=tu-clave-anonima-de-supabase
   ```

4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
