import { openDatabaseAsync } from "@/lib/db/adapters/driverFactory";
import { handleSelectiveMigrationPreview } from "@/lib/migration/selectivePreviewRequest";
import { isAuthRequired, isAuthenticated } from "@/shared/utils/apiAuth";

export async function POST(request: Request) {
  return handleSelectiveMigrationPreview(request, {
    isAuthRequired,
    isAuthenticated,
    openDatabase: openDatabaseAsync,
  });
}
