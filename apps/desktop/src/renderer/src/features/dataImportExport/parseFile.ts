import * as XLSX from 'xlsx';

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, unknown>[];
}

// Reads the first sheet of an uploaded .xlsx/.xls/.csv file into raw
// header/row data — no field-schema knowledge here, that's applied one
// layer up (the column-mapping UI + resolveImportRow) so this stays a
// dumb, reusable "read a spreadsheet" utility.
export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[firstSheetName];
  // header: 1 -> array-of-arrays so we can read the literal header row
  // ourselves rather than trusting sheet_to_json's auto-dedup of blank/
  // duplicate headers, which would otherwise silently rename columns.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  if (aoa.length === 0) return { headers: [], rows: [] };

  const headers = aoa[0].map((h) => String(h ?? '').trim());
  const rows = aoa.slice(1).map((line) => {
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      row[h] = line[i] ?? '';
    });
    return row;
  });

  return { headers, rows };
}
