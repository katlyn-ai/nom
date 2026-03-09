'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'
import { XIcon, SparklesIcon, ExternalLinkIcon } from '@/components/icons'

type ShoppingItem = {
  id: string
  name: string
  checked: boolean
  category: string
  added_by: string
}

type StoreItem = { name: string; price: number }

type StoreResult = {
  name: string
  url: string
  color: string
  delivery: string
  items: StoreItem[]
  subtotal: number
}

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Drinks', 'Other']

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')
  const [category, setCategory] = useState('Other')
  const [userId, setUserId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  // Go Shopping state
  const [showCompare, setShowCompare] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [compareResults, setCompareResults] = useState<StoreResult[] | null>(null)
  const [selectedStore, setSelectedStore] = useState<StoreResult | null>(null)
  const [compareError, setCompareError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from('shopping_items')
        .select('*')
        .eq('user_id', user.id)
        .order('category')
      setItems(data || [])
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel('shopping')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, payload => {
        if (payload.eventType === 'INSERT') {
          setItems(prev => [...prev, payload.new as ShoppingItem])
        } else if (payload.eventType === 'UPDATE') {
          setItems(prev => prev.map(i => i.id === payload.new.id ? payload.new as ShoppingItem : i))
        } else if (payload.eventType === 'DELETE') {
          setItems(prev => prev.filter(i => i.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const addItem = async () => {
    if (!newItem.trim() || !userId) return
    const { data } = await supabase.from('shopping_items').insert({
      user_id: userId,
      name: newItem.trim(),
      category,
      checked: false,
      added_by: userId,
    }).select().single()
    if (data) {
      setItems(prev => [...prev, data])
      setNewItem('')
    }
  }

  const toggleItem = async (id: string, checked: boolean) => {
    await supabase.from('shopping_items').update({ checked: !checked }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !checked } : i))
  }

  const deleteItem = async (id: string) => {
    await supabase.from('shopping_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const deleteChecked = async () => {
    const checkedIds = items.filter(i => i.checked).map(i => i.id)
    await supabase.from('shopping_items').delete().in('id', checkedIds)
    setItems(prev => prev.filter(i => !i.checked))
  }

  const generateFromMeals = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/generate-shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.items) {
        for (const item of data.items) {
          const { data: inserted } = await supabase.from('shopping_items').insert({
            user_id: userId,
            name: item.name,
            category: item.category || 'Other',
            checked: false,
            added_by: userId,
          }).select().single()
          if (inserted) setItems(prev => [...prev, inserted])
        }
      }
    } catch (e) {
      console.error(e)
    }
    setGenerating(false)
  }

  // ── Go Shopping ──────────────────────────────────────────────────────────

  const openCompare = async () => {
    setShowCompare(true)
    setComparing(true)
    setCompareError(null)
    setSelectedStore(null)
    setCompareResults(null)

    try {
      const unchecked = items.filter(i => !i.checked)
      const res = await fetch('/api/compare-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: unchecked }),
      })
      const data = await res.json()
      if (data.stores) {
        setCompareResults(data.stores)
      } else {
        setCompareError(data.error || 'Could not compare prices')
      }
    } catch {
      setCompareError('Something went wrong')
    }
    setComparing(false)
  }

  const selectStore = async (store: StoreResult) => {
    setSelectedStore(store)

    // Record savings vs most expensive option
    if (compareResults) {
      const maxTotal = Math.max(...compareResults.map(s => s.subtotal))
      const savings = +(maxTotal - store.subtotal).toFixed(2)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('shopping_sessions').insert({
          user_id: user.id,
          store_name: store.name,
          total_estimated: store.subtotal,
          savings_vs_expensive: savings > 0 ? savings : 0,
        })
      }
    }

    window.open(store.url, '_blank')
  }

  const closeCompare = () => {
    setShowCompare(false)
    setCompareResults(null)
    setSelectedStore(null)
    setCompareError(null)
  }

  // ─────────────────────────────────────────────────────────────────────────

  const ShoppingRow = ({ item, i, onToggle, onDelete }: {
    item: ShoppingItem; i: number; onToggle: () => void; onDelete: () => void
  }) => {
    const [hovered, setHovered] = useState(false)
    return (
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: 'var(--card)', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          onClick={onToggle}
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
          style={{
            borderColor: item.checked ? 'var(--secondary)' : 'var(--border)',
            background: item.checked ? 'var(--secondary)' : 'transparent',
          }}
        >
          {item.checked && <span className="text-white text-xs">✓</span>}
        </button>
        <span
          className="text-sm flex-1"
          style={{ color: item.checked ? 'var(--muted)' : 'var(--foreground)', textDecoration: item.checked ? 'line-through' : 'none' }}
        >
          {item.name}
        </span>
        <button
          onClick={onDelete}
          title="Remove item"
          style={{ color: 'var(--muted)', opacity: hovered ? 1 : 0.3, transition: 'opacity 0.15s' }}
        >
          <XIcon size={14} />
        </button>
      </div>
    )
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat)
    if (catItems.length > 0) acc[cat] = catItems
    return acc
  }, {} as Record<string, ShoppingItem[]>)

  const checkedCount = items.filter(i => i.checked).length
  const uncheckedCount = items.filter(i => !i.checked).length

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-64 px-6 py-8 pb-24 md:pb-8 max-w-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Shopping List</h1>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>
              {uncheckedCount} items remaining · updates live
            </p>
          </div>
          <button
            onClick={generateFromMeals}
            disabled={generating}
            className="px-4 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-60"
            style={{ background: 'var(--secondary)' }}
          >
            {generating ? '…' : '🍽️ From meals'}
          </button>
        </div>

        {/* Add item */}
        <div className="rounded-2xl p-4 mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="Add item…"
              className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            />
            <button
              onClick={addItem}
              className="px-4 py-2.5 rounded-xl text-white text-sm font-medium"
              style={{ background: 'var(--primary)' }}
            >
              Add
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
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

        {/* Items grouped by category */}
        {Object.keys(grouped).length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <p className="text-4xl mb-3">🛒</p>
            <p className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>Your list is empty</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Add items above or generate from your meal plan</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([cat, catItems]) => (
              <div key={cat}>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>{cat}</p>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {catItems.map((item, i) => (
                    <ShoppingRow
                      key={item.id}
                      item={item}
                      i={i}
                      onToggle={() => toggleItem(item.id, item.checked)}
                      onDelete={() => deleteItem(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {checkedCount > 0 && (
          <button
            onClick={deleteChecked}
            className="mt-6 w-full py-3 rounded-xl text-sm font-medium"
            style={{ background: 'var(--border)', color: 'var(--muted)' }}
          >
            Remove {checkedCount} checked item{checkedCount > 1 ? 's' : ''}
          </button>
        )}

        {/* Go Shopping button */}
        {uncheckedCount > 0 && (
          <button
            onClick={openCompare}
            className="mt-4 w-full py-4 rounded-2xl text-white font-semibold flex items-center justify-center gap-2 text-sm"
            style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-md)' }}
          >
            🛒 Go Shopping — compare prices
          </button>
        )}
      </main>

      {/* ── Price comparison modal ───────────────────────────────────────── */}
      {showCompare && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={closeCompare}
          />
          <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-50 pointer-events-none">
            <div
              className="rounded-t-3xl md:rounded-3xl w-full md:max-w-lg md:mx-4 flex flex-col pointer-events-auto"
              style={{ background: 'var(--card)', maxHeight: '90vh', boxShadow: '0 -8px 40px rgba(0,0,0,0.15)' }}
            >
              {/* Modal header */}
              <div
                className="px-6 pt-6 pb-4 flex items-center justify-between flex-shrink-0"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
                    {selectedStore ? `Shopping at ${selectedStore.name}` : 'Compare prices'}
                  </h2>
                  {!selectedStore && (
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                      {uncheckedCount} items · Barbora, Selver, Prisma, Rimi
                    </p>
                  )}
                </div>
                <button
                  onClick={closeCompare}
                  className="p-2 rounded-xl hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--muted)' }}
                >
                  <XIcon size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-5">

                {/* Loading */}
                {comparing && (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <div style={{ color: 'var(--primary)' }}><SparklesIcon size={28} /></div>
                    <p className="font-medium" style={{ color: 'var(--foreground)' }}>Comparing prices…</p>
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                      Checking Barbora, Selver, Prisma &amp; Rimi
                    </p>
                  </div>
                )}

                {/* Error */}
                {!comparing && compareError && (
                  <div className="py-10 text-center">
                    <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>{compareError}</p>
                    <button
                      onClick={openCompare}
                      className="text-sm font-medium px-4 py-2 rounded-xl"
                      style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                    >
                      Try again
                    </button>
                  </div>
                )}

                {/* Confirmation — store selected */}
                {!comparing && selectedStore && (
                  <div>
                    <div
                      className="rounded-2xl p-5 mb-5 text-center"
                      style={{ background: selectedStore.color + '15', border: `1.5px solid ${selectedStore.color}30` }}
                    >
                      <p className="text-3xl mb-2">🎉</p>
                      <p className="font-semibold text-lg" style={{ color: selectedStore.color, fontFamily: 'var(--font-display)' }}>
                        Opening {selectedStore.name}
                      </p>
                      <p className="text-2xl font-bold mt-2" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
                        ≈ €{selectedStore.subtotal.toFixed(2)}
                      </p>
                      {compareResults && (
                        (() => {
                          const savings = Math.max(...compareResults.map(s => s.subtotal)) - selectedStore.subtotal
                          return savings > 0.01 ? (
                            <p className="text-sm mt-1 font-medium" style={{ color: selectedStore.color }}>
                              Saving ≈ €{savings.toFixed(2)} vs most expensive
                            </p>
                          ) : null
                        })()
                      )}
                      <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
                        Log in at {selectedStore.name} and add the items below to your cart
                      </p>
                    </div>

                    {/* Shopping list reference */}
                    <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Your list</p>
                    <div className="rounded-2xl overflow-hidden mb-4" style={{ border: '1px solid var(--border)' }}>
                      {items.filter(i => !i.checked).map((item, i) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-4 py-3"
                          style={{ background: 'var(--card)', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                        >
                          <div className="w-4 h-4 rounded border flex-shrink-0" style={{ borderColor: 'var(--border)' }} />
                          <span className="text-sm" style={{ color: 'var(--foreground)' }}>{item.name}</span>
                          {selectedStore.items.find(si => si.name.toLowerCase().includes(item.name.toLowerCase().slice(0, 4))) && (
                            <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>
                              ≈ €{selectedStore.items.find(si => si.name.toLowerCase().includes(item.name.toLowerCase().slice(0, 4)))?.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => window.open(selectedStore.url, '_blank')}
                      className="w-full py-3 rounded-2xl text-white text-sm font-medium flex items-center justify-center gap-2"
                      style={{ background: selectedStore.color }}
                    >
                      <ExternalLinkIcon size={14} />
                      Open {selectedStore.name} again
                    </button>
                  </div>
                )}

                {/* Price comparison results */}
                {!comparing && compareResults && !selectedStore && (
                  <div className="space-y-3">
                    {(() => {
                      const minTotal = Math.min(...compareResults.map(s => s.subtotal))
                      const maxTotal = Math.max(...compareResults.map(s => s.subtotal))
                      return [...compareResults]
                        .sort((a, b) => a.subtotal - b.subtotal)
                        .map(store => {
                          const isCheapest = store.subtotal === minTotal
                          const savings = maxTotal - store.subtotal
                          return (
                            <div
                              key={store.name}
                              className="rounded-2xl p-4"
                              style={{
                                border: `2px solid ${isCheapest ? store.color : 'var(--border)'}`,
                                background: 'var(--card)',
                              }}
                            >
                              {/* Store header */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: store.color }} />
                                  <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{store.name}</span>
                                  {isCheapest && (
                                    <span
                                      className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                                      style={{ background: store.color }}
                                    >
                                      Cheapest
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className="text-xl font-bold" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
                                    €{store.subtotal.toFixed(2)}
                                  </p>
                                  {savings > 0.01 && (
                                    <p className="text-xs" style={{ color: store.color }}>
                                      Save €{savings.toFixed(2)}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Item prices — top 4 */}
                              <div className="space-y-1 mb-3">
                                {store.items.slice(0, 4).map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between">
                                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{item.name}</span>
                                    <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                                      €{item.price.toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                                {store.items.length > 4 && (
                                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                                    + {store.items.length - 4} more items
                                  </p>
                                )}
                              </div>

                              <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>{store.delivery}</p>

                              <button
                                onClick={() => selectStore(store)}
                                className="w-full py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-1.5"
                                style={{ background: store.color }}
                              >
                                Shop at {store.name}
                                <ExternalLinkIcon size={12} />
                              </button>
                            </div>
                          )
                        })
                    })()}

                    <p className="text-xs text-center pt-1 pb-2" style={{ color: 'var(--muted)' }}>
                      Prices are AI estimates — actual prices may vary
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
