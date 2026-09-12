// node-cron zamanlayici sarmalayici (otomatik yorum tarama)
import cron from 'node-cron'

let task = null
let current = { running: false, schedule: null, lastRun: null, lastResult: null }

export function getSchedulerState() {
  return { ...current }
}

export function setLast(result) {
  current.lastRun = new Date().toISOString()
  current.lastResult = result
}

export function startScheduler(schedule, fn) {
  stopScheduler()
  let sched = schedule
  if (!cron.validate(sched)) sched = '*/15 * * * *'
  task = cron.schedule(sched, async () => {
    try {
      const r = await fn()
      setLast(r)
    } catch (e) {
      setLast({ error: e.message })
    }
  })
  current.running = true
  current.schedule = sched
  return true
}

export function stopScheduler() {
  if (task) {
    try { task.stop() } catch (e) {}
    task = null
  }
  current.running = false
}

// Bagimsiz zamanli paylasim worker'i (her dakika calisir)
let scheduleTask = null
export function startScheduleWorker(fn) {
  if (scheduleTask) return
  scheduleTask = cron.schedule('* * * * *', async () => {
    try { await fn() } catch (e) {}
  })
}
