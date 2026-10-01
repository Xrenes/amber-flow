import React, { useState } from 'react';
import { DATA_TYPE_LABELS, type ImportExportDataType } from '@amber-flow/shared';
import { listAgentGoals } from '@amber-flow/shared';
import type { AdminData } from './useAdminData';
import { exportDataType } from '../dataImportExport/exportData';
import ImportWizard from '../dataImportExport/ImportWizard';
import styles from './DataImportExportTab.module.css';

interface Props {
  data: AdminData;
  onImported: () => void;
}

const DATA_TYPES: ImportExportDataType[] = ['appointments', 'timeSessions', 'agentGoals'];

const ICONS: Record<ImportExportDataType, React.ReactNode> = {
  appointments: (
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  timeSessions: (
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  agentGoals: (
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
    </svg>
  ),
};

// Generic bulk import/export for any of Amber Flow's core data types —
// export downloads the current data as .xlsx (also usable as a fill-in
// template); import accepts any spreadsheet shape via a column-mapping step
// (see ImportWizard.tsx), so it isn't tied to the exported file's exact
// layout.
export default function DataImportExportTab({ data, onImported }: Props) {
  const [importingType, setImportingType] = useState<ImportExportDataType | null>(null);

  async function handleExport(dataType: ImportExportDataType) {
    const { data: goals } = await listAgentGoals();
    exportDataType(dataType, {
      appointments: data.appointments,
      timeSessions: data.sessions,
      agentGoals: goals || [],
      profiles: data.profiles,
    });
  }

  return (
    <div>
      <p className={styles.intro}>
        Export any data type to a spreadsheet, or import one — any column layout works, you'll match your file's
        columns to Amber Flow's fields before anything is written.
      </p>
      <div className={styles.grid}>
        {DATA_TYPES.map((dt) => (
          <div key={dt} className={styles.card}>
            <div className={styles.cardIcon}>{ICONS[dt]}</div>
            <div className={styles.cardBody}>
              <div className={styles.cardTitle}>{DATA_TYPE_LABELS[dt]}</div>
            </div>
            <div className={styles.cardActions}>
              <button className={styles.ghostBtn} onClick={() => handleExport(dt)}>
                Export
              </button>
              <button className={styles.primaryBtn} onClick={() => setImportingType(dt)}>
                Import
              </button>
            </div>
          </div>
        ))}
      </div>

      {importingType && (
        <ImportWizard
          dataType={importingType}
          profiles={data.profiles}
          onClose={() => setImportingType(null)}
          onImported={onImported}
        />
      )}
    </div>
  );
}
