'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, CheckCircle, Info, AlertCircle, Trash2, MarkAsRead } from 'lucide-react'

interface Notification {
  id: string
  title: string
  message: string
  type: 'success' | 'info' | 'warning' | 'error'
  date: string
  read: boolean
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      title: 'Scan Completed',
      message: 'Your code scan of project X has completed with 5 issues found',
      type: 'success',
      date: '2024-04-17 10:30 AM',
      read: false,
    },
    {
      id: '2',
      title: 'GitHub Integration',
      message: 'Your GitHub integration has been successfully configured',
      type: 'success',
      date: '2024-04-17 9:15 AM',
      read: false,
    },
    {
      id: '3',
      title: 'System Update',
      message: 'A new version of CodeSpectra is now available',
      type: 'info',
      date: '2024-04-16 2:00 PM',
      read: true,
    },
    {
      id: '4',
      title: 'Team Invitation',
      message: 'You have been invited to join the Developer Team',
      type: 'info',
      date: '2024-04-16 11:30 AM',
      read: true,
    },
    {
      id: '5',
      title: 'High Priority Issue',
      message: 'A critical code issue was detected in your main branch',
      type: 'warning',
      date: '2024-04-15 3:45 PM',
      read: true,
    },
  ])

  const handleMarkAsRead = (id: string) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const handleDelete = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id))
  }

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return null
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Bell className="w-8 h-8 text-primary" />
            Notifications
          </h1>
          <p className="text-muted-foreground mt-2">Stay updated with your platform activity</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllAsRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {notifications.map((notification) => (
          <Card
            key={notification.id}
            className={`p-4 transition-colors ${!notification.read ? 'bg-primary/5' : ''}`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 mt-1">
                {getTypeIcon(notification.type)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground">{notification.title}</h3>
                  {!notification.read && <Badge className="text-xs">New</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
                <p className="text-xs text-muted-foreground/60">{notification.date}</p>
              </div>
              <div className="flex gap-2">
                {!notification.read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMarkAsRead(notification.id)}
                    title="Mark as read"
                  >
                    <MarkAsRead className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(notification.id)}
                  className="text-red-600"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {notifications.length === 0 && (
        <Card className="p-12 text-center">
          <Bell className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">No notifications</p>
          <p className="text-muted-foreground text-sm">You&apos;re all caught up!</p>
        </Card>
      )}
    </div>
  )
}
