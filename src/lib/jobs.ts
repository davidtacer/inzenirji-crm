/** Plain job data for client components (TASK-035). */
export function jobView(j: { status: string; message: string | null; done: number; total: number; failed: number } | null) {
  return j ? { status: j.status, message: j.message, done: j.done, total: j.total, failed: j.failed } : null;
}
