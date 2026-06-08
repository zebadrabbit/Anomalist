import { writable } from "svelte/store";

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export const toasts = writable<ToastItem[]>([]);

export function removeToast(id: string): void {
  toasts.update((items) => items.filter((item) => item.id !== id));
}

export function addToast(type: ToastType, message: string): void {
  const item: ToastItem = {
    id: crypto.randomUUID(),
    type,
    message
  };

  toasts.update((items) => [...items, item]);

  setTimeout(() => {
    removeToast(item.id);
  }, 4000);
}
