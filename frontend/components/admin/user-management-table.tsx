'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Users, Search, Edit2, Trash2, MoreVertical, Shield, KeyRound, Mail, CheckSquare, Square, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getRoleLabel, normalizeUserRole } from '@/lib/rbac'
import { exportUsersToXLS } from '@/lib/export-excel'
import { EmptyState } from '@/components/ui/empty-state'
import { useAdminT } from '@/lib/i18n/admin'

interface User {
  id: string
  name: string
  email: string
  role: string
  status: 'active' | 'inactive'
  joinedAt: string
  lastActive: string
  plan?: string
}

interface UserManagementTableProps {
  users?: User[]
  onEdit?: (user: User) => void
  onDelete?: (userId: string) => void
  onRoleChange?: (user: User) => void
  onResetPassword?: (userId: string) => void
  onSendResetEmail?: (userId: string) => void
  onBulkDelete?: (userIds: string[]) => void
  onBulkRoleChange?: (userIds: string[], role: string) => void
  onExportXLS?: (selectedUsers?: User[]) => void
}

export function UserManagementTable({ 
  users = [],
  onEdit,
  onDelete,
  onRoleChange,
  onResetPassword,
  onSendResetEmail,
  onBulkDelete,
  onBulkRoleChange,
  onExportXLS,
}: UserManagementTableProps) {
  const { t } = useAdminT()
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filteredUsers = useMemo(() => users.filter((user) => {
    const matchesSearch =
      (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    const canon = normalizeUserRole(user.role)
    const matchesRole =
      roleFilter === 'all' || canon === (roleFilter as 'superadmin' | 'tenant_admin' | 'user')
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter
    return matchesSearch && matchesRole && matchesStatus
  }), [users, searchQuery, roleFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedUsers = filteredUsers.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => { setPage(1) }, [searchQuery, roleFilter, statusFilter, pageSize])

  const filteredIds = useMemo(() => new Set(filteredUsers.map(u => u.id)), [filteredUsers])
  const allSelected = filteredUsers.length > 0 && filteredUsers.every(u => selected.has(u.id))
  const someSelected = selected.size > 0

  const toggleSelectAll = () => {
    const next = new Set(selected)
    if (allSelected) {
      filteredIds.forEach(id => next.delete(id))
    } else {
      filteredIds.forEach(id => next.add(id))
    }
    setSelected(next)
  }

  const toggleUser = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const getRoleColor = (role: string) => {
    switch (normalizeUserRole(role)) {
      case 'superadmin': return 'danger'
      case 'tenant_admin': return 'info'
      default: return 'secondary'
    }
  }

  const handleExportAllOrFiltered = () => {
    if (onExportXLS) {
      onExportXLS(filteredUsers)
    } else {
      exportUsersToXLS(filteredUsers, `user_management_${new Date().toISOString().split('T')[0]}.xlsx`)
    }
  }

  const handleExportSelected = () => {
    const selectedUsers = users.filter((u) => selected.has(u.id))
    if (onExportXLS) {
      onExportXLS(selectedUsers)
    } else {
      exportUsersToXLS(selectedUsers, `user_management_selected_${new Date().toISOString().split('T')[0]}.xlsx`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input aria-label={t('userTable.searchAria')}
            placeholder={t('userTable.searchPlaceholder')}
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger aria-label={t('userTable.filterRole')} className="w-[160px]">
            <SelectValue placeholder={t('userTable.allRoles')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('userTable.allRoles')}</SelectItem>
            <SelectItem value="superadmin">{t('userTable.roleSuperadmin')}</SelectItem>
            <SelectItem value="tenant_admin">{t('userTable.roleTenantAdmin')}</SelectItem>
            <SelectItem value="user">{t('userTable.roleUser')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label={t('common.filterByStatus')} className="w-35">
            <SelectValue placeholder={t('userTable.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('userTable.allStatuses')}</SelectItem>
            <SelectItem value="active">{t('userTable.active')}</SelectItem>
            <SelectItem value="inactive">{t('userTable.inactive')}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="gap-2 shrink-0 border-primary/20 hover:bg-primary/5"
          onClick={handleExportAllOrFiltered}
          disabled={filteredUsers.length === 0}

        >
          <Download className="w-4 h-4 text-primary" />
          {t('userTable.exportXls')}
        </Button>
      </div>

      {someSelected && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-sm font-medium">{t('userTable.selected', { count: selected.size })}</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleExportSelected}>
            <Download className="w-3.5 h-3.5 mr-1" />
            {t('userTable.exportSelected')}
          </Button>
          {onBulkRoleChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Shield className="w-3.5 h-3.5 mr-1" />
                  {t('userTable.changeRole')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { onBulkRoleChange(Array.from(selected), 'user'); setSelected(new Set()) }}>
                  {t('userTable.setUser')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { onBulkRoleChange(Array.from(selected), 'tenant_admin'); setSelected(new Set()) }}>
                  {t('userTable.setOrgAdmin')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { onBulkRoleChange(Array.from(selected), 'superadmin'); setSelected(new Set()) }}>
                  {t('userTable.setPlatformAdmin')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onBulkDelete && (
            <Button variant="outline" size="sm" className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => { onBulkDelete(Array.from(selected)); setSelected(new Set()) }}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              {t('common.delete')}
            </Button>
          )}
        </div>
      )}

      <Card className="overflow-hidden rounded-2xl border-border/70">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="sticky left-0 z-10 w-10 bg-muted py-3 px-4">
                  <button
                    onClick={toggleSelectAll}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={allSelected ? t('userTable.deselectAll') : t('userTable.selectAll')}
                  >
                    {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="sticky left-10 z-10 bg-muted text-left py-3 px-4 font-semibold">{t('userTable.colUser')}</th>
                <th className="text-left py-3 px-4 font-semibold">{t('common.email')}</th>
                <th className="text-left py-3 px-4 font-semibold">{t('common.role')}</th>
                <th className="text-left py-3 px-4 font-semibold">{t('common.status')}</th>
                <th className="text-left py-3 px-4 font-semibold">{t('userTable.colJoined')}</th>
                <th className="text-left py-3 px-4 font-semibold">{t('userTable.colLastActive')}</th>
                <th className="text-right py-3 px-4 font-semibold">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-0">
                    <EmptyState
                      variant="search"
                      title={t('userTable.noUsers')}
                      description={t('userTable.noUsersHint')}
                      className="border-0 bg-transparent py-6 md:py-8"
                    />
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr key={user.id} className="group border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="sticky left-0 z-10 w-10 bg-card py-3 px-4 group-hover:bg-muted">
                      <button
                        onClick={() => toggleUser(user.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={t(selected.has(user.id) ? 'userTable.deselect' : 'userTable.select', { name: user.name || user.email })}
                      >
                        {selected.has(user.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="sticky left-10 z-10 max-w-[12rem] truncate bg-card py-3 px-4 font-medium group-hover:bg-muted">{user.name}</td>
                    <td className="py-3 px-4 text-muted-foreground">{user.email}</td>
                    <td className="py-3 px-4">
                      <Badge variant={getRoleColor(user.role)}>
                        {getRoleLabel(normalizeUserRole(user.role))}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={user.status === 'active' ? 'success' : 'secondary'}>
                        {user.status === 'active' ? t('userTable.active') : user.status === 'inactive' ? t('userTable.inactive') : user.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">{user.joinedAt}</td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">{user.lastActive}</td>
                    <td className="py-3 px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" title={t('userTable.moreOptions')} aria-label={t('userTable.moreOptionsFor', { name: user.name || user.email })}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit?.(user)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            {t('userTable.editProfile')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onRoleChange?.(user)}>
                            <Shield className="w-4 h-4 mr-2" />
                            {t('userTable.changeRole')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onResetPassword?.(user.id)}>
                            <KeyRound className="w-4 h-4 mr-2" />
                            {t('userTable.resetPassword')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onSendResetEmail?.(user.id)}>
                            <Mail className="w-4 h-4 mr-2" />
                            {t('userTable.sendReset')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDelete?.(user.id)}
                            className="text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('userTable.deleteUser')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {filteredUsers.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <p>{t('userTable.page', { page: safePage, total: totalPages })}</p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronLeft className="h-3 w-3 mr-1" />{t('userTable.prev')}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                {t('common.next')}<ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger aria-label={t('userTable.rowsPerPage')} className="h-8 w-25 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">{t('userTable.perPage', { count: 10 })}</SelectItem>
                <SelectItem value="15">{t('userTable.perPage', { count: 15 })}</SelectItem>
                <SelectItem value="25">{t('userTable.perPage', { count: 25 })}</SelectItem>
                <SelectItem value="50">{t('userTable.perPage', { count: 50 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}
