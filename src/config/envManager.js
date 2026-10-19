/**
 * Env Manager
 * Reads and writes the .env file used by the server, preserving comments
 * and structure. Powers the web settings UI (GET/POST /v1/config).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '..', '.env');
const envExamplePath = join(__dirname, '..', '..', '.env.example');

/** Create .env from .env.example when missing (same behavior as the .bat launcher) */
export function ensureEnvFile() {
  if (existsSync(envPath)) return;
  if (existsSync(envExamplePath)) {
    writeFileSync(envPath, readFileSync(envExamplePath));
  } else {
    writeFileSync(envPath, '');
  }
}

/**
 * Update one or more variables in .env.
 *
 * - Replaces the existing (or commented-out) line for the key
 * - Appends at the end when the key doesn't exist yet
 * - Empty/null value turns the key back into a disabled comment (`# KEY=`)
 * - Also applies the change to process.env so the running server
 *   picks it up immediately
 *
 * @param {Record<string, string|null>} updates
 * @returns {Record<string, string|null>} what was actually applied
 */
export function updateEnvFile(updates = {}) {
  ensureEnvFile();
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  const applied = {};

  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^\\s*#?\\s*${key}\\b\\s*=`);
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) matches.push(i);
    }

    const newLine = value == null || value === ''
      ? `# ${key}=`
      : `${key}=${String(value)}`;

    if (matches.length > 0) {
      lines[matches[0]] = newLine;
      // remove duplicate declarations for the same key
      for (let j = matches.length - 1; j >= 1; j--) lines.splice(matches[j], 1);
      applied[key] = value ?? '';
    } else if (value != null && value !== '') {
      lines.push('', `${key}=${String(value)}`);
      applied[key] = String(value);
    }
  }

  writeFileSync(envPath, lines.join('\n'));

  // Apply to the running process environment
  for (const [key, value] of Object.entries(applied)) {
    if (value === '') delete process.env[key];
    else process.env[key] = value;
  }

  return applied;
}

/** Mask a secret for display: keeps only first/last 4 chars */
export function maskSecret(value) {
  if (!value) return '';
  const v = String(value);
  if (v.length <= 8) return '****';
  return `${v.slice(0, 4)}****${v.slice(-4)}`;
}
