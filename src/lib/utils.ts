/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STORAGE_KEY = 'nexomemgram_config';

export function saveConfig(token: string, chatId: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, chatId }));
}

export function loadConfig() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : null;
}

export function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
