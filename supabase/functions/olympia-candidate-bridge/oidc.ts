function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJsonSegment(value: string) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

export async function verifyGitHubActionsOidcToken(token: string, audience: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== "string" || token.length > 20000) throw new Error("OIDC_TOKEN_INVALID");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("OIDC_TOKEN_INVALID");

  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decodeJsonSegment(parts[0]);
    claims = decodeJsonSegment(parts[1]);
  } catch {
    throw new Error("OIDC_TOKEN_INVALID");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("OIDC_TOKEN_ALGORITHM_REJECTED");

  const response = await fetch("https://token.actions.githubusercontent.com/.well-known/jwks", {
    headers: { "Accept": "application/json" },
  });
  if (!response.ok) throw new Error("OIDC_KEYS_UNAVAILABLE");
  const jwks = await response.json();
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find((entry: Record<string, unknown>) => entry.kid === header.kid && entry.kty === "RSA" && (entry.use === undefined || entry.use === "sig") && (entry.alg === undefined || entry.alg === "RS256")) : null;
  if (!jwk) throw new Error("OIDC_KEY_NOT_FOUND");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signingInput = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(parts[2]),
    signingInput,
  );
  if (!validSignature) throw new Error("OIDC_SIGNATURE_INVALID");

  const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== "https://token.actions.githubusercontent.com" ||
      !tokenAudiences.includes(audience) ||
      typeof claims.exp !== "number" || claims.exp <= nowSeconds ||
      (typeof claims.nbf === "number" && claims.nbf > nowSeconds) ||
      (typeof claims.iat !== "number" || claims.iat > nowSeconds + 30 || claims.iat < nowSeconds - 600)) {
    throw new Error("OIDC_CLAIMS_REJECTED");
  }
  return claims;
}
