import { NextResponse, type NextRequest } from "next/server";
import { authorizeSubject } from "@/features/ai/authz";
import { AiError } from "@/features/ai/errors";
import { EXPORT_KINDS, exportFilename, toCsv, type ExportKind } from "@/features/exports/csv";
import { buildExport, TooManyRows } from "@/features/exports/data";
import { parseExportRange } from "@/features/exports/range";
import { getUserSettings } from "@/features/tasks/queries";
import { getSessionUser } from "@/lib/auth/session";
import { hasReadGrant } from "@/lib/auth/grant";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

/**
 * GET /api/export/{kind}?from=YYYY-MM-DD&to=YYYY-MM-DD[&subject=<user id>]
 * Authenticated users export their own data. `subject` is honoured only for an administrator holding a
 * read grant for that user (checked before any data is read). Internal errors are never echoed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return fail(404, "Unknown export.");

  const me = await getSessionUser();
  if (!me) return fail(401, "Sign in required.");

  const q = request.nextUrl.searchParams;
  let subjectId: string;
  try {
    subjectId = await authorizeSubject({ id: me.id, role: me.role }, q.get("subject"), hasReadGrant);
  } catch (e) {
    return e instanceof AiError && e.code === "invalid_input" ? fail(400, "Invalid user.") : fail(403, "You don't have access to that user's data.");
  }

  try {
    const settings = await getUserSettings(subjectId);
    const range = parseExportRange(q.get("from"), q.get("to"), settings.today);
    if ("error" in range) return fail(400, range.error);

    const { columns, rows } = await buildExport(kind as ExportKind, range, subjectId, settings);
    const csv = toCsv(columns, rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(kind as ExportKind, range.from, range.to, subjectId === me.id ? undefined : subjectId.slice(0, 8))}"`,
        "X-Row-Count": String(rows.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof TooManyRows) return fail(413, "Too many rows. Choose a shorter date range.");
    return fail(500, "The export failed. Try again.");
  }
}
