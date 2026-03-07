/** Текущий месяц в формате YYYY-MM */
export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Последние N месяцев для выбора периода */
export function getMonthOptions(count = 24): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  const monthNames = "январь февраль март апрель май июнь июль август сентябрь октябрь ноябрь декабрь".split(" ");
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const value = `${y}-${String(m).padStart(2, "0")}`;
    const label = `${monthNames[m - 1]} ${y}`;
    options.push({ value, label });
  }
  return options;
}
