import { createClient } from '@supabase/supabase-js';
import { calculateAuditLine } from './auditEngine.js';
import xlsx from 'xlsx';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kmdxikpfxvowbqqqnjyq.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) throw new Error("Need VITE_SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching data from DB...");
  const { data: consumos, error } = await supabase
    .from('consumos_mensuales')
    .select(`*, lineas(*, socios(*), planes_abonos(*))`)
    .eq('periodo', '2026-02');
    
  if (error) throw error;
  const movistarLines = consumos.filter(c => c.lineas.proveedor_id === 2);
  console.log(`Found ${movistarLines.length} Movistar lines in DB.`);

  // Load config
  const { data: configData } = await supabase.from('periodos_config').select('*').eq('periodo', '2026-02').eq('proveedor_id', 2).single();
  const { data: providerInfo } = await supabase.from('proveedores').select('*').eq('proveedor_id', 2).single();
  
  const auditLines = movistarLines.map(c => calculateAuditLine(c, c.lineas, {
    providerId: 2,
    period: '2026-02',
    adicionales: []
  }, providerInfo || {}));

  console.log("Reading Excel...");
  const path = 'C:/Users/dante/OneDrive/Escritorio/carga pagina/.streamlit/MOV EXCELS 2026/MOVISTAR (02) (VTO MARZO 2026).xlsx';
  const wb = xlsx.readFile(path);
  const sheet = wb.Sheets['SOCIOS'];
  const excelData = xlsx.utils.sheet_to_json(sheet, {header: 1});
  
  let excelTotal = 0;
  let dbTotal = 0;
  let mismatches = [];

  for(let i=1; i<excelData.length; i++) {
    const row = excelData[i];
    if(row[0] === 'MOVISTAR') {
      const linea = row[3];
      let expectedAunar = parseFloat(row[5]);
      if (isNaN(expectedAunar)) expectedAunar = 0;
      excelTotal += expectedAunar;
      
      const dbLine = auditLines.find(a => Number(a.numero_linea) === Number(linea));
      if (!dbLine) {
        console.log(`MISSING IN DB: Linea ${linea} - Excel says $${expectedAunar}`);
        continue;
      }
      
      const calcAunar = dbLine.calculado.totalCobrar;
      dbTotal += calcAunar;
      
      const diff = Math.abs(calcAunar - expectedAunar);
      if (diff > 1) {
        mismatches.push({
          linea,
          name: row[2],
          excel: expectedAunar,
          db: calcAunar,
          diff: calcAunar - expectedAunar
        });
      }
    }
  }
  
  console.log("=====================================");
  console.log(`EXCEL TOTAL: $${excelTotal.toFixed(2)}`);
  console.log(`DB TOTAL:    $${dbTotal.toFixed(2)}`);
  console.log("=====================================");
  console.log(`FOUND ${mismatches.length} MISMATCHES > $1`);
  
  mismatches.sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 15).forEach(m => {
    console.log(`${m.linea} (${m.name}): Excel=$${m.excel.toFixed(2)} | DB=$${m.db.toFixed(2)} | Diff=$${m.diff.toFixed(2)}`);
  });
}

run();
