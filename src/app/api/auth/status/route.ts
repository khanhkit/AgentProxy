import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { cookies } from "next/headers";
import { verifyDashboardSessionToken } from "@/shared/utils/dashboardSessionToken";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ authenticated: false });
    }

    return NextResponse.json({ authenticated: Boolean(await verifyDashboardSessionToken(token)) });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
