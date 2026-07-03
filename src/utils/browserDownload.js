/**
 * Escapes a CSV field to prevent CSV injection and column shifting.
 * @param {any} field
 * @returns {string}
 */
function escapeCSVField(field) {
  if (field === null || field === undefined) return '';
  const str = String(field);
  const needsEscaping = /[;\r\n",]/.test(str);
  
  if (!needsEscaping) return str;
  
  // Escape double quotes by doubling them
  const escapedStr = str.replace(/"/g, '""');
  // Wrap in double quotes
  return `"${escapedStr}"`;
}

/**
 * Generic CSV exporter with BOM, semicolon delimiter, Blob creation, and auto-download.
 * @param {string[]} headers - Column header labels
 * @param {Array<Array<any>>} rows - Array of row arrays
 * @param {string} filename - Download filename (should end in .csv)
 */
export function exportToCSV(headers, rows, filename) {
  const safeHeaders = headers.map(escapeCSVField).join(";");
  const safeRows = rows.map(row => row.map(escapeCSVField).join(";")).join("\n");
  
  const csvContent = "\uFEFF" + [safeHeaders, safeRows].join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
