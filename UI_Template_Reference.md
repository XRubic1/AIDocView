# UI Template Reference Guide
## Credyx A/R Solutions - React + TypeScript + Tailwind CSS

This document serves as a comprehensive reference template for creating UI components in the Credyx A/R Solutions application. All components should follow the patterns and conventions outlined here.

---

## Table of Contents
1. [Project Structure](#project-structure)
2. [Component Patterns](#component-patterns)
3. [Styling Conventions](#styling-conventions)
4. [Type Definitions](#type-definitions)
5. [Component Templates](#component-templates)
6. [Best Practices](#best-practices)
7. [Common Patterns](#common-patterns)
8. [Icon Usage](#icon-usage)
9. [Responsive Design](#responsive-design)
10. [Accessibility](#accessibility)

---

## Project Structure

```
src/
├── components/
│   ├── dashboard/          # Dashboard-specific components
│   │   ├── Header.tsx
│   │   ├── SummaryCards.tsx
│   │   ├── AgingTable.tsx
│   │   ├── ARBreakdownChart.tsx
│   │   ├── WarningsList.tsx
│   │   ├── OverdueTable.tsx
│   │   └── ForcedCloseBanner.tsx
│   └── ui/                  # Reusable UI components
│       └── EmptyState.tsx
├── pages/
│   └── Dashboard.tsx
├── types/
│   └── dashboard.ts         # TypeScript type definitions
├── data/
│   └── mockDashboard.ts     # Mock data for development
├── App.tsx
├── index.tsx
├── index.css
└── tailwind.config.js
```

---

## Component Patterns

### 1. Component File Structure

**Standard Component Template:**
```typescript
import React from 'react'
import { IconName } from 'lucide-react' // Icons as needed

interface ComponentNameProps {
  // Props defined with clear types
  requiredProp: string
  optionalProp?: number
  onAction?: (id: string) => void
}

export function ComponentName({
  requiredProp,
  optionalProp,
  onAction,
}: ComponentNameProps) {
  // Component logic here
  
  return (
    <div className="bg-white border border-gray-200">
      {/* Component JSX */}
    </div>
  )
}
```

**Key Points:**
- Always use named exports: `export function ComponentName`
- Define props interface with `ComponentNameProps` naming
- Use TypeScript for all props
- Destructure props in function parameters
- Use functional components with React hooks

---

### 2. Component Categories

#### A. **Dashboard Components** (`components/dashboard/`)
- Page-specific components
- Business logic components
- Data visualization components

#### B. **UI Components** (`components/ui/`)
- Reusable, generic components
- No business logic
- Highly configurable via props

---

## Styling Conventions

### Color Palette

```typescript
// Primary Colors
const colors = {
  primary: '#000000',        // Black - primary text, buttons
  background: '#f5f5f5',     // Gray-50 - page background
  white: '#ffffff',          // White - card backgrounds
  border: '#e5e7eb',         // Gray-200 - borders
  
  // Status Colors
  success: '#22c55e',        // Green - success states
  warning: '#f59e0b',       // Amber - warnings
  danger: '#dc2626',         // Red - errors, critical
  info: '#3b82f6',           // Blue - informational
  
  // Text Colors
  textPrimary: '#000000',    // Black - primary text
  textSecondary: '#6b7280',  // Gray-600 - secondary text
  textMuted: '#9ca3af',      // Gray-400 - muted text
}
```

### Tailwind Class Patterns

**Card Container:**
```tsx
<div className="bg-white border border-gray-200">
  {/* Card content */}
</div>
```

**Card with Padding:**
```tsx
<div className="bg-white border border-gray-200 p-6">
  {/* Card content */}
</div>
```

**Section Title:**
```tsx
<h2 className="text-lg font-bold text-black mb-4">
  Section Title
</h2>
```

**Button Styles:**

*Primary Button:*
```tsx
<button className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors">
  Button Text
</button>
```

*Secondary Button:*
```tsx
<button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">
  Button Text
</button>
```

*Danger Button:*
```tsx
<button className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors">
  Button Text
</button>
```

**Table Styles:**
```tsx
<table className="w-full">
  <thead>
    <tr className="border-b border-gray-200">
      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
        Header
      </th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-3 px-4 text-sm text-gray-900">
        Content
      </td>
    </tr>
  </tbody>
</table>
```

**Alternating Row Colors:**
```tsx
<tr className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
```

**Grid Layouts:**
```tsx
// Responsive grid
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
  {/* Grid items */}
</div>

// Two column layout
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {/* Grid items */}
</div>
```

**Spacing:**
- Section spacing: `space-y-6` (24px between sections)
- Card spacing: `gap-5` or `gap-6` (20px or 24px)
- Internal padding: `p-6` (24px)
- Small padding: `p-4` (16px)

---

## Type Definitions

### Type File Structure (`types/dashboard.ts`)

```typescript
// Base types
export interface BaseEntity {
  id: string
}

// Specific types
export interface AgingBreakdown {
  '1_15': number
  '16_30': number
  '31_45': number
  '46_60': number
  '61_90': number
  over_91: number
}

export interface ARBreakdown {
  collected: number
  not_collected: number
}

export interface Warning {
  type: 'red' | 'yellow'
  message: string
  invoice_id: string
  invoice_number: string
  short_amount?: number
}

export interface OverdueInvoice {
  id: string
  inv_number: string
  load_number: string
  amount: number
  days_overdue: number
  broker_name: string
}

export interface PaymentConfirmation {
  invoice_id: string
  invoice_number: string
  expected_payment_date: string
  days_since_expected: number
}

// Main data type
export interface DashboardData {
  ar_balance: number
  short_payment: number
  aging: AgingBreakdown
  warnings: Warning[]
  overdue_invoices: OverdueInvoice[]
  ar_breakdown: ARBreakdown
  payment_confirmations_needed: PaymentConfirmation[]
}
```

**Type Naming Conventions:**
- Use PascalCase for interfaces/types
- Use descriptive names
- Group related types in same file
- Export all types for reuse

---

## Component Templates

### 1. Summary Card Component

```typescript
import React from 'react'
import { IconName } from 'lucide-react'

interface SummaryCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  color?: 'default' | 'success' | 'warning' | 'danger'
  onClick?: () => void
}

export function SummaryCard({
  label,
  value,
  icon,
  color = 'default',
  onClick,
}: SummaryCardProps) {
  const colorClasses = {
    default: 'text-black',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600',
  }

  return (
    <div
      className={`bg-white p-6 border border-gray-200 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-600">{label}</span>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>
        {value}
      </div>
    </div>
  )
}
```

### 2. Data Table Component

```typescript
import React from 'react'

interface Column<T> {
  key: keyof T | string
  label: string
  render?: (item: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  emptyMessage?: string
  onRowClick?: (item: T) => void
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  emptyMessage = 'No data available',
  onRowClick,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 p-6">
        <div className="text-center text-gray-500 py-8">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={`py-3 px-4 text-sm font-semibold text-gray-700 text-${column.align || 'left'}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr
                key={item.id}
                className={`border-b border-gray-100 ${
                  onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                } transition-colors ${
                  index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                }`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column) => (
                  <td
                    key={String(column.key)}
                    className={`py-3 px-4 text-sm text-gray-900 text-${column.align || 'left'}`}
                  >
                    {column.render
                      ? column.render(item)
                      : String(item[column.key as keyof T] || '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

### 3. Empty State Component

```typescript
import React from 'react'
import { PlusCircleIcon } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description: string
  icon?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="bg-white border border-gray-200 p-12">
      <div className="text-center max-w-md mx-auto">
        {icon || <div className="text-6xl mb-4 text-gray-300">📊</div>}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{description}</p>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="inline-flex items-center space-x-2 px-6 py-3 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors"
          >
            <PlusCircleIcon className="w-4 h-4" />
            <span>{actionLabel}</span>
          </button>
        )}
      </div>
    </div>
  )
}
```

### 4. Alert/Banner Component

```typescript
import React from 'react'
import { AlertTriangleIcon, XIcon } from 'lucide-react'

interface AlertBannerProps {
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  actions?: Array<{
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary' | 'danger'
  }>
  onDismiss?: () => void
}

export function AlertBanner({
  type,
  title,
  message,
  actions,
  onDismiss,
}: AlertBannerProps) {
  const typeStyles = {
    info: 'bg-blue-50 border-blue-400 text-blue-900',
    warning: 'bg-yellow-50 border-yellow-400 text-yellow-900',
    error: 'bg-red-50 border-red-400 text-red-900',
    success: 'bg-green-50 border-green-400 text-green-900',
  }

  const iconColors = {
    info: 'text-blue-600',
    warning: 'text-yellow-600',
    error: 'text-red-600',
    success: 'text-green-600',
  }

  return (
    <div className={`${typeStyles[type]} border-2 p-4 mb-5`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <AlertTriangleIcon className={`w-6 h-6 ${iconColors[type]} mt-0.5 flex-shrink-0`} />
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-1">{title}</h3>
            <p className="text-sm mb-3">{message}</p>
            {actions && actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {actions.map((action, index) => (
                  <button
                    key={index}
                    onClick={action.onClick}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      action.variant === 'danger'
                        ? 'text-white bg-red-600 hover:bg-red-700'
                        : action.variant === 'secondary'
                        ? 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                        : 'text-white bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-4 hover:opacity-80 transition-opacity"
            aria-label="Close banner"
          >
            <XIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
```

### 5. Page Layout Template

```typescript
import React from 'react'
import { Header } from '../components/dashboard/Header'

interface PageLayoutProps {
  children: React.ReactNode
  userName: string
  companyName: string
}

export function PageLayout({
  children,
  userName,
  companyName,
}: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={userName} companyName={companyName} />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
```

---

## Best Practices

### 1. Currency Formatting

**Always use this helper function:**
```typescript
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}
```

**Usage:**
```tsx
<div className="text-2xl font-bold text-black">
  {formatCurrency(125000.5)}
</div>
// Output: $125,000.50
```

### 2. Date Formatting

```typescript
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 60) return `${diffMins} minutes ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  return `${diffDays} days ago`
}
```

### 3. Status Badges

```typescript
interface StatusBadgeProps {
  status: 'pending' | 'submitted' | 'processing' | 'hld' | 'ok' | 'denied' | 'force_close'
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const statusConfig = {
    pending: { color: 'bg-gray-100 text-gray-800', defaultLabel: 'Pending' },
    submitted: { color: 'bg-blue-100 text-blue-800', defaultLabel: 'Submitted' },
    processing: { color: 'bg-orange-100 text-orange-800', defaultLabel: 'Processing' },
    hld: { color: 'bg-red-100 text-red-800', defaultLabel: 'HLD' },
    ok: { color: 'bg-green-100 text-green-800', defaultLabel: 'OK' },
    denied: { color: 'bg-red-100 text-red-800', defaultLabel: 'Denied' },
    force_close: { color: 'bg-red-100 text-red-800', defaultLabel: 'Force Closed' },
  }

  const config = statusConfig[status]

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
      {label || config.defaultLabel}
    </span>
  )
}
```

### 4. Loading States

```typescript
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }

  return (
    <div className="flex items-center justify-center p-8">
      <div
        className={`${sizeClasses[size]} border-4 border-gray-200 border-t-black rounded-full animate-spin`}
      />
    </div>
  )
}

// Skeleton loader for cards
export function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
      <div className="h-8 bg-gray-200 rounded w-1/2"></div>
    </div>
  )
}
```

### 5. Error Handling

```typescript
interface ErrorDisplayProps {
  error: Error | string
  onRetry?: () => void
}

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const errorMessage = error instanceof Error ? error.message : error

  return (
    <div className="bg-red-50 border border-red-200 p-6 rounded">
      <div className="flex items-start space-x-3">
        <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900 mb-1">
            Error
          </h3>
          <p className="text-sm text-red-800">{errorMessage}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## Common Patterns

### 1. Conditional Rendering

```typescript
// Empty state pattern
if (data.length === 0) {
  return <EmptyState title="No items" description="..." />
}

// Conditional display
{showBanner && data.length > 0 && (
  <Banner data={data} />
)}
```

### 2. Event Handlers

```typescript
// Always use arrow functions for handlers
const handleClick = (id: string) => {
  // Handler logic
}

// Pass to component
<button onClick={() => handleClick(id)}>
  Click
</button>

// Or use bind for complex handlers
const handleAction = useCallback((item: Item) => {
  // Handler logic
}, [dependencies])
```

### 3. State Management

```typescript
// Simple state
const [data, setData] = useState<DataType>(initialData)

// State with loading
const [data, setData] = useState<DataType | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<Error | null>(null)

// Derived state
const redWarnings = data.warnings.filter(w => w.type === 'red').length
```

### 4. Props Destructuring

```typescript
// Always destructure props
export function Component({
  prop1,
  prop2,
  optionalProp,
  onAction,
}: ComponentProps) {
  // Component body
}
```

---

## Icon Usage

### Import Pattern
```typescript
import { IconName } from 'lucide-react'
```

### Common Icons
- `AlertCircleIcon` - Errors, warnings
- `AlertTriangleIcon` - Warnings, alerts
- `CheckCircleIcon` - Success, completed
- `XIcon` - Close, dismiss
- `PlusCircleIcon` - Add, create
- `LogOutIcon` - Logout
- `DollarSignIcon` - Money, currency
- `FileTextIcon` - Documents, invoices
- `TrendingUpIcon` - Growth, metrics
- `SearchIcon` - Search
- `FilterIcon` - Filter
- `DownloadIcon` - Download
- `UploadIcon` - Upload
- `EditIcon` - Edit
- `TrashIcon` - Delete

### Icon Sizing
```tsx
// Small icons (inline with text)
<IconName className="w-4 h-4" />

// Medium icons (buttons, headers)
<IconName className="w-5 h-5" />

// Large icons (empty states, features)
<IconName className="w-6 h-6" />
```

### Icon Colors
```tsx
// Default (gray)
<IconName className="w-5 h-5 text-gray-400" />

// Primary (black)
<IconName className="w-5 h-5 text-black" />

// Status colors
<IconName className="w-5 h-5 text-red-600" />
<IconName className="w-5 h-5 text-green-600" />
<IconName className="w-5 h-5 text-yellow-600" />
```

---

## Responsive Design

### Breakpoints (Tailwind Default)
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

### Responsive Patterns

**Grid Layouts:**
```tsx
// 1 column mobile, 2 tablet, 4 desktop
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
```

**Text Visibility:**
```tsx
// Hide on mobile, show on desktop
<span className="hidden sm:inline">Full Text</span>

// Show on mobile, hide on desktop
<span className="sm:hidden">Short Text</span>
```

**Navigation:**
```tsx
// Horizontal on desktop, hamburger on mobile
<nav className="hidden md:flex space-x-1">
  {/* Desktop nav */}
</nav>
<button className="md:hidden">
  {/* Mobile menu button */}
</button>
```

**Container Width:**
```tsx
// Max width container with padding
<div className="max-w-[1200px] mx-auto px-6">
  {/* Content */}
</div>
```

---

## Accessibility

### ARIA Labels
```tsx
<button
  aria-label="Close banner"
  onClick={onDismiss}
>
  <XIcon className="w-5 h-5" />
</button>
```

### Keyboard Navigation
- All interactive elements should be keyboard accessible
- Use semantic HTML (`<button>`, `<nav>`, `<header>`)
- Maintain logical tab order

### Color Contrast
- Text on white: Use `text-black` or `text-gray-900`
- Text on colored backgrounds: Ensure WCAG AA compliance
- Don't rely solely on color for information

### Focus States
```tsx
// Tailwind includes focus states by default
<button className="focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2">
  Button
</button>
```

---

## File Naming Conventions

- **Components:** PascalCase - `SummaryCards.tsx`
- **Types:** PascalCase - `dashboard.ts`
- **Utils:** camelCase - `formatCurrency.ts`
- **Constants:** UPPER_SNAKE_CASE - `API_ENDPOINTS.ts`
- **Hooks:** camelCase with `use` prefix - `useDashboard.ts`

---

## Code Organization

### Import Order
```typescript
// 1. React imports
import React, { useState, useEffect } from 'react'

// 2. Third-party libraries
import { IconName } from 'lucide-react'
import { PieChart } from 'recharts'

// 3. Internal components
import { Header } from '../components/dashboard/Header'
import { SummaryCards } from '../components/dashboard/SummaryCards'

// 4. Types
import { DashboardData } from '../types/dashboard'

// 5. Utils/helpers
import { formatCurrency } from '../utils/format'

// 6. Data/mocks
import { mockDashboardData } from '../data/mockDashboard'
```

### Component Structure Order
1. Imports
2. Type definitions (if local)
3. Component function
4. Helper functions (if small)
5. Return JSX

---

## Testing Considerations

### Component Testability
- Keep components pure and testable
- Extract business logic to hooks or utils
- Use props for all external dependencies
- Mock data for development

### Example Test Structure
```typescript
// Component should be easily testable
describe('SummaryCards', () => {
  it('displays correct currency format', () => {
    // Test implementation
  })
  
  it('handles zero values correctly', () => {
    // Test implementation
  })
})
```

---

## Performance Optimization

### React.memo for Expensive Components
```typescript
export const ExpensiveComponent = React.memo(function ExpensiveComponent({
  data,
}: Props) {
  // Component implementation
})
```

### useCallback for Event Handlers
```typescript
const handleClick = useCallback((id: string) => {
  // Handler logic
}, [dependencies])
```

### useMemo for Expensive Calculations
```typescript
const total = useMemo(() => {
  return data.reduce((sum, item) => sum + item.amount, 0)
}, [data])
```

---

## Common Utility Functions

### Currency Formatting
```typescript
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}
```

### Date Formatting
```typescript
export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
```

### Relative Time
```typescript
export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 60) return `${diffMins} minutes ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  if (diffDays < 30) return `${diffDays} days ago`
  return formatDate(dateString)
}
```

---

## Checklist for New Components

- [ ] Component follows naming convention (PascalCase)
- [ ] Props interface defined with TypeScript
- [ ] Uses Tailwind classes (no inline styles)
- [ ] Responsive design implemented
- [ ] Empty states handled
- [ ] Loading states handled (if async)
- [ ] Error states handled (if async)
- [ ] Accessibility attributes added (ARIA labels)
- [ ] Icons imported from lucide-react
- [ ] Currency formatted using helper function
- [ ] Component is exported as named export
- [ ] File placed in correct directory structure
- [ ] Imports organized correctly
- [ ] No console.logs or debug code
- [ ] Follows color palette conventions
- [ ] Hover states and transitions added
- [ ] Mobile responsive tested

---

## Quick Reference

### Common Tailwind Classes
- Container: `max-w-[1200px] mx-auto px-6`
- Card: `bg-white border border-gray-200 p-6`
- Button Primary: `px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors`
- Button Secondary: `px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors`
- Text Primary: `text-black` or `text-gray-900`
- Text Secondary: `text-gray-600`
- Text Muted: `text-gray-500`
- Spacing: `space-y-6` (sections), `gap-5` or `gap-6` (grids)

### Common Patterns
- Empty State: Use `EmptyState` component
- Loading: Use `LoadingSpinner` or `CardSkeleton`
- Error: Use `ErrorDisplay` component
- Status: Use `StatusBadge` component
- Currency: Use `formatCurrency()` helper
- Date: Use `formatDate()` or `formatRelativeTime()` helpers

---

**Last Updated:** 2025-11-29
**Version:** 1.0.0

