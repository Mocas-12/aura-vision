import type { SiteStats } from '../utils/site-stats'

export default function SiteFooter({ sitePv, devicePv }: SiteStats) {
  return (
    <footer className="vision-footer">
        <div className="visitor-counts">
          <span className="flex items-center gap-1">
            <span>总访问量：</span>
            <span className="numeric">{sitePv}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>本设备浏览次数：</span>
            <span className="numeric">{devicePv}</span>
          </span>
        </div>
        <div className="author-contact">
          <img
            src="https://github.com/Mocas-12.png"
            alt="Unlimited Box"
            width="24"
            height="24"
          />
          <span>Unlimited Box</span>
          <a href="mailto:a18577y@gmail.com">a18577y@gmail.com</a>
        </div>
    </footer>
  )
}
