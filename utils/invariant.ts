export const invariant: (
  condition: unknown,
  message: string
) => asserts condition = (condition, message) => {
  if (condition) {
    return;
  }
  throw new Error(['Invariant failed:', message].join(' '));
};
