import React from 'react';
import Dropdown from '../../components/Dropdown';
import styles from './AdminToolbar.module.css';

export interface SortOption {
  key: string;
  label: string;
}

interface Props {
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  sortOptions: SortOption[];
  sortValue: string;
  onSortChange: (v: string) => void;
  filterOptions: { key: string; label: string }[];
  filterValue: string;
  onFilterChange: (v: string) => void;
}

// Search + sort + filter toolbar, styled after a reference CRM layout —
// used above list/table views (Appointments, Tasks) in place of a bare
// filter-chip row.
export default function AdminToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  sortOptions,
  sortValue,
  onSortChange,
  filterOptions,
  filterValue,
  onFilterChange,
}: Props) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.searchField}>
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className={styles.selectField}>
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
        </svg>
        <Dropdown
          variant="bare"
          value={sortValue}
          onChange={onSortChange}
          options={sortOptions.map((opt) => ({ value: opt.key, label: opt.label }))}
        />
      </div>

      <div className={styles.selectField}>
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <Dropdown
          variant="bare"
          value={filterValue}
          onChange={onFilterChange}
          options={filterOptions.map((opt) => ({ value: opt.key, label: opt.label }))}
        />
      </div>
    </div>
  );
}
