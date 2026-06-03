# Credyx A/R Solutions

Accounts Receivable Management System built with Next.js, TypeScript, and Tailwind CSS.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
.
├── app/                    # Next.js App Router
│   ├── components/         # React components
│   │   ├── dashboard/      # Dashboard-specific components
│   │   └── ui/             # Reusable UI components
│   ├── data/               # Mock data and fixtures
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page
├── templates/              # Component templates
├── public/                 # Static assets
├── next.config.ts          # Next.js configuration
├── tailwind.config.ts      # Tailwind CSS configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies and scripts
```

## 🛠️ Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## 🎨 Styling

This project uses:
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Recharts** for data visualization

See `UI_Template_Reference.md` for detailed styling guidelines and component patterns.

## 📚 Documentation

- **UI Template Reference**: `UI_Template_Reference.md` - Comprehensive UI guidelines
- **Quick Reference**: `UI_Quick_Reference.md` - Quick lookup cheat sheet
- **Developer Specification**: `Developer_Specification.md` - System requirements
- **Templates**: `templates/` - Ready-to-use component templates

## 🧩 Component Templates

Copy templates from `templates/` folder when creating new components:
- `ComponentTemplate.tsx` - Basic component
- `SummaryCardTemplate.tsx` - Summary card
- `DataTableTemplate.tsx` - Data table
- `PageTemplate.tsx` - Full page
- `TypeDefinitionTemplate.ts` - Type definitions
- `UtilityFunctionsTemplate.ts` - Utility functions

## 🔧 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Charts**: Recharts
- **Package Manager**: npm

## 📝 Code Style

- Use TypeScript for all files
- Follow the patterns in `UI_Template_Reference.md`
- Use named exports for components
- Follow the import order guidelines
- Use Tailwind classes (no inline styles)

## 🚧 Development

### Adding New Components

1. Copy a template from `templates/`
2. Place in appropriate directory (`app/components/`)
3. Follow naming conventions (PascalCase)
4. Add TypeScript types
5. Use Tailwind for styling

### Adding New Pages

1. Create a new file in `app/` directory
2. Export a default component
3. Use the `PageTemplate.tsx` as reference
4. Follow the layout structure

## 📄 License

ISC

---

For detailed development guidelines, see `UI_Template_Reference.md`.

