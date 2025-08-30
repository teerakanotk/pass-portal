/**
 * Generate AD-compliant password
 */
export function generatePassword(
  length = 8,
  options = ["noSimilar", "noDuplicated"]
) {
  const CHAR_SETS_AD = {
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    numbers: "0123456789",
    symbols: "@#",
  };
  const SIMILAR_CHARS = new Set([
    "i",
    "I",
    "l",
    "1",
    "o",
    "O",
    "0",
    "S",
    "5",
    "Z",
    "2",
    "B",
    "8",
    "G",
    "6",
    "Q",
  ]);

  const flags = new Set(options);

  const filterSimilar = (chars) =>
    flags.has("noSimilar")
      ? chars
          .split("")
          .filter((c) => !SIMILAR_CHARS.has(c))
          .join("")
      : chars;

  const pickRandomChar = (chars, usedSet = new Set()) => {
    const pool = flags.has("noDuplicated")
      ? chars.split("").filter((c) => !usedSet.has(c))
      : chars.split("");
    if (pool.length === 0)
      throw new Error("Not enough unique characters to generate password");
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const shuffleArray = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const usedChars = new Set();
  let passwordChars = [];

  // Ensure at least one char from each type
  for (const set of Object.values(CHAR_SETS_AD)) {
    const char = pickRandomChar(filterSimilar(set), usedChars);
    passwordChars.push(char);
    usedChars.add(char);
  }

  const allChars = Object.values(CHAR_SETS_AD).map(filterSimilar).join("");
  while (passwordChars.length < length) {
    const char = pickRandomChar(allChars, usedChars);
    passwordChars.push(char);
    usedChars.add(char);
  }

  return shuffleArray(passwordChars).join("");
}
