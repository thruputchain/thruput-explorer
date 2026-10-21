import type { CSSProperties } from "react";
import { codeToTokens } from "shiki";

export async function JsonCode({ value }: { value: string }) {
  const { tokens } = await codeToTokens(value, {
    lang: "json",
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });

  return (
    <code>
      {tokens.map((line, lineIndex) => (
        <span key={lineIndex}>
          {line.map((token, tokenIndex) => (
            <span key={tokenIndex} className="json-token" style={token.htmlStyle as CSSProperties}>{token.content}</span>
          ))}
          {lineIndex < tokens.length - 1 ? "\n" : null}
        </span>
      ))}
    </code>
  );
}
