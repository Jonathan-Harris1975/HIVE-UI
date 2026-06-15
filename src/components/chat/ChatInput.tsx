import { useState, useRef, useCallback } from 'react'
import type { HiveMode } from '@/types'
import { ModeSelector } from './ModeSelector'
import { ModelPicker } from './ModelPicker'
import { Spinner } from '@/components/shared'
import { cx } from '@/utils'

interface ChatInputProps {
  onSend: (message: string) => void
  onStop?: () => void
  mode: HiveMode
  onModeChange: (mode: HiveMode) => void
  model: string
  onModelChange: (model: string) => void
  disabled?: boolean
  streaming?: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  onStop,
  mode,
  onModeChange,
  model,
  onModelChange,
  disabled,
  streaming,
  placeholder = 'Ask HIVE anything…',
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled || streaming) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, streaming, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  return (
    <div className="border-t border-hive-border bg-hive-bg p-3">
      {/* Toolbar row */}
      <div className="flex items-center gap-2 mb-2">
        <ModeSelector value={mode} onChange={onModeChange} compact />
        <ModelPicker value={model} onChange={onModelChange} compact />
        <div className="flex-1" />
        <span className="text-2xs text-hive-textDim">Shift+Enter for newline</span>
      </div>

      {/* Input row */}
      <div className={cx(
        'flex items-end gap-2 bg-hive-surface border rounded-hive-lg px-3 py-2 transition-colors',
        disabled ? 'border-hive-border opacity-60' : 'border-hive-border focus-within:border-hive-accent',
      )}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={streaming ? 'HIVE is thinking…' : placeholder}
          className={cx(
            'flex-1 bg-transparent resize-none text-sm text-hive-text placeholder-hive-textDim',
            'focus:outline-none leading-relaxed py-0.5 max-h-[200px] overflow-y-auto',
          )}
          style={{ scrollbarWidth: 'thin' }}
        />

        {/* Send / Stop button */}
        {streaming ? (
          <button
            onClick={onStop}
            className="shrink-0 w-8 h-8 rounded-hive bg-hive-error/20 border border-hive-error/40 text-hive-error hover:bg-hive-error/30 transition-colors flex items-center justify-center"
            title="Stop generation"
          >
            <span className="text-xs">■</span>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className={cx(
              'shrink-0 w-8 h-8 rounded-hive flex items-center justify-center transition-all',
              value.trim() && !disabled
                ? 'bg-hive-accent hover:bg-hive-accentHov text-white shadow-accent'
                : 'bg-hive-surfaceHi text-hive-textDim cursor-not-allowed',
            )}
            title="Send (Enter)"
          >
            {disabled ? <Spinner size="sm" /> : <SendIcon />}
          </button>
        )}
      </div>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 1.5l13 6.5-13 6.5V9.5l9-2-9-2V1.5z"/>
    </svg>
  )
}
