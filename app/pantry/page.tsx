'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'
import { PackageIcon, PlusIcon, XIcon } from '@/components/icons'

type PantryItem = {
  id: string
  name: string
  in_stock: boolean
  category: string
  quantity?: string | null
  expires_at?: string | null
}

// Returns how urgent the expiry is relative to today
function expiryStatus(dateStr: string): 'expired' | 'today' | 'soon' | 'upcoming' | 'fine' {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(dateStr + 'T00:00:00') // parse as local date
  const diffDays = Math.round((exp.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0) return 'expired'
  if (diffDays === 0) return 'today'
  if (diffDays <= 2) return 'soon'
  if (diffDays <= 6) return 'upcoming'
  return 'fine'
}

const EXPIRY_STYLES: Record<string, { bg: string; color: string; label: (d: string) => string }> = {
  expired:  { bg: '#FEE2E2', color: '#DC2626', label: () => 'Expired' },
  today:    { bg: '#FEE2E2', color: '#DC2626', label: () => 'Expires today' },
  soon:     { bg: '#FEF3C7', color: '#D97706', label: (d) => `Exp ${new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` },
  upcoming: { bg: '#FEF9C3', color: '#A16207', label: (d) => `Exp ${new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` },
  fine:     { bg: 'var(--border)', color: 'var(--muted)', label: (d) => `Exp ${new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` },
}

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Spices', 'Frozen', 'Drinks', 'Other']

const supabase = createClient()

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [newExpiry, setNewExpiry] = useState('')
  const [outPrompt, setOutPrompt] = useState<{ id: string; name: string } | null>(null)
  const [addingToCart, setAddingToCart] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('pantry_items')
        .select('*')
        .eq('user_id', user.id)
        .order('category')
        .order('name')
      setItems(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const addItem = async () => {
    if (!newItem.trim() || adding) return
    setAddError(null)
    setAdding(true)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (!user) {
      setAddError(authErr?.message || 'Not signed in')
      setAdding(false)
      return
    }
    const name = newItem.trim()
    const { data, error } = await supabase.from('pantry_items').insert({
      user_id: user.id,
      name,
      category: 'Other', // will be updated by auto-categorise below
      in_stock: true,
      quantity: newQuantity.trim() || null,
      expires_at: newExpiry || null,
    }).select().single()
    if (error) {
      setAddError(error.message)
    } else if (data) {
      setItems(prev => [...prev, data])
      setNewItem('')
      setNewQuantity('')
      setNewExpiry('')

      // Auto-categorise in the background — update once AI responds
      fetch('/api/categorise-shopping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [name] }),
      }).then(r => r.json()).then(json => {
        const category: string = json.categorised?.[0] ?? 'Other'
        if (category !== 'Other') {
          supabase.from('pantry_items').update({ category }).eq('id', data.id)
          setItems(prev => prev.map(i => i.id === data.id ? { ...i, category } : i))
        }
      }).catch(() => {/* silent — item stays in Other */})
    }
    setAdding(false)
  }

  const markOut = (item: PantryItem) => {
    // Show a popup asking whether to add to shopping list, then delete
    setOutPrompt({ id: item.id, name: item.name })
  }

  const confirmMarkOut = async (addToShopping: boolean) => {
    if (!outPrompt) return
    setAddingToCart(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAddingToCart(false); return }

    if (addToShopping) {
      const pantryItem = items.find(i => i.id === outPrompt.id)
      // Auto-categorise before adding to shopping
      let category = pantryItem?.category || 'Other'
      try {
        const res = await fetch('/api/categorise-shopping', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items: [outPrompt.name] }),
        })
        if (res.ok) {
          const json = await res.json()
          if (json.categorised?.[0]) category = json.categorised[0]
        }
      } catch { /* use existing category */ }
      await supabase.from('shopping_items').insert({
        user_id: user.id,
        name: outPrompt.name,
        category,
        checked: false,
        added_by: user.id,
      })
    }

    // Always delete the item from pantry
    await supabase.from('pantry_items').delete().eq('id', outPrompt.id)
    setItems(prev => prev.filter(i => i.id !== outPrompt.id))
    setAddingToCart(false)
    setOutPrompt(null)
  }

  const deleteItem = async (id: string) => {
    await supabase.from('pantry_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    if (outPrompt?.id === id) setOutPrompt(null)
  }

  const inStock = items.filter(i => i.in_stock)

  // Items expiring today or already expired
  const expiringSoon = inStock.filter(i => {
    if (!i.expires_at) return false
    const s = expiryStatus(i.expires_at)
    return s === 'expired' || s === 'today' || s === 'soon'
  })

  const groupedInStock = CATEGORIES.reduce((acc, cat) => {
    const catItems = inStock.filter(i => i.category === cat)
    if (catItems.length > 0) acc[cat] = catItems
    return acc
  }, {} as Record<string, PantryItem[]>)

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <div className="md:ml-64 flex items-center justify-center h-64">
        <p style={{ color: 'var(--muted)' }}>Loading pantry…</p>
      </div>
    </div>
  )

  const ItemRow = ({ item, i, onQuantityChange, onNameChange }: {
    item: PantryItem; i: number
    onQuantityChange: (id: string, qty: string | null) => void
    onNameChange: (id: string, name: string) => void
  }) => {
    const [hovered, setHovered] = useState(false)
    const [editingQty, setEditingQty] = useState(false)
    const [qtyDraft, setQtyDraft] = useState(item.quantity ?? '')
    const [editingName, setEditingName] = useState(false)
    const [nameDraft, setNameDraft] = useState(item.name)

    const saveQty = async () => {
      const trimmed = qtyDraft.trim() || null
      setEditingQty(false)
      if (trimmed === (item.quantity ?? null)) return // no change
      await supabase.from('pantry_items').update({ quantity: trimmed }).eq('id', item.id)
      onQuantityChange(item.id, trimmed)
    }

    const saveName = async () => {
      const trimmed = nameDraft.trim()
      setEditingName(false)
      if (!trimmed || trimmed === item.name) { setNameDraft(item.name); return }
      await supabase.from('pantry_items').update({ name: trimmed }).eq('id', item.id)
      onNameChange(item.id, trimmed)
    }

    return (
      <div
        key={item.id}
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: 'var(--card)', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          onClick={() => markOut(item)}
          title="Mark as run out"
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
          style={{ borderColor: 'var(--primary)' }}
        />
        <span
          className="text-sm flex-1 flex items-center gap-2 min-w-0"
          style={{ color: 'var(--foreground)' }}
        >
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') { setNameDraft(item.name); setEditingName(false) }
              }}
              className="text-sm px-2 py-0.5 rounded-lg outline-none flex-1 min-w-0"
              style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1.5px solid var(--primary)' }}
            />
          ) : (
            <span
              className="truncate cursor-text hover:opacity-70 transition-opacity"
              title="Click to edit name"
              onClick={() => { setNameDraft(item.name); setEditingName(true) }}
            >
              {item.name}
            </span>
          )}

          {/* Quantity — tap to edit */}
          {(
            editingQty ? (
              <input
                autoFocus
                value={qtyDraft}
                onChange={e => setQtyDraft(e.target.value)}
                onBlur={saveQty}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveQty()
                  if (e.key === 'Escape') { setQtyDraft(item.quantity ?? ''); setEditingQty(false) }
                }}
                placeholder="e.g. 500g"
                className="text-xs px-2 py-0.5 rounded-full outline-none w-24 flex-shrink-0"
                style={{ background: 'var(--primary-light)', color: 'var(--primary)', border: '1.5px solid var(--primary)' }}
              />
            ) : item.quantity ? (
              <button
                onClick={() => { setQtyDraft(item.quantity ?? ''); setEditingQty(true) }}
                title="Edit amount"
                className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 hover:opacity-75 transition-opacity"
                style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
              >
                {item.quantity}
              </button>
            ) : (
              <button
                onClick={() => { setQtyDraft(''); setEditingQty(true) }}
                title="Add amount"
                className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 transition-opacity"
                style={{
                  background: 'var(--border)',
                  color: 'var(--muted)',
                  opacity: hovered ? 0.8 : 0,
                }}
              >
                + amount
              </button>
            )
          )}

          {item.expires_at && (() => {
            const status = expiryStatus(item.expires_at)
            const s = EXPIRY_STYLES[status]
            return (
              <span
                className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                style={{ background: s.bg, color: s.color }}
              >
                {s.label(item.expires_at)}
              </span>
            )
          })()}
        </span>
        <button
          onClick={() => deleteItem(item.id)}
          title="Remove from pantry"
          style={{ color: 'var(--muted)', opacity: hovered ? 1 : 0.3, transition: 'opacity 0.15s' }}
        >
          <XIcon size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-64 px-6 py-8 pb-24 md:pb-8 max-w-2xl">

        <div className="mb-6">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Pantry</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {inStock.length} items in stock
          </p>
        </div>

        {/* Expiry warning banner */}
        {expiringSoon.length > 0 && (
          <div
            className="rounded-xl px-4 py-3 mb-4 text-sm"
            style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}
          >
            <span className="font-semibold" style={{ color: '#92400E' }}>⚠️ Use soon: </span>
            <span style={{ color: '#78350F' }}>
              {expiringSoon.map(i => i.name).join(', ')}
            </span>
          </div>
        )}

        {/* Add item */}
        <div className="rounded-2xl p-4 mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newItem.trim()) addItem() }}
              placeholder="Add item to pantry…"
              spellCheck={true}
              className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            />
            <button
              onClick={addItem}
              disabled={adding}
              className="px-4 py-2.5 rounded-xl text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-60"
              style={{ background: 'var(--primary)' }}
            >
              <PlusIcon size={14} /> {adding ? '…' : 'Add'}
            </button>
          </div>
          {newItem.trim() && (
            <div className="mb-3 space-y-2">
              <input
                type="text"
                value={newQuantity}
                onChange={e => setNewQuantity(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addItem() }}
                placeholder="How much do you have? e.g. ca 500g, a handful, 2 cups…"
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
              />
              <div className="flex items-center gap-3">
                <label className="text-xs flex-shrink-0" style={{ color: 'var(--muted)' }}>
                  Expiry date <span className="opacity-60">(optional)</span>
                </label>
                <input
                  type="date"
                  value={newExpiry}
                  onChange={e => setNewExpiry(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--background)', color: newExpiry ? 'var(--foreground)' : 'var(--muted)' }}
                />
              </div>
            </div>
          )}
          {addError && (
            <p className="text-xs px-1" style={{ color: 'red' }}>
              Error: {addError}
            </p>
          )}
        </div>

        {Object.keys(groupedInStock).length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex justify-center mb-3" style={{ color: 'var(--primary)' }}>
              <PackageIcon size={40} />
            </div>
            <p className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>Your pantry is empty</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Add the items you currently have at home</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(groupedInStock).map(([cat, catItems]) => (
              <div key={cat}>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>{cat}</p>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {catItems.map((item, i) => <ItemRow key={item.id} item={item} i={i} onQuantityChange={(id, qty) => setItems(prev => prev.map(p => p.id === id ? { ...p, quantity: qty } : p))} onNameChange={(id, name) => setItems(prev => prev.map(p => p.id === id ? { ...p, name } : p))} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Ran out popup */}
      {outPrompt && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={() => !addingToCart && setOutPrompt(null)}
          />
          <div
            className="fixed inset-x-4 bottom-8 md:inset-auto md:left-1/2 md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-50 rounded-3xl p-6 max-w-sm w-full"
            style={{ background: 'var(--card)', boxShadow: 'var(--shadow-lg)' }}
          >
            <p className="font-semibold text-base mb-1" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
              Ran out of {outPrompt.name}
            </p>
            <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
              Add it to your shopping list before removing?
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => confirmMarkOut(true)}
                disabled={addingToCart}
                className="w-full py-3 rounded-2xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: 'var(--gradient-primary)' }}
              >
                {addingToCart ? 'Adding…' : '✓ Yes, add to shopping list'}
              </button>
              <button
                onClick={() => confirmMarkOut(false)}
                disabled={addingToCart}
                className="w-full py-3 rounded-2xl text-sm font-medium disabled:opacity-60"
                style={{ background: 'var(--background)', color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                No, just remove it
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
