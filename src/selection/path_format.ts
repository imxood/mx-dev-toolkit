export function normalizeSelectionPath(inputPath: string): string {
  const normalizedPath = inputPath.replace(/\\/g, "/");
  return normalizedPath.replace(/^[a-z]:/, (drivePrefix) => drivePrefix.toUpperCase());
}
