// Reading and writing sheets: CSV quoting, Arabic, a byte-order mark for
// Excel, formula-like cells neutralised and read back unchanged, and .xlsx
// read from the "Lesson Content" sheet with row numbers.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseCsv, readTable, toCsv } from '../lib/content/sheet.mjs';

describe('CSV', () => {
  it('round-trips commas, quotes, new lines, Arabic and formula-like cells', () => {
    const rows = [['a', 'b,c', 'say "hi"'], ['line\nbreak', 'عيشك', '=1+1'], ['@x', '+y', '-z']];
    const text = toCsv(rows);
    assert.ok(text.startsWith(String.fromCharCode(0xfeff)), 'BOM so Excel reads UTF-8 Arabic');
    assert.ok(text.includes("'=1+1"), 'formula neutralised for Excel');
    assert.deepEqual(parseCsv(text), rows);
  });

  it('reads CRLF files', () => {
    assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  });
});

describe('readTable', () => {
  it('CSV: header, then records with their spreadsheet row numbers; blank rows skipped', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'lt-sheet-')), 'x.csv');
    await writeFile(file, 'unit,lesson_number\nGreetings,9\n,\nFood,17\n', 'utf8');
    const { header, records } = await readTable(file);
    assert.deepEqual(header, ['unit', 'lesson_number']);
    assert.deepEqual(records, [
      { rowNumber: 2, values: { unit: 'Greetings', lesson_number: '9' } },
      { rowNumber: 4, values: { unit: 'Food', lesson_number: '17' } },
    ]);
  });

  it('XLSX: the "Lesson Content" sheet, numbers read as text', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('READ ME').addRow(['notes only']);
    const sheet = wb.addWorksheet('Lesson Content');
    sheet.addRow(['unit', 'lesson_number', 'word_arabic']);
    sheet.addRow(['Greetings', 9, 'أسلامة']);
    const file = join(await mkdtemp(join(tmpdir(), 'lt-sheet-')), 'x.xlsx');
    await wb.xlsx.writeFile(file);
    const { header, records } = await readTable(file);
    assert.deepEqual(header, ['unit', 'lesson_number', 'word_arabic']);
    assert.deepEqual(records, [{ rowNumber: 2, values: { unit: 'Greetings', lesson_number: '9', word_arabic: 'أسلامة' } }]);
  });

  it('other file types are refused', async () => {
    await assert.rejects(readTable('words.txt'), /use .csv or .xlsx/);
  });
});
