// Date representation helpers — faithful port of the relevant part of
// loot-core src/server/models.ts. Dates are stored as YYYYMMDD integers.
export function toDateRepr(str: string) {
  if (typeof str !== "string") {
    throw new Error("toDateRepr not passed a string: " + str);
  }

  return parseInt(str.replace(/-/g, ""));
}

export function fromDateRepr(number: number) {
  if (typeof number !== "number") {
    throw new Error("fromDateRepr not passed a number: " + number);
  }

  const dateString = number.toString();
  return dateString.slice(0, 4) + "-" + dateString.slice(4, 6) + "-" + dateString.slice(6);
}
