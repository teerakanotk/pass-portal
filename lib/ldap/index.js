import ldap from "ldapjs";

/**
 * Creates and returns a new LDAP client instance.
 *
 * @returns {ldap.Client} The new LDAP client.
 *
 * Example:
 * ```javascript
 * const client = ldapCreateClient();
 * ```
 */
export function ldapCreateClient() {
  return ldap.createClient({
    url: process.env.LDAP_URL,
    connectTimeout: 5000,
    tlsOptions: { rejectUnauthorized: false }, // Ignore self-signed certs
  });
}

/**
 * Binds (authenticates) the LDAP client to the server.
 *
 * @param {ldap.Client} client The LDAP client to bind.
 * @returns {Promise<void>} A promise that resolves when bind is successful or rejects on error.
 *
 * Example:
 * ```javascript
 * try {
 *   await ldapBindClient(client);
 * } catch (err) {
 *   console.error("LDAP bind failed:", err);
 * }
 * ```
 */
export function ldapBindClient(client) {
  return new Promise((resolve, reject) => {
    client.bind(process.env.LDAP_BIND_DN, process.env.LDAP_PASSWORD, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Unbinds an LDAP client and terminates the session with the LDAP server.
 *
 * This function ensures that the client is unbound properly after operations are completed.
 *
 * @param {ldap.Client} client The LDAP client instance to unbind.
 * @returns {Promise<void>} A promise that resolves when the unbind operation completes.
 *
 * Example usage in a Next.js API route:
 * ```javascript
 * try {
 *   await ldapBindClient(client);
 *   // Perform LDAP operations
 * } catch (err) {
 *   return NextResponse.json(err, { status: 500 });
 * } finally {
 *   await ldapUnbindClient(client);
 * }
 * ```
 */
export function ldapUnbindClient(client) {
  return new Promise((resolve, reject) => {
    client.unbind((err) => {
      if (err) {
        return reject(
          new Error(`Failed to unbind LDAP client: ${err.message || err}`)
        );
      }
      resolve(); // Successfully unbound
    });
  });
}

/**
 * Performs an LDAP search operation to retrieve entries based on search options.
 *
 * @param {ldap.Client} client The LDAP client instance to use for the search.
 * @param {Object} opts Search options including:
 *   - `filter`: The search filter (e.g., "(objectClass=person)").
 *   - `scope`: The search scope ("sub", "base", "one").
 *   - `attributes`: Array of attribute names to retrieve (e.g., ["cn", "mail"]).
 * @returns {Promise<Array>} Resolves with an array of LDAP entries (objects with dn and attributes).
 *
 * Example:
 * ```javascript
 * const opts = {
 *   filter: "(objectClass=person)",
 *   scope: "sub",
 *   attributes: ["cn", "mail"]
 * };
 *
 * try {
 *   const entries = await ldapSearch(client, opts);
 *   console.log(entries);
 * } catch (err) {
 *   console.error("LDAP search error:", err);
 * }
 * ```
 */
export function ldapSearch(client, opts) {
  const baseDN = process.env.LDAP_BASE_DN;

  return new Promise((resolve, reject) => {
    const entries = [];

    client.search(baseDN, opts, (err, res) => {
      if (err) return reject(err);

      res.on("searchEntry", (entry) => {
        const obj = { dn: entry.dn.toString() };

        entry.attributes.forEach((attr) => {
          obj[attr.type] =
            attr.values.length === 1 ? attr.values[0] : attr.values;
        });

        entries.push(obj);
      });

      res.on("error", (err) => reject(err));

      res.on("end", () => resolve(entries));
    });
  });
}

/**
 * Modifies an LDAP entry by applying a set of changes.
 *
 * @param {ldap.Client} client The LDAP client instance.
 * @param {string} dn The distinguished name (DN) of the LDAP entry to modify.
 * @param {Array} changes An array of change objects with:
 *   - `operation`: Operation type (e.g., "replace", "add", "delete").
 *   - `type`: The attribute to modify (e.g., "unicodePwd", "mail").
 *   - `values`: The new values for the attribute.
 * @returns {Promise<void>} A promise that resolves if the modification is successful, or rejects if it fails.
 *
 * Example:
 * ```javascript
 * const dn = "cn=johndoe,ou=users,dc=example,dc=com";
 * const changes = [
 *   {
 *     operation: "replace",
 *     type: "unicodePwd",
 *     values: "newencodedpassword"
 *   }
 * ];
 *
 * await ldapModify(client, dn, changes);
 * ```
 */
export function ldapModify(client, dn, changes) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(changes) || changes.length === 0) {
      return reject(new Error("Changes must be a non-empty array"));
    }

    const ldapChanges = changes.map((data) => {
      if (!data.operation || !data.type || !data.values) {
        return reject(
          new Error("Each change must have operation, type, and values")
        );
      }

      return new ldap.Change({
        operation: data.operation,
        modification: {
          type: data.type,
          values: [data.values], // LDAP expects values as an array
        },
      });
    });

    client.modify(dn, ldapChanges, (err) => {
      if (err) {
        reject(new Error(`LDAP Modify Error: ${err.message || err}`));
      } else {
        resolve(); // Successfully modified the entry
      }
    });
  });
}

/**
 * Encodes the password to the UTF-16 little-endian format required by LDAP servers.
 * The password will be wrapped in double quotes as required by Active Directory for the `unicodePwd` attribute.
 *
 * @param {string} password - The plain-text password to encode.
 * @returns {Buffer} The encoded password in UTF-16 little-endian format, wrapped in double quotes.
 *
 * @example
 * const password = "mySecurePassword123";
 * const encodedPassword = encodePassword(password);
 * console.log(encodedPassword); // <Buffer ...> (UTF-16 encoded password)
 */
export function encodePassword(password) {
  // Wrap the password in double quotes and encode as UTF-16 little-endian.
  return Buffer.from(`"${password}"`, "utf16le");
}
