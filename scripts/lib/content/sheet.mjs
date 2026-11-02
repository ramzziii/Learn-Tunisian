// Reading and writing the content spreadsheets (CSV or XLSX). Every value is
// read as text exactly as typed — nothing is trimmed or corrected here;
// validation reports problems instead of fixing them.
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

/** Excel shows Arabic correctly in a UTF-8 CSV only with a byte-order mark. */
const BOM = '\uFEFF';
/** Cells starting with these are formulas in Excel; written with a leading apostrophe and read back without it. */
const FORMULA_START = /^[=+@]/;

/** Parses CSV text (quotes, doubled quotes, commas and newlines inside quotes, CRLF, a leading BOM). */
export function parseCsv(text) {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((v) => (v.startsWith("'") && FORMULA_START.test(v.slice(1)) ? v.slice(1) : v)));
}

/** CSV text for rows of strings, with a BOM; formula-like cells are neutralised for Excel. */
export function toCsv(rows) {
  const cell = (value) => {
    let v = value === null || value === undefined ? '' : String(value);
    if (FORMULA_START.test(v)) v = `'${v}`;
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return BOM + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export async function writeCsv(path, header, records) {
  await writeFile(path, toCsv([header, ...records.map((r) => header.map((h) => r[h] ?? ''))]), 'utf8');
}

/**
 * Reads a .csv or .xlsx table: the header row, then one record per non-empty
 * row with its spreadsheet row number (the header is row 1). For a workbook,
 * the "Lesson Content" sheet if there is one, otherwise the first sheet.
 */
export async function readTable(path) {
  const ext = extname(path).toLowerCase();
  let matrix;
  if (ext === '.csv') {
    matrix = parseCsv(await readFile(path, 'utf8'));
  } else if (ext === '.xlsx') {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const sheet = workbook.getWorksheet('Lesson Content') ?? workbook.worksheets[0];
    if (!sheet) throw new Error('The workbook has no sheets.');
    matrix = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values = [];
      for (let c = 1; c <= sheet.columnCount; c++) values.push(row.getCell(c).text ?? '');
      matrix[rowNumber - 1] = values;
    });
    for (let i = 0; i < matrix.length; i++) matrix[i] = matrix[i] ?? [];
  } else {
    throw new Error(`Unsupported file type "${ext}": use .csv or .xlsx.`);
  }
  if (matrix.length === 0) throw new Error('The file is empty.');
  const header = matrix[0].map((h) => String(h ?? '').trim());
  const records = [];
  for (let i = 1; i < matrix.length; i++) {
    const values = matrix[i];
    if (values.every((v) => String(v ?? '').trim() === '')) continue;
    const record = {};
    header.forEach((h, c) => {
      if (h) record[h] = String(values[c] ?? '');
    });
    records.push({ rowNumber: i + 1, values: record });
  }
  return { header, records };
}
