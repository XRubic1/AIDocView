# UI Component Templates

This folder contains ready-to-use templates for creating new UI components in the Credyx A/R Solutions application.

## 📁 Available Templates

### 1. `ComponentTemplate.tsx`
**Use for:** Basic, generic components
- Standard component structure
- TypeScript props interface
- Empty state placeholder
- Basic styling structure

### 2. `SummaryCardTemplate.tsx`
**Use for:** Summary/metric cards
- Pre-configured card layout
- Icon support
- Color variants (default, success, warning, danger)
- Click handler support

### 3. `DataTableTemplate.tsx`
**Use for:** Data tables with columns
- Generic table component
- Column configuration
- Empty state handling
- Row click handlers
- Alternating row colors

### 4. `PageTemplate.tsx`
**Use for:** Full page components
- Complete page structure
- Header integration
- Loading state
- Error state
- Empty state
- Main content area

### 5. `TypeDefinitionTemplate.ts`
**Use for:** TypeScript type definitions
- Base entity interface
- Feature-specific types
- Enum-like types
- API response types
- Form data types

### 6. `UtilityFunctionsTemplate.ts`
**Use for:** Utility/helper functions
- Currency formatting
- Date formatting
- Relative time formatting
- Validation functions
- Text manipulation

## 🚀 How to Use

1. **Copy the template** that matches your needs
2. **Rename the file** to match your component name
3. **Update the component name** in the code
4. **Customize** the props, logic, and styling
5. **Follow the patterns** from `UI_Template_Reference.md`

## 📝 Example Workflow

```bash
# 1. Copy template
cp templates/ComponentTemplate.tsx components/dashboard/NewComponent.tsx

# 2. Open and edit
# - Change ComponentName to NewComponent
# - Update props interface
# - Add your logic
# - Customize styling
```

## 🎯 Template Selection Guide

| Need | Template |
|------|----------|
| Simple display component | `ComponentTemplate.tsx` |
| Metric/summary card | `SummaryCardTemplate.tsx` |
| Data table | `DataTableTemplate.tsx` |
| Full page | `PageTemplate.tsx` |
| Type definitions | `TypeDefinitionTemplate.ts` |
| Helper functions | `UtilityFunctionsTemplate.ts` |

## ⚠️ Important Notes

- Always update component names and interfaces
- Remove placeholder comments
- Add proper TypeScript types
- Follow the styling conventions
- Include empty/loading/error states where needed
- Add accessibility attributes (ARIA labels)

## 📚 Additional Resources

- **Full Reference:** `../UI_Template_Reference.md`
- **Quick Reference:** `../UI_Quick_Reference.md`
- **Code Examples:** See existing components in `../components/`

---

**Remember:** These are starting points. Customize them to fit your specific needs while maintaining consistency with the existing codebase.

