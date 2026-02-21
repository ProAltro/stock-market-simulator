/**
 * Judge0 API Client Service
 * Handles code submission and result retrieval from Judge0
 */

const JUDGE0_URL = process.env.JUDGE0_URL || "http://judge0-server:2358";

export const LANGUAGES = {
  python3: 71, // Python 3.8.1
  cpp: 54, // C++ (GCC 9.2.0)
  javascript: 63, // JavaScript (Node.js 12.14.0)
};

/**
 * Submit code to Judge0 for execution
 */
export async function submitCode(
  sourceCode,
  languageId = LANGUAGES.python3,
  stdin = "",
  options = {}
) {
  const body = {
    source_code: Buffer.from(sourceCode).toString("base64"),
    language_id: languageId,
    cpu_time_limit: options.cpu_time_limit || 60,
    memory_limit: options.memory_limit || 256000,
    max_file_size: options.max_file_size || 4096,
  };

  if (stdin) {
    body.stdin = Buffer.from(stdin).toString("base64");
  }

  const response = await fetch(
    `${JUDGE0_URL}/submissions?base64_encoded=true&wait=false`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Judge0 submission failed: ${error}`);
  }

  return response.json();
}

/**
 * Get submission status/result from Judge0
 */
export async function getSubmission(token) {
  const response = await fetch(
    `${JUDGE0_URL}/submissions/${token}?base64_encoded=true&fields=*`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Judge0 fetch failed: ${error}`);
  }

  const result = await response.json();

  if (result.stdout) {
    result.stdout = Buffer.from(result.stdout, "base64").toString("utf-8");
  }
  if (result.stderr) {
    result.stderr = Buffer.from(result.stderr, "base64").toString("utf-8");
  }
  if (result.compile_output) {
    result.compile_output = Buffer.from(result.compile_output, "base64").toString("utf-8");
  }
  if (result.message) {
    result.message = Buffer.from(result.message, "base64").toString("utf-8");
  }

  return result;
}

/**
 * Poll for submission completion
 */
export async function waitForSubmission(
  token,
  maxAttempts = 120,
  interval = 1000
) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getSubmission(token);

    if (result.status && result.status.id >= 3) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error("Submission timed out");
}

/**
 * Get Judge0 system info
 */
export async function getSystemInfo() {
  const response = await fetch(`${JUDGE0_URL}/about`);

  if (!response.ok) {
    throw new Error("Failed to connect to Judge0");
  }

  return response.json();
}

/**
 * Get available languages
 */
export async function getLanguages() {
  const response = await fetch(`${JUDGE0_URL}/languages`);

  if (!response.ok) {
    throw new Error("Failed to fetch languages");
  }

  return response.json();
}

/**
 * Health check for Judge0
 */
export async function healthCheck() {
  try {
    await getSystemInfo();
    return { healthy: true };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}
