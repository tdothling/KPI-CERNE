import { useState, useMemo } from 'react';
import { ProjectFile, ClientDoc, Discipline, DateFilterType, SupplyOrder } from '../types';
import { parseISO, isValid, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, getMonth, setMonth, setDate, endOfDay } from 'date-fns';

export function useAppFilters(
    projects: ProjectFile[],
    supplyOrders: SupplyOrder[],
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

    const filteredSupplyOrders = useMemo(() => {
        let result = supplyOrders;
        if (selectedClients.length > 0) {
            result = result.filter(o => selectedClients.includes(o.client));
        }
        // Disciplina é opcional em suprimentos: com o filtro ativo, pedidos sem
        // disciplina ficam de fora (consistente com as demais listas)
        if (selectedDisciplines.length > 0) {
            result = result.filter(o => o.discipline && selectedDisciplines.includes(o.discipline));
        }
        const dateRange = getFilterDateRange();
        if (dateRange) {
            const { start: filterStart, end: filterEnd } = dateRange;
            result = result.filter(o => {
                if (!o.createdAt) return false;
                const orderStart = parseISO(o.createdAt);
                const deliveredAt = o.milestones?.deliveredAt;
                const orderEnd = (deliveredAt && isValid(parseISO(deliveredAt)))
                    ? parseISO(deliveredAt)
                    : new Date();
                return orderStart <= filterEnd && orderEnd >= filterStart;
            });
        }
        return result;
    }, [supplyOrders, selectedClients, selectedDisciplines, dateFilterType, referenceDate, customRange]);

    const uniqueClients = useMemo(() => {
        const registeredNames = clients.map(c => c.name);
        const projectClients = projects.map(p => p.client);
        const supplyClients = supplyOrders.map(o => o.client);

        const merged = new Set([
            ...registeredNames,
            ...projectClients,
            ...supplyClients
        ]);
        return Array.from(merged).sort();
    }, [clients, projects, supplyOrders]);

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
        filteredProjects, filteredSupplyOrders,
        uniqueClients
    };
}
