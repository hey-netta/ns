const crypto = require("crypto");

const FAILURE_LIMIT = 5;
const COOLDOWN_MS = 60 * 1000;
const attemptsByClient = new Map();

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function getClientKey(event) {
  const forwarded = event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"] || "";
  return forwarded.split(",")[0].trim() || event.headers["client-ip"] || "unknown";
}

function isCoolingDown(clientKey) {
  const attempt = attemptsByClient.get(clientKey);
  return attempt?.lockedUntil && attempt.lockedUntil > Date.now();
}

function recordFailure(clientKey) {
  const now = Date.now();
  const current = attemptsByClient.get(clientKey);
  const count = current?.resetAt > now ? current.count + 1 : 1;

  attemptsByClient.set(clientKey, {
    count,
    resetAt: now + COOLDOWN_MS,
    lockedUntil: count >= FAILURE_LIMIT ? now + COOLDOWN_MS : 0
  });
}

function clearFailures(clientKey) {
  attemptsByClient.delete(clientKey);
}

function matchesSecret(submitted, secret) {
  const submittedHash = crypto.createHash("sha256").update(submitted).digest();
  const secretHash = crypto.createHash("sha256").update(secret).digest();

  return crypto.timingSafeEqual(submittedHash, secretHash);
}

exports.handler = async event => {
  if (event.httpMethod !== "POST") {
    return json(405, {
      error: "Method not allowed."
    });
  }

  const portfolioPassword = process.env.PORTFOLIO_PASSWORD;
  const portfolioUrl = process.env.PORTFOLIO_URL;

  if (!portfolioPassword || !portfolioUrl) {
    return json(500, {
      error: "Portfolio access is not configured."
    });
  }

  const clientKey = getClientKey(event);

  if (isCoolingDown(clientKey)) {
    return json(200, {
      ok: false,
      code: "rate_limited",
      error: "Too many attempts."
    });
  }

  let body = {};

  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    body = {};
  }

  const submittedPassword = typeof body.password === "string" ? body.password : "";

  if (!matchesSecret(submittedPassword, portfolioPassword)) {
    recordFailure(clientKey);
    return json(200, {
      ok: false,
      code: "incorrect",
      error: "Incorrect password."
    });
  }

  clearFailures(clientKey);

  return json(200, {
    ok: true,
    url: portfolioUrl
  });
};
