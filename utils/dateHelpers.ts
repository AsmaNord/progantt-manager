
import { addDays, differenceInDays, format, parseISO, isValid } from 'date-fns';

/**
 * Formats a date string to DD-MMM-YY (e.g., 25-OCT-25)
 * Safely handles invalid dates.
 */
export const formatProjectDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return 'N/A';
  return format(d, 'dd-MMM-yy').toUpperCase();
};

export const calculateEndDate = (startDateStr: string, days: number): string => {
  const start = parseISO(startDateStr);
  if (!isValid(start)) return format(new Date(), 'yyyy-MM-dd');
  // Subtracting 1 because day 1 is the start day itself
  const end = addDays(start, Math.max(0, days - 1));
  return format(end, 'yyyy-MM-dd');
};

export const calculateStartDate = (endDateStr: string, days: number): string => {
  const end = parseISO(endDateStr);
  if (!isValid(end)) return format(new Date(), 'yyyy-MM-dd');
  // end = start + days - 1  => start = end - days + 1
  const start = addDays(end, -(Math.max(0, days - 1)));
  return format(start, 'yyyy-MM-dd');
};

export const calculateWorkDays = (startStr: string, endStr: string): number => {
  const start = parseISO(startStr);
  const end = parseISO(endStr);
  if (!isValid(start) || !isValid(end)) return 1;
  // Adding 1 to include both start and end dates
  const diff = differenceInDays(end, start) + 1;
  return Math.max(1, diff);
};

export const getProjectDateRange = (items: { start: string; end: string }[]) => {
  const validDates = items.flatMap(i => [parseISO(i.start), parseISO(i.end)]).filter(isValid);

  if (validDates.length === 0) {
    const today = new Date();
    return {
      start: addDays(today, -30),
      end: addDays(today, 90)
    };
  }

  const times = validDates.map(d => d.getTime());
  const minDate = new Date(Math.min(...times));
  const maxDate = new Date(Math.max(...times));

  // Add padding for better visualization
  return {
    start: addDays(minDate, -30),
    end: addDays(maxDate, 60)
  };
};

export const STEP_COLORS = [
  '#3498db', // Blue
  '#2ecc71', // Green
  '#f1c40f', // Yellow
  '#9b59b6', // Purple
  '#e74c3c', // Red
  '#e67e22', // Orange
];
