export const isRequiredFlagSet = (requiredFlag?: number | boolean) => requiredFlag === 1 || requiredFlag === true;

export const formatViewValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string' && value.trim() === '') {
    return '—';
  }

  return String(value);
};
