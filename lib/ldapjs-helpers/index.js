import ldap from "ldapjs";

/**
 * Creates and returns an LDAP client instance, configured from environment variables.
 *
 * Retrieves the LDAP server URL from the `LDAP_URL` environment variable
 * and initializes a new client connection. TLS verification is configurable
 * via `rejectUnauthorized` — set `false` for development/testing with self-signed
 * certificates, and `true` in production for secure communication.
 *
 * @returns LDAP client configured to connect to the specified server.
 *
 * @throws {Error} If the `LDAP_URL` environment variable is not set.
 *
 * @remarks
 * - This function only creates the client — it does not establish a bind/authentication.
 * - Ensure `rejectUnauthorized` is set to `true` in production to prevent MITM attacks.
 * - Always close the client with `unbind` when done to free network resources.
 */
export function ldapCreateClient() {
  const url = process.env.LDAP_URL;
  if (!url) {
    throw new Error("LDAP_URL is not defined in environment variables.");
  }

  return ldap.createClient({
    url,
    timeout: 5000,
    connectTimeout: 5000,
    tlsOptions: {
      rejectUnauthorized: false, // for dev only don't use on production
    },
  });
}

/**
 * Establishes an authenticated LDAP connection using a service account
 * whose DN (Distinguished Name) and password are provided via environment variables.
 *
 * Wraps the callback-based `client.bind` method in a Promise
 * to support async/await patterns in modern codebases.
 *
 * @param client - LDAP client instance with an open connection to the server.
 * @returns Promise that resolves when binding succeeds; rejects on error.
 *
 * @throws {Error} If LDAP_BIND_DN or LDAP_BIND_PASSWORD environment variables are missing.
 *
 * @remarks
 * - Binding authenticates the connection under the specified service account,
 *   allowing privileged directory operations depending on its access rights.
 * - Ensure sensitive credentials are not hardcoded; keep them in secure env config.
 * - This operation must be called before performing directory searches or modifications.
 */
export async function ldapBindClient(client) {
  const bindDN = process.env.LDAP_BIND_DN;
  const bindPassword = process.env.LDAP_BIND_PASSWORD;

  if (!bindDN || !bindPassword) {
    throw new Error("LDAP_BIND_DN or LDAP_BIND_PASSWORD is not set in env.");
  }

  return new Promise((resolve, reject) => {
    client.bind(bindDN, bindPassword, (err) => {
      if (err) {
        reject(
          new Error(`LDAP bind failed for DN="${bindDN}": ${err.message}`)
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Gracefully unbinds (disconnects) from the LDAP server and
 * releases associated resources.
 *
 * Wraps the callback-based `client.unbind` method in a Promise
 * for use with async/await flows.
 *
 * @param client - Active LDAP client connection to close.
 * @returns Promise that resolves once the unbind operation completes.
 *
 * @remarks
 * Unbinding is a one-way action — once called, the client cannot
 * be reused without creating a new connection.
 */
export async function ldapUnbind(client) {
  return new Promise((resolve, reject) => {
    client.unbind((err) => {
      if (err) {
        reject(new Error(`LDAP unbind failed: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Utility wrapper that manages the full LDAP client lifecycle:
 * - create client
 * - bind with service account
 * - execute provided function
 * - unbind safely (always called, even on error)
 *
 * @param {function(import('ldapjs').Client): Promise<any>} fn - Async function that receives a bound LDAP client.
 * @returns {Promise<any>} The return value of `fn`.
 *
 * @throws Rethrows any error from fn, bind, or unbind.
 *
 * @example
 * import { ldapWithClient } from './ldapWithClient';
 * import { searchUser } from './searchUser';
 *
 * // Example: search for a user
 * const users = await ldapWithClient(async (client) => {
 *   const results = await searchUser(client, "john.doe");
 *   return results; // array of user objects
 * });
 *
 * @example
 * // Example: multiple LDAP operations
 * const result = await ldapWithClient(async (client) => {
 *   await doSomething(client);
 *   return await doAnotherThing(client);
 * });
 */
export async function ldapWithClient(fn) {
  const client = ldapCreateClient();

  try {
    await ldapBindClient(client);
    return await fn(client);
  } finally {
    await ldapUnbind(client).catch((err) => {
      console.error("Failed to unbind LDAP client:", err);
    });
  }
}

/**
 * Search user by email and return to "sAMAccountName"
 *
 * @param client - LDAP with bind client
 * @param email - Email (eg. john_doe@example.com)
 * @returns Promise return sAMAccountName (string) or null if not found
 */
export async function getSamAccountNameByEmail(client, email) {
  const baseDN = process.env.LDAP_BASE_DN;
  if (!baseDN) {
    throw new Error("LDAP_BASE_DN is not defined in environment variables.");
  }

  const opts = {
    scope: "sub",
    filter: `(&(objectCategory=person)(objectClass=user)(mail=${email}))`,
    attributes: ["sAMAccountName"],
  };

  return new Promise((resolve, reject) => {
    let found = false;

    client.search(baseDN, opts, (err, res) => {
      if (err) {
        return reject(new Error(`LDAP search failed: ${err.message}`));
      }

      res.on("searchEntry", (entry) => {
        found = true;
        const attr = entry.attributes.find(
          (attr) => attr.type === "sAMAccountName"
        );
        const samAccountName = attr?.values?.[0] || null;
        resolve(samAccountName);
      });

      res.on("error", (err) => {
        reject(new Error(`LDAP search error: ${err.message}`));
      });

      res.on("end", () => {
        if (!found) resolve(null);
      });
    });
  });
}

/**
 * Encodes a given password into a UTF-16LE buffer,
 * surrounding it with double quotes.
 *
 * Useful for interoperability with systems or protocols
 * that expect UTF-16LE encoded credentials in this format.
 *
 * @param password - Plaintext password to encode.
 * @returns Buffer containing the UTF-16LE encoded string.
 */
export function encodePassword(password) {
  return Buffer.from(`"${password}"`, "utf16le");
}
