/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

let firebaseConfig: { projectId?: string } = {};
try {
  const raw = fs.readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8');
  firebaseConfig = JSON.parse(raw);
} catch {
  firebaseConfig = {};
}

let adminAuthInstance: Auth | null = null;

try {
  if (!getApps().length && firebaseConfig?.projectId) {
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
  if (getApps().length) {
    adminAuthInstance = getAuth();
  }
} catch (err) {
  console.warn('[AI Studio] Firebase Admin initialization skipped:', err);
}

export const adminAuth = adminAuthInstance;
