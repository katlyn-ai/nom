'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'

type Recipe = {
  id: string
  name: string
  description: string
  ingredients: string[]
  instructions: string
  rating: number | null
  servings: number
  prep_time: number
  tags: string[]
  image_url?: string | null
}

const FOOD_EMOJIS = ['🍝', '🥗', '🍜', '🍛', '🥘', '🍲', '🥙', '🌮', '🍱', '🥩', '🍣', '🥞', '🍕', '🫕']
function foodEmoji(name: string) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return FOOD_EMOJIS[Math.abs(hash) % FOOD_EMOJIS.length]
}

const BG_GRADIENTS = [
  'linear-gradient(135deg, #f9a8d4, #fbcfe8)',
  'linear-gradient(135deg, #86efac, #bbf7d0)',
  'linear-gradient(135deg, #93c5fd, #bfdbfe)',
  'linear-gradient(135deg, #fcd34d, #fde68a)',
  'linear-gradient(135deg, #f9a875, #fed7aa)',
  'linear-gradient(135deg, #c4b5fd, #ddd6fe)',
]
function bgGradient(name: string) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return BG_GRADIENTS[Math.abs(hash) % BG_GRADIENTS.length]
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type MealPlanEntry = { id: string; day_index: number; meal_type: string; custom_name: string }

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importPreview, setImportPreview] = useState<Omit<Recipe, 'id' | 'rating'> | null>(null)
  const [importImageUrl, setImportImageUrl] = useState('')
  const [importSaving, setImportSaving] = useState(false)
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', description: '', ingredients: '', instructions: '',
    servings: 4, prep_time: 30, tags: '', image_url: '',
  })

  // Add to meal plan
  const [mealPlanEntries, setMealPlanEntries] = useState<MealPlanEntry[]>([])
  const [primaryMealType, setPrimaryMealType] = useState('dinner')
  const [addingRecipe, setAddingRecipe] = useState<Recipe | null>(null)
  const [addingDay, setAddingDay] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [fillingRecipes, setFillingRecipes] = useState(false)
  const [fillResult, setFillResult] = useState<{ filled: number; total: number } | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [{ data: recipesData }, { data: mealData }, { data: settingsData }] = await Promise.all([
        supabase.from('recipes').select('*').eq('user_id', user.id).order('name'),
        supabase.from('meal_plans').select('id, day_index, meal_type, custom_name').eq('user_id', user.id),
        supabase.from('settings').select('plan_breakfast, plan_lunch, plan_dinner').eq('user_id', user.id).single(),
      ])

      setRecipes(recipesData || [])
      setMealPlanEntries(mealData || [])

      // Determine primary meal type from settings
      if (settingsData) {
        const primary = settingsData.plan_dinner !== false ? 'dinner'
          : settingsData.plan_lunch !== false ? 'lunch'
          : 'breakfast'
        setPrimaryMealType(primary)
      }

      setLoading(false)
    }
    load()
  }, [])

  const closeAdd = () => {
    setShowAdd(false)
    setEditingRecipe(null)
    setForm({ name: '', description: '', ingredients: '', instructions: '', servings: 4, prep_time: 30, tags: '', image_url: '' })
  }

  const handleSave = async () => {
    if (!userId || !form.name) return
    const payload = {
      name: form.name,
      description: form.description,
      ingredients: form.ingredients.split('\n').filter(Boolean),
      instructions: form.instructions,
      servings: form.servings,
      prep_time: form.prep_time,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      image_url: form.image_url.trim() || null,
    }
    if (editingRecipe) {
      const { data } = await supabase.from('recipes').update(payload).eq('id', editingRecipe.id).select().single()
      if (data) {
        setRecipes(prev => prev.map(r => r.id === data.id ? data : r))
        if (selected?.id === data.id) setSelected(data)
      }
    } else {
      const { data } = await supabase.from('recipes').insert({ user_id: userId, ...payload }).select().single()
      if (data) setRecipes(prev => [...prev, data])
    }
    closeAdd()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes(prev => prev.filter(r => r.id !== id))
    setSelected(null)
    setDeletingId(null)
  }

  const fillMissingRecipes = async () => {
    if (!userId || fillingRecipes) return
    setFillingRecipes(true)
    setFillResult(null)
    try {
      const res = await fetch('/api/populate-recipes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      setFillResult({ filled: data.filled || 0, total: data.total || 0 })
      // Reload recipes to show newly populated ones
      const { data: fresh } = await supabase.from('recipes').select('*').eq('user_id', userId).order('name')
      if (fresh) setRecipes(fresh)
    } catch { /* silent */ }
    setFillingRecipes(false)
  }

  const emptyRecipes = recipes.filter(r => !r.ingredients?.length)

  const handleRate = async (id: string, rating: number) => {
    await supabase.from('recipes').update({ rating }).eq('id', id)
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, rating } : r))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, rating } : null)
  }

  const handleAddToMealPlan = async (recipe: Recipe, dayIndex: number) => {
    if (!userId) return
    setAddingDay(dayIndex)

    const existing = mealPlanEntries.find(
      m => m.day_index === dayIndex && m.meal_type === primaryMealType
    )

    // Carry the recipe's real ingredients, instructions and prep time into meal_plans
    // so the dashboard never needs to call AI to re-invent them from just the meal name
    const recipeInstructions = recipe.instructions
      ? recipe.instructions.split('\n').filter(Boolean)
      : null
    const mealPayload = {
      custom_name: recipe.name,
      ingredients: recipe.ingredients?.length ? recipe.ingredients : null,
      instructions: recipeInstructions?.length ? recipeInstructions : null,
      cooking_time_minutes: recipe.prep_time || null,
    }

    if (existing?.id) {
      await supabase.from('meal_plans')
        .update(mealPayload)
        .eq('id', existing.id)
      setMealPlanEntries(prev =>
        prev.map(m => m.id === existing.id ? { ...m, ...mealPayload } : m)
      )
    } else {
      const { data } = await supabase.from('meal_plans').insert({
        user_id: userId,
        day_index: dayIndex,
        meal_type: primaryMealType,
        ...mealPayload,
      }).select().single()
      if (data) setMealPlanEntries(prev => [...prev, data])
    }

    setAddingDay(null)
    setAddingRecipe(null)
    const day = DAYS[dayIndex]
    setToast(`Added to ${day}!`)
    setTimeout(() => setToast(null), 2500)
  }

  // Step 1: Parse recipe text with AI
  const handleImportFromText = async () => {
    if (!importText.trim() || !userId) return
    setImporting(true)
    setImportError('')
    try {
      const res = await fetch('/api/import-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        setImportError(data.error)
        setImporting(false)
        return
      }
      const r = data.recipe
      setImportPreview({
        name: r.name || '',
        description: r.description || '',
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        instructions: r.instructions || '',
        servings: r.servings || 4,
        prep_time: r.prep_time || 30,
        tags: Array.isArray(r.tags) ? r.tags : [],
        image_url: null,
      })
    } catch {
      setImportError('Something went wrong. Please try again.')
    }
    setImporting(false)
  }

  // Step 2: Save parsed recipe with optional image
  const handleSaveImport = async () => {
    if (!importPreview || !userId) return
    setImportSaving(true)
    const { data: saved } = await supabase.from('recipes').insert({
      user_id: userId,
      name: importPreview.name,
      description: importPreview.description,
      ingredients: importPreview.ingredients,
      instructions: importPreview.instructions,
      servings: importPreview.servings,
      prep_time: importPreview.prep_time,
      tags: importPreview.tags,
      image_url: importImageUrl.trim() || null,
    }).select().single()
    if (saved) {
      setRecipes(prev => [...prev, saved])
      setShowImport(false)
      setImportText('')
      setImportPreview(null)
      setImportImageUrl('')
    }
    setImportSaving(false)
  }

  const closeImport = () => {
    setShowImport(false)
    setImportError('')
    setImportText('')
    setImportPreview(null)
    setImportImageUrl('')
  }

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
  )

  const StarRating = ({ recipe }: { recipe: Recipe }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onClick={(e) => { e.stopPropagation(); handleRate(recipe.id, star) }}
          className="text-lg hover:scale-110 transition-transform"
        >
          {star <= (recipe.rating || 0) ? '⭐' : '☆'}
        </button>
      ))}
    </div>
  )

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <div className="md:ml-64 flex items-center justify-center h-screen">
        <p style={{ color: 'var(--muted)' }}>Loading recipes…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-64 px-6 py-8 pb-24 md:pb-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Recipe Book</h1>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>{recipes.length} recipes saved</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              🔗 From URL
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2.5 rounded-xl text-white text-sm font-medium"
              style={{ background: 'var(--primary)' }}
            >
              + Add manually
            </button>
          </div>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search recipes or tags…"
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none mb-4"
          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
        />

        {/* Auto-fill banner — shown when recipes are missing ingredients */}
        {emptyRecipes.length > 0 && (
          <div
            className="rounded-2xl p-4 mb-5 flex items-center justify-between gap-3 flex-wrap"
            style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)' }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>
                ✨ {emptyRecipes.length} recipe{emptyRecipes.length > 1 ? 's' : ''} missing ingredients
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--primary)' }}>
                Auto-fill with AI so they work with pantry &amp; shopping list
              </p>
            </div>
            <button
              onClick={fillMissingRecipes}
              disabled={fillingRecipes}
              className="px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 disabled:opacity-60"
              style={{ background: 'var(--primary)' }}
            >
              {fillingRecipes ? 'Filling in…' : 'Auto-fill all'}
            </button>
          </div>
        )}

        {fillResult && fillResult.total > 0 && (
          <div
            className="rounded-2xl p-3 mb-5 text-sm"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}
          >
            ✓ Filled in {fillResult.filled} of {fillResult.total} recipes
            <button onClick={() => setFillResult(null)} className="ml-3 text-xs underline">dismiss</button>
          </div>
        )}

        {/* Recipe list */}
        {filtered.length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-4xl mb-3">📖</p>
            <p className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>No recipes yet</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Add your first recipe to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map(recipe => (
              <div
                key={recipe.id}
                onClick={() => setSelected(recipe)}
                className="rounded-2xl cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                {/* Image or gradient placeholder */}
                <div className="relative w-full" style={{ paddingTop: '52%' }}>
                  {recipe.image_url ? (
                    <img
                      src={recipe.image_url}
                      alt={recipe.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={e => {
                        const t = e.currentTarget
                        t.style.display = 'none'
                        if (t.parentElement) {
                          t.parentElement.style.background = bgGradient(recipe.name)
                          const span = document.createElement('span')
                          span.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:2.5rem'
                          span.textContent = foodEmoji(recipe.name)
                          t.parentElement.appendChild(span)
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: bgGradient(recipe.name) }}
                    >
                      <span className="text-4xl">{foodEmoji(recipe.name)}</span>
                    </div>
                  )}

                  {/* Add to meal plan button */}
                  <button
                    onClick={e => { e.stopPropagation(); setAddingRecipe(recipe) }}
                    title="Add to meal plan"
                    className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md hover:scale-110 transition-transform"
                    style={{ background: 'var(--primary)', fontSize: '1.1rem', lineHeight: 1 }}
                  >
                    +
                  </button>
                </div>

                {/* Card content */}
                <div className="p-4">
                  <h3 className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>{recipe.name}</h3>
                  {recipe.description && (
                    <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--muted)' }}>
                      {recipe.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <StarRating recipe={recipe} />
                    <div className="flex gap-3 text-xs" style={{ color: 'var(--muted)' }}>
                      {recipe.prep_time && <span>⏱ {recipe.prep_time}m</span>}
                      {recipe.servings && <span>👥 {recipe.servings}</span>}
                    </div>
                  </div>
                  {recipe.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {recipe.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recipe detail modal */}
        {selected && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setSelected(null)}
          >
            <div
              className="w-full max-w-lg rounded-2xl max-h-[85vh] overflow-y-auto"
              style={{ background: 'var(--card)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Hero image / gradient */}
              <div className="relative w-full rounded-t-2xl overflow-hidden" style={{ paddingTop: '45%' }}>
                {selected.image_url ? (
                  <img
                    src={selected.image_url}
                    alt={selected.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={e => {
                      const t = e.currentTarget
                      t.style.display = 'none'
                      if (t.parentElement) {
                        t.parentElement.style.background = bgGradient(selected.name)
                        const span = document.createElement('span')
                        span.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:4rem'
                        span.textContent = foodEmoji(selected.name)
                        t.parentElement.appendChild(span)
                      }
                    }}
                  />
                ) : (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ background: bgGradient(selected.name) }}
                  >
                    <span className="text-6xl">{foodEmoji(selected.name)}</span>
                  </div>
                )}
                <button
                  onClick={() => setSelected(null)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                  style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}
                >
                  ✕
                </button>
              </div>

              <div className="p-6">
                <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>{selected.name}</h2>
                <StarRating recipe={selected} />
                <div className="flex gap-4 mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                  {selected.prep_time && <span>⏱ {selected.prep_time} min</span>}
                  {selected.servings && <span>👥 {selected.servings} servings</span>}
                </div>
                {selected.description && (
                  <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>{selected.description}</p>
                )}
                {selected.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {selected.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {selected.ingredients?.length > 0 && (
                  <div className="mt-5">
                    <p className="font-medium text-sm mb-2" style={{ color: 'var(--foreground)' }}>Ingredients</p>
                    <ul className="space-y-1">
                      {selected.ingredients.map((ing, i) => (
                        <li key={i} className="text-sm flex gap-2" style={{ color: 'var(--muted)' }}>
                          <span>•</span> {ing}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.instructions && (
                  <div className="mt-5">
                    <p className="font-medium text-sm mb-2" style={{ color: 'var(--foreground)' }}>Instructions</p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--muted)' }}>{selected.instructions}</p>
                  </div>
                )}

                {/* Edit / Delete actions */}
                <div className="flex gap-2 mt-6 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={() => {
                      setForm({
                        name: selected.name,
                        description: selected.description || '',
                        ingredients: selected.ingredients?.join('\n') || '',
                        instructions: selected.instructions || '',
                        servings: selected.servings || 4,
                        prep_time: selected.prep_time || 30,
                        tags: selected.tags?.join(', ') || '',
                        image_url: selected.image_url || '',
                      })
                      setEditingRecipe(selected)
                      setSelected(null)
                      setShowAdd(true)
                    }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  >
                    ✏️ Edit recipe
                  </button>

                  {deletingId === selected.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(selected.id)}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                        style={{ background: '#ef4444' }}
                      >
                        Confirm delete
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium"
                        style={{ background: 'var(--border)', color: 'var(--muted)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(selected.id)}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: '#fee2e2', color: '#ef4444' }}
                    >
                      🗑 Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import from URL modal */}
        {showImport && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={closeImport}
          >
            <div
              className="w-full max-w-lg rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
              style={{ background: 'var(--card)' }}
              onClick={e => e.stopPropagation()}
            >
              {!importPreview ? (
                <>
                  <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Import recipe</h2>
                  <p className="text-sm mb-1" style={{ color: 'var(--muted)' }}>
                    Open the recipe page, select all the text (Cmd+A), copy it, then paste it below.
                  </p>
                  <p className="text-xs mb-4 px-3 py-2 rounded-xl" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                    Works with any recipe site — BBC Good Food, AllRecipes, NYT Cooking, and more.
                  </p>
                  <textarea
                    value={importText}
                    onChange={e => { setImportText(e.target.value); setImportError('') }}
                    placeholder="Paste the recipe text here…"
                    rows={6}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none mb-3"
                    style={{ borderColor: importError ? 'red' : 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    autoFocus
                  />
                  {importError && (
                    <p className="text-xs mb-3" style={{ color: 'red' }}>{importError}</p>
                  )}
                  {importing && (
                    <div className="flex items-center gap-2 text-sm mb-3" style={{ color: 'var(--muted)' }}>
                      <span className="animate-spin inline-block">✨</span>
                      Extracting recipe…
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={handleImportFromText}
                      disabled={importing || !importText.trim()}
                      className="flex-1 py-3 rounded-xl text-white text-sm font-medium disabled:opacity-50"
                      style={{ background: 'var(--primary)' }}
                    >
                      {importing ? 'Extracting…' : 'Extract recipe'}
                    </button>
                    <button
                      onClick={closeImport}
                      className="px-5 py-3 rounded-xl text-sm font-medium"
                      style={{ background: 'var(--border)', color: 'var(--muted)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={() => setImportPreview(null)} style={{ color: 'var(--muted)' }} className="text-lg">←</button>
                    <h2 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>Recipe found!</h2>
                  </div>

                  {/* Preview card */}
                  <div
                    className="rounded-xl p-4 mb-4"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                  >
                    {/* Preview image */}
                    <div
                      className="w-full rounded-lg mb-3 flex items-center justify-center overflow-hidden"
                      style={{
                        height: '140px',
                        background: importImageUrl ? undefined : bgGradient(importPreview.name)
                      }}
                    >
                      {importImageUrl ? (
                        <img
                          src={importImageUrl}
                          alt={importPreview.name}
                          className="w-full h-full object-cover rounded-lg"
                          onError={e => { e.currentTarget.style.display = 'none' }}
                        />
                      ) : (
                        <span className="text-5xl">{foodEmoji(importPreview.name)}</span>
                      )}
                    </div>

                    <p className="font-semibold text-base mb-1" style={{ color: 'var(--foreground)' }}>{importPreview.name}</p>
                    {importPreview.description && (
                      <p className="text-sm mb-2 line-clamp-2" style={{ color: 'var(--muted)' }}>{importPreview.description}</p>
                    )}
                    <div className="flex gap-4 text-xs" style={{ color: 'var(--muted)' }}>
                      <span>⏱ {importPreview.prep_time}m</span>
                      <span>👥 {importPreview.servings} servings</span>
                      <span>🥕 {importPreview.ingredients.length} ingredients</span>
                    </div>
                    {importPreview.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {importPreview.tags.map(tag => (
                          <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Optional photo URL */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                      Photo URL <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                      type="url"
                      value={importImageUrl}
                      onChange={e => setImportImageUrl(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Right-click a photo on the recipe page → Copy image address</p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveImport}
                      disabled={importSaving}
                      className="flex-1 py-3 rounded-xl text-white text-sm font-medium disabled:opacity-50"
                      style={{ background: 'var(--primary)' }}
                    >
                      {importSaving ? 'Saving…' : 'Save recipe'}
                    </button>
                    <button
                      onClick={closeImport}
                      className="px-5 py-3 rounded-xl text-sm font-medium"
                      style={{ background: 'var(--border)', color: 'var(--muted)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Add to meal plan — day picker modal */}
        {addingRecipe && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setAddingRecipe(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ background: 'var(--card)' }}
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
                Add to meal plan
              </h2>
              <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                Which day should <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>"{addingRecipe.name}"</span> go on?
              </p>
              <div className="grid grid-cols-7 gap-1.5 mb-4">
                {DAYS.map((day, i) => {
                  const existing = mealPlanEntries.find(
                    m => m.day_index === i && m.meal_type === primaryMealType
                  )
                  const isBusy = !!existing?.custom_name
                  const isLoading = addingDay === i
                  return (
                    <button
                      key={day}
                      onClick={() => handleAddToMealPlan(addingRecipe, i)}
                      disabled={isLoading}
                      title={isBusy ? `${day}: ${existing.custom_name}` : day}
                      className="flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-60"
                      style={{
                        background: isBusy ? 'var(--primary-light)' : 'var(--background)',
                        color: isBusy ? 'var(--primary)' : 'var(--foreground)',
                        border: `1.5px solid ${isBusy ? 'var(--primary)' : 'var(--border)'}`,
                      }}
                    >
                      <span>{day.slice(0, 3)}</span>
                      {isLoading ? (
                        <span style={{ fontSize: '0.6rem' }}>…</span>
                      ) : isBusy ? (
                        <span style={{ fontSize: '0.55rem', opacity: 0.7, maxWidth: '2.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {existing.custom_name.split(' ')[0]}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', opacity: 0.4 }}>free</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                Highlighted days already have a {primaryMealType} — clicking replaces it.
              </p>
            </div>
          </div>
        )}

        {/* Add recipe modal */}
        {showAdd && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={closeAdd}
          >
            <div
              className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
              style={{ background: 'var(--card)' }}
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-xl font-semibold mb-5" style={{ color: 'var(--foreground)' }}>
                {editingRecipe ? 'Edit recipe' : 'Add recipe'}
              </h2>
              <div className="space-y-4">
                {[
                  { label: 'Recipe name', key: 'name', placeholder: 'e.g. Spaghetti Carbonara' },
                  { label: 'Description (optional)', key: 'description', placeholder: 'A short description…' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                      {field.label}
                    </label>
                    <input
                      type="text"
                      value={form[field.key as keyof typeof form] as string}
                      onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    />
                  </div>
                ))}

                {/* Photo URL field */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                    Photo URL <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={form.image_url}
                    onChange={e => setForm(prev => ({ ...prev, image_url: e.target.value }))}
                    placeholder="https://example.com/photo.jpg"
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  />
                  {form.image_url && (
                    <div className="mt-2 rounded-xl overflow-hidden" style={{ height: '100px' }}>
                      <img
                        src={form.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={e => { e.currentTarget.style.opacity = '0.3' }}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                    Ingredients (one per line)
                  </label>
                  <textarea
                    value={form.ingredients}
                    onChange={e => setForm(prev => ({ ...prev, ingredients: e.target.value }))}
                    placeholder="200g pasta&#10;2 eggs&#10;100g pancetta"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                    Instructions
                  </label>
                  <textarea
                    value={form.instructions}
                    onChange={e => setForm(prev => ({ ...prev, instructions: e.target.value }))}
                    placeholder="Step by step instructions…"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Servings</label>
                    <input
                      type="number"
                      value={form.servings}
                      onChange={e => setForm(prev => ({ ...prev, servings: +e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Prep time (min)</label>
                    <input
                      type="number"
                      value={form.prep_time}
                      onChange={e => setForm(prev => ({ ...prev, prep_time: +e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Tags (comma separated)</label>
                  <input
                    type="text"
                    value={form.tags}
                    onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="pasta, quick, vegetarian"
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    className="flex-1 py-3 rounded-xl text-white text-sm font-medium"
                    style={{ background: 'var(--primary)' }}
                  >
                    {editingRecipe ? 'Save changes' : 'Save recipe'}
                  </button>
                  <button
                    onClick={closeAdd}
                    className="px-5 py-3 rounded-xl text-sm font-medium"
                    style={{ background: 'var(--border)', color: 'var(--muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-white text-sm font-medium shadow-lg pointer-events-none"
          style={{ background: 'var(--primary)', transition: 'opacity 0.3s' }}
        >
          ✓ {toast}
        </div>
      )}
    </div>
  )
}
