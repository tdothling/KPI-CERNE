import { format, parseISO, isValid, isWeekend, addDays } from 'date-fns';

type Period = 'MANHA' | 'TARDE';

interface Pause {
    startDate: string;
    startPeriod?: Period;
    endDate?: string;
    endPeriod?: Period;
}

interface Project {
    startDate: string;
    startPeriod?: Period;
    endDate?: string;
    endPeriod?: Period;
    pauses?: Pause[];
}

export const calculateNetExecutionDuration = (
    project: Project,
    holidays: string[]
): number => {
    if (!project.startDate || !isValid(parseISO(project.startDate))) return 0;

    const start = parseISO(project.startDate);
    const end = (project.endDate && isValid(parseISO(project.endDate)))
        ? parseISO(project.endDate)
        : new Date();

    if (start > end) return 0;

    const holidaySet = new Set(holidays);
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    const todayStr = format(new Date(), 'yyyy-MM-dd'); // cached once

    // Project boundary slots — computed once outside the loop
    const projStartSlot = `${startStr}_${project.startPeriod ?? 'MANHA'}`;
    const projEndSlot = `${endStr}_${project.endPeriod ?? 'TARDE'}`;

    // Pre-compute pause boundary slots once
    const pauseSlots = (project.pauses ?? [])
        .filter(p => !!p.startDate)
        .map(p => ({
            start: `${p.startDate}_${p.startPeriod ?? 'MANHA'}`,
            end:   `${p.endDate ?? todayStr}_${p.endPeriod ?? 'TARDE'}`,
        }));

    const periods: Period[] = ['MANHA', 'TARDE'];
    let cursorDate = start;
    let netSlots = 0;

    while (cursorDate <= end) {
        const dateStr = format(cursorDate, 'yyyy-MM-dd');

        if (!isWeekend(cursorDate) && !holidaySet.has(dateStr)) {
            for (const p of periods) {
                const currentSlot = `${dateStr}_${p}`;

                // Project window: INCLUSIVE on both ends
                if (currentSlot < projStartSlot || currentSlot > projEndSlot) {
                    continue;
                }

                // Pause check: INCLUSIVE on both ends
                const inPause = pauseSlots.some(
                    ps => currentSlot >= ps.start && currentSlot <= ps.end
                );

                if (!inPause) {
                    netSlots++;
                }
            }
        }

        cursorDate = addDays(cursorDate, 1);
    }

    return netSlots * 0.5;
};

// Test scenario
const project: Project = {
    startDate: '2026-03-25',
    startPeriod: 'MANHA',
    endDate: '2026-03-26',
    endPeriod: 'TARDE',
    pauses: [
        {
            startDate: '2026-03-25',
            startPeriod: 'MANHA',
            endDate: '2026-03-26',
            endPeriod: 'MANHA'
        }
    ]
};

// Slots totais: 25_MANHA, 25_TARDE, 26_MANHA, 26_TARDE = 4 slots = 2.0d
// Slots em pausa (INCLUSIVE): 25_MANHA, 25_TARDE, 26_MANHA = 3 slots = 1.5d
// Expected: 0.5d (só 26_TARDE livre)
console.log("Calculated Net Duration:", calculateNetExecutionDuration(project, [])); // Expected: 0.5
