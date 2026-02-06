/**
 * Judge0 API Client Service
 * Handles code submission and result retrieval from Judge0
 */

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://judge0-server:2358';

// Language IDs in Judge0
export const LANGUAGES = {
  python3: 71,  // Python 3.8.1
  javascript: 63,  // JavaScript (Node.js 12.14.0)
};

/**
 * Submit code to Judge0 for execution
 * @param {string} sourceCode - The code to execute
 * @param {number} languageId - Judge0 language ID
 * @param {string} stdin - Standard input for the program
 * @returns {Promise<Object>} Submission response with token
 */
export async function submitCode(sourceCode, languageId = LANGUAGES.python3, stdin = '') {
  const response = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=true&wait=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_code: Buffer.from(sourceCode).toString('base64'),
      language_id: languageId,
      stdin: Buffer.from(stdin).toString('base64'),
      cpu_time_limit: 10,  // 10 seconds max
      memory_limit: 128000,  // 128 MB
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Judge0 submission failed: ${error}`);
  }

  return response.json();
}

/**
 * Get submission status/result from Judge0
 * @param {string} token - Submission token
 * @returns {Promise<Object>} Submission result
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
  
  // Decode base64 fields
  if (result.stdout) {
    result.stdout = Buffer.from(result.stdout, 'base64').toString('utf-8');
  }
  if (result.stderr) {
    result.stderr = Buffer.from(result.stderr, 'base64').toString('utf-8');
  }
  if (result.compile_output) {
    result.compile_output = Buffer.from(result.compile_output, 'base64').toString('utf-8');
  }
  if (result.message) {
    result.message = Buffer.from(result.message, 'base64').toString('utf-8');
  }

  return result;
}

/**
 * Poll for submission completion
 * @param {string} token - Submission token
 * @param {number} maxAttempts - Maximum polling attempts
 * @param {number} interval - Polling interval in ms
 * @returns {Promise<Object>} Final submission result
 */
export async function waitForSubmission(token, maxAttempts = 30, interval = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getSubmission(token);
    
    // Status IDs: 1-2 = In Queue/Processing, 3+ = Completed
    if (result.status && result.status.id >= 3) {
      return result;
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Submission timed out');
}

/**
 * Get Judge0 system info
 * @returns {Promise<Object>} System information
 */
export async function getSystemInfo() {
  const response = await fetch(`${JUDGE0_URL}/about`);
  
  if (!response.ok) {
    throw new Error('Failed to connect to Judge0');
  }
  
  return response.json();
}

/**
 * Get available languages
 * @returns {Promise<Array>} List of available languages
 */
export async function getLanguages() {
  const response = await fetch(`${JUDGE0_URL}/languages`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch languages');
  }
  
  return response.json();
}
