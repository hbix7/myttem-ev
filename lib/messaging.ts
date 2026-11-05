import { useStore } from '@/lib/store'
import { useMasterStore } from '@/lib/store/master'
import { useWhatsAppStore } from '@/lib/store/whatsapp'
import { planNotification, type ChannelHealth } from '@/lib/store/comms'
import type { NotificationResult } from '@/lib/types'

export function channelHealth(): ChannelHealth {
  const wa = useWhatsAppStore.getState()
  return {
    flagOn: useMasterStore.getState().flags.C,
    numberStatus: wa.numberStatus,
    templateStatus: wa.templateStatus,
    parallelRun: wa.parallelRun,
    failDelivery: wa.failNextDelivery,
  }
}

/** Plans the message for an event, records it in the job's message log and returns what was sent. */
export function dispatch(jobId: string, event: string, subject: string = event): NotificationResult {
  const { consumedFailure, ...result } = planNotification(jobId, event, subject, channelHealth())
  if (consumedFailure) useWhatsAppStore.getState().armDeliveryFailure(false)
  useStore.setState(s => ({ notifications: [...s.notifications, ...result.notifications] }))
  return result
}
