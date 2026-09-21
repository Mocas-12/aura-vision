import type { SiteStats } from '../utils/site-stats'

export default function SiteFooter({ sitePv, devicePv }: SiteStats) {
  return (
    <div className="relative z-10 w-full mt-auto pt-5 mb-10">
      <div
        className="glass mx-auto rounded-3xl px-4 py-2 text-center flex flex-col items-center gap-2"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', width: 'fit-content', maxWidth: '90%' }}
      >
        <div className="text-sm cyber-text flex items-center justify-center gap-4">
          <span className="flex items-center gap-1">
            <span>👁️</span>
            <span>总访问量：</span>
            <span style={{ fontFamily: 'monospace' }}>{sitePv}</span>
          </span>
          <span className="sep">|</span>
          <span className="flex items-center gap-1">
            <span>👤</span>
            <span>本设备浏览次数：</span>
            <span style={{ fontFamily: 'monospace' }}>{devicePv}</span>
          </span>
        </div>
        <div className="text-sm cyber-text flex items-center justify-center gap-[10px] overflow-hidden flex-nowrap">
          <img
            src="https://github.com/Mocas-12.png"
            alt="avatar"
            className="inline-block rounded-full"
            style={{ width: '24px', height: '24px', objectFit: 'cover' }}
          />
          <span>Unlimited Box</span>
          <span>|</span>
          <a href="mailto:a18577y@gmail.com" className="cyber-text" style={{ textDecoration: 'none' }}>📧 a18577y@gmail.com</a>
        </div>
      </div>
    </div>
  )
}
