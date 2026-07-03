import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Afip from "npm:afip.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { denominacion_receptor, imp_total, tipo } = await req.json();

    const CUIT = Deno.env.get('AFIP_CUIT');
    const PRODUCTION = Deno.env.get('AFIP_PRODUCTION') === 'true';

    // MODO MOCK: Si no hay CUIT configurado, devuelve un CAE ficticio
    if (!CUIT) {
      console.log("Running in MOCK mode");
      await new Promise(resolve => setTimeout(resolve, 1000));
      return new Response(JSON.stringify({
        cae: "74" + Math.floor(Math.random() * 1000000000000),
        vencimiento: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        nro_comprobante: Math.floor(Math.random() * 10000),
        status: "success"
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // MODO REAL: Requiere AFIP_CERT y AFIP_KEY en los Secrets de Supabase
    const afip = new Afip({ 
      CUIT: parseInt(CUIT),
      production: PRODUCTION,
      cert: Deno.env.get('AFIP_CERT'), 
      key: Deno.env.get('AFIP_KEY')
    });

    const cbteTipo = tipo.includes('B') ? 6 : 11;
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(1, cbteTipo);
    const nextVoucher = lastVoucher + 1;

    const data = {
      'CantReg': 1,
      'PtoVta': 1,
      'CbteTipo': cbteTipo,
      'Concepto': 1,
      'DocTipo': 99,
      'DocNro': 0,
      'CbteDesde': nextVoucher,
      'CbteHasta': nextVoucher,
      // Calculate Argentina local date (UTC-3)
      'CbteFch': (() => {
        const formatter = new Intl.DateTimeFormat('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const parts = formatter.formatToParts(new Date());
        const year = parts.find(p => p.type === 'year')?.value || '';
        const month = parts.find(p => p.type === 'month')?.value || '';
        const day = parts.find(p => p.type === 'day')?.value || '';
        return parseInt(`${year}${month}${day}`);
      })(),
      'ImpTotal': imp_total,
      'ImpTotConc': 0,
      'ImpNeto': imp_total,
      'ImpOpEx': 0,
      'ImpIVA': 0,
      'ImpTrib': 0,
      'MonId': 'PES',
      'MonCotiz': 1,
    };

    const res = await afip.ElectronicBilling.createVoucher(data);

    return new Response(JSON.stringify({
      cae: res.CAE,
      vencimiento: res.CAEFchVto,
      nro_comprobante: nextVoucher,
      status: "success"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
