import * as ts from "typescript";

export type ComplexityProfile = "strict" | "balanced" | "permissive";

export interface FunctionComplexity {
  file: string;
  line: number;
  col: number;
  endLine: number;
  name: string;
  complexity: number;
}

type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration
  | ts.ConstructorDeclaration;

function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function propertyNameText(
  name: ts.PropertyName,
  sourceFile: ts.SourceFile,
): string {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return name.getText(sourceFile);
}

function resolveName(node: FunctionLike, sourceFile: ts.SourceFile): string {
  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.name !== undefined
  ) {
    return propertyNameText(node.name, sourceFile);
  }
  const parent = node.parent;
  if (
    parent !== undefined &&
    ts.isVariableDeclaration(parent) &&
    parent.initializer === node &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.text;
  }
  if (
    parent !== undefined &&
    ts.isPropertyAssignment(parent) &&
    parent.initializer === node
  ) {
    return propertyNameText(parent.name, sourceFile);
  }
  if (
    parent !== undefined &&
    ts.isPropertyDeclaration(parent) &&
    parent.initializer === node
  ) {
    return propertyNameText(parent.name, sourceFile);
  }
  if (
    parent !== undefined &&
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.right === node
  ) {
    if (ts.isIdentifier(parent.left)) {
      return parent.left.text;
    }
    if (
      ts.isPropertyAccessExpression(parent.left) &&
      parent.left.name !== undefined
    ) {
      return parent.left.getText(sourceFile);
    }
  }
  return "(anonymous)";
}

// questionDotToken lives on the individual optional-chain node interfaces,
// not on ts.Node, so read it through one guarded cast here.
function hasQuestionDot(node: ts.Node): boolean {
  return (
    (node as { questionDotToken?: ts.QuestionDotToken }).questionDotToken !==
    undefined
  );
}

interface ComplexityRule {
  profiles: ComplexityProfile[];
  test: (node: ts.Node) => boolean;
}

const ALL_PROFILES: ComplexityProfile[] = ["strict", "balanced", "permissive"];
const STRICT_ONLY: ComplexityProfile[] = ["strict"];
const BALANCED_OR_STRICT: ComplexityProfile[] = ["balanced", "strict"];

function isElseBranch(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) &&
    node.elseStatement !== undefined &&
    !ts.isIfStatement(node.elseStatement)
  );
}

function isLoopOrBranch(node: ts.Node): boolean {
  return (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCaseClause(node) ||
    ts.isCatchClause(node)
  );
}

function isLogicalOperator(node: ts.Node): boolean {
  return (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  );
}

function isOptionalChain(node: ts.Node): boolean {
  return (
    (ts.isPropertyAccessExpression(node) ||
      ts.isCallExpression(node) ||
      ts.isElementAccessExpression(node)) &&
    hasQuestionDot(node)
  );
}

function isOptionalTaggedTemplate(node: ts.Node): boolean {
  return ts.isTaggedTemplateExpression(node) && hasQuestionDot(node);
}

function isLogicalAssignment(node: ts.Node): boolean {
  return (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken)
  );
}

// Each syntactic concept appears once; the profile axis is data.
const COMPLEXITY_RULES: ComplexityRule[] = [
  { profiles: ALL_PROFILES, test: ts.isIfStatement },
  { profiles: STRICT_ONLY, test: isElseBranch },
  { profiles: ALL_PROFILES, test: isLoopOrBranch },
  { profiles: BALANCED_OR_STRICT, test: isLogicalOperator },
  { profiles: BALANCED_OR_STRICT, test: ts.isConditionalExpression },
  { profiles: STRICT_ONLY, test: isOptionalChain },
  { profiles: STRICT_ONLY, test: isOptionalTaggedTemplate },
  { profiles: STRICT_ONLY, test: isLogicalAssignment },
];

function countForFunction(
  fn: FunctionLike,
  profile: ComplexityProfile,
): number {
  let complexity = 1;

  function visit(node: ts.Node): void {
    if (node !== fn && isFunctionLike(node)) {
      return;
    }
    for (const rule of COMPLEXITY_RULES) {
      if (rule.profiles.includes(profile) && rule.test(node)) {
        complexity += 1;
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(fn, visit);
  return complexity;
}

export function analyzeComplexity(
  filePath: string,
  sourceText: string,
  profile: ComplexityProfile,
): FunctionComplexity[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : undefined,
  );
  const results: FunctionComplexity[] = [];

  function collect(node: ts.Node): void {
    if (isFunctionLike(node) && node.body !== undefined) {
      const start = ts.getLineAndCharacterOfPosition(
        sourceFile,
        node.getStart(sourceFile),
      );
      const end = ts.getLineAndCharacterOfPosition(
        sourceFile,
        node.body.getEnd(),
      );
      results.push({
        file: filePath,
        line: start.line + 1,
        col: start.character + 1,
        endLine: end.line + 1,
        name: resolveName(node, sourceFile),
        complexity: countForFunction(node, profile),
      });
    }
    ts.forEachChild(node, collect);
  }

  collect(sourceFile);
  return results;
}
