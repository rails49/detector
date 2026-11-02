const KEY = 'bench-run';

/**
 * Notes a run's settings and current step in localStorage. When iOS kills
 * the tab, Safari reloads the page and the note shows where the run stopped.
 */
export function noteStep(settings: string, step: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ settings, step }));
  } catch {
    // Without storage, a crash leaves no note.
  }
}

/** Removes the note; a run calls it when it ends, however it ends. */
export function clearNote(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to remove.
  }
}

/** The note an unfinished run left, as one line, and removes it. */
export function takeNote(): string | undefined {
  try {
    const value = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!value) return undefined;
    const { settings, step } = JSON.parse(value);
    return `${settings}: stopped at ${step}`;
  } catch {
    return undefined;
  }
}
