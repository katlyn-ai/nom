import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 512,
        height: 512,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #2D5438 0%, #4E7E5A 100%)',
        borderRadius: '115px',
      }}
    >
      <svg
        width="320"
        height="320"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Bowl body */}
        <path d="M11 22 Q11 30 20 30 Q29 30 29 22 Z" fill="white" opacity="0.95" />
        {/* Bowl rim */}
        <line x1="10" y1="22" x2="30" y2="22" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
        {/* Steam — three wavy lines */}
        <path d="M15 19 Q14 16.5 15 14" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8" />
        <path d="M20 18 Q19 15.5 20 13" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8" />
        <path d="M25 19 Q24 16.5 25 14" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8" />
      </svg>
    </div>,
    { ...size },
  )
}
