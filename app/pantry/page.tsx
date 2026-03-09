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
}

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Drinks', 'Other']

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')
  const [category, setCategory] = useState('Other')
  const [userId, setUserId] = useState<string | null>(null)
  // Prompt state: which item was just marked out
  const [outPrompt, setOutPrompt] = useState<{ id: string; name: string } | null>(null)
  const [addingToCart, setAddingToCart] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
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
    if (!newItem.trim() || !userId) return
    const { data } = await supabase.from('pantry_items').insert({
      user_id: userId,
      name: newItem.trim(),
      category,
      in_stock: true,
    }).select().single()
    if (data) {
      setItems(prev => [...prev, data])
      setNewItem('')
    }
  }

  const markOut = async (item: PantryItem) => {
    // Mark as out of stock in DB
    await supabase.from('pantry_items').update({ in_stock: false }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, in_stock: false } : i))
    // Prompt to add to shopping list
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
    if (!outPrompt || !userId) return
    setAddingToCart(true)
    // Find the pantry item's category to use on the shopping list
    const pantryItem = items.find(i => i.id === outPrompt.id)
    await supabase.from('shopping_items').insert({
      user_id: userId,
      name: outPrompt.name,
      category: pantryItem?.category || 'Other',
      checked: false,
      added_by: userId,
    })
    setAddingToCart(false)
    setOutPrompt(null)
  }

  const inStock = items.filter(i => i.in_stock)
  const outOfStock = items.filter(i => !i.in_stock)

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

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-64 px-6 py-8 pb-24 md:pb-8 max-w-2xl">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Pantry</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {inStock.length} items in stock · {outOfStock.length} run out
          </p>
        </div>

        {/* Add item */}
        <div
          className="rounded-2xl p-4 mb-6"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="Add item to pantry…"
              className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            />
            <button
              onClick={addItem}
              className="px-4 py-2.5 rounded-xl text-white text-sm font-medium flex items-center gap-1.5"
              style={{ background: 'var(--primary)' }}
            >
              <PlusIcon size={14} /> Add
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

        {/* In-stock items, grouped */}
        {Object.keys(groupedInStock).length === 0 && outOfStock.length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="flex justify-center mb-3" style={{ color: 'var(--primary)' }}>
              <PackageIcon size={40} />
            </div>
            <p className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>Your pantry is empty</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Add the items you currently have at home
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* In stock */}
            {Object.entries(groupedInStock).map(([cat, catItems]) => (
              <div key={cat}>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
                  {cat}
                </p>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {catItems.map((item, i) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 group"
                      style={{
                        background: 'var(--card)',
                        borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      {/* Mark out button */}
                      <button
                        onClick={() => markOut(item)}
                        title="Mark as run out"
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 hover:border-primary transition-colors"
                        style={{ borderColor: 'var(--primary)' }}
                      />
                      <span className="text-sm flex-1" style={{ color: 'var(--foreground)' }}>
                        {item.name}
                      </span>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--muted)' }}
                        title="Remove from pantry"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Out of stock section */}
            {outOfStock.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
                  Run out
                </p>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {outOfStock.map((item, i) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 group"
                      style={{
                        background: 'var(--card)',
                        borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      {/* Restore button */}
                      <button
                        onClick={() => markBack(item.id)}
                        title="Back in stock"
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: 'var(--border)', background: 'var(--border)' }}
                      >
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>✓</span>
                      </button>
                      <span
                        className="text-sm flex-1"
                        style={{ color: 'var(--muted)', textDecoration: 'line-through' }}
                      >
                        {item.name}
                      </span>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--muted)' }}
                        title="Remove from pantry"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
