import { useRef } from 'react'

type OtpInputProps = {
  value: string[]
  onChange: (value: string[]) => void
  idPrefix: string
  length: number
  inputClassName: string
}

export default function OtpInput({ value, onChange, idPrefix, length, inputClassName }: OtpInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const focusInput = (index: number) => {
    inputRefs.current[index]?.focus()
    inputRefs.current[index]?.select()
  }

  const applyDigits = (index: number, digits: string) => {
    const next = [...value]
    digits.slice(0, length - index).split('').forEach((digit, offset) => {
      next[index + offset] = digit
    })
    onChange(next)
    focusInput(Math.min(index + digits.length, length - 1))
  }

  const handleChange = (index: number, inputValue: string) => {
    const digits = inputValue.replace(/\D/g, '')
    if (!digits) {
      const next = [...value]
      next[index] = ''
      onChange(next)
      return
    }
    applyDigits(index, digits)
  }

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      const next = [...value]
      if (value[index]) {
        next[index] = ''
        onChange(next)
        return
      }
      if (index > 0) {
        next[index - 1] = ''
        onChange(next)
        focusInput(index - 1)
      }
      return
    }

    if (event.key === 'Delete') {
      event.preventDefault()
      const next = [...value]
      next[index] = ''
      onChange(next)
      return
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusInput(index - 1)
    }

    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault()
      focusInput(index + 1)
    }
  }

  const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const digits = event.clipboardData.getData('text').replace(/\D/g, '')
    if (digits) applyDigits(index, digits)
  }

  return (
    <div className="grid grid-cols-8 gap-2 pt-3 sm:gap-3">
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(input) => { inputRefs.current[index] = input }}
          id={`${idPrefix}-${index}`}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={digit}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          className={inputClassName}
        />
      ))}
    </div>
  )
}