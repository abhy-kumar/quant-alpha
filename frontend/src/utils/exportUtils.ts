/**
 * exportUtils.ts
 * --------------
 * Client-side CSV and JSON data export utility for Quant Alpha.
 */

/**
 * Downloads a string payload as a CSV or JSON file in the browser.
 */
export function downloadFile(filename: string, content: string, mimeType: string = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Converts an array of flat JavaScript objects to CSV string.
 */
export function exportToCSV<T extends Record<string, any>>(filename: string, data: T[], columns?: { key: keyof T; label: string }[]) {
  if (!data || data.length === 0) return

  const cols = columns || Object.keys(data[0]).map(k => ({ key: k, label: k }))
  const headerRow = cols.map(c => `"${String(c.label).replace(/"/g, '""')}"`).join(',')

  const bodyRows = data.map(row => {
    return cols.map(c => {
      const val = row[c.key]
      if (val === null || val === undefined) return '""'
      if (typeof val === 'number') return String(val)
      const strVal = String(val).replace(/"/g, '""')
      return `"${strVal}"`
    }).join(',')
  })

  const csvContent = [headerRow, ...bodyRows].join('\n')
  downloadFile(filename, csvContent, 'text/csv;charset=utf-8;')
}

/**
 * Exports data as a formatted JSON file.
 */
export function exportToJSON<T>(filename: string, data: T) {
  const jsonContent = JSON.stringify(data, null, 2)
  downloadFile(filename, jsonContent, 'application/json;charset=utf-8;')
}
