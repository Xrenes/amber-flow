import React, { useMemo, useState } from 'react';
import {
  listTaskFieldOptions,
  buildAgentLookup,
  resolveImportRow,
  FIELD_SCHEMAS,
  DATA_TYPE_LABELS,
  type ImportExportDataType,
  type ResolvedImportRow,
} from '@amber-flow/shared';
import type { Profile } from '@amber-flow/shared';
import { parseSpreadsheetFile, type ParsedSheet } from './parseFile';
import { executeImport } from './executeImport';
import styles from './ImportWizard.module.css';

interface Props {
  dataType: ImportExportDataType;
  profiles: Profile[];
  onClose: () => void;
  onImported: () => void;
}

type Step = 'upload' | 'map' | 'preview' | 'done';

const MAPPING_STORAGE_PREFIX = 'amberflow.importMapping.';

function loadSavedMapping(dataType: ImportExportDataType): Record<string, string> {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_PREFIX + dataType);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMapping(dataType: ImportExportDataType, mapping: Record<string, string>) {
  try {
    localStorage.setItem(MAPPING_STORAGE_PREFIX + dataType, JSON.stringify(mapping));
  } catch {
    /* best-effort */
  }
}

// Upload -> map columns -> preview (resolved rows + skip reasons) -> confirm
// -> write. The column-mapping step is what makes this work with ANY
// spreadsheet shape (the user's own headers, not just an Amber Flow
// template) — each app field is matched to one of the uploaded file's
// actual columns, remembered per data type via localStorage so repeat
// imports of the same recurring file shape don't need remapping.
export default function ImportWizard({ dataType, profiles, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>(() => loadSavedMapping(dataType));
  const [resolved, setResolved] = useState<ResolvedImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const fields = FIELD_SCHEMAS[dataType];

  async function handleFileSelected(file: File) {
    setFileError(null);
    try {
      const result = await parseSpreadsheetFile(file);
      if (result.rows.length === 0) {
        setFileError('No data rows found in that file.');
        return;
      }
      setParsed(result);
      // Pre-fill mapping: prefer the saved mapping where the column still
      // exists in this file; otherwise try an exact label match.
      const saved = loadSavedMapping(dataType);
      const next: Record<string, string> = {};
      fields.forEach((f) => {
        if (saved[f.key] && result.headers.includes(saved[f.key])) {
          next[f.key] = saved[f.key];
        } else {
          const exact = result.headers.find((h) => h.toLowerCase() === f.label.toLowerCase());
          if (exact) next[f.key] = exact;
        }
      });
      setMapping(next);
      setStep('map');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  async function handleMappingConfirmed() {
    if (!parsed) return;
    saveMapping(dataType, mapping);

    const [campaignRes] = await Promise.all([listTaskFieldOptions('campaign')]);
    const campaigns = new Set((campaignRes.data || []).map((o) => o.value.toLowerCase()));
    const agents = buildAgentLookup(profiles);

    const results = parsed.rows.map((row, idx) => {
      // Re-key the raw row from the uploaded file's own headers to the
      // app's field keys, per the mapping the user just confirmed.
      const reKeyed: Record<string, unknown> = {};
      fields.forEach((f) => {
        const sourceHeader = mapping[f.key];
        reKeyed[f.key] = sourceHeader ? row[sourceHeader] : undefined;
      });
      return resolveImportRow(idx + 2, reKeyed, fields, agents, campaigns); // +2: header row is row 1
    });

    setResolved(results);
    setStep('preview');
  }

  const okRows = useMemo(() => resolved.filter((r) => !r.error), [resolved]);
  const errorRows = useMemo(() => resolved.filter((r) => r.error), [resolved]);

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    const { error } = await executeImport(dataType, okRows);
    setImporting(false);
    if (error) {
      setImportError(error.message);
      return;
    }
    setStep('done');
    onImported();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Import {DATA_TYPE_LABELS[dataType]}</div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {step === 'upload' && (
            <div className={styles.uploadStep}>
              <p className={styles.hint}>
                Upload a .xlsx, .xls, or .csv file. Any column layout works — you'll match your file's columns to
                Amber Flow's fields on the next step.
              </p>
              <label className={styles.fileDrop}>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                  }}
                />
                Choose a file…
              </label>
              {fileError && <p className={styles.errorText}>{fileError}</p>}
            </div>
          )}

          {step === 'map' && parsed && (
            <div>
              <p className={styles.hint}>Match each Amber Flow field to a column from your file.</p>
              <div className={styles.mappingGrid}>
                {fields.map((f) => (
                  <div key={f.key} className={styles.mappingRow}>
                    <div className={styles.mappingLabel}>
                      {f.label}
                      {f.required && <span className={styles.required}>*</span>}
                      {f.hint && <span className={styles.fieldHint}>{f.hint}</span>}
                    </div>
                    <select
                      value={mapping[f.key] || ''}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    >
                      <option value="">— Not mapped —</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className={styles.actions}>
                <button className={styles.ghostBtn} onClick={() => setStep('upload')}>
                  Back
                </button>
                <button
                  className={styles.primaryBtn}
                  onClick={handleMappingConfirmed}
                  disabled={fields.some((f) => f.required && !mapping[f.key])}
                >
                  Preview Import
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div>
              <div className={styles.summaryRow}>
                <div className={styles.summaryChip}>
                  <span className={styles.summaryOk}>{okRows.length}</span> will be imported
                </div>
                {errorRows.length > 0 && (
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryError}>{errorRows.length}</span> will be skipped
                  </div>
                )}
              </div>

              {errorRows.length > 0 && (
                <div className={styles.errorList}>
                  {errorRows.slice(0, 50).map((r) => (
                    <div key={r.rowNumber} className={styles.errorItem}>
                      Row {r.rowNumber}: {r.error}
                    </div>
                  ))}
                  {errorRows.length > 50 && <div className={styles.errorItem}>…and {errorRows.length - 50} more</div>}
                </div>
              )}

              {importError && <p className={styles.errorText}>{importError}</p>}

              <div className={styles.actions}>
                <button className={styles.ghostBtn} onClick={() => setStep('map')}>
                  Back
                </button>
                <button className={styles.primaryBtn} onClick={handleImport} disabled={importing || okRows.length === 0}>
                  {importing ? 'Importing…' : `Import ${okRows.length} row${okRows.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className={styles.doneStep}>
              <p className={styles.hint}>
                Imported {okRows.length} row{okRows.length === 1 ? '' : 's'}
                {errorRows.length > 0 ? `, skipped ${errorRows.length}.` : '.'}
              </p>
              <button className={styles.primaryBtn} onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
