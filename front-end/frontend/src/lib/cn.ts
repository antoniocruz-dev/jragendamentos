import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes do Tailwind resolvendo conflitos (ex.: px-4 + px-2 → px-2). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
