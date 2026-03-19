import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import dayjs from 'dayjs'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return dayjs(date).format('MMM D, YYYY')
}

export function formatDateTime(date: string | Date) {
  return dayjs(date).format('MMM D, YYYY h:mm A')
}

export function formatCurrency(amount: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}
