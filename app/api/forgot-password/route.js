import { NextResponse } from "next/server";
import {
  ldapCreateClient,
  ldapBindClient,
  ldapUnbindClient,
  ldapSearch,
  ldapModify,
  encodePassword,
} from "@/lib/ldap";
import { generatePassword } from "@/lib/ldap/password";

export async function POST(request) {
  const client = ldapCreateClient();

  try {
    await ldapBindClient(client);

    const { email } = await request.json();

    // Search for user by email
    const searchResults = await ldapSearch(client, {
      filter: `(&(mail=${email})(objectClass=top)(objectClass=person)(objectClass=organizationalPerson)(objectClass=user))`,
      scope: "sub",
      attributes: ["dn"],
    });

    if (searchResults.length === 0 || !searchResults[0].dn) {
      // Return early if no results found or dn is missing
      return NextResponse.json(
        {
          message:
            "If an account exists with this email, you will receive instructions to reset your password.",
        },
        { status: 200 }
      );
    }

    const dn = searchResults[0].dn;
    const password = generatePassword();

    // Modify the user's password
    await ldapModify(client, dn, [
      {
        operation: "replace",
        type: "unicodePwd",
        values: encodePassword(password),
      },
      {
        operation: "replace",
        type: "description",
        values: password,
      },
      {
        operation: "replace",
        type: "pwdLastSet",
        values: "0",
      },
    ]);

    return NextResponse.json(
      {
        message:
          "If an account exists with this email, you will receive instructions to reset your password.",
      },
      { status: 200 }
    );
  } catch (error) {
    // Handle any errors during the process
    return NextResponse.json(
      { error: error.message || error },
      { status: 500 }
    );
  } finally {
    await ldapUnbindClient(client);
  }
}
