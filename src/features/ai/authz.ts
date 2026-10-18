import { aiError } from "./errors";

export interface Requester { id: string; role: "user" | "admin" }

/**
 * Decides whose data an AI request may use. Pure so it is unit-tested; the grant lookup is injected.
 *  - no subject, or subject === requester  -> the requester's own data
 *  - another user's data -> only an administrator that holds a read grant for that user
 * This runs BEFORE any data is retrieved or sent to the model; the model never enforces access.
 */
export async function authorizeSubject(
  requester: Requester,
  requestedSubjectId: string | null | undefined,
  hasGrant: (adminId: string, subjectId: string) => Promise<boolean>,
): Promise<string> {
  if (!requestedSubjectId || requestedSubjectId === requester.id) return requester.id;
  if (!/^[0-9a-f-]{36}$/i.test(requestedSubjectId)) throw aiError("invalid_input");
  if (requester.role !== "admin") throw aiError("forbidden");
  if (!(await hasGrant(requester.id, requestedSubjectId))) throw aiError("forbidden");
  return requestedSubjectId;
}
