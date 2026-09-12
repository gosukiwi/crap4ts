import { describe, expect, it } from "vitest";
import { analyzeComplexity } from "../src/crap/index.js";

describe("analyzeComplexity", () => {
  it("gives a trivial function complexity 1 under all profiles", () => {
    const src = `function trivial() { return 1; }`;
    for (const profile of ["permissive", "balanced", "strict"] as const) {
      const res = analyzeComplexity("a.ts", src, profile);
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        file: "a.ts",
        line: 1,
        col: 1,
        endLine: 1,
        name: "trivial",
        complexity: 1,
      });
    }
  });

  it("counts if + for + && + ternary + else as 3 / 5 / 6", () => {
    const src = `function f(x: number): number {
  if (x > 0) {
    return x > 1 && x < 10 ? 1 : 2;
  } else {
    for (let i = 0; i < x; i++) {
    }
    return 0;
  }
}`;
    // permissive: if(1) + for(1) = base 1 + 2 = 3
    // balanced: + &&(1) + ternary(1) = 5
    // strict: + bare else(1) = 6
    expect(analyzeComplexity("a.ts", src, "permissive")[0].complexity).toBe(3);
    expect(analyzeComplexity("a.ts", src, "balanced")[0].complexity).toBe(5);
    expect(analyzeComplexity("a.ts", src, "strict")[0].complexity).toBe(6);
  });

  it("counts catch clauses", () => {
    const src = `function t() {
  try {
    foo();
  } catch (e) {
    bar();
  }
}`;
    for (const profile of ["permissive", "balanced", "strict"] as const) {
      expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(2);
    }
  });

  it("counts each switch case but not default", () => {
    const src = `function s(x: number) {
  switch (x) {
    case 1:
      return 1;
    case 2:
      return 2;
    default:
      return 0;
  }
}`;
    for (const profile of ["permissive", "balanced", "strict"] as const) {
      expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(3);
    }
  });

  it("names an unassigned arrow (anonymous)", () => {
    const src = `[1, 2, 3].map((n) => n * 2);`;
    const res = analyzeComplexity("a.ts", src, "permissive");
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ name: "(anonymous)", complexity: 1 });
  });

  it("records class methods and constructors with their own names", () => {
    const src = `class A {
  constructor() {}
  greet(x: number) {
    if (x > 0) {
      return 1;
    }
    return 0;
  }
}`;
    const res = analyzeComplexity("a.ts", src, "permissive");
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ name: "constructor", complexity: 1 });
    expect(res[1]).toMatchObject({ name: "greet", complexity: 2 });
  });

  it("records nested functions separately without leaking inner complexity", () => {
    const src = `function outer() {
  function inner() {
    if (true) {
      return 1;
    }
    return 0;
  }
  return inner();
}`;
    const res = analyzeComplexity("a.ts", src, "permissive");
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ name: "outer", complexity: 1 });
    expect(res[1]).toMatchObject({ name: "inner", complexity: 2 });
  });

  it("resolves names from enclosing variables and counts else-if once per if", () => {
    const src = `const g = function () { return 1; };
function e(a: boolean, b: boolean) {
  if (a) {
    return 1;
  } else if (b) {
    return 2;
  } else {
    return 3;
  }
}`;
    const perm = analyzeComplexity("a.ts", src, "permissive");
    expect(perm).toHaveLength(2);
    expect(perm[0]).toMatchObject({ name: "g", complexity: 1 });
    // 2 IfStatements, no bare-else bonus under permissive
    expect(perm[1]).toMatchObject({ name: "e", complexity: 3 });
    // strict adds exactly one for the bare final else
    // (the outer else branch IS an IfStatement, so no bonus there)
    expect(analyzeComplexity("a.ts", src, "strict")[1].complexity).toBe(4);
  });

  it("counts ?. and ?? only under the right profiles", () => {
    const opt = `function o(a: any) {
  return a?.b;
}`;
    expect(analyzeComplexity("a.ts", opt, "permissive")[0].complexity).toBe(1);
    expect(analyzeComplexity("a.ts", opt, "balanced")[0].complexity).toBe(1);
    expect(analyzeComplexity("a.ts", opt, "strict")[0].complexity).toBe(2);

    const nullish = `function n(a: number | null) {
  return a ?? 0;
}`;
    expect(analyzeComplexity("a.ts", nullish, "permissive")[0].complexity).toBe(
      1,
    );
    expect(analyzeComplexity("a.ts", nullish, "balanced")[0].complexity).toBe(
      2,
    );

    const assign = `function la(a: boolean, b: boolean) {
  a &&= b;
  return a;
}`;
    expect(analyzeComplexity("a.ts", assign, "permissive")[0].complexity).toBe(
      1,
    );
    expect(analyzeComplexity("a.ts", assign, "balanced")[0].complexity).toBe(1);
    expect(analyzeComplexity("a.ts", assign, "strict")[0].complexity).toBe(2);
  });

  it("counts ?.[] the same as ?. under strict", () => {
    const dot = `function o(a: any) {
  return a?.b;
}`;
    const bracket = `function o(a: any) {
  return a?.[b];
}`;
    expect(analyzeComplexity("a.ts", bracket, "strict")[0].complexity).toBe(
      analyzeComplexity("a.ts", dot, "strict")[0].complexity,
    );
    expect(analyzeComplexity("a.ts", bracket, "strict")[0].complexity).toBe(2);
  });

  it("counts ?. on tagged templates the same as ?. under strict", () => {
    const dot = `function o(a: any) {
  return a?.b;
}`;
    const tagged = "function o(tag: any) {\n  return tag?.`hi`;\n}";
    expect(analyzeComplexity("a.ts", tagged, "strict")[0].complexity).toBe(
      analyzeComplexity("a.ts", dot, "strict")[0].complexity,
    );
    expect(analyzeComplexity("a.ts", tagged, "strict")[0].complexity).toBe(2);
  });

  it("counts ?.() optional calls the same as ?. under strict", () => {
    const dot = `function o(a: any) {
  return a?.b;
}`;
    const optCall = `function o(foo: any) {
  return foo?.();
}`;
    expect(analyzeComplexity("a.ts", optCall, "strict")[0].complexity).toBe(
      analyzeComplexity("a.ts", dot, "strict")[0].complexity,
    );
    expect(analyzeComplexity("a.ts", optCall, "strict")[0].complexity).toBe(2);
    expect(analyzeComplexity("a.ts", optCall, "balanced")[0].complexity).toBe(
      1,
    );
  });

  it("names a class-field arrow from its PropertyDeclaration", () => {
    const src = `class A {
  handler = (x: number) => {
    if (x > 0) {
      return 1;
    }
    return 0;
  };
}`;
    const res = analyzeComplexity("a.ts", src, "permissive");
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ name: "handler", complexity: 2 });
  });

  it("names an arrow assigned via = from its left-hand side", () => {
    const src = `o.h = () => { return 1; };`;
    const res = analyzeComplexity("a.ts", src, "permissive");
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ name: "o.h", complexity: 1 });
  });

  describe("TSX components", () => {
    const SRC = `export const List = ({ items, show }: { items: string[]; show: boolean }) => {
  if (!show) {
    return null;
  }
  const extra = { className: "x" };
  return (
    <>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
        {show && <li {...extra}>extra</li>}
        {show ? <li>yes</li> : <li>no</li>}
      </ul>
    </>
  );
};`;
    it("counts TSX branches without JSX noise", () => {
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        const result = analyzeComplexity("src/List.tsx", SRC, profile);
        expect(result).toHaveLength(2);
      }
      const byName = (profile: "permissive" | "balanced" | "strict") => {
        const result = analyzeComplexity("src/List.tsx", SRC, profile);
        return Object.fromEntries(result.map((r) => [r.name, r.complexity]));
      };
      expect(byName("permissive")["List"]).toBe(2);
      expect(byName("balanced")["List"]).toBe(4);
      expect(byName("strict")["List"]).toBe(4);
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        const result = analyzeComplexity("src/List.tsx", SRC, profile);
        const anon = result.find((r) => r.name === "(anonymous)");
        expect(anon).toBeDefined();
        expect(anon!.complexity).toBe(1);
      }
    });
  });

  describe("effect hooks", () => {
    it("adds 2 per bare useEffect call under all profiles", () => {
      const src = `function C() {
  useEffect(() => {}, []);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(3);
      }
    });

    it("adds 2 for React.-prefixed effect calls", () => {
      const src = `function C() {
  React.useEffect(() => {}, []);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(3);
      }
    });

    it("adds 2 for useLayoutEffect and useInsertionEffect", () => {
      for (const hook of ["useLayoutEffect", "useInsertionEffect"]) {
        const src = `function C() {
  ${hook}(() => {}, []);
  return 1;
}`;
        for (const profile of ["permissive", "balanced", "strict"] as const) {
          expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(3);
        }
      }
    });

    it("sums multiple effect calls", () => {
      const src = `function C() {
  useEffect(() => {}, []);
  useLayoutEffect(() => {}, []);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(5);
      }
    });
  });

  describe("memo hooks", () => {
    it("adds 1 per bare useMemo or useCallback call under all profiles", () => {
      for (const hook of ["useMemo", "useCallback"]) {
        const src = `function C() {
  ${hook}(() => 1, []);
  return 1;
}`;
        for (const profile of ["permissive", "balanced", "strict"] as const) {
          expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(2);
        }
      }
    });

    it("adds 1 for React.-prefixed memo calls", () => {
      for (const hook of ["React.useMemo", "React.useCallback"]) {
        const src = `function C() {
  ${hook}(() => 1, []);
  return 1;
}`;
        for (const profile of ["permissive", "balanced", "strict"] as const) {
          expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(2);
        }
      }
    });

    it("sums two memo calls", () => {
      const src = `function C() {
  useMemo(() => 1, []);
  useCallback(() => 2, []);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(3);
      }
    });

    it("sums one effect call plus one memo call to +3", () => {
      const src = `function C() {
  useEffect(() => {}, []);
  useMemo(() => 1, []);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(4);
      }
    });
  });

  describe("state hooks", () => {
    it("adds 0 for a single useState call under all profiles", () => {
      const src = `function C() {
  useState(0);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(1);
      }
    });

    it("adds 1 per pair of useState calls", () => {
      const two = `function C() {
  useState(0);
  useState(1);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", two, profile)[0].complexity).toBe(2);
      }
    });

    it("rounds pairing down: 3 calls add 1 and 10 calls add 5", () => {
      const three = `function C() {
  useState(0);
  useState(1);
  useState(2);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", three, profile)[0].complexity).toBe(2);
      }
      const tenCalls = Array.from(
        { length: 10 },
        (_, i) => `  useState(${i});`,
      ).join("\n");
      const ten = `function C() {\n${tenCalls}\n  return 1;\n}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", ten, profile)[0].complexity).toBe(6);
      }
    });

    it("counts every STATE_HOOKS member in the state tier", () => {
      const src = `function C() {
  useReducer((s: number) => s, 0);
  useRef(0);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(2);
      }
      const ctx = `function C() {
  useContext(Ctx);
  useState(0);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", ctx, profile)[0].complexity).toBe(2);
      }
    });

    it("counts custom hooks and useId in the state tier", () => {
      const src = `function C() {
  useFetch("/a");
  useId();
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(2);
      }
    });

    it("counts React.-prefixed state calls", () => {
      const src = `function C() {
  React.useState(0);
  React.useState(1);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(2);
      }
    });

    it("keeps pairing within the state tier when mixing tiers", () => {
      const src = `function C() {
  useState(0);
  useEffect(() => {}, []);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(3);
      }
    });

    it("ignores the bare React 19 use API", () => {
      const src = `function C() {
  use(promise);
  use(promise2);
  return 1;
}`;
      for (const profile of ["permissive", "balanced", "strict"] as const) {
        expect(analyzeComplexity("a.ts", src, profile)[0].complexity).toBe(1);
      }
    });
  });

  it("reports 1-based line/col and inclusive endLine of the body", () => {
    const src = `function f(x: number): number {
  if (x > 0) {
    return 1;
  }
  return 0;
}`;
    const res = analyzeComplexity("a.ts", src, "permissive");
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      file: "a.ts",
      line: 1,
      col: 1,
      endLine: 6,
      name: "f",
    });
  });
});
