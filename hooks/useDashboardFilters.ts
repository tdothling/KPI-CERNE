import { useMemo, useState, useCallback } from 'react';
import { ProjectFile, Discipline, Status, ProjectPhase } from '../types';
import { parseISO, isValid, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

export interface DashboardFilterState {
  clients: string[];
  disciplines: Discipline[];
  phases: ProjectPhase[];
  statuses: Status[];
  dateFrom: string; // ISO string or ''
  dateTo: string;   // ISO string or ''
}

const INITIAL_FILTER_STATE: DashboardFilterState = {
  clients: [],
  disciplines: [],
  phases: [],
  statuses: [],
  dateFrom: '',
  dateTo: '',
};

export function useDashboardFilters(allProjects: ProjectFile[]) {
  const [filters, setFilters] = useState<DashboardFilterState>(INITIAL_FILTER_STATE);

  // Derived: count active filters (arrays with items + filled date fields)
  const activeFilterCount = useMemo(() => {
    return (
      filters.clients.length +
      filters.disciplines.length +
      filters.phases.length +
      filters.statuses.length +
      (filters.dateFrom ? 1 : 0) +
      (filters.dateTo ? 1 : 0)
    );
  }, [filters]);

  // Derived: filtered projects — pure derivation during render, no useEffect
  const filteredProjects = useMemo(() => {
    return allProjects.filter(p => {
      // Client filter
      if (filters.clients.length > 0 && !filters.clients.includes(p.client)) return false;
      // Discipline filter
      if (filters.disciplines.length > 0 && !filters.disciplines.includes(p.discipline)) return false;
      // Phase filter
      if (filters.phases.length > 0) {
        const pPhase = p.phase ?? ProjectPhase.EXECUTIVE;
        if (!filters.phases.includes(pPhase)) return false;
      }
      // Status filter
      if (filters.statuses.length > 0 && !filters.statuses.includes(p.status)) return false;
      // Date range (startDate)
      if (filters.dateFrom && p.startDate && isValid(parseISO(p.startDate))) {
        if (parseISO(p.startDate) < startOfDay(parseISO(filters.dateFrom))) return false;
      }
      if (filters.dateTo && p.startDate && isValid(parseISO(p.startDate))) {
        if (parseISO(p.startDate) > endOfDay(parseISO(filters.dateTo))) return false;
      }
      return true;
    });
  }, [allProjects, filters]);

  // Derived: unique client list from all projects
  const availableClients = useMemo(
    () => Array.from(new Set(allProjects.map(p => p.client))).sort(),
    [allProjects]
  );

  const clearAllFilters = useCallback(() => setFilters(INITIAL_FILTER_STATE), []);

  const toggleMulti = useCallback(<T,>(key: keyof DashboardFilterState, value: T) => {
    setFilters(prev => {
      const current = prev[key] as T[];
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }, []);

  const setDateFrom = useCallback((v: string) => setFilters(prev => ({ ...prev, dateFrom: v })), []);
  const setDateTo = useCallback((v: string) => setFilters(prev => ({ ...prev, dateTo: v })), []);

  return {
    filters,
    filteredProjects,
    activeFilterCount,
    availableClients,
    clearAllFilters,
    toggleMulti,
    setDateFrom,
    setDateTo,
  };
}
