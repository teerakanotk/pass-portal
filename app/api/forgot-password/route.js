import { NextResponse } from "next/server";
import { getSamAccountNameByEmail, ldapWithClient } from "@/lib/ldapjs-helpers";

export async function POST(request) {
  try {
    const body = await request.json();

    const sAMAccountName = await ldapWithClient(async (client) => {
      return getSamAccountNameByEmail(client, body.email);
    });

    if (!sAMAccountName) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ message: sAMAccountName }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
