'use client'

import { useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import { resolveAdminAccess } from '@/lib/adminRoles'

type AdminUser = {
  id: string
  email: string
  role: string
  admin_team_role?: string
  full_name: string
  heard_from?: string
  email_status?: string
  status: string
}

type CategoryView = {
  title: string
  description: string
  data: AdminUser[]
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [canManageUsers, setCanManageUsers] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<CategoryView | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [actionNotice, setActionNotice] = useState('')
  const [userWaivers, setUserWaivers] = useState<Array<{ id: string; waiver_title: string; org_name: string; full_name: string; signed_at: string }>>([])
  const [waiversLoading, setWaiversLoading] = useState(false)
  const roleOptions = ['admin', 'org_admin', 'school_admin', 'club_admin', 'travel_admin', 'coach', 'assistant_coach', 'athlete']
  const teamRoleOptions = ['superadmin', 'support', 'finance', 'ops']

  useEffect(() => {
    let active = true
    const loadUsers = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch('/api/admin/users')
      if (!response.ok) {
        if (active) {
          setNotice('Unable to load users.')
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      setUsers((payload.users || []) as AdminUser[])
      setCanManageUsers(Boolean(payload.can_manage))
      setLoading(false)
    }
    loadUsers()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selectedUser) { setUserWaivers([]); return }
    let active = true
    const loadWaivers = async () => {
      setWaiversLoading(true)
      const res = await fetch(`/api/admin/waivers?user_id=${selectedUser.id}`)
      if (res.ok && active) {
        const data = await res.json()
        setUserWaivers(data.signatures || [])
      }
      if (active) setWaiversLoading(false)
    }
    loadWaivers()
    return () => { active = false }
  }, [selectedUser])

  // Keep selectedCategory data in sync when users list updates
  useEffect(() => {
    if (!selectedCategory) return
    const title = selectedCategory.title
    setSelectedCategory((prev) => {
      if (!prev) return prev
      const updated =
        title === 'Admin staff' ? adminStaff :
        title === 'Coaches' ? coaches :
        athletes
      return { ...prev, data: updated }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users])

  const coaches = useMemo(() => users.filter((u) => String(u.role || '').toLowerCase() === 'coach'), [users])
  const athletes = useMemo(() => users.filter((u) => String(u.role || '').toLowerCase() === 'athlete'), [users])
  const adminStaff = useMemo(() => users.filter((u) => resolveAdminAccess(u).isAdmin), [users])

  const categories: CategoryView[] = [
    { title: 'Coaches', description: 'Active coaching accounts', data: coaches },
    { title: 'Athletes', description: 'Registered athletes', data: athletes },
    { title: 'Admin staff', description: 'Support, finance, ops, superadmin', data: adminStaff },
  ]

  const updateUserRole = async (userId: string, role: string) => {
    if (!canManageUsers) { setActionNotice('Read-only access. Superadmin is required to manage users.'); return }
    const response = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_role', payload: { user_id: userId, role } }),
    })
    if (!response.ok) { setActionNotice('Unable to update role.'); return }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
    setSelectedUser((prev) => (prev?.id === userId ? { ...prev, role } : prev))
    setActionNotice('Role updated.')
  }

  const updateSuspended = async (userId: string, suspended: boolean) => {
    if (!canManageUsers) { setActionNotice('Read-only access. Superadmin is required to manage users.'); return }
    const response = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_suspended', payload: { user_id: userId, suspended } }),
    })
    if (!response.ok) { setActionNotice('Unable to update suspension.'); return }
    const status = suspended ? 'Suspended' : 'Active'
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status } : u)))
    setSelectedUser((prev) => (prev?.id === userId ? { ...prev, status } : prev))
    setActionNotice(`User ${status.toLowerCase()}.`)
  }

  const updateAdminTeamRole = async (userId: string, adminTeamRole: string) => {
    if (!canManageUsers) { setActionNotice('Read-only access. Superadmin is required to manage users.'); return }
    const response = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_admin_team_role', payload: { user_id: userId, admin_team_role: adminTeamRole } }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setActionNotice(payload?.error || 'Unable to update admin team role.')
      return
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, admin_team_role: adminTeamRole } : u)))
    setSelectedUser((prev) => (prev?.id === userId ? { ...prev, admin_team_role: adminTeamRole } : prev))
    setActionNotice('Admin team role updated.')
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Users</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Click a category to browse users.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            {notice ? <p className="text-sm text-[#6b5f55]">{notice}</p> : null}
            <section className="grid gap-4 md:grid-cols-3">
              {loading ? (
                <div className="md:col-span-3">
                  <LoadingState label="Loading users..." />
                </div>
              ) : (
                categories.map((cat) => (
                  <button
                    key={cat.title}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:bg-[#f5f5f5] active:scale-[0.98]"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{cat.title}</p>
                    <p className="mt-2 text-3xl font-semibold text-[#191919]">{cat.data.length}</p>
                    <p className="mt-1 text-xs text-[#6b5f55]">{cat.description}</p>
                  </button>
                ))
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Category list modal */}
      {selectedCategory && !selectedUser ? (
        <div
          className="fixed inset-0 z-[500] flex items-end justify-center bg-black/45 backdrop-blur-[2px] px-4 pb-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedCategory(null) }}
        >
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white shadow-xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[#dcdcdc]">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{selectedCategory.description}</p>
                <h2 className="mt-1 text-2xl font-semibold text-[#191919]">{selectedCategory.title}</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                  {selectedCategory.data.length}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* Scrollable list */}
            <div className="overflow-y-auto px-6 py-4 space-y-3 flex-1">
              {selectedCategory.data.length === 0 ? (
                <EmptyState title="No users found." description="No users in this category yet." />
              ) : (
                selectedCategory.data.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => { setSelectedUser(user); setActionNotice('') }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-left text-sm text-[#191919] transition hover:border-[#191919]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{user.full_name || user.email || 'User'}</p>
                      <p className="truncate text-xs text-[#6b5f55]">{user.email}</p>
                      <p className="mt-1 text-[11px] text-[#6b5f55]">
                        Email status: {user.email_status || 'Email verification pending'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                      {user.status || 'Active'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* User detail modal */}
      {selectedUser ? (
        <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/45 backdrop-blur-[2px] px-4 pb-4 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white shadow-xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[#dcdcdc]">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">User profile</p>
                <h2 className="mt-1 text-2xl font-semibold text-[#191919]">{selectedUser.full_name || 'User details'}</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedUser(null); setActionNotice('') }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {/* Scrollable content */}
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1 text-sm text-[#191919]">
              <div className="space-y-3">
                {[
                  { label: 'Role', value: selectedUser.role || 'unknown' },
                  {
                    label: 'Admin team role',
                    value:
                      selectedUser.role === 'admin' || selectedUser.role === 'superadmin'
                        ? (selectedUser.admin_team_role || 'superadmin')
                        : 'N/A',
                  },
                  { label: 'Status', value: selectedUser.status || 'Active' },
                  { label: 'Email status', value: selectedUser.email_status || 'Email verification pending' },
                  { label: 'Heard from', value: selectedUser.heard_from || 'Not captured' },
                  { label: 'User ID', value: selectedUser.id },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{item.label}</p>
                    <p className="mt-1 break-all font-semibold text-[#191919]">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {!canManageUsers ? (
                  <p className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs text-[#6b5f55]">
                    Read-only mode: you can view users, but only superadmin can change roles or suspension.
                  </p>
                ) : null}
                <label className="block space-y-2 text-sm">
                  <span className="text-xs font-semibold text-[#6b5f55]">Role</span>
                  <select
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={selectedUser.role}
                    disabled={!canManageUsers}
                    onChange={(e) => updateUserRole(selectedUser.id, e.target.value)}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </label>
                {selectedUser.role === 'admin' || selectedUser.role === 'superadmin' ? (
                  <label className="block space-y-2 text-sm">
                    <span className="text-xs font-semibold text-[#6b5f55]">Admin team role</span>
                    <select
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      value={selectedUser.admin_team_role || 'superadmin'}
                      disabled={!canManageUsers}
                      onChange={(e) => updateAdminTeamRole(selectedUser.id, e.target.value)}
                    >
                      {teamRoleOptions.map((teamRole) => (
                        <option key={teamRole} value={teamRole}>{teamRole}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {canManageUsers ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                      onClick={() => updateSuspended(selectedUser.id, selectedUser.status !== 'Suspended')}
                    >
                      {selectedUser.status === 'Suspended' ? 'Re-enable user' : 'Suspend user'}
                    </button>
                  </div>
                ) : null}
                {actionNotice ? <p className="text-xs text-[#6b5f55]">{actionNotice}</p> : null}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">Waiver signatures</p>
                {waiversLoading ? (
                  <p className="mt-2 text-xs text-[#6b5f55]">Loading…</p>
                ) : userWaivers.length === 0 ? (
                  <p className="mt-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs text-[#6b5f55]">
                    No waiver signatures on record.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {userWaivers.map((sig) => (
                      <div key={sig.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs">
                        <p className="font-semibold text-[#191919]">{sig.waiver_title}</p>
                        <p className="text-[#6b5f55]">
                          {sig.org_name} · Signed as &quot;{sig.full_name}&quot; ·{' '}
                          {new Date(sig.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Back button */}
            {selectedCategory ? (
              <div className="px-6 pb-5 pt-2 border-t border-[#dcdcdc]">
                <button
                  type="button"
                  onClick={() => { setSelectedUser(null); setActionNotice('') }}
                  className="text-xs font-semibold text-[#6b5f55] hover:text-[#191919] transition"
                >
                  ← Back to {selectedCategory.title}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}
