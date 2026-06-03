import React from 'react'
// import { IconName } from 'lucide-react' // Replace with actual icon

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
      className={`bg-white p-6 border border-gray-200 ${
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
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

