'use client'

import { Card } from '@/components/ui/card'
import { BarChart3, TrendingUp, Users, Activity } from 'lucide-react'

export default function Analytics() {
  const stats = [
    { label: 'Total Users', value: '1,234', change: '+12%', icon: Users },
    { label: 'Active Users', value: '892', change: '+5%', icon: Activity },
    { label: 'Total Challenges', value: '456', change: '+8%', icon: TrendingUp },
    { label: 'Completion Rate', value: '78%', change: '+3%', icon: BarChart3 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">System Analytics</h1>
        <p className="text-muted-foreground mt-1">Platform statistics and insights</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold mt-2">{stat.value}</p>
                  <p className="text-xs text-green-600 mt-2">{stat.change} from last month</p>
                </div>
                <Icon className="w-8 h-8 text-primary/50" />
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Activity Overview</h2>
        <div className="text-center py-12 text-muted-foreground">
          <p>Chart visualization would go here</p>
        </div>
      </Card>
    </div>
  )
}
