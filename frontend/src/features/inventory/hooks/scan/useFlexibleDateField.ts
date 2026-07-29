import { useCallback, useEffect, useMemo, useState } from "react";
import type { DateFormatType } from "@/types/scan";

/**
 * Individual date parts that can be selected in the flexible picker UI.
 */
export type DatePickerPart = "day" | "month" | "year";

/**
 * Visibility and option state for the active picker sheet.
 */
export interface DatePickerState {
  visible: boolean;
  title: string;
  options: string[];
}

/**
 * Parsed date values used to compose formatted date strings.
 */
export interface DateParts {
  day: string;
  month: string;
  year: string;
}

interface UseFlexibleDateFieldArgs {
  value: string;
  format: DateFormatType;
  onChangeValue: (value: string) => void;
  onChangeFormat: (format: DateFormatType) => void;
  currentDate?: Date;
  earliestYear?: number;
}

const composeDate = (format: DateFormatType, parts: DateParts) => {
  if (format === "full") {
    if (!parts.day || !parts.month || !parts.year) return "";
    return `${parts.day.padStart(2, "0")}/${parts.month.padStart(2, "0")}/${parts.year}`;
  }
  if (format === "month_year") {
    if (!parts.month || !parts.year) return "";
    return `${parts.month.padStart(2, "0")}/${parts.year}`;
  }
  if (format === "year_only") {
    return parts.year || "";
  }
  return "";
};

const parseDateParts = (value: string, format: DateFormatType): DateParts => {
  if (!value) {
    return { day: "", month: "", year: "" };
  }

  const parts = value.split("/");
  if (format === "full" && parts.length === 3) {
    return {
      day: parts[0] ?? "",
      month: parts[1] ?? "",
      year: parts[2] ?? "",
    };
  }
  if (format === "month_year" && parts.length === 2) {
    return {
      day: "",
      month: parts[0] ?? "",
      year: parts[1] ?? "",
    };
  }
  if (format === "year_only") {
    return {
      day: "",
      month: "",
      year: parts[0] ?? "",
    };
  }
  return { day: "", month: "", year: "" };
};

const isValidDateYear = (year: number, earliestYear: number, currentDate: Date) =>
  year >= earliestYear && year <= currentDate.getFullYear();

const validateFullDateInput = (input: string, earliestYear: number, currentDate: Date) => {
  const parts = input.split("/");
  if (parts.length !== 3) return false;
  const day = Number(parts[0] ?? Number.NaN);
  const month = Number(parts[1] ?? Number.NaN);
  const year = Number(parts[2] ?? Number.NaN);
  if ([day, month, year].some((part) => Number.isNaN(part))) return false;
  if (day < 1 || day > 31 || month < 1 || month > 12) return false;
  if (!isValidDateYear(year, earliestYear, currentDate)) return false;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return false;
  return date <= currentDate;
};

const validateMonthYearInput = (input: string, earliestYear: number, currentDate: Date) => {
  const parts = input.split("/");
  if (parts.length !== 2) return false;
  const month = Number(parts[0] ?? Number.NaN);
  const year = Number(parts[1] ?? Number.NaN);
  if ([month, year].some((part) => Number.isNaN(part))) return false;
  if (month < 1 || month > 12) return false;
  if (!isValidDateYear(year, earliestYear, currentDate)) return false;
  if (year !== currentDate.getFullYear()) return true;
  return month <= currentDate.getMonth() + 1;
};

const validateYearOnlyInput = (input: string, earliestYear: number, currentDate: Date) => {
  const year = Number(input);
  if (Number.isNaN(year)) return false;
  return isValidDateYear(year, earliestYear, currentDate);
};

const buildPickerState = (part: DatePickerPart, options: string[]): DatePickerState => {
  const titleByPart: Record<DatePickerPart, string> = {
    day: "Select Day",
    month: "Select Month",
    year: "Select Year",
  };
  return { visible: true, title: titleByPart[part], options };
};

/**
 * Validates date input against the currently selected input format.
 */
export const validateFlexibleDateInput = (
  input: string,
  format: DateFormatType,
  earliestYear: number,
  currentDate: Date
) => {
  if (!input) return true;

  switch (format) {
    case "full":
      return validateFullDateInput(input, earliestYear, currentDate);
    case "month_year":
      return validateMonthYearInput(input, earliestYear, currentDate);
    case "year_only":
      return validateYearOnlyInput(input, earliestYear, currentDate);
    default:
      return true;
  }
};

/**
 * Manages picker state and formatted values for flexible manufacturing/expiry dates.
 */
export const useFlexibleDateField = ({
  value,
  format,
  onChangeValue,
  onChangeFormat,
  currentDate = new Date(),
  earliestYear,
}: UseFlexibleDateFieldArgs) => {
  const currentYear = currentDate.getFullYear();
  const minYear = earliestYear ?? currentYear - 10;

  const [parts, setParts] = useState<DateParts>(() => parseDateParts(value, format));
  const [activePickerPart, setActivePickerPart] = useState<DatePickerPart | null>(null);
  const [pickerState, setPickerState] = useState<DatePickerState>({
    visible: false,
    title: "",
    options: [],
  });

  useEffect(() => {
    setParts(parseDateParts(value, format));
  }, [format, value]);

  const isFull = format === "full";
  const isMonthYear = format === "month_year";

  const generateMonthOptions = useCallback(
    () => Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")),
    []
  );

  const generateYearOptions = useCallback(() => {
    const years: string[] = [];
    for (let year = currentYear; year >= minYear; year -= 1) {
      years.push(String(year));
    }
    return years;
  }, [currentYear, minYear]);

  const generateDayOptions = useCallback(() => {
    const month = Number(parts.month) || 1;
    const year = Number(parts.year) || currentYear;
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) =>
      String(index + 1).padStart(2, "0")
    );
  }, [currentYear, parts.month, parts.year]);

  const openPicker = useCallback(
    (part: DatePickerPart) => {
      setActivePickerPart(part);
      const optionsByPart: Record<DatePickerPart, string[]> = {
        day: generateDayOptions(),
        month: generateMonthOptions(),
        year: generateYearOptions(),
      };
      setPickerState(buildPickerState(part, optionsByPart[part]));
    },
    [generateDayOptions, generateMonthOptions, generateYearOptions]
  );

  const closePicker = useCallback(() => {
    setPickerState((current) => ({
      ...current,
      visible: false,
    }));
    setActivePickerPart(null);
  }, []);

  const selectOption = useCallback(
    (selectedValue: string) => {
      if (!activePickerPart) return;

      setParts((current) => {
        const nextParts: DateParts = {
          ...current,
          [activePickerPart]: selectedValue,
        };

        if (activePickerPart === "month" || activePickerPart === "year") {
          nextParts.day = "";
        }

        onChangeValue(composeDate(format, nextParts));
        return nextParts;
      });

      closePicker();
    },
    [activePickerPart, closePicker, format, onChangeValue]
  );

  const handleFormatChange = useCallback(
    (nextFormat: DateFormatType) => {
      setParts({ day: "", month: "", year: "" });
      onChangeFormat(nextFormat);
      onChangeValue("");
      closePicker();
    },
    [closePicker, onChangeFormat, onChangeValue]
  );

  const isValid = useMemo(
    () => validateFlexibleDateInput(value, format, minYear, currentDate),
    [currentDate, format, minYear, value]
  );

  return {
    currentYear,
    earliestYear: minYear,
    isFull,
    isMonthYear,
    isValid,
    openPicker,
    closePicker,
    pickerState,
    parts,
    selectOption,
    handleFormatChange,
  };
};
