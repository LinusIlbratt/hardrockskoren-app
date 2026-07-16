/** Stable JSON serialization for dirty-checking form state. */
export function serializeFormState<T>(value: T): string {
  return JSON.stringify(value);
}

export function isFormStateDirty<T>(
  current: T,
  initial: T,
  serialize: (value: T) => string = serializeFormState,
): boolean {
  return serialize(current) !== serialize(initial);
}
