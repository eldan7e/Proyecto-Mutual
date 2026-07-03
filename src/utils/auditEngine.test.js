import { procesarClaro, procesarPersonal } from './providerProcessors';
import { calculateInvoiceTotals } from './auditEngine';

describe('Audit Engine & Provider Processors Edge Cases', () => {

  // Edge case 1: procesarClaro - Ignoring header, empty lines, and totals
  test('procesarClaro ignores header, empty lines, and "total por linea"', () => {
    const mockLines = [
      'NUMERO\tPLAN\tABONO\tEXCEDENTE', // Header
      '', // Empty
      '2215554444\t\tPlan A\t1000\t\t0\t0\t0\t0\t0\t0\t0', // Valid line with 12+ parts
      'TOTAL POR LINEA\t\t\t5000\t0' // Should be ignored
    ];

    const result = procesarClaro(mockLines);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].telefono).toBe('2215554444');
    expect(result.lines[0].plan).toBe('Plan A');
  });

  // Edge case 2: procesarPersonal - Combinations of lines and "CARGOSDELMES"
  test('procesarPersonal handles loose lines and multiple CARGOSDELMES', () => {
    const mockLines = [
      'LINEA MÓVIL (221) 555-4444 $ 1.500,00',
      'CARGOS DEL MES Cant.',
      'INTERNET $ 500,00', // Should be combined later or handled as INTERNET
      'TOTAL CARGOS DEL MES $ 2.000,00',
      'LINEA MÓVIL 2216667777 $ 3.000,00'
    ];

    const result = procesarPersonal(mockLines);
    expect(result.lines.length).toBeGreaterThan(0);
    const line1 = result.lines.find(l => l.telefono.includes('2215554444'));
    const line2 = result.lines.find(l => l.telefono.includes('2216667777'));
    expect(line1).toBeDefined();
    expect(line2).toBeDefined();
  });

  // Edge case 3: calculateInvoiceTotals - Global extras without phones
  test('calculateInvoiceTotals calculates global extras without phone numbers', () => {
    const rawData = 'Bono Adicional sin linea $ 500,00\nTotal Factura $ 1500,00';
    const lines = rawData.split('\n');
    const finalResults = [
      { telefono: '2215554444', montoStr: '1000.00' }
    ];
    const response = { invoiceTotal: 0, invoiceTax: 0 };
    const selectedProvider = 'claro';

    // Mock getParserByProvider via an object if needed, or rely on its internal import 
    // since we're directly calling calculateInvoiceTotals.

    const result = calculateInvoiceTotals(rawData, lines, finalResults, response, selectedProvider);
    
    // 1000 from finalResults + 500 global = 1500 subtotal
    expect(result.subtotalLines).toBe(1500);
    // Claro uses subtotalLines if invoiceTotalDetected is 0
    expect(result.total).toBe(1500);
  });
});
