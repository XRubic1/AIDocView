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
        <h2 className="text-lg font-bold text-black mb-4">Table Title</h2>
        <div className="text-center text-gray-500 py-8">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200">
      <div className="p-6">
        <h2 className="text-lg font-bold text-black mb-4">Table Title</h2>
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
    </div>
  )
}

