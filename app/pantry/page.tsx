'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'
import { PackageIcon, PlusIcon, XIcon } from '@/components/icons'

function CameraIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  )
}

function ChecklistIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/>
    </svg>
  )
}

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

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Grains & Pasta', 'Dry Goods', 'Condiments', 'Tins & Jars', 'Spices', 'Bakery', 'Frozen', 'Drinks', 'Other']

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
  // Receipt scanning
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResults, setScanResults] = useState<{ name: string; quantity: string | null; category: string }[]>([])
  const [scanSelected, setScanSelected] = useState<Set<number>>(new Set())
  const [showScanModal, setShowScanModal] = useState(false)
  const [confirmingScan, setConfirmingScan] = useState(false)
  const [scanSkipped, setScanSkipped] = useState(0)
  // Copy pantry prompt
  const [promptCopied, setPromptCopied] = useState(false)
  // Quick review mode
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewQueue, setReviewQueue] = useState<string[]>([])
  const [reviewPos, setReviewPos] = useState(0)
  const [reviewEditingQty, setReviewEditingQty] = useState(false)
  const [reviewQtyDraft, setReviewQtyDraft] = useState('')

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

  // ── Receipt scanning ─────────────────────────────────────────────────────
  const handleScanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    if (fileInputRef.current) fileInputRef.current.value = ''

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1]
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setScanning(false); return }

        const res = await fetch('/api/scan-receipt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg', userId: user.id }),
        })
        const data = await res.json()

        if (data.items && data.items.length > 0) {
          setScanResults(data.items)
          setScanSelected(new Set(data.items.map((_: unknown, i: number) => i)))
          setScanSkipped(data.skipped || 0)
          setShowScanModal(true)
        } else {
          alert('No new items found. Either the receipt was unclear or everything is already in your pantry.')
        }
      } catch {
        alert('Something went wrong scanning the receipt. Try again.')
      }
      setScanning(false)
    }
    reader.readAsDataURL(file)
  }

  const confirmScanItems = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setConfirmingScan(true)
    const toAdd = scanResults.filter((_, i) => scanSelected.has(i))
    for (const item of toAdd) {
      const { data } = await supabase.from('pantry_items').insert({
        user_id: user.id,
        name: item.name,
        category: item.category || 'Other',
        in_stock: true,
        quantity: item.quantity || null,
      }).select().single()
      if (data) setItems(prev => [...prev, data])
    }
    setShowScanModal(false)
    setScanResults([])
    setScanSelected(new Set())
    setConfirmingScan(false)
  }

  // ── Quick review ──────────────────────────────────────────────────────────
  const startReview = () => {
    setReviewQueue(inStock.map(i => i.id))
    setReviewPos(0)
    setReviewEditingQty(false)
    setReviewQtyDraft('')
    setReviewMode(true)
  }

  const reviewItemId = reviewQueue[reviewPos]
  const reviewItem = items.find(i => i.id === reviewItemId) ?? null
  const reviewDone = reviewPos >= reviewQueue.length

  const reviewNext = () => setReviewPos(prev => prev + 1)

  const reviewMarkOut = (item: PantryItem) => {
    setOutPrompt({ id: item.id, name: item.name })
  }

  const reviewStartQtyEdit = (item: PantryItem) => {
    setReviewQtyDraft(item.quantity ?? '')
    setReviewEditingQty(true)
  }

  const reviewSaveQty = async (item: PantryItem) => {
    const trimmed = reviewQtyDraft.trim() || null
    await supabase.from('pantry_items').update({ quantity: trimmed }).eq('id', item.id)
    setItems(prev => prev.map(p => p.id === item.id ? { ...p, quantity: trimmed } : p))
    setReviewEditingQty(false)
    setReviewQtyDraft('')
    setReviewPos(prev => prev + 1)
  }

  const copyPantryPrompt = () => {
    if (inStock.length === 0) return
    // Build grouped list
    const lines: string[] = []
    CATEGORIES.forEach(cat => {
      const catItems = inStock.filter(i =>
        cat === 'Other'
          ? (i.category === 'Other' || !CATEGORIES.includes(i.category))
          : i.category === cat
      )
      if (catItems.length === 0) return
      lines.push(`${cat}:`)
      catItems.forEach(i => {
        lines.push(`  - ${i.name}${i.quantity ? ` (${i.quantity})` : ''}`)
      })
    })

    const pantryList = lines.join('\n')
    const prompt = `Here is everything I currently have in my pantry:\n\n${pantryList}\n\nBased on what I have, please suggest a recipe and give me step-by-step instructions. Tell me if there's anything small I might need to pick up to complete the dish.`

    navigator.clipboard.writeText(prompt).then(() => {
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2500)
    })
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
    // If in review mode, advance past the deleted item
    if (reviewMode) setReviewPos(prev => prev + 1)
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
    const catItems = inStock.filter(i =>
      cat === 'Other'
        ? (i.category === 'Other' || !CATEGORIES.includes(i.category))
        : i.category === cat
    )
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

  const ItemRow = ({ item, i, onQuantityChange, onNameChange, onCategoryChange }: {
    item: PantryItem; i: number
    onQuantityChange: (id: string, qty: string | null) => void
    onNameChange: (id: string, name: string) => void
    onCategoryChange: (id: string, category: string) => void
  }) => {
    const [hovered, setHovered] = useState(false)
    const [editingQty, setEditingQty] = useState(false)
    const [qtyDraft, setQtyDraft] = useState(item.quantity ?? '')
    const [editingName, setEditingName] = useState(false)
    const [nameDraft, setNameDraft] = useState(item.name)
    const [editingCat, setEditingCat] = useState(false)

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

    const saveCat = async (newCat: string) => {
      setEditingCat(false)
      if (newCat === item.category) return
      await supabase.from('pantry_items').update({ category: newCat }).eq('id', item.id)
      onCategoryChange(item.id, newCat)
    }

    return (
      <div
        key={item.id}
        className="flex items-start gap-3 px-4 py-3"
        style={{ background: 'var(--card)', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Mark-out circle */}
        <button
          onClick={() => markOut(item)}
          title="Mark as run out"
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ borderColor: 'var(--primary)' }}
        />

        {/* Main content — two lines */}
        <div className="flex-1 min-w-0">
          {/* Line 1: name */}
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
              className="text-sm px-2 py-0.5 rounded-lg outline-none w-full"
              style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1.5px solid var(--primary)' }}
            />
          ) : (
            <p
              className="text-sm font-medium cursor-text leading-snug"
              style={{ color: 'var(--foreground)', wordBreak: 'break-word' }}
              onClick={() => { setNameDraft(item.name); setEditingName(true) }}
            >
              {item.name}
            </p>
          )}

          {/* Line 2: quantity · expiry · category */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {/* Quantity */}
            {editingQty ? (
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
                className="text-xs px-2 py-0.5 rounded-full outline-none w-28"
                style={{ background: 'var(--primary-light)', color: 'var(--primary)', border: '1.5px solid var(--primary)' }}
              />
            ) : item.quantity ? (
              <button
                onClick={() => { setQtyDraft(item.quantity ?? ''); setEditingQty(true) }}
                className="text-xs px-2 py-0.5 rounded-full hover:opacity-75 transition-opacity"
                style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
              >
                {item.quantity}
              </button>
            ) : (
              <button
                onClick={() => { setQtyDraft(''); setEditingQty(true) }}
                className="text-xs px-2 py-0.5 rounded-full transition-opacity"
                style={{ background: 'var(--border)', color: 'var(--muted)', opacity: hovered ? 1 : 0 }}
              >
                + amount
              </button>
            )}

            {/* Expiry */}
            {item.expires_at && (() => {
              const status = expiryStatus(item.expires_at)
              const s = EXPIRY_STYLES[status]
              return (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: s.bg, color: s.color }}
                >
                  {s.label(item.expires_at)}
                </span>
              )
            })()}

            {/* Category picker */}
            {editingCat ? (
              <select
                autoFocus
                value={item.category}
                onChange={e => saveCat(e.target.value)}
                onBlur={() => setEditingCat(false)}
                className="text-xs px-2 py-0.5 rounded-full outline-none"
                style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1.5px solid var(--primary)' }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <button
                onClick={() => setEditingCat(true)}
                title="Change category"
                className="text-xs px-2 py-0.5 rounded-full transition-opacity"
                style={{ background: 'var(--border)', color: 'var(--muted)', opacity: hovered ? 0.9 : 0.4 }}
              >
                {item.category}
              </button>
            )}
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={() => deleteItem(item.id)}
          title="Remove from pantry"
          className="mt-0.5 flex-shrink-0"
          style={{ color: 'var(--muted)', opacity: hovered ? 1 : 0.25, transition: 'opacity 0.15s' }}
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
              {inStock.length} items in stock
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 mt-1">
            {/* Hidden file input for receipt scan */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleScanUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              title="Scan a receipt"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--primary)', color: 'white' }}
            >
              <CameraIcon size={14} />
              {scanning ? 'Scanning…' : 'Scan receipt'}
            </button>
            {inStock.length > 0 && (
              <button
                onClick={startReview}
                title="Quick review — go through each item"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
              >
                <ChecklistIcon size={14} />
                Review
              </button>
            )}
            {inStock.length > 0 && (
              <button
                onClick={copyPantryPrompt}
                title="Copy pantry as a Claude prompt"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: promptCopied ? 'var(--primary-light)' : 'var(--border)', color: promptCopied ? 'var(--primary)' : 'var(--muted)' }}
              >
                {promptCopied ? '✓ Copied!' : '💬 Ask Claude'}
              </button>
            )}
          </div>
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
                  {catItems.map((item, i) => <ItemRow key={item.id} item={item} i={i} onQuantityChange={(id, qty) => setItems(prev => prev.map(p => p.id === id ? { ...p, quantity: qty } : p))} onNameChange={(id, name) => setItems(prev => prev.map(p => p.id === id ? { ...p, name } : p))} onCategoryChange={(id, category) => setItems(prev => prev.map(p => p.id === id ? { ...p, category } : p))} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Quick review overlay */}
      {reviewMode && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)' }} />
          <div
            className="fixed inset-x-4 z-50 rounded-3xl p-6 max-w-sm w-full"
            style={{ background: 'var(--card)', boxShadow: 'var(--shadow-lg)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
          >
            {reviewDone || !reviewItem ? (
              <>
                <div className="text-center mb-5">
                  <p className="text-4xl mb-3">🎉</p>
                  <p className="font-semibold text-lg" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
                    Pantry review done!
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                    You reviewed all {reviewQueue.length} items.
                  </p>
                </div>
                <button
                  onClick={() => { setReviewMode(false); setReviewQueue([]); setReviewPos(0) }}
                  className="w-full py-3 rounded-2xl text-white text-sm font-semibold"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Quick review — {reviewPos + 1} of {reviewQueue.length}
                  </p>
                  <button onClick={() => { setReviewMode(false); setReviewQueue([]); setReviewPos(0) }} style={{ color: 'var(--muted)' }}>
                    <XIcon size={16} />
                  </button>
                </div>
                {/* Progress bar */}
                <div className="h-1 rounded-full mb-5 overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(reviewPos / reviewQueue.length) * 100}%`, background: 'var(--primary)' }}
                  />
                </div>
                <p className="text-xl font-semibold mb-1" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
                  {reviewItem.name}
                </p>
                {reviewItem.quantity && !reviewEditingQty && (
                  <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Currently: {reviewItem.quantity}</p>
                )}
                {!reviewItem.quantity && !reviewEditingQty && <div className="mb-4" />}

                {/* Inline qty editor */}
                {reviewEditingQty && (
                  <div className="mb-4">
                    <input
                      autoFocus
                      value={reviewQtyDraft}
                      onChange={e => setReviewQtyDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') reviewSaveQty(reviewItem)
                        if (e.key === 'Escape') { setReviewEditingQty(false) }
                      }}
                      placeholder="e.g. 200g, half a bottle, 3 left…"
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--background)', border: '1.5px solid var(--primary)', color: 'var(--foreground)' }}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {reviewEditingQty ? (
                    <>
                      <button
                        onClick={() => reviewSaveQty(reviewItem)}
                        className="w-full py-3 rounded-2xl text-white text-sm font-semibold"
                        style={{ background: 'var(--gradient-primary)' }}
                      >
                        ✓ Save amount
                      </button>
                      <button
                        onClick={() => setReviewEditingQty(false)}
                        className="w-full py-2.5 rounded-2xl text-sm font-medium"
                        style={{ background: 'var(--background)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={reviewNext}
                        className="w-full py-3 rounded-2xl text-white text-sm font-semibold"
                        style={{ background: 'var(--gradient-primary)' }}
                      >
                        ✓ Still have it
                      </button>
                      <button
                        onClick={() => reviewStartQtyEdit(reviewItem)}
                        className="w-full py-2.5 rounded-2xl text-sm font-medium"
                        style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                      >
                        ↻ Amount changed
                      </button>
                      <button
                        onClick={() => reviewMarkOut(reviewItem)}
                        className="w-full py-2.5 rounded-2xl text-sm font-medium"
                        style={{ background: '#FEE2E2', color: '#DC2626' }}
                      >
                        ✕ Ran out
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Scan results modal */}
      {showScanModal && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => !confirmingScan && setShowScanModal(false)} />
          <div
            className="fixed inset-x-4 z-50 rounded-3xl flex flex-col max-w-sm w-full"
            style={{ background: 'var(--card)', boxShadow: 'var(--shadow-lg)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxHeight: '80vh' }}
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <p className="font-semibold" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
                  Found {scanResults.length} item{scanResults.length !== 1 ? 's' : ''}
                </p>
                {scanSkipped > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {scanSkipped} already in your pantry — skipped
                  </p>
                )}
              </div>
              <button onClick={() => setShowScanModal(false)} style={{ color: 'var(--muted)' }}>
                <XIcon size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-2 py-2">
              {scanResults.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setScanSelected(prev => {
                    const next = new Set(prev)
                    next.has(i) ? next.delete(i) : next.add(i)
                    return next
                  })}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                  style={{ background: scanSelected.has(i) ? 'var(--primary-light)' : 'transparent' }}
                >
                  <div
                    className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                    style={{
                      background: scanSelected.has(i) ? 'var(--primary)' : 'transparent',
                      border: `2px solid ${scanSelected.has(i) ? 'var(--primary)' : 'var(--border)'}`,
                    }}
                  >
                    {scanSelected.has(i) && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{item.name}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {item.category}{item.quantity ? ` · ${item.quantity}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={confirmScanItems}
                disabled={confirmingScan || scanSelected.size === 0}
                className="w-full py-3 rounded-2xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--gradient-primary)' }}
              >
                {confirmingScan ? 'Adding…' : `Add ${scanSelected.size} item${scanSelected.size !== 1 ? 's' : ''} to pantry`}
              </button>
            </div>
          </div>
        </>
      )}

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
