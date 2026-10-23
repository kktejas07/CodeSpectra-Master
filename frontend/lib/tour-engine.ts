'use client'

/**
 * SEO-050: the driver.js runtime and its CSS, split out of lib/tour-driver.ts
 * so they load only when a tour or hint actually starts (signed-in pages),
 * never on public pages that merely mount TourProvider.
 */
import 'driver.js/dist/driver.css'
import 'driver.js/dist/hints.css'
import '@/app/driver-tour.css'

export { driver } from 'driver.js'
export { hints } from 'driver.js/hints'
