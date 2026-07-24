import { describe, expect, it } from "vitest";

import { HyperFormula } from "../hyperformula";

function ev(formula: string): unknown {
  const hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3", language: "enUS" });
  try {
    const sheet = hf.getSheetId(hf.addSheet("Sheet1"))!;
    hf.setCellContents({ sheet, col: 0, row: 0 }, [[formula]]);
    return hf.getCellValue({ sheet, col: 0, row: 0 });
  } finally {
    hf.destroy();
  }
}

describe("math", () => {
  it("ABS/SIGN/INT/MOD/POWER/SQRT", () => {
    expect(ev("=ABS(-42)")).toBe(42);
    expect(ev("=SIGN(-3)")).toBe(-1);
    expect(ev("=INT(3.9)")).toBe(3);
    expect(ev("=MOD(-3, 5)")).toBe(2);
    expect(ev("=POWER(2, 8)")).toBe(256);
    expect(ev("=SQRT(144)")).toBe(12);
  });
  it("ROUND family honours decimals", () => {
    expect(ev("=ROUND(3.14159, 2)")).toBe(3.14);
    expect(ev("=ROUNDUP(3.141, 2)")).toBe(3.15);
    expect(ev("=ROUNDDOWN(3.149, 2)")).toBe(3.14);
    expect(ev("=TRUNC(3.99)")).toBe(3);
  });
  it("CEILING/FLOOR to significance", () => {
    expect(ev("=CEILING(2.1, 1)")).toBe(3);
    expect(ev("=FLOOR(2.9, 1)")).toBe(2);
  });
  it("SUM/PRODUCT/SUMSQ over inline args", () => {
    expect(ev("=SUM(1,2,3)")).toBe(6);
    expect(ev("=PRODUCT(2,3,4)")).toBe(24);
    expect(ev("=SUMSQ(3,4)")).toBe(25);
  });
  it("SUMIF/SUMPRODUCT with array ranges", () => {
    expect(ev('=SUMIF({1;2;3;4}, ">2")')).toBe(7);
    expect(ev("=SUMPRODUCT({1;2;3}, {4;5;6})")).toBe(32);
  });
});

describe("logical", () => {
  it("IF/AND/OR/NOT/XOR", () => {
    expect(ev('=IF(1>0, "y", "n")')).toBe("y");
    expect(ev("=AND(1=1, 2=2)")).toBe(true);
    expect(ev("=OR(1=2, 2=2)")).toBe(true);
    expect(ev("=NOT(1=2)")).toBe(true);
    expect(ev("=XOR(TRUE(), FALSE())")).toBe(true);
  });
  it("IFS/SWITCH/CHOOSE", () => {
    expect(ev('=IFS(1>2, "a", 3>2, "b")')).toBe("b");
    expect(ev('=SWITCH(2, 1, "one", 2, "two", "other")')).toBe("two");
    expect(ev('=CHOOSE(2, "a", "b", "c")')).toBe("b");
  });
});

describe("text", () => {
  it("basic string ops", () => {
    expect(ev('=CONCATENATE("a", "b", "c")')).toBe("abc");
    expect(ev('=LEFT("hello", 2)')).toBe("he");
    expect(ev('=RIGHT("hello", 2)')).toBe("lo");
    expect(ev('=MID("hello", 2, 3)')).toBe("ell");
    expect(ev('=LEN("hello")')).toBe(5);
    expect(ev('=UPPER("hi")')).toBe("HI");
    expect(ev('=PROPER("hello world")')).toBe("Hello World");
    expect(ev('=SUBSTITUTE("a-b-c", "-", "+")')).toBe("a+b+c");
    expect(ev('=FIND("l", "hello")')).toBe(3);
    expect(ev('=TRIM("  a   b ")')).toBe("a b");
    expect(ev('=VALUE("1,234")')).toBe(1234);
  });
  it("TEXT numeric format", () => {
    expect(ev('=TEXT(1234.5, "#,##0.00")')).toBe("1,234.50");
    expect(ev('=TEXT(0.5, "0%")')).toBe("50%");
  });
  it("CONCAT alias", () => {
    expect(ev('=CONCAT("x", "y")')).toBe("xy");
  });
});

describe("date", () => {
  it("DATE/YEAR/MONTH/DAY round-trip", () => {
    expect(ev("=YEAR(DATE(2026,3,15))")).toBe(2026);
    expect(ev("=MONTH(DATE(2026,3,15))")).toBe(3);
    expect(ev("=DAY(DATE(2026,3,15))")).toBe(15);
  });
  it("EOMONTH/EDATE/DAYS", () => {
    expect(ev("=DAY(EOMONTH(DATE(2026,2,10), 0))")).toBe(28);
    expect(ev("=MONTH(EDATE(DATE(2026,1,31), 1))")).toBe(2);
    expect(ev("=DAYS(DATE(2026,1,11), DATE(2026,1,1))")).toBe(10);
  });
});

describe("statistics", () => {
  it("AVERAGE/COUNT/MEDIAN/MAX/MIN", () => {
    expect(ev("=AVERAGE(2,4,6)")).toBe(4);
    expect(ev('=COUNT(1,2,"x",3)')).toBe(3);
    expect(ev("=MEDIAN(1,2,3,4)")).toBe(2.5);
    expect(ev("=MAX(1,9,4)")).toBe(9);
    expect(ev("=MIN(3,1,2)")).toBe(1);
  });
  it("COUNTIF/PERCENTILE", () => {
    expect(ev('=COUNTIF({1;2;3;4}, ">2")')).toBe(2);
    expect(ev("=PERCENTILE({1;2;3;4}, 0.5)")).toBe(2.5);
  });
});

describe("lookup", () => {
  it("INDEX/MATCH on a column", () => {
    expect(ev("=INDEX({10;20;30}, 2)")).toBe(20);
    expect(ev("=MATCH(20, {10;20;30}, 0)")).toBe(2);
  });
});

describe("info", () => {
  it("IS* predicates", () => {
    expect(ev("=ISNUMBER(1)")).toBe(true);
    expect(ev('=ISTEXT("a")')).toBe(true);
    expect(ev("=ISERROR(1/0)")).toBe(true);
    expect(ev("=ISEVEN(4)")).toBe(true);
    expect(ev("=ISODD(3)")).toBe(true);
  });
});

describe("financial", () => {
  it("PMT and NPV", () => {
    // 12 months, 1% monthly, $1000 loan -> ~-88.85 payment
    expect(ev("=ROUND(PMT(0.01, 12, 1000), 2)")).toBe(-88.85);
    expect(ev("=ROUND(NPV(0.1, 100, 100, 100), 2)")).toBe(248.69);
  });
  it("IRR converges", () => {
    expect(ev("=ROUND(IRR({-100;40;40;40}), 3)")).toBe(0.097);
  });
});
