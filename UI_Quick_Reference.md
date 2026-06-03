# UI Quick Reference Card
## Credyx A/R Solutions - React + TypeScript + Tailwind

---

## 🎨 Color Palette

| Purpose | Color | Tailwind Class |
|---------|-------|----------------|
| Primary Text | Black | `text-black` |
| Secondary Text | Gray-600 | `text-gray-600` |
| Muted Text | Gray-500 | `text-gray-500` |
| Background | Gray-50 | `bg-gray-50` |
| Card Background | White | `bg-white` |
| Border | Gray-200 | `border-gray-200` |
| Success | Green-600 | `text-green-600` / `bg-green-600` |
| Warning | Yellow-600 | `text-yellow-600` / `bg-yellow-600` |
| Danger | Red-600 | `text-red-600` / `bg-red-600` |
| Info | Blue-600 | `text-blue-600` / `bg-blue-600` |

---

## 📦 Component Structure

```tsx
import React from 'react'
import { IconName } from 'lucide-react'

interface ComponentProps {
  prop: string
  onAction?: () => void
}

export function Component({ prop, onAction }: ComponentProps) {
  return <div className="bg-white border border-gray-200 p-6">...</div>
}
```

---

## 🎯 Common Patterns

### Card Container
```tsx
<div className="bg-white border border-gray-200 p-6">
  <h2 className="text-lg font-bold text-black mb-4">Title</h2>
  {/* Content */}
</div>
```

### Primary Button
```tsx
<button className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 transition-colors">
  Button
</button>
```

### Secondary Button
```tsx
<button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">
  Button
</button>
```

### Status Badge
```tsx
<span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-800">
  Status
</span>
```

### Table Row (Alternating)
```tsx
<tr className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
```

### Grid Layout
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
```

---

## 💰 Currency Formatting

```tsx
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

// Usage
{formatCurrency(125000.5)} // $125,000.50
```

---

## 📅 Date Formatting

```tsx
// Format date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// Relative time
const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  
  if (diffMins < 60) return `${diffMins} minutes ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  return formatDate(dateString)
}
```

---

## 🎭 Empty State

```tsx
if (data.length === 0) {
  return (
    <div className="bg-white border border-gray-200 p-12">
      <div className="text-center">
        <div className="text-6xl mb-4 text-gray-300">📊</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No items</h3>
        <p className="text-sm text-gray-600">Get started by creating your first item.</p>
      </div>
    </div>
  )
}
```

---

## ⏳ Loading State

```tsx
<div className="flex items-center justify-center p-8">
  <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
</div>
```

---

## ❌ Error State

```tsx
<div className="bg-red-50 border border-red-200 p-6 rounded">
  <h3 className="text-sm font-semibold text-red-900 mb-1">Error</h3>
  <p className="text-sm text-red-800">{error.message}</p>
</div>
```

---

## 📱 Responsive Breakpoints

- `sm:` 640px
- `md:` 768px
- `lg:` 1024px
- `xl:` 1280px

**Example:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
```

---

## 🎯 Icon Sizes

- Small (inline): `w-4 h-4`
- Medium (buttons): `w-5 h-5`
- Large (features): `w-6 h-6`

**Example:**
```tsx
<AlertCircleIcon className="w-5 h-5 text-red-600" />
```

---

## 📐 Spacing

- Section spacing: `space-y-6` (24px)
- Grid gap: `gap-5` (20px) or `gap-6` (24px)
- Card padding: `p-6` (24px)
- Small padding: `p-4` (16px)

---

## 🔤 Typography

- Page title: `text-lg font-bold text-black mb-4`
- Card title: `text-lg font-bold text-black mb-4`
- Body text: `text-sm text-gray-900`
- Secondary text: `text-sm text-gray-600`
- Large number: `text-2xl font-bold text-black`

---

## 📋 Import Order

```tsx
// 1. React
import React, { useState } from 'react'

// 2. Third-party
import { IconName } from 'lucide-react'

// 3. Components
import { Header } from '../components/dashboard/Header'

// 4. Types
import { DashboardData } from '../types/dashboard'

// 5. Utils
import { formatCurrency } from '../utils/format'

// 6. Data
import { mockData } from '../data/mock'
```

---

## ✅ Component Checklist

- [ ] TypeScript props interface defined
- [ ] Named export used
- [ ] Tailwind classes (no inline styles)
- [ ] Responsive design
- [ ] Empty state handled
- [ ] Loading state (if async)
- [ ] Error state (if async)
- [ ] ARIA labels added
- [ ] Currency formatted correctly
- [ ] Hover states added
- [ ] Transitions added

---

## 🚀 Quick Copy Templates

**See `/templates` folder for:**
- `ComponentTemplate.tsx` - Basic component
- `SummaryCardTemplate.tsx` - Summary card
- `DataTableTemplate.tsx` - Data table
- `PageTemplate.tsx` - Full page
- `TypeDefinitionTemplate.ts` - Type definitions
- `UtilityFunctionsTemplate.ts` - Utility functions

---

**For detailed documentation, see `UI_Template_Reference.md`**

