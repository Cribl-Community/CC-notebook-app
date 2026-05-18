import { describe, expect, it } from 'vitest'
import { EXAMPLE_DATA_URLS, exampleDataRawUrl } from './exampleDataUrls'

describe('exampleDataUrls', () => {
  it('builds raw GitHub URLs', () => {
    expect(exampleDataRawUrl('malware-hunt', 'pe_imports_hunt.csv')).toBe(
      'https://raw.githubusercontent.com/michaelhyatt/notebook-app-example-data/main/malware-hunt/pe_imports_hunt.csv',
    )
    expect(EXAMPLE_DATA_URLS.dailyMinTemperatures).toContain('daily-min-temperatures.csv')
  })
})
