import { useEffect, useState } from 'react'
import { Bookmark, Trash2, X } from 'lucide-react'
import { BLUEPRINT_NODE_KIND_LABELS } from '../../types/blueprintGraph'
import {
  deleteSavedCard,
  listSavedCards,
  type SavedBlueprintCard,
} from './blueprintCardLibrary'

interface BlueprintSavedCardsPanelProps {
  open: boolean
  onClose: () => void
  onInsert: (card: SavedBlueprintCard) => void
}

export default function BlueprintSavedCardsPanel({
  open,
  onClose,
  onInsert,
}: BlueprintSavedCardsPanelProps) {
  const [cards, setCards] = useState(() => listSavedCards())

  useEffect(() => {
    if (!open) return
    setCards(listSavedCards())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="bp-saved" role="dialog" aria-modal="true" aria-label="Saved cards">
      <div className="bp-saved__panel">
        <div className="bp-saved__head">
          <div className="bp-saved__heading">
            <Bookmark className="bp-saved__icon" aria-hidden />
            <div>
              <h2 className="bp-saved__title">Saved cards</h2>
              <p className="bp-saved__sub">Click a card to add it to the canvas.</p>
            </div>
          </div>
          <button
            type="button"
            className="admin-blueprints__btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {cards.length === 0 ? (
          <p className="bp-saved__empty">
            No saved cards yet. Edit a step and press the bookmark next to its title.
          </p>
        ) : (
          <ul className="bp-saved__list">
            {cards.map((card) => (
              <li key={card.id} className="bp-saved__item">
                <button
                  type="button"
                  className="bp-saved__pick"
                  onClick={() => {
                    onInsert(card)
                    onClose()
                  }}
                >
                  <span className="bp-saved__name">{card.name}</span>
                  <span className="bp-saved__kind">
                    {BLUEPRINT_NODE_KIND_LABELS[card.kind]}
                  </span>
                </button>
                <button
                  type="button"
                  className="bp-saved__delete"
                  aria-label={`Delete ${card.name}`}
                  onClick={() => {
                    deleteSavedCard(card.id)
                    setCards(listSavedCards())
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
