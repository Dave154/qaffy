type QaffyLogoProps = {
  className?: string
  light?: boolean
}

export default function QaffyLogo({ className = '', light = false }: QaffyLogoProps) {
  return (
    <div className={className} aria-label="Qaffy logo">
      <h1
        className={`text-4xl leading-[33px] ${light ? 'text-white' : 'text-[#00b7d4]'}`}
        style={{ fontFamily: 'Freestyle Script, cursive' }}
      >
        Qaffy
      </h1>
    </div>
  )
}
