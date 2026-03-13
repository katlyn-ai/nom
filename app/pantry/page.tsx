'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'
import { PackageIcon, PlusIcon, XIcon, SparklesIcon } from '@/components/icons'

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

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Drinks', 'Other']

const supabase = createClient()

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [newExpiry, setNewExpiry] = useState('')
  const [category, setCategory] = useState('Other')
  const [outPrompt, setOutPrompt] = useState<{ id: string; name: string } | null>(null)
  const [addingToCart, setAddingToCart] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [categorising, setCategorising] = useState(false)
  const [categoriseToast, setCategoriseToast] = useState<string | null>(null)

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
    const { data, error } = await supabase.from('pantry_items').insert({
      user_id: user.id,
      name: newItem.trim(),
      category,
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
    }
    setAdding(false)
  }

  const markOut = async (item: PantryItem) => {
    await supabase.from('pantry_items').update({ in_stock: false }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, in_stock: false } : i))
    setOutPrompt({ id: item.id, name: item.name })
  }

  const markBack = async (id: string) => {
    await supabase.from('pantry_items').update({ in_stock: true }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, in_stock: true } : i))
  }

  const deleteItem = async (id: string) => {
    await supabase.from('pantry_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    if (outPrompt?.id === id) setOutPrompt(null)
  }

  const addToShoppingList = async () => {
    if (!outPrompt) return
    setAddingToCart(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAddingToCart(false); return }
    const pantryItem = items.find(i => i.id === outPrompt.id)
    await supabase.from('shopping_items').insert({
      user_id: user.id,
      name: outPrompt.name,
      category: pantryItem?.category || 'Other',
      checked: false,
      added_by: user.id,
    })
    setAddingToCart(false)
    setOutPrompt(null)
  }

  const handleAutoCategorise = async () => {
    setCategorising(true)
    setCategoriseToast(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCategorising(false); return }

    try {
      const res = await fetch('/api/categorise-pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (data.error) {
        setCategoriseToast(`Error: ${data.error} — try again`)
      } else if (data.categorised?.length) {
        // Apply new categories to local state
        setItems(prev => prev.map(item => {
          const match = data.categorised.find((c: { id: string; category: string }) => c.id === item.id)
          return match ? { ...item, category: match.category } : item
        }))
        setCategoriseToast(`✓ Organised ${data.updated} item${data.updated !== 1 ? 's' : ''} into categories`)
      } else {
        setCategoriseToast('All items are already organised')
      }
    } catch {
      setCategoriseToast('Could not organise — try again')
    }

    setCategorising(false)
    setTimeout(() => setCategoriseToast(null), 3000)
  }

  const inStock = items.filter(i => i.in_stock)
  const outOfStock = items.filter(i => !i.in_stock)

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

  const ItemRow = ({ item, i, showCheckmark }: { item: PantryItem; i: number; showCheckmark: boolean }) => {
    const [hovered, setHovered] = useState(false)
    return (
      <div
        key={item.id}
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: 'var(--card)', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {showCheckmark ? (
          <button
            onClick={() => markBack(item.id)}
            title="Back in stock"
            className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
            style={{ borderColor: 'var(--border)', background: 'var(--border)' }}
          >
            <span className="text-xs" style={{ color: 'var(--muted)' }}>✓</span>
          </button>
        ) : (
          <button
            onClick={() => markOut(item)}
            title="Mark as run out"
            className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
            style={{ borderColor: 'var(--primary)' }}
          />
        )}
        <span
          className="text-sm flex-1 flex items-center gap-2 min-w-0"
          style={{
            color: showCheckmark ? 'var(--muted)' : 'var(--foreground)',
            textDecoration: showCheckmark ? 'line-through' : 'none',
          }}
        >
          <span className="truncate">{item.name}</span>
          {item.quantity && !showCheckmark && (
            <span
              className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
            >
              {item.quantity}
            </span>
          )}
          {item.expires_at && !showCheckmark && (() => {
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

        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Pantry</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              {inStock.length} items in stock · {outOfStock.length} run out
            </p>
          </div>
          {items.length > 0 && (
            <button
              onClick={handleAutoCategorise}
              disabled={categorising}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60 flex-shrink-0"
              style={{
                background: 'var(--card)',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <SparklesIcon size={14} />
              {categorising ? 'Organising…' : 'Auto-organise'}
            </button>
          )}
        </div>

        {/* Categorise toast */}
        {categoriseToast && (
          <div
            className="rounded-xl px-4 py-3 mb-4 text-sm font-medium"
            style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
          >
            {categoriseToast}
          </div>
        )}

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
            <p className="text-xs mb-2 px-1" style={{ color: 'red' }}>
              Error: {addError}
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  background: category === cat ? 'var(--primary)' : 'var(--border)',
                  color: category === cat ? 'white' : 'var(--muted)',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* "Ran out" prompt banner */}
        {outPrompt && (
          <div
            className="rounded-2xl p-4 mb-5 flex items-center justify-between gap-3"
            style={{ background: 'var(--accent)', boxShadow: 'var(--shadow-sm)' }}
          >
            <p className="text-sm font-medium text-white">
              Ran out of <strong>{outPrompt.name}</strong> — add to shopping list?
            </p>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={addToShoppingList}
                disabled={addingToCart}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white disabled:opacity-60"
                style={{ color: 'var(--accent)' }}
              >
                {addingToCart ? 'Adding…' : 'Yes, add it'}
              </button>
              <button
                onClick={() => setOutPrompt(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.25)', color: 'white' }}
              >
                No thanks
              </button>
            </div>
          </div>
        )}

        {Object.keys(groupedInStock).length === 0 && outOfStock.length === 0 ? (
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
                  {catItems.map((item, i) => <ItemRow key={item.id} item={item} i={i} showCheckmark={false} />)}
                </div>
              </div>
            ))}

            {outOfStock.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Run out</p>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {outOfStock.map((item, i) => <ItemRow key={item.id} item={item} i={i} showCheckmark={true} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
