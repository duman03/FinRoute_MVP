import { usePushNotification } from '../hooks/usePushNotification';

export function PushNotificationBridge(): null {
  usePushNotification();
  return null;
}
