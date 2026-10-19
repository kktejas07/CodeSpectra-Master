/**
 * Stage handler registration (side-effect imports). The engine imports this
 * module before running onEnter, so every handler is registered exactly once.
 *   applied + screening, assessment  → core (this folder)
 *   bot_screen                       → lib/ats/screening (bot screening part)
 *   virtual / f2f interviews         → lib/ats/interviews (interviews part)
 *   hr_round                         → lib/ats/hr (HR round part)
 */
import './screening'
import './assessment'
import '@/lib/ats/screening/handler'
import '@/lib/ats/interviews/handler'
import '@/lib/ats/hr/handler'
import '@/lib/ats/bgv/handler'
