/** "1 set", "3 sets". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** What's been typed in a number box, kept to digits and one decimal point ("," counts as one). */
export function cleanNumberText(raw: string, integer: boolean): string {
  const text = raw.replace(/,/g, ".").replace(integer ? /[^\d]/g : /[^\d.]/g, "");
  const dot = text.indexOf(".");
  return dot < 0 ? text : text.slice(0, dot + 1) + text.slice(dot + 1).replace(/\./g, "");
}
