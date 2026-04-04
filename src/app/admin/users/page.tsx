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
  status: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [canManageUsers, setCanManageUsers] = useState(false)
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
    return () => {
      active = false
    }
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

  const coaches = useMemo(() => users.filter((user) => String(user.role || '').toLowerCase() === 'coach'), [users])
  const athletes = useMemo(() => users.filter((user) => String(user.role || '').toLowerCase() === 'athlete'), [users])
  const adminStaff = useMemo(() => users.filter((user) => {
    return resolveAdminAccess(user).isAdmin
  }), [users])

  const updateUserRole = async (userId: string, role: string) => {
    if (!canManageUsers) {
      setActionNotice('Read-only access. Superadmin is required to manage users.')
      return
    }
    const response = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_role', payload: { user_id: userId, role } }),
    })
    if (!response.ok) {
      setActionNotice('Unable to update role.')
      return
    }
    setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, role } : user)))
    setSelectedUser((prev) => (prev && prev.id === userId ? { ...prev, role } : prev))
    setActionNotice('Role updated.')
  }

  const updateSuspended = async (userId: string, suspended: boolean) => {
    if (!canManageUsers) {
      setActionNotice('Read-only access. Superadmin is required to manage users.')
      return
    }
    const response = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_suspended', payload: { user_id: userId, suspended } }),
    })
    if (!response.ok) {
      setActionNotice('Unable to update suspension.')
      return
    }
    const status = suspended ? 'Suspended' : 'Active'
    setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, status } : user)))
    setSelectedUser((prev) => (prev && prev.id === userId ? { ...prev, status } : prev))
    setActionNotice(`User ${status.toLowerCase()}.`)
  }

  const updateAdminTeamRole = async (userId: string, adminTeamRole: string) => {
    if (!canManageUsers) {
      setActionNotice('Read-only access. Superadmin is required to manage users.')
      return
    }
    const response = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_admin_team_role',
        payload: { user_id: userId, admin_team_role: adminTeamRole },
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setActionNotice(payload?.error || 'Unable to update admin team role.')
      return
    }
    setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, admin_team_role: adminTeamRole } : user)))
    setSelectedUser((prev) => (prev && prev.id === userId ? { ...prev, admin_team_role: adminTeamRole } : prev))
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
            <p className="mt-2 text-sm text-[#6b5f55]">Breakdown of coaches and athletes with quick profiles.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              {[
                { label: 'Coaches', value: coaches.length.toString() },
                { label: 'Athletes', value: athletes.length.toString() },
                { label: 'Admin staff', value: adminStaff.length.toString() },
              ].map((stat) => (
                <div key={stat.label} className="glass-card border border-[#191919] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              {[
                { title: 'Admin staff', description: 'Support, finance, ops, superadmin', data: adminStaff },
                { title: 'Coaches', description: 'Active coaching accounts', data: coaches },
                { title: 'Athletes', description: 'Registered athletes', data: athletes },
              ].map((group) => (
                <div key={group.title} className="glass-card border border-[#191919] bg-white p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-[#191919]">{group.title}</h2>
                      <p className="text-sm text-[#6b5f55]">{group.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                      {group.data.length}
                    </span>
                  </div>
                  {notice ? <p className="mt-3 text-xs text-[#6b5f55]">{notice}</p> : null}
                  <div className="mt-4 space-y-3 text-sm">
                    {loading ? (
                      <LoadingState label="Loading users..." />
                    ) : group.data.length === 0 ? (
                      <EmptyState title="No users found." description="Try widening the search or filters." />
                    ) : (
                      group.data.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => setSelectedUser(user)}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-left text-sm text-[#191919] transition hover:border-[#191919]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{user.full_name || user.email || 'User'}</p>
                            <p className="break-all text-xs text-[#6b5f55]">{user.email}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                            {user.status || 'Active'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>

      {selectedUser ? (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/45 backdrop-blur-[2px] px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">User profile</p>
                <h2 className="mt-2 text-2xl font-semibold">{selectedUser.full_name || 'User details'}</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null)
                  setActionNotice('')
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                x
              </button>
            </div>
            <div className="mt-4 space-y-3">
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
                { label: 'User ID', value: selectedUser.id },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{item.label}</p>
                  <p className="mt-1 font-semibold text-[#191919]">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {!canManageUsers ? (
                <p className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs text-[#6b5f55]">
                  Read-only mode: you can view users, but only superadmin can change roles or suspension.
                </p>
              ) : null}
              <label className="space-y-2 text-sm">
                <span className="text-xs font-semibold text-[#6b5f55]">Role</span>
                <select
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  value={selectedUser.role}
                  disabled={!canManageUsers}
                  onChange={(event) => updateUserRole(selectedUser.id, event.target.value)}
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              {selectedUser.role === 'admin' || selectedUser.role === 'superadmin' ? (
                <label className="space-y-2 text-sm">
                  <span className="text-xs font-semibold text-[#6b5f55]">Admin team role</span>
                  <select
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={selectedUser.admin_team_role || 'superadmin'}
                    disabled={!canManageUsers}
                    onChange={(event) => updateAdminTeamRole(selectedUser.id, event.target.value)}
                  >
                    {teamRoleOptions.map((teamRole) => (
                      <option key={teamRole} value={teamRole}>
                        {teamRole}
                      </option>
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
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">Waiver signatures</p>
              {waiversLoading ? (
                <p className="mt-2 text-xs text-[#6b5f55]">Loading…</p>
              ) : userWaivers.length === 0 ? (
                <p className="mt-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs text-[#6b5f55]">
                  No waiver signatures on record.
                </p>
              ) : (
                <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
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
        </div>
      ) : null}
    </main>
  )
}
