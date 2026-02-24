import { useState, useMemo } from 'react';
import { ProjectFile, MaterialDoc, PurchaseDoc, ClientDoc, Discipline, DateFilterType } from '../types';
import { parseISO, isValid, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, getMonth, setMonth, setDate, endOfDay } from 'date-fns';

export function useAppFilters(
    projects: ProjectFile[],
    materials: MaterialDoc[],
    purchases: PurchaseDoc[],
    clients: ClientDoc[]
) {
    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    const [selectedDisciplines, setSelectedDisciplines] = useState<Discipline[]>([]);
    const [dateFilterType, setDateFilterType] = useState<DateFilterType>('ALL');
    const [referenceDate, setReferenceDate] = useState<Date>(new Date());
    const [customRange, setCustomRange] = useState<{ start: string, end: string }>({ start: '', end: '' });

    const getFilterDateRange = () => {
        if (dateFilterType === 'ALL') return null;
        let start: Date, end: Date;
        if (dateFilterType === 'CUSTOM') {
            if (!customRange.start || !customRange.end) return null;
            start = parseISO(customRange.start);
            end = endOfDay(parseISO(customRange.end));
            return { start, end };
        }
        switch (dateFilterType) {
            case 'MONTH': start = startOfMonth(referenceDate); end = endOfMonth(referenceDate); break;
            case 'QUARTER': start = startOfQuarter(referenceDate); end = endOfQuarter(referenceDate); break;
            case 'SEMESTER':
                const month = getMonth(referenceDate);
                if (month < 6) { start = startOfYear(referenceDate); end = setDate(setMonth(referenceDate, 5), 30); }
                else { start = setDate(setMonth(referenceDate, 6), 1); end = endOfYear(referenceDate); }
                end.setHours(23, 59, 59, 999);
                break;
            case 'YEAR': start = startOfYear(referenceDate); end = endOfYear(referenceDate); break;
            default: return null;
        }
        return { start, end };
    };

    const filteredProjects = useMemo(() => {
        let result = projects;
        if (selectedClients.length > 0) {
            result = result.filter(p => selectedClients.includes(p.client));
        }
        if (selectedDisciplines.length > 0) {
            result = result.filter(p => selectedDisciplines.includes(p.discipline));
        }

        const dateRange = getFilterDateRange();
        if (dateRange) {
            const { start: filterStart, end: filterEnd } = dateRange;
            result = result.filter(p => {
                if (!p.startDate) return false;
                const projectStart = parseISO(p.startDate);
                let projectEnd: Date;
                if (p.endDate && isValid(parseISO(p.endDate))) {
                    projectEnd = parseISO(p.endDate);
                } else {
                    projectEnd = new Date();
                }
                return projectStart <= filterEnd && projectEnd >= filterStart;
            });
        }
        return result;
    }, [projects, selectedClients, selectedDisciplines, dateFilterType, referenceDate, customRange]);

    const filteredMaterials = useMemo(() => {
        let result = materials;
        if (selectedClients.length > 0) {
            result = result.filter(m => selectedClients.includes(m.client));
        }
        if (selectedDisciplines.length > 0) {
            result = result.filter(m => selectedDisciplines.includes(m.discipline));
        }
        const dateRange = getFilterDateRange();
        if (dateRange) {
            const { start: filterStart, end: filterEnd } = dateRange;
            result = result.filter(m => {
                if (!m.startDate) return false;
                const matStart = parseISO(m.startDate);
                let matEnd: Date;
                if (m.endDate && isValid(parseISO(m.endDate))) {
                    matEnd = parseISO(m.endDate);
                } else {
                    matEnd = new Date();
                }
                return matStart <= filterEnd && matEnd >= filterStart;
            });
        }
        return result;
    }, [materials, selectedClients, selectedDisciplines, dateFilterType, referenceDate, customRange]);

    const filteredPurchases = useMemo(() => {
        let result = purchases;
        if (selectedClients.length > 0) {
            result = result.filter(p => selectedClients.includes(p.client));
        }
        return result;
    }, [purchases, selectedClients]);

    const uniqueClients = useMemo(() => {
        const registeredNames = clients.map(c => c.name);
        const projectClients = projects.map(p => p.client);
        const materialClients = materials.map(m => m.client);
        const purchaseClients = purchases.map(p => p.client);

        const merged = new Set([
            ...registeredNames,
            ...projectClients,
            ...materialClients,
            ...purchaseClients
        ]);
        return Array.from(merged).sort();
    }, [clients, projects, materials, purchases]);

    const toggleClientSelection = (clientName: string) => {
        setSelectedClients(prev => {
            if (prev.includes(clientName)) {
                return prev.filter(c => c !== clientName);
            } else {
                return [...prev, clientName];
            }
        });
    };

    const toggleDisciplineSelection = (discipline: Discipline) => {
        setSelectedDisciplines(prev => {
            if (prev.includes(discipline)) {
                return prev.filter(d => d !== discipline);
            } else {
                return [...prev, discipline];
            }
        });
    };

    return {
        selectedClients, setSelectedClients, toggleClientSelection,
        selectedDisciplines, setSelectedDisciplines, toggleDisciplineSelection,
        dateFilterType, setDateFilterType,
        referenceDate, setReferenceDate,
        customRange, setCustomRange,
        filteredProjects, filteredMaterials, filteredPurchases,
        uniqueClients
    };
}
